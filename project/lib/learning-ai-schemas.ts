import { z } from "zod"
import {
  ASSESSMENTS,
  QUESTIONS,
  TOPICS,
  type DifficultyLevel,
} from "./assessment-data"
import type { RecommendationKind } from "./adaptive-study-plan"

export const MAX_PRACTICE_QUESTION_COUNT = 5
const MAX_REQUEST_TEXT_LENGTH = 500
const MAX_RESPONSE_TEXT_LENGTH = 1200
const MAX_QUESTION_PROMPT_LENGTH = 500
const MAX_OPTION_LENGTH = 200

const difficultyValues = [
  "foundational",
  "core",
  "advanced",
] as const satisfies readonly DifficultyLevel[]

const recommendationKindValues = [
  "focus",
  "develop",
  "reinforce",
  "run-diagnostic",
] as const satisfies readonly RecommendationKind[]

const difficultySchema = z.enum(difficultyValues)
const recommendationKindSchema = z.enum(recommendationKindValues)

const assessmentIdSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((id) => ASSESSMENTS.some((assessment) => assessment.id === id), {
    message: "Unknown assessment ID.",
  })

const questionIdSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((id) => QUESTIONS.some((question) => question.id === id), {
    message: "Unknown question ID.",
  })

const topicIdSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((id) => TOPICS.some((topic) => topic.id === id), {
    message: "Unknown topic ID.",
  })

const requestTextSchema = (maximumLength: number) =>
  z.string().trim().min(1).max(maximumLength)

const responseTextSchema = (maximumLength: number) =>
  z.string().trim().min(1).max(maximumLength)

export const mistakeExplanationRequestSchema = z
  .object({
    task: z.literal("mistake-explanation"),
    assessmentId: assessmentIdSchema,
    questionId: questionIdSchema,
    selectedOptionIndex: z.number().int().min(0).max(3),
  })
  .strict()
  .superRefine((request, context) => {
    const question = QUESTIONS.find((item) => item.id === request.questionId)
    if (!question) return

    if (question.assessmentId !== request.assessmentId) {
      context.addIssue({
        code: "custom",
        path: ["assessmentId"],
        message: "Question does not belong to this assessment.",
      })
    }

    if (request.selectedOptionIndex >= question.options.length) {
      context.addIssue({
        code: "custom",
        path: ["selectedOptionIndex"],
        message: "Selected option index is outside the question's options.",
      })
    } else if (request.selectedOptionIndex === question.correctIndex) {
      context.addIssue({
        code: "custom",
        path: ["selectedOptionIndex"],
        message: "A mistake explanation requires an incorrect selected answer.",
      })
    }
  })

export const targetedPracticeRequestSchema = z
  .object({
    task: z.literal("targeted-practice"),
    topicId: topicIdSchema,
    difficulty: difficultySchema,
    questionCount: z
      .number()
      .int()
      .min(1)
      .max(MAX_PRACTICE_QUESTION_COUNT),
  })
  .strict()

export const recommendationExplanationRequestSchema = z
  .object({
    task: z.literal("recommendation-explanation"),
    topicId: topicIdSchema,
    kind: recommendationKindSchema,
    reason: requestTextSchema(MAX_REQUEST_TEXT_LENGTH),
    action: requestTextSchema(MAX_REQUEST_TEXT_LENGTH),
    suggestedDifficulty: difficultySchema.nullable(),
    suggestedMinutes: z.number().int().min(1).max(20).nullable(),
  })
  .strict()

export const learningAiRequestSchema = z.discriminatedUnion("task", [
  mistakeExplanationRequestSchema,
  targetedPracticeRequestSchema,
  recommendationExplanationRequestSchema,
])

export const mistakeExplanationResponseSchema = z
  .object({
    explanation: responseTextSchema(MAX_RESPONSE_TEXT_LENGTH),
    nextStep: responseTextSchema(MAX_REQUEST_TEXT_LENGTH),
  })
  .strict()

export const generatedPracticeQuestionSchema = z
  .object({
    prompt: responseTextSchema(MAX_QUESTION_PROMPT_LENGTH),
    options: z.array(responseTextSchema(MAX_OPTION_LENGTH)).length(4),
    correctIndex: z.number().int().min(0).max(3),
    explanation: responseTextSchema(MAX_RESPONSE_TEXT_LENGTH),
  })
  .strict()

export const targetedPracticeResponseSchema = z
  .object({
    questions: z
      .array(generatedPracticeQuestionSchema)
      .min(1)
      .max(MAX_PRACTICE_QUESTION_COUNT),
  })
  .strict()

export const recommendationExplanationResponseSchema = z
  .object({
    explanation: responseTextSchema(MAX_RESPONSE_TEXT_LENGTH),
  })
  .strict()

export type MistakeExplanationRequest = z.infer<
  typeof mistakeExplanationRequestSchema
>
export type TargetedPracticeRequest = z.infer<
  typeof targetedPracticeRequestSchema
>
export type RecommendationExplanationRequest = z.infer<
  typeof recommendationExplanationRequestSchema
>
export type LearningAiRequest = z.infer<typeof learningAiRequestSchema>
export type MistakeExplanationResponse = z.infer<
  typeof mistakeExplanationResponseSchema
>
export type GeneratedPracticeQuestion = z.infer<
  typeof generatedPracticeQuestionSchema
>
export type TargetedPracticeResponse = z.infer<
  typeof targetedPracticeResponseSchema
>
export type RecommendationExplanationResponse = z.infer<
  typeof recommendationExplanationResponseSchema
>
