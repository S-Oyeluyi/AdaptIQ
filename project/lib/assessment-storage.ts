import {
  getAssessmentById,
  getQuestionsForAssessment,
  getTopicById,
} from "./assessment-data"
import type { AssessmentEvaluation } from "./assessment-engine"

export const ASSESSMENT_STORAGE_KEY = "adaptiq:assessment-attempts"
export const ASSESSMENT_STORAGE_VERSION = 1

export interface AssessmentStorageAdapter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type AssessmentStorageErrorCode =
  | "unavailable"
  | "read-failed"
  | "write-failed"
  | "clear-failed"
  | "malformed-json"
  | "unsupported-version"
  | "invalid-data"

export interface AssessmentStorageError {
  code: AssessmentStorageErrorCode
  message: string
}

export type LoadAssessmentAttemptsResult =
  | { ok: true; attempts: AssessmentEvaluation[]; status: "loaded" | "empty" }
  | { ok: false; error: AssessmentStorageError }

export type AssessmentStorageOperationResult =
  | { ok: true }
  | { ok: false; error: AssessmentStorageError }

interface StoredAssessmentAttempts {
  version: number
  attempts: AssessmentEvaluation[]
}

const difficultyMultipliers = {
  foundational: 1,
  core: 1.5,
  advanced: 2,
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0
}

function numbersMatch(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-8
}

function validateAttempts(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return ["Attempts must be an array."]
  }

  const errors: string[] = []
  const attemptIds = new Set<string>()

  for (const [attemptIndex, candidate] of value.entries()) {
    const label = `Attempt at index ${attemptIndex}`
    if (!isRecord(candidate)) {
      errors.push(`${label} must be an object.`)
      continue
    }

    const attempt = candidate
    const stringFields = ["id", "assessmentId", "assessmentTitle", "completedAt"]
    for (const field of stringFields) {
      if (typeof attempt[field] !== "string" || attempt[field].length === 0) {
        errors.push(`${label} has an invalid "${field}".`)
      }
    }

    if (
      typeof attempt.id === "string" &&
      attempt.id.length > 0 &&
      attemptIds.has(attempt.id)
    ) {
      errors.push(`${label} duplicates attempt ID "${attempt.id}".`)
    }
    if (typeof attempt.id === "string") attemptIds.add(attempt.id)

    const assessment =
      typeof attempt.assessmentId === "string"
        ? getAssessmentById(attempt.assessmentId)
        : undefined
    if (!assessment) {
      errors.push(`${label} references an unknown assessment.`)
    }

    if (
      typeof attempt.completedAt !== "string" ||
      !Number.isFinite(Date.parse(attempt.completedAt))
    ) {
      errors.push(`${label} has an invalid completion timestamp.`)
    }
    if (!isFiniteNumber(attempt.durationSeconds) || attempt.durationSeconds < 0) {
      errors.push(`${label} has an invalid duration.`)
    }
    if (
      !isNonNegativeInteger(attempt.totalQuestions) ||
      !isNonNegativeInteger(attempt.answeredQuestions) ||
      !isNonNegativeInteger(attempt.correctCount)
    ) {
      errors.push(`${label} has invalid question counts.`)
    }
    if (
      !isFiniteNumber(attempt.overallScore) ||
      attempt.overallScore < 0 ||
      attempt.overallScore > 100
    ) {
      errors.push(`${label} has an invalid overall score.`)
    }
    if (
      !isFiniteNumber(attempt.earnedWeightedScore) ||
      attempt.earnedWeightedScore < 0 ||
      !isFiniteNumber(attempt.maximumWeightedScore) ||
      attempt.maximumWeightedScore < 0 ||
      attempt.earnedWeightedScore > attempt.maximumWeightedScore
    ) {
      errors.push(`${label} has invalid weighted score totals.`)
    }
    if (!Array.isArray(attempt.responses)) {
      errors.push(`${label} responses must be an array.`)
    }
    if (!isRecord(attempt.topicBreakdown)) {
      errors.push(`${label} topic breakdown must be an object.`)
    }
    if (
      !assessment ||
      !Array.isArray(attempt.responses) ||
      !isRecord(attempt.topicBreakdown)
    ) {
      continue
    }
    if (attempt.assessmentTitle !== assessment.title) {
      errors.push(`${label} assessment title does not match its assessment ID.`)
    }

    const questions = getQuestionsForAssessment(assessment.id)
    const questionsById = new Map(questions.map((question) => [question.id, question]))
    const responsesByQuestionId = new Map<string, Record<string, unknown>>()
    let responseEarnedScore = 0
    let responseMaximumScore = 0
    let answeredQuestions = 0
    let correctCount = 0

    for (const [responseIndex, response] of attempt.responses.entries()) {
      const responseLabel = `${label} response ${responseIndex}`
      if (!isRecord(response)) {
        errors.push(`${responseLabel} must be an object.`)
        continue
      }

      const question =
        typeof response.questionId === "string"
          ? questionsById.get(response.questionId)
          : undefined
      if (!question) {
        errors.push(`${responseLabel} references an unknown assessment question.`)
        continue
      }
      if (responsesByQuestionId.has(question.id)) {
        errors.push(`${label} contains duplicate response for "${question.id}".`)
      }
      responsesByQuestionId.set(question.id, response)

      if (response.topicId !== question.topicId || !getTopicById(question.topicId)) {
        errors.push(`${responseLabel} has an invalid topic reference.`)
      }

      const selectedOptionIndex = response.selectedOptionIndex
      const isAnswered = selectedOptionIndex !== null
      if (
        isAnswered &&
        (!Number.isInteger(selectedOptionIndex) ||
          (selectedOptionIndex as number) < 0 ||
          (selectedOptionIndex as number) >= question.options.length)
      ) {
        errors.push(`${responseLabel} has an invalid selected option.`)
      }

      const expectedCorrect =
        isAnswered && selectedOptionIndex === question.correctIndex
      if (typeof response.isCorrect !== "boolean" || response.isCorrect !== expectedCorrect) {
        errors.push(`${responseLabel} has an inconsistent correctness value.`)
      }

      const multiplier = difficultyMultipliers[question.difficulty]
      const expectedMaximum = question.weight * multiplier
      if (!isFiniteNumber(response.maxScore) || !numbersMatch(response.maxScore, expectedMaximum)) {
        errors.push(`${responseLabel} has an invalid maximum score.`)
      } else {
        responseMaximumScore += response.maxScore
      }
      const expectedEarned = expectedCorrect ? expectedMaximum : 0
      if (!isFiniteNumber(response.earnedScore) || !numbersMatch(response.earnedScore, expectedEarned)) {
        errors.push(`${responseLabel} has an invalid earned score.`)
      } else {
        responseEarnedScore += response.earnedScore
      }

      if (isAnswered) answeredQuestions += 1
      if (expectedCorrect) correctCount += 1
    }

    if (
      attempt.responses.length !== attempt.totalQuestions ||
      questions.length !== attempt.totalQuestions
    ) {
      errors.push(`${label} total question count does not match its responses.`)
    }
    if (answeredQuestions !== attempt.answeredQuestions) {
      errors.push(`${label} answered question count does not match its responses.`)
    }
    if (correctCount !== attempt.correctCount) {
      errors.push(`${label} correct count does not match its responses.`)
    }
    if (
      isFiniteNumber(attempt.earnedWeightedScore) &&
      !numbersMatch(attempt.earnedWeightedScore, responseEarnedScore)
    ) {
      errors.push(`${label} earned weighted score does not match its responses.`)
    }
    if (
      isFiniteNumber(attempt.maximumWeightedScore) &&
      !numbersMatch(attempt.maximumWeightedScore, responseMaximumScore)
    ) {
      errors.push(`${label} maximum weighted score does not match its responses.`)
    }

    const expectedOverall =
      responseMaximumScore > 0
        ? (responseEarnedScore / responseMaximumScore) * 100
        : 0
    if (
      isFiniteNumber(attempt.overallScore) &&
      !numbersMatch(attempt.overallScore, expectedOverall)
    ) {
      errors.push(`${label} overall score does not match its responses.`)
    }

    const topicQuestionGroups = new Map<string, typeof questions>()
    for (const question of questions) {
      const group = topicQuestionGroups.get(question.topicId) ?? []
      group.push(question)
      topicQuestionGroups.set(question.topicId, group)
    }
    const topicIds = Object.keys(attempt.topicBreakdown)
    if (
      topicIds.length !== topicQuestionGroups.size ||
      topicIds.some((topicId) => !topicQuestionGroups.has(topicId))
    ) {
      errors.push(`${label} topic breakdown does not match its questions.`)
    }

    for (const [topicId, topicQuestions] of topicQuestionGroups) {
      const topicResult = attempt.topicBreakdown[topicId]
      if (!isRecord(topicResult)) {
        errors.push(`${label} has an invalid result for topic "${topicId}".`)
        continue
      }
      const topic = getTopicById(topicId)
      const topicResponses = topicQuestions
        .map((question) => responsesByQuestionId.get(question.id))
        .filter((response): response is Record<string, unknown> => response !== undefined)
      const topicAnswered = topicResponses.filter(
        (response) => response.selectedOptionIndex !== null,
      ).length
      const topicCorrect = topicResponses.filter(
        (response) => response.isCorrect === true,
      ).length
      const topicEarned = topicResponses.reduce(
        (sum, response) => sum + (isFiniteNumber(response.earnedScore) ? response.earnedScore : 0),
        0,
      )
      const topicMaximum = topicQuestions.reduce(
        (sum, question) =>
          sum + question.weight * difficultyMultipliers[question.difficulty],
        0,
      )
      const expectedAccuracy =
        topicAnswered > 0 ? (topicCorrect / topicAnswered) * 100 : 0
      const expectedMastery =
        topicAnswered > 0 && topicMaximum > 0
          ? (topicEarned / topicMaximum) * 100
          : null

      if (
        topicResult.topicId !== topicId ||
        topicResult.topicName !== topic?.name ||
        topicResult.totalQuestions !== topicQuestions.length ||
        topicResult.answeredQuestions !== topicAnswered ||
        topicResult.correctQuestions !== topicCorrect ||
        !isFiniteNumber(topicResult.accuracy) ||
        !numbersMatch(topicResult.accuracy, expectedAccuracy) ||
        !isFiniteNumber(topicResult.weightedScore) ||
        !numbersMatch(topicResult.weightedScore, topicEarned) ||
        !isFiniteNumber(topicResult.maximumWeightedScore) ||
        !numbersMatch(topicResult.maximumWeightedScore, topicMaximum) ||
        !(
          (topicResult.masteryScore === null && expectedMastery === null) ||
          (isFiniteNumber(topicResult.masteryScore) &&
            expectedMastery !== null &&
            numbersMatch(topicResult.masteryScore, expectedMastery))
        )
      ) {
        errors.push(`${label} has inconsistent results for topic "${topicId}".`)
      }
    }
  }

  return errors
}

function getStorage(
  storage?: AssessmentStorageAdapter,
): AssessmentStorageAdapter | undefined {
  if (storage) return storage
  if (typeof window === "undefined") return undefined

  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function failure(
  code: AssessmentStorageErrorCode,
  message: string,
): Extract<AssessmentStorageOperationResult, { ok: false }> {
  return { ok: false, error: { code, message } }
}

export function saveAssessmentAttempts(
  attempts: readonly AssessmentEvaluation[],
  storage?: AssessmentStorageAdapter,
): AssessmentStorageOperationResult {
  const validationErrors = validateAttempts(attempts)
  if (validationErrors.length > 0) {
    return failure(
      "invalid-data",
      `Assessment attempts were not saved: ${validationErrors.join(" ")}`,
    )
  }

  const target = getStorage(storage)
  if (!target) {
    return failure("unavailable", "Browser storage is not available.")
  }

  try {
    const envelope: StoredAssessmentAttempts = {
      version: ASSESSMENT_STORAGE_VERSION,
      attempts: [...attempts],
    }
    target.setItem(ASSESSMENT_STORAGE_KEY, JSON.stringify(envelope))
    return { ok: true }
  } catch {
    return failure("write-failed", "Assessment attempts could not be saved.")
  }
}

export function loadAssessmentAttempts(
  storage?: AssessmentStorageAdapter,
): LoadAssessmentAttemptsResult {
  const target = getStorage(storage)
  if (!target) {
    return failure("unavailable", "Browser storage is not available.")
  }

  let serialized: string | null
  try {
    serialized = target.getItem(ASSESSMENT_STORAGE_KEY)
  } catch {
    return failure("read-failed", "Assessment attempts could not be read.")
  }

  if (serialized === null) {
    return { ok: true, attempts: [], status: "empty" }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    return failure("malformed-json", "Saved assessment data is not valid JSON.")
  }

  if (!isRecord(parsed) || !Number.isInteger(parsed.version)) {
    return failure("invalid-data", "Saved assessment data has an invalid format.")
  }
  if (parsed.version !== ASSESSMENT_STORAGE_VERSION) {
    return failure(
      "unsupported-version",
      `Saved assessment data version ${parsed.version} is not supported.`,
    )
  }

  const validationErrors = validateAttempts(parsed.attempts)
  if (validationErrors.length > 0) {
    return failure(
      "invalid-data",
      `Saved assessment data failed validation: ${validationErrors.join(" ")}`,
    )
  }

  const attempts = parsed.attempts as AssessmentEvaluation[]
  return {
    ok: true,
    attempts,
    status: attempts.length > 0 ? "loaded" : "empty",
  }
}

export function clearAssessmentAttempts(
  storage?: AssessmentStorageAdapter,
): AssessmentStorageOperationResult {
  const target = getStorage(storage)
  if (!target) {
    return failure("unavailable", "Browser storage is not available.")
  }

  try {
    target.removeItem(ASSESSMENT_STORAGE_KEY)
    return { ok: true }
  } catch {
    return failure("clear-failed", "Assessment attempts could not be cleared.")
  }
}
