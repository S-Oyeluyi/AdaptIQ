import assert from "node:assert/strict"
import {
  ASSESSMENTS,
  QUESTIONS,
  TOPICS,
} from "../lib/assessment-data"
import {
  MAX_PRACTICE_QUESTION_COUNT,
  generatedPracticeQuestionSchema,
  learningAiRequestSchema,
  mistakeExplanationRequestSchema,
  mistakeExplanationResponseSchema,
  recommendationExplanationRequestSchema,
  recommendationExplanationResponseSchema,
  targetedPracticeRequestSchema,
  targetedPracticeResponseSchema,
} from "../lib/learning-ai-schemas"

const question = QUESTIONS[0]
const assessment = ASSESSMENTS.find(
  (item) => item.id === question.assessmentId,
)!
const incorrectOptionIndex = question.correctIndex === 0 ? 1 : 0

const validMistakeRequest = {
  task: "mistake-explanation",
  assessmentId: assessment.id,
  questionId: question.id,
  selectedOptionIndex: incorrectOptionIndex,
}

const validPracticeRequest = {
  task: "targeted-practice",
  topicId: TOPICS[0].id,
  difficulty: "core",
  questionCount: 3,
}

const validRecommendationRequest = {
  task: "recommendation-explanation",
  topicId: TOPICS[0].id,
  kind: "focus",
  reason: "Recent answers show a gap in this topic.",
  action: "Practise foundational questions.",
  suggestedDifficulty: "foundational",
  suggestedMinutes: 8,
}

const validGeneratedQuestion = {
  prompt: "Solve 2x + 4 = 10.",
  options: ["2", "3", "4", "5"],
  correctIndex: 1,
  explanation: "Subtract 4, then divide both sides by 2 to get x = 3.",
}

function runLearningAiSchemaTests(): void {
  assert.equal(mistakeExplanationRequestSchema.safeParse(validMistakeRequest).success, true)
  assert.equal(targetedPracticeRequestSchema.safeParse(validPracticeRequest).success, true)
  assert.equal(
    recommendationExplanationRequestSchema.safeParse(validRecommendationRequest).success,
    true,
  )
  assert.equal(learningAiRequestSchema.safeParse(validMistakeRequest).success, true)
  assert.equal(learningAiRequestSchema.safeParse(validPracticeRequest).success, true)
  assert.equal(
    learningAiRequestSchema.safeParse(validRecommendationRequest).success,
    true,
  )

  assert.equal(
    mistakeExplanationRequestSchema.safeParse({
      ...validMistakeRequest,
      selectedOptionIndex: undefined,
    }).success,
    false,
  )
  assert.equal(
    targetedPracticeRequestSchema.safeParse({
      ...validPracticeRequest,
      questionCount: undefined,
    }).success,
    false,
  )
  assert.equal(
    recommendationExplanationRequestSchema.safeParse({
      ...validRecommendationRequest,
      reason: undefined,
    }).success,
    false,
  )

  assert.equal(
    mistakeExplanationRequestSchema.safeParse({
      ...validMistakeRequest,
      questionId: "unknown-question",
    }).success,
    false,
  )
  assert.equal(
    mistakeExplanationRequestSchema.safeParse({
      ...validMistakeRequest,
      assessmentId: "unknown-assessment",
    }).success,
    false,
  )
  assert.equal(
    mistakeExplanationRequestSchema.safeParse({
      ...validMistakeRequest,
      assessmentId: "geometry-essentials",
    }).success,
    false,
  )
  assert.equal(
    targetedPracticeRequestSchema.safeParse({
      ...validPracticeRequest,
      topicId: "unknown-topic",
    }).success,
    false,
  )
  assert.equal(
    targetedPracticeRequestSchema.safeParse({
      ...validPracticeRequest,
      difficulty: "expert",
    }).success,
    false,
  )
  assert.equal(
    targetedPracticeRequestSchema.safeParse({
      ...validPracticeRequest,
      questionCount: MAX_PRACTICE_QUESTION_COUNT + 1,
    }).success,
    false,
  )
  assert.equal(
    mistakeExplanationRequestSchema.safeParse({
      ...validMistakeRequest,
      selectedOptionIndex: question.correctIndex,
    }).success,
    false,
  )
  assert.equal(
    mistakeExplanationRequestSchema.safeParse({
      ...validMistakeRequest,
      isCorrect: false,
    }).success,
    false,
  )

  assert.equal(
    mistakeExplanationResponseSchema.safeParse({
      explanation: "This explains the correct reasoning.",
      nextStep: "Try isolating the variable first.",
    }).success,
    true,
  )
  assert.equal(
    mistakeExplanationResponseSchema.safeParse({
      explanation: "",
      nextStep: "Try again.",
    }).success,
    false,
  )
  assert.equal(
    mistakeExplanationResponseSchema.safeParse({
      explanation: "This explains the correct reasoning.",
      nextStep: "",
    }).success,
    false,
  )
  assert.equal(
    recommendationExplanationResponseSchema.safeParse({
      explanation: "This topic is recommended based on your recent evidence.",
    }).success,
    true,
  )
  assert.equal(
    recommendationExplanationResponseSchema.safeParse({
      explanation: "",
    }).success,
    false,
  )
  assert.equal(
    recommendationExplanationResponseSchema.safeParse({
      explanation: "e".repeat(1201),
    }).success,
    false,
  )
  assert.equal(
    recommendationExplanationRequestSchema.safeParse({
      ...validRecommendationRequest,
      action: "a".repeat(501),
    }).success,
    false,
  )
  assert.equal(
    recommendationExplanationRequestSchema.safeParse({
      ...validRecommendationRequest,
      suggestedDifficulty: "expert",
    }).success,
    false,
  )

  assert.equal(
    generatedPracticeQuestionSchema.safeParse(validGeneratedQuestion).success,
    true,
  )
  assert.equal(
    generatedPracticeQuestionSchema.safeParse({
      ...validGeneratedQuestion,
      options: ["2", "3", "4"],
    }).success,
    false,
  )
  assert.equal(
    generatedPracticeQuestionSchema.safeParse({
      ...validGeneratedQuestion,
      correctIndex: 4,
    }).success,
    false,
  )
  assert.equal(
    generatedPracticeQuestionSchema.safeParse({
      ...validGeneratedQuestion,
      explanation: "",
    }).success,
    false,
  )
  assert.equal(
    generatedPracticeQuestionSchema.safeParse({
      ...validGeneratedQuestion,
      prompt: "p".repeat(501),
    }).success,
    false,
  )
  assert.equal(
    targetedPracticeResponseSchema.safeParse({
      questions: [validGeneratedQuestion],
    }).success,
    true,
  )
  assert.equal(
    targetedPracticeResponseSchema.safeParse({
      questions: Array.from(
        { length: MAX_PRACTICE_QUESTION_COUNT + 1 },
        () => validGeneratedQuestion,
      ),
    }).success,
    false,
  )
}

runLearningAiSchemaTests()
console.log("AI request and response schema tests passed.")
