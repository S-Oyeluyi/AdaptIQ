import assert from "node:assert/strict"
import {
  fetchMistakeExplanation,
  fetchRecommendationExplanation,
  fetchTargetedPractice,
  LearningCoachClientError,
  sendLearningCoachRequest,
} from "../lib/client/learning-coach-client"

function createMockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

async function runLearningCoachClientTests(): Promise<void> {
  console.log("=== STARTING LEARNING COACH CLIENT TESTS ===")

  // 1. Successful mistake explanation
  let capturedUrl: string | undefined
  let capturedInit: RequestInit | undefined
  const mockSuccessResponse = {
    explanation: "You added instead of subtracting.",
    nextStep: "Isolate x by using inverse operations.",
  }

  const result = await fetchMistakeExplanation(
    {
      assessmentId: "algebra-readiness",
      questionId: "ALG-LE-001",
      selectedOptionIndex: 1,
    },
    {
      fetcher: async (url, init) => {
        capturedUrl = String(url)
        capturedInit = init
        return createMockResponse(mockSuccessResponse)
      },
    },
  )

  assert.equal(capturedUrl, "/api/learning/coach")
  assert.equal(capturedInit?.method, "POST")
  const parsedBody = JSON.parse(String(capturedInit?.body))
  assert.deepEqual(parsedBody, {
    task: "mistake-explanation",
    assessmentId: "algebra-readiness",
    questionId: "ALG-LE-001",
    selectedOptionIndex: 1,
  })
  assert.deepEqual(result, mockSuccessResponse)
  console.log("✓ Mistake explanation request and payload formatting verified")

  // 2. Successful recommendation explanation
  const mockRecResponse = {
    explanation: "Working on this builds strong algebra foundations.",
  }
  const recResult = await fetchRecommendationExplanation(
    {
      topicId: "linear-equations",
      kind: "focus",
      reason: "Mastery is low.",
      action: "Review concepts.",
      suggestedDifficulty: "core",
      suggestedMinutes: 10,
    },
    {
      fetcher: async () => createMockResponse(mockRecResponse),
    },
  )
  assert.deepEqual(recResult, mockRecResponse)
  console.log("✓ Recommendation explanation request verified")

  // 3. Successful targeted practice
  const mockPracticeResponse = {
    questions: [
      {
        prompt: "What is 2x = 4?",
        options: ["1", "2", "3", "4"],
        correctIndex: 1,
        explanation: "Divide by 2.",
      },
    ],
  }
  const practiceResult = await fetchTargetedPractice(
    {
      topicId: "linear-equations",
      difficulty: "core",
      questionCount: 1,
    },
    {
      fetcher: async () => createMockResponse(mockPracticeResponse),
    },
  )
  assert.deepEqual(practiceResult, mockPracticeResponse)
  console.log("✓ Targeted practice request verified")

  // 4. Rate limit 429 error handling
  await assert.rejects(
    fetchMistakeExplanation(
      {
        assessmentId: "algebra-readiness",
        questionId: "ALG-LE-001",
        selectedOptionIndex: 1,
      },
      {
        fetcher: async () =>
          createMockResponse(
            { error: "Too many requests. Please wait before trying again." },
            429,
          ),
      },
    ),
    (err: unknown) => {
      assert(err instanceof LearningCoachClientError)
      assert.equal(err.status, 429)
      assert.equal(err.code, "RATE_LIMITED")
      assert.match(err.message, /wait/i)
      return true
    },
  )
  console.log("✓ Rate limiting (429) handled gracefully")

  // 5. Timeout 504 error handling
  await assert.rejects(
    fetchTargetedPractice(
      {
        topicId: "linear-equations",
        difficulty: "core",
        questionCount: 2,
      },
      {
        fetcher: async () =>
          createMockResponse({ error: "AI service request timed out." }, 504),
      },
    ),
    (err: unknown) => {
      assert(err instanceof LearningCoachClientError)
      assert.equal(err.status, 504)
      assert.equal(err.code, "TIMEOUT")
      return true
    },
  )
  console.log("✓ Gateway timeout (504) handled gracefully")

  // 6. Network failure handling
  await assert.rejects(
    sendLearningCoachRequest(
      {
        task: "mistake-explanation",
        assessmentId: "algebra-readiness",
        questionId: "ALG-LE-001",
        selectedOptionIndex: 1,
      },
      {
        fetcher: async () => {
          throw new TypeError("Failed to fetch")
        },
      },
    ),
    (err: unknown) => {
      assert(err instanceof LearningCoachClientError)
      assert.equal(err.status, null)
      assert.equal(err.code, "NETWORK_ERROR")
      return true
    },
  )
  console.log("✓ Network disconnect handled gracefully")

  console.log("=== ALL LEARNING COACH CLIENT TESTS PASSED ===")
}

void runLearningCoachClientTests().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
