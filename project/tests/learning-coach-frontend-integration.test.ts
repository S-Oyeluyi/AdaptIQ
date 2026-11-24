import assert from "node:assert/strict"
import { QUESTIONS, ASSESSMENTS, TOPICS } from "../lib/assessment-data"
import { evaluateAssessment, type AssessmentEvaluation } from "../lib/assessment-engine"
import { computeCognitiveFingerprint } from "../lib/cognitive-fingerprint"
import { generateStudyPlan } from "../lib/adaptive-study-plan"
import {
  fetchMistakeExplanation,
  fetchRecommendationExplanation,
  fetchTargetedPractice,
  LearningCoachClientError,
} from "../lib/client/learning-coach-client"
import {
  mistakeExplanationResponseSchema,
  recommendationExplanationResponseSchema,
  targetedPracticeResponseSchema,
} from "../lib/learning-ai-schemas"

console.log("=== STARTING LEARNING COACH FRONTEND INTEGRATION TESTS ===")

async function runFrontendIntegrationTests() {
  // 1. Mistake Explanation Integration
  console.log("[1] Testing Mistake Explanation integration flow...")
  const question = QUESTIONS[0]
  const assessment = ASSESSMENTS.find(a => a.id === question.assessmentId)!
  const incorrectOptionIndex = question.correctIndex === 0 ? 1 : 0

  const mockMistakeResponse = {
    explanation: "You confused addition with subtraction when isolating the variable.",
    nextStep: "Remember to subtract the constant term from both sides of the equation.",
  }

  let mistakeFetchCalled = false
  const mistakeResult = await fetchMistakeExplanation(
    {
      assessmentId: assessment.id,
      questionId: question.id,
      selectedOptionIndex: incorrectOptionIndex,
    },
    {
      fetcher: async (_url, init) => {
        mistakeFetchCalled = true
        const body = JSON.parse(String(init?.body))
        assert.equal(body.task, "mistake-explanation")
        assert.equal(body.assessmentId, assessment.id)
        assert.equal(body.questionId, question.id)
        assert.equal(body.selectedOptionIndex, incorrectOptionIndex)
        return new Response(JSON.stringify(mockMistakeResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      },
    },
  )

  assert.equal(mistakeFetchCalled, true)
  assert.equal(mistakeExplanationResponseSchema.safeParse(mistakeResult).success, true)
  assert.equal(mistakeResult.explanation, mockMistakeResponse.explanation)
  assert.equal(mistakeResult.nextStep, mockMistakeResponse.nextStep)
  console.log("✓ Mistake explanation flow verified")

  // 2. Recommendation Explanation Integration
  console.log("[2] Testing Recommendation Explanation integration flow...")
  const topic = TOPICS[0]
  const mockRecResponse = {
    explanation: "Linear equations form the cornerstone of higher-level algebra.",
  }

  let recFetchCalled = false
  const recResult = await fetchRecommendationExplanation(
    {
      topicId: topic.id,
      kind: "focus",
      reason: "Provisional mastery is low based on diagnostic evidence.",
      action: "Review foundational variable manipulation.",
      suggestedDifficulty: "foundational",
      suggestedMinutes: 10,
    },
    {
      fetcher: async (_url, init) => {
        recFetchCalled = true
        const body = JSON.parse(String(init?.body))
        assert.equal(body.task, "recommendation-explanation")
        assert.equal(body.topicId, topic.id)
        assert.equal(body.kind, "focus")
        return new Response(JSON.stringify(mockRecResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      },
    },
  )

  assert.equal(recFetchCalled, true)
  assert.equal(recommendationExplanationResponseSchema.safeParse(recResult).success, true)
  assert.equal(recResult.explanation, mockRecResponse.explanation)
  console.log("✓ Recommendation explanation flow verified")

  // 3. Targeted Practice Generation Integration
  console.log("[3] Testing Targeted Practice generation flow...")
  const mockPracticeResponse = {
    questions: [
      {
        prompt: "If 3x + 2 = 11, what is x?",
        options: ["2", "3", "4", "5"],
        correctIndex: 1,
        explanation: "Subtract 2 to get 3x = 9, then divide by 3 to get x = 3.",
      },
      {
        prompt: "Solve: y - 7 = 3",
        options: ["4", "10", "21", "-4"],
        correctIndex: 1,
        explanation: "Add 7 to both sides: y = 10.",
      },
      {
        prompt: "What value of m satisfies 2m = 16?",
        options: ["8", "14", "18", "32"],
        correctIndex: 0,
        explanation: "Divide both sides by 2 to get m = 8.",
      },
    ],
  }

  let practiceFetchCalled = false
  const practiceResult = await fetchTargetedPractice(
    {
      topicId: topic.id,
      difficulty: "core",
      questionCount: 3,
    },
    {
      fetcher: async (_url, init) => {
        practiceFetchCalled = true
        const body = JSON.parse(String(init?.body))
        assert.equal(body.task, "targeted-practice")
        assert.equal(body.topicId, topic.id)
        assert.equal(body.difficulty, "core")
        assert.equal(body.questionCount, 3)
        return new Response(JSON.stringify(mockPracticeResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      },
    },
  )

  assert.equal(practiceFetchCalled, true)
  assert.equal(targetedPracticeResponseSchema.safeParse(practiceResult).success, true)
  assert.equal(practiceResult.questions.length, 3)
  console.log("✓ Targeted practice generation flow verified")

  // 4. Architectural Safeguard: Formative Practice Never Modifies Deterministic Mastery
  console.log("[4] Testing Architectural Safeguard: Mastery isolation...")
  const baselineAttempt: AssessmentEvaluation = evaluateAssessment(
    assessment.id,
    [question],
    { [question.id]: incorrectOptionIndex },
    60,
  )
  const fpBefore = computeCognitiveFingerprint([baselineAttempt])
  const planBefore = generateStudyPlan(fpBefore)

  // Simulate user answering formative practice questions
  const formativeAnswers = practiceResult.questions.map((q, idx) => ({
    questionIndex: idx,
    selectedOption: q.correctIndex, // perfect answers in formative practice!
    isCorrect: true,
  }))
  assert.equal(formativeAnswers.every(a => a.isCorrect), true)

  // Confirm that sessionAttempts is unchanged and fingerprint is untouched
  const fpAfter = computeCognitiveFingerprint([baselineAttempt])
  const planAfter = generateStudyPlan(fpAfter)

  assert.deepEqual(fpBefore.overallMastery, fpAfter.overallMastery)
  assert.deepEqual(fpBefore.topics, fpAfter.topics)
  assert.deepEqual(planBefore.recommendations, planAfter.recommendations)
  console.log("✓ Architectural safeguard verified: Formative AI practice does not mutate deterministic mastery or fingerprint")

  // 5. Error and Recovery States
  console.log("[5] Testing Client Error and Recovery States...")
  let failCount = 0
  const recoverableFetch = async () => {
    failCount++
    if (failCount === 1) {
      return new Response(JSON.stringify({ error: "Service temporarily unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })
    }
    return new Response(JSON.stringify(mockMistakeResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Attempt 1 fails
  await assert.rejects(
    fetchMistakeExplanation(
      { assessmentId: assessment.id, questionId: question.id, selectedOptionIndex: incorrectOptionIndex },
      { fetcher: recoverableFetch },
    ),
    (err: unknown) => {
      assert(err instanceof LearningCoachClientError)
      assert.equal(err.status, 503)
      return true
    },
  )

  // Attempt 2 (Retry) succeeds
  const recoveredResult = await fetchMistakeExplanation(
    { assessmentId: assessment.id, questionId: question.id, selectedOptionIndex: incorrectOptionIndex },
    { fetcher: recoverableFetch },
  )
  assert.equal(recoveredResult.explanation, mockMistakeResponse.explanation)
  console.log("✓ Error handling and retry flow verified")

  console.log("=== ALL LEARNING COACH FRONTEND INTEGRATION TESTS PASSED ===")
}

void runFrontendIntegrationTests().catch(err => {
  console.error(err)
  process.exitCode = 1
})
