import {
  getAssessmentById,
  getTopicById,
  type AssessmentAttempt,
  type AssessmentDefinition,
  type DiagnosticQuestion,
  type DifficultyLevel,
  type QuestionResponse,
  type TopicResult,
} from "./assessment-data"

const DIFFICULTY_MULTIPLIERS: Record<DifficultyLevel, number> = {
  foundational: 1,
  core: 1.5,
  advanced: 2,
}

export interface TopicAssessmentResult extends Omit<TopicResult, "masteryScore"> {
  answeredQuestions: number
  maximumWeightedScore: number
  masteryScore: number | null
}

export type AssessmentEvaluation = Omit<AssessmentAttempt, "topicBreakdown"> & {
  answeredQuestions: number
  earnedWeightedScore: number
  maximumWeightedScore: number
  topicBreakdown: Record<string, TopicAssessmentResult>
}

export class AssessmentEvaluationError extends Error {
  readonly errors: string[]

  constructor(errors: string[]) {
    super(`Assessment evaluation failed: ${errors.join(" ")}`)
    this.name = "AssessmentEvaluationError"
    this.errors = errors
  }
}

function getAssessment(
  assessmentOrId: AssessmentDefinition | string,
): AssessmentDefinition {
  const assessment =
    typeof assessmentOrId === "string"
      ? getAssessmentById(assessmentOrId)
      : assessmentOrId

  if (!assessment) {
    throw new AssessmentEvaluationError([
      `Unknown assessment "${assessmentOrId}".`,
    ])
  }

  return assessment
}

function validateEvaluationInput(
  assessment: AssessmentDefinition,
  questions: readonly DiagnosticQuestion[],
  selectedAnswers: Readonly<Record<string, number | null | undefined>>,
  durationSeconds: number,
): void {
  const errors: string[] = []
  const questionIds = new Set<string>()

  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    errors.push("Duration must be a non-negative finite number of seconds.")
  }

  for (const question of questions) {
    if (!question.id.trim()) {
      errors.push("Every question must have a non-empty ID.")
    } else if (questionIds.has(question.id)) {
      errors.push(`Duplicate question ID "${question.id}".`)
    }
    questionIds.add(question.id)

    if (question.assessmentId !== assessment.id) {
      errors.push(
        `Question "${question.id}" belongs to assessment "${question.assessmentId}", not "${assessment.id}".`,
      )
    }
    if (!assessment.topicIds.includes(question.topicId)) {
      errors.push(
        `Question "${question.id}" uses topic "${question.topicId}", which is not listed for assessment "${assessment.id}".`,
      )
    }
    if (!getTopicById(question.topicId)) {
      errors.push(
        `Question "${question.id}" references unknown topic "${question.topicId}".`,
      )
    }
    if (
      !Number.isInteger(question.correctIndex) ||
      question.correctIndex < 0 ||
      question.correctIndex >= question.options.length
    ) {
      errors.push(`Question "${question.id}" has an invalid correct answer index.`)
    }
    if (!Number.isFinite(question.weight) || question.weight <= 0) {
      errors.push(`Question "${question.id}" must have a positive finite weight.`)
    }
    if (
      !Object.prototype.hasOwnProperty.call(
        DIFFICULTY_MULTIPLIERS,
        question.difficulty,
      )
    ) {
      errors.push(`Question "${question.id}" has an unsupported difficulty.`)
    }
  }

  for (const [questionId, selectedOptionIndex] of Object.entries(selectedAnswers)) {
    if (!questionIds.has(questionId)) {
      errors.push(`Answer references unknown question "${questionId}".`)
      continue
    }

    if (selectedOptionIndex == null) {
      continue
    }

    const question = questions.find((item) => item.id === questionId)
    if (
      !Number.isInteger(selectedOptionIndex) ||
      selectedOptionIndex < 0 ||
      selectedOptionIndex >= (question?.options.length ?? 0)
    ) {
      errors.push(
        `Answer for question "${questionId}" has an invalid option index.`,
      )
    }
  }

  if (errors.length > 0) {
    throw new AssessmentEvaluationError(errors)
  }
}

function evaluateQuestion(
  question: DiagnosticQuestion,
  selectedOptionIndex: number | null,
): QuestionResponse {
  // The maximum uses the question's base weight scaled by its difficulty.
  const maxScore = question.weight * DIFFICULTY_MULTIPLIERS[question.difficulty]
  const isCorrect =
    selectedOptionIndex !== null &&
    selectedOptionIndex === question.correctIndex

  return {
    questionId: question.id,
    topicId: question.topicId,
    selectedOptionIndex,
    isCorrect,
    earnedScore: isCorrect ? maxScore : 0,
    maxScore,
  }
}

function calculateTopicBreakdown(
  questions: readonly DiagnosticQuestion[],
  responses: readonly QuestionResponse[],
): Record<string, TopicAssessmentResult> {
  const responseByQuestionId = new Map(
    responses.map((response) => [response.questionId, response]),
  )
  const breakdown: Record<string, TopicAssessmentResult> = {}

  for (const question of questions) {
    let result = breakdown[question.topicId]
    if (!result) {
      const topic = getTopicById(question.topicId)
      if (!topic) {
        throw new AssessmentEvaluationError([
          `Question "${question.id}" references unknown topic "${question.topicId}".`,
        ])
      }

      result = breakdown[question.topicId] = {
        topicId: topic.id,
        topicName: topic.name,
        totalQuestions: 0,
        answeredQuestions: 0,
        correctQuestions: 0,
        accuracy: 0,
        weightedScore: 0,
        maximumWeightedScore: 0,
        masteryScore: null,
      }
    }

    const response = responseByQuestionId.get(question.id)
    result.totalQuestions += 1
    result.maximumWeightedScore += response?.maxScore ?? 0

    if (response && response.selectedOptionIndex !== null) {
      result.answeredQuestions += 1
      result.weightedScore += response.earnedScore
      if (response.isCorrect) {
        result.correctQuestions += 1
      }
    }
  }

  for (const result of Object.values(breakdown)) {
    result.accuracy =
      result.answeredQuestions === 0
        ? 0
        : (result.correctQuestions / result.answeredQuestions) * 100

    // Unanswered questions are not evidence, so leave mastery unestimated.
    result.masteryScore =
      result.answeredQuestions === 0 || result.maximumWeightedScore === 0
        ? null
        : (result.weightedScore / result.maximumWeightedScore) * 100
  }

  return breakdown
}

export function evaluateAssessment(
  assessmentOrId: AssessmentDefinition | string,
  questions: readonly DiagnosticQuestion[],
  selectedAnswers: Readonly<Record<string, number | null | undefined>>,
  durationSeconds = 0,
): AssessmentEvaluation {
  const assessment = getAssessment(assessmentOrId)
  validateEvaluationInput(
    assessment,
    questions,
    selectedAnswers,
    durationSeconds,
  )

  const responses = questions.map((question) =>
    evaluateQuestion(question, selectedAnswers[question.id] ?? null),
  )
  const topicBreakdown = calculateTopicBreakdown(questions, responses)
  const earnedWeightedScore = responses.reduce(
    (total, response) => total + response.earnedScore,
    0,
  )
  const maximumWeightedScore = responses.reduce(
    (total, response) => total + response.maxScore,
    0,
  )
  const answeredQuestions = responses.filter(
    (response) => response.selectedOptionIndex !== null,
  ).length
  const correctCount = responses.filter((response) => response.isCorrect).length

  // Unanswered items remain in the denominator, and an empty assessment scores zero.
  const overallScore =
    maximumWeightedScore === 0
      ? 0
      : (earnedWeightedScore / maximumWeightedScore) * 100

  return {
    id: globalThis.crypto.randomUUID(),
    assessmentId: assessment.id,
    assessmentTitle: assessment.title,
    completedAt: new Date().toISOString(),
    durationSeconds,
    totalQuestions: questions.length,
    answeredQuestions,
    correctCount,
    overallScore,
    earnedWeightedScore,
    maximumWeightedScore,
    responses,
    topicBreakdown,
  }
}
