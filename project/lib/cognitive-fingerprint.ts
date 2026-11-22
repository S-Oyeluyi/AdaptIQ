/**
 * cognitive-fingerprint.ts
 *
 * Aggregates assessment evidence from one or more AssessmentEvaluation attempts
 * and produces a structured Cognitive Fingerprint.
 *
 * Aggregation rules:
 * - For each unique question ID, the LATEST *answered* response is used.
 * - An unanswered response in a later retake does NOT erase a previously
 *   answered response (evidence is never downgraded to absence).
 * - Only answered questions count as evidence (selectedOptionIndex !== null).
 * - If a topic has zero answered questions, masteryEstimate remains null.
 * - Accuracy = correctAnswers / answeredQuestions  (not / totalQuestions)
 * - Mastery  = earnedWeightedScore / maximumWeightedScoreOfAnsweredQuestions
 *
 * These are provisional estimates based on available diagnostic questions only.
 * They are not scientifically validated measures of ability or intelligence.
 */

import { TOPICS, type Topic } from "./assessment-data"
import type { AssessmentEvaluation, TopicAssessmentResult } from "./assessment-engine"

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type EvidenceStatus =
  | "sufficient"       // ≥1 answered question
  | "none"             // no attempts on any assessment that contains this topic

export interface TopicFingerprint {
  /** Canonical topic identifier from assessment-data TOPICS */
  topicId: string
  topicName: string
  domain: string
  /** Number of unique questions for which an answered response exists */
  answeredQuestions: number
  correctAnswers: number
  incorrectAnswers: number
  /**
   * Accuracy = correctAnswers / answeredQuestions × 100
   * Null when answeredQuestions === 0
   */
  accuracy: number | null
  earnedWeightedScore: number
  maximumWeightedScore: number
  /**
   * Provisional mastery = earnedWeightedScore / maximumWeightedScore × 100
   * Null when answeredQuestions === 0
   */
  masteryEstimate: number | null
  evidenceStatus: EvidenceStatus
}

export interface CognitiveFingerprint {
  topics: TopicFingerprint[]
  /**
   * Overall mastery across all topics with evidence.
   * Null when no answered questions exist at all.
   */
  overallMastery: number | null
  /** Number of distinct topics with at least one answered question */
  topicsWithEvidence: number
  /** Number of distinct question IDs for which an answered response exists */
  totalAnsweredQuestions: number
  /** ISO timestamp of the most recent attempt included */
  lastUpdated: string | null
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * A snapshot of the best-known response for one question.
 * "Best-known" = the latest attempt that actually provided an answer.
 */
interface BestResponse {
  topicId: string
  isCorrect: boolean
  earnedScore: number
  maxScore: number
  /** ISO timestamp of the attempt this came from */
  attemptTimestamp: string
}

/**
 * Walk attempts in chronological order (oldest first so that later entries
 * overwrite earlier ones) and build a map of:
 *   questionId → BestResponse
 *
 * Rules applied here:
 * 1. Attempts are sorted by `completedAt` ascending (oldest → newest).
 * 2. For each response in an attempt:
 *    - If `selectedOptionIndex` is null (unanswered), skip — do not overwrite
 *      a previously recorded answered response.
 *    - If `selectedOptionIndex` is not null (answered), record or overwrite
 *      the entry for that questionId.
 */
function buildBestResponseMap(
  attempts: readonly AssessmentEvaluation[],
): Map<string, BestResponse> {
  // Sort ascending so that later attempts overwrite older ones naturally
  const sorted = [...attempts].sort(
    (a, b) =>
      new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
  )

  const best = new Map<string, BestResponse>()

  for (const attempt of sorted) {
    for (const response of attempt.responses) {
      // Skip unanswered — never downgrade evidence to absence
      if (response.selectedOptionIndex === null) continue

      best.set(response.questionId, {
        topicId: response.topicId,
        isCorrect: response.isCorrect,
        earnedScore: response.earnedScore,
        maxScore: response.maxScore,
        attemptTimestamp: attempt.completedAt,
      })
    }
  }

  return best
}

/**
 * Aggregate the best-response map into per-topic accumulators.
 */
function aggregateByTopic(
  best: Map<string, BestResponse>,
): Map<string, {
  answeredQuestions: number
  correctAnswers: number
  incorrectAnswers: number
  earnedWeightedScore: number
  maximumWeightedScore: number
}> {
  const acc = new Map<string, {
    answeredQuestions: number
    correctAnswers: number
    incorrectAnswers: number
    earnedWeightedScore: number
    maximumWeightedScore: number
  }>()

  for (const resp of best.values()) {
    if (!acc.has(resp.topicId)) {
      acc.set(resp.topicId, {
        answeredQuestions: 0,
        correctAnswers: 0,
        incorrectAnswers: 0,
        earnedWeightedScore: 0,
        maximumWeightedScore: 0,
      })
    }
    const entry = acc.get(resp.topicId)!
    entry.answeredQuestions += 1
    entry.earnedWeightedScore += resp.earnedScore
    entry.maximumWeightedScore += resp.maxScore
    if (resp.isCorrect) {
      entry.correctAnswers += 1
    } else {
      entry.incorrectAnswers += 1
    }
  }

  return acc
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a CognitiveFingerprint from zero or more AssessmentEvaluation attempts.
 *
 * Safe to call with an empty array — returns a fingerprint where every topic
 * has `evidenceStatus: "none"` and `masteryEstimate: null`.
 */
export function computeCognitiveFingerprint(
  attempts: readonly AssessmentEvaluation[],
): CognitiveFingerprint {
  const bestResponses = buildBestResponseMap(attempts)
  const topicAcc = aggregateByTopic(bestResponses)

  let globalEarned = 0
  let globalMax = 0
  let topicsWithEvidence = 0

  const topicResults: TopicFingerprint[] = TOPICS.map((topic: Topic) => {
    const acc = topicAcc.get(topic.id)

    if (!acc || acc.answeredQuestions === 0) {
      return {
        topicId: topic.id,
        topicName: topic.name,
        domain: topic.domain,
        answeredQuestions: 0,
        correctAnswers: 0,
        incorrectAnswers: 0,
        accuracy: null,
        earnedWeightedScore: 0,
        maximumWeightedScore: 0,
        masteryEstimate: null,
        evidenceStatus: "none",
      } satisfies TopicFingerprint
    }

    const accuracy = (acc.correctAnswers / acc.answeredQuestions) * 100
    const mastery =
      acc.maximumWeightedScore > 0
        ? (acc.earnedWeightedScore / acc.maximumWeightedScore) * 100
        : null

    globalEarned += acc.earnedWeightedScore
    globalMax += acc.maximumWeightedScore
    topicsWithEvidence += 1

    return {
      topicId: topic.id,
      topicName: topic.name,
      domain: topic.domain,
      answeredQuestions: acc.answeredQuestions,
      correctAnswers: acc.correctAnswers,
      incorrectAnswers: acc.incorrectAnswers,
      accuracy,
      earnedWeightedScore: acc.earnedWeightedScore,
      maximumWeightedScore: acc.maximumWeightedScore,
      masteryEstimate: mastery,
      evidenceStatus: "sufficient",
    } satisfies TopicFingerprint
  })

  const overallMastery =
    globalMax > 0 ? (globalEarned / globalMax) * 100 : null

  // Find the timestamp of the most recent attempt
  let lastUpdated: string | null = null
  for (const attempt of attempts) {
    if (
      lastUpdated === null ||
      new Date(attempt.completedAt) > new Date(lastUpdated)
    ) {
      lastUpdated = attempt.completedAt
    }
  }

  return {
    topics: topicResults,
    overallMastery,
    topicsWithEvidence,
    totalAnsweredQuestions: bestResponses.size,
    lastUpdated,
  }
}

// ---------------------------------------------------------------------------
// Derived helpers for the UI
// ---------------------------------------------------------------------------

/**
 * Returns the colour token to use for a mastery score, following the same
 * conventions used in the existing dashboard styling.
 */
export function masteryColor(masteryEstimate: number | null): string {
  if (masteryEstimate === null) return "amber"
  if (masteryEstimate >= 75) return "green"
  if (masteryEstimate >= 50) return "cyan"
  return "amber"
}

/**
 * Returns a short human-readable label for a mastery estimate.
 */
export function masteryLabel(masteryEstimate: number | null): string {
  if (masteryEstimate === null) return "Insufficient assessment data"
  if (masteryEstimate >= 75) return "Strong understanding"
  if (masteryEstimate >= 50) return "Developing understanding"
  return "Needs attention"
}

/**
 * Returns topics sorted by mastery descending (topics with no evidence last).
 * Used to find the strongest and weakest topics with evidence.
 */
export function sortedByMastery(
  topics: readonly TopicFingerprint[],
): TopicFingerprint[] {
  return [...topics].sort((a, b) => {
    if (a.masteryEstimate === null && b.masteryEstimate === null) return 0
    if (a.masteryEstimate === null) return 1
    if (b.masteryEstimate === null) return -1
    return b.masteryEstimate - a.masteryEstimate
  })
}
