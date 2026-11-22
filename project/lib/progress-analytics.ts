/**
 * progress-analytics.ts
 *
 * Computes structured learning progress and analytics from actual assessment attempts.
 *
 * Calculation & Reporting Rules:
 * - Each completed attempt is represented separately in history; retakes never overwrite past records.
 * - Overall progress tracks weighted assessment scores across chronological attempts.
 * - Comparing scores across different assessment types includes explicit notes regarding differing topic domains.
 * - Topic-level comparison requires at least 2 attempts covering the given topic. Single-attempt topics are
 *   labelled as baseline; unassessed topics are clearly marked as awaiting diagnostic evidence.
 * - Retakes on identical questions are analyzed at the item level to verify genuine improvement rather than
 *   assuming growth merely from question volume.
 * - Insufficient evidence states (0 attempts or 1 attempt) strictly avoid inventing fictitious gains or trends.
 */

import { TOPICS, type Topic } from "./assessment-data"
import type { AssessmentEvaluation } from "./assessment-engine"

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export type TopicProgressStatus = "unassessed" | "baseline" | "improved" | "declined" | "steady"

export interface TopicProgressItem {
  topicId: string
  topicName: string
  domain: string
  status: TopicProgressStatus
  attemptsCount: number
  /** Score on latest attempt covering this topic (0-100), or null if unassessed */
  currentScore: number | null
  /** Score on prior attempt covering this topic (0-100), or null if < 2 attempts */
  previousScore: number | null
  /** Score difference: currentScore - previousScore, or null if not comparable */
  scoreChange: number | null
  /** Whether 2+ attempts provide comparable evidence */
  comparableEvidence: boolean
  /** Descriptive status label */
  statusLabel: string
  /** Item-level retake details if repeated questions were answered */
  retakeImprovementNote: string | null
}

export interface AttemptHistoryItem {
  id: string
  attemptNumber: number
  assessmentId: string
  assessmentTitle: string
  completedAt: string
  dateLabel: string
  timeLabel: string
  durationSeconds: number
  durationFormatted: string
  totalQuestions: number
  answeredQuestions: number
  correctCount: number
  scorePercentage: number
  earnedWeightedScore: number
  maximumWeightedScore: number
  color: "cyan" | "violet" | "amber" | "green"
  topicScores: {
    topicId: string
    topicName: string
    score: number | null
    correct: number
    total: number
  }[]
}

export interface ProgressChartPoint {
  attemptNumber: number
  label: string
  shortLabel: string
  date: string
  score: number
  assessmentTitle: string
  durationMinutes: number
  correctCount: number
  totalQuestions: number
}

export type TrendStatus = "no-data" | "baseline-only" | "improving" | "declining" | "steady" | "cross-assessment"

export interface ProgressAnalytics {
  hasData: boolean
  hasMultipleAttempts: boolean
  totalAttempts: number
  totalTimeSeconds: number
  totalTimeFormatted: string
  totalQuestionsAnswered: number
  totalCorrectAnswers: number
  overallAccuracy: number | null
  averageScore: number | null

  // Overall progress trend
  initialScore: number | null
  latestScore: number | null
  overallScoreGrowth: number | null
  overallTrendStatus: TrendStatus
  overallTrendSummary: string
  isSingleAssessmentRepeated: boolean

  // Time-series points for charts (chronological order)
  chartPoints: ProgressChartPoint[]

  // Attempt records (reverse-chronological, newest first)
  attemptHistory: AttemptHistoryItem[]

  // Topic progression (all topics)
  topicProgress: TopicProgressItem[]

  // Derived highlights
  mostImprovedTopic: TopicProgressItem | null
  topicsNeedingAssessment: TopicProgressItem[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${Math.max(1, totalSeconds)}s`
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  if (secs === 0) return `${mins}m`
  return `${mins}m ${secs}s`
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString)
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  } catch {
    return "Recent"
  }
}

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString)
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  } catch {
    return ""
  }
}

function pickScoreColor(score: number): "cyan" | "violet" | "amber" | "green" {
  if (score >= 85) return "green"
  if (score >= 70) return "cyan"
  if (score >= 50) return "violet"
  return "amber"
}

// ---------------------------------------------------------------------------
// Main Analytics Generator
// ---------------------------------------------------------------------------

export function calculateProgressAnalytics(
  sessionAttempts: readonly AssessmentEvaluation[],
): ProgressAnalytics {
  if (!sessionAttempts || sessionAttempts.length === 0) {
    return {
      hasData: false,
      hasMultipleAttempts: false,
      totalAttempts: 0,
      totalTimeSeconds: 0,
      totalTimeFormatted: "0 min",
      totalQuestionsAnswered: 0,
      totalCorrectAnswers: 0,
      overallAccuracy: null,
      averageScore: null,
      initialScore: null,
      latestScore: null,
      overallScoreGrowth: null,
      overallTrendStatus: "no-data",
      overallTrendSummary: "Complete your first diagnostic assessment to begin tracking your progress.",
      isSingleAssessmentRepeated: false,
      chartPoints: [],
      attemptHistory: [],
      topicProgress: TOPICS.map((topic) => ({
        topicId: topic.id,
        topicName: topic.name,
        domain: topic.domain,
        status: "unassessed",
        attemptsCount: 0,
        currentScore: null,
        previousScore: null,
        scoreChange: null,
        comparableEvidence: false,
        statusLabel: "Awaiting diagnostic",
        retakeImprovementNote: null,
      })),
      mostImprovedTopic: null,
      topicsNeedingAssessment: TOPICS.map((topic) => ({
        topicId: topic.id,
        topicName: topic.name,
        domain: topic.domain,
        status: "unassessed",
        attemptsCount: 0,
        currentScore: null,
        previousScore: null,
        scoreChange: null,
        comparableEvidence: false,
        statusLabel: "Awaiting diagnostic",
        retakeImprovementNote: null,
      })),
    }
  }

  // Chronological order (oldest -> newest)
  const chronological = [...sessionAttempts].sort(
    (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
  )

  const totalAttempts = chronological.length
  const initialAttempt = chronological[0]
  const latestAttempt = chronological[chronological.length - 1]

  const totalTimeSeconds = chronological.reduce(
    (sum, a) => sum + (a.durationSeconds || 0),
    0,
  )
  const totalQuestionsAnswered = chronological.reduce(
    (sum, a) => sum + (a.answeredQuestions || 0),
    0,
  )
  const totalCorrectAnswers = chronological.reduce(
    (sum, a) => sum + (a.correctCount || 0),
    0,
  )
  const overallAccuracy =
    totalQuestionsAnswered > 0
      ? Math.round((totalCorrectAnswers / totalQuestionsAnswered) * 100)
      : null

  const sumScores = chronological.reduce((sum, a) => sum + a.overallScore, 0)
  const averageScore = Math.round(sumScores / totalAttempts)

  const isSingleAssessmentRepeated =
    totalAttempts >= 2 &&
    chronological.every((a) => a.assessmentId === initialAttempt.assessmentId)

  // Overall Score Growth (strictly comparable only across repeat attempts of the same assessment)
  const initialScore = Math.round(initialAttempt.overallScore)
  const latestScore = Math.round(latestAttempt.overallScore)
  const overallScoreGrowth =
    isSingleAssessmentRepeated ? latestScore - initialScore : null

  let overallTrendStatus: TrendStatus = "baseline-only"
  let overallTrendSummary = ""

  if (totalAttempts === 1) {
    overallTrendStatus = "baseline-only"
    overallTrendSummary = `Baseline score established at ${initialScore}%. Complete additional assessments to track change over time.`
  } else if (isSingleAssessmentRepeated) {
    const diff = latestScore - initialScore
    if (diff > 0) overallTrendStatus = "improving"
    else if (diff < 0) overallTrendStatus = "declining"
    else overallTrendStatus = "steady"

    const diffLabel = diff > 0 ? `+${diff} pts` : `${diff} pts`
    overallTrendSummary = `${diffLabel} across repeat attempts of ${initialAttempt.assessmentTitle}.`
  } else {
    overallTrendStatus = "cross-assessment"
    overallTrendSummary = `Completed ${totalAttempts} assessments across different subjects (${initialAttempt.assessmentTitle} and ${latestAttempt.assessmentTitle}). Cross-assessment scores reflect distinct subject domains rather than direct performance change.`
  }

  // Chart Points
  const chartPoints: ProgressChartPoint[] = chronological.map((attempt, idx) => ({
    attemptNumber: idx + 1,
    label: `Attempt ${idx + 1} (${attempt.assessmentTitle})`,
    shortLabel: `#${idx + 1}`,
    date: formatDate(attempt.completedAt),
    score: Math.round(attempt.overallScore),
    assessmentTitle: attempt.assessmentTitle,
    durationMinutes: Math.max(1, Math.round((attempt.durationSeconds || 0) / 60)),
    correctCount: attempt.correctCount,
    totalQuestions: attempt.totalQuestions,
  }))

  // Attempt History (Reverse Chronological: newest first)
  const attemptHistory: AttemptHistoryItem[] = [...chronological]
    .reverse()
    .map((attempt, revIdx) => {
      const originalIdx = totalAttempts - revIdx
      const scorePct = Math.round(attempt.overallScore)
      const topicScores = Object.values(attempt.topicBreakdown || {}).map((tr) => ({
        topicId: tr.topicId,
        topicName: tr.topicName,
        score: tr.masteryScore !== null ? Math.round(tr.masteryScore) : null,
        correct: tr.correctQuestions,
        total: tr.totalQuestions,
      }))

      return {
        id: attempt.id,
        attemptNumber: originalIdx,
        assessmentId: attempt.assessmentId,
        assessmentTitle: attempt.assessmentTitle,
        completedAt: attempt.completedAt,
        dateLabel: formatDate(attempt.completedAt),
        timeLabel: formatTime(attempt.completedAt),
        durationSeconds: attempt.durationSeconds,
        durationFormatted: formatDuration(attempt.durationSeconds || 0),
        totalQuestions: attempt.totalQuestions,
        answeredQuestions: attempt.answeredQuestions,
        correctCount: attempt.correctCount,
        scorePercentage: scorePct,
        earnedWeightedScore: attempt.earnedWeightedScore,
        maximumWeightedScore: attempt.maximumWeightedScore,
        color: pickScoreColor(scorePct),
        topicScores,
      }
    })

  // Topic Progression
  const topicProgress: TopicProgressItem[] = TOPICS.map((topic) => {
    // Collect all attempts that included this topic AND had at least 1 answered question
    const topicAttempts = chronological.filter(
      (a) =>
        a.topicBreakdown &&
        a.topicBreakdown[topic.id] &&
        a.topicBreakdown[topic.id].answeredQuestions > 0,
    )

    if (topicAttempts.length === 0) {
      return {
        topicId: topic.id,
        topicName: topic.name,
        domain: topic.domain,
        status: "unassessed",
        attemptsCount: 0,
        currentScore: null,
        previousScore: null,
        scoreChange: null,
        comparableEvidence: false,
        statusLabel: "Awaiting diagnostic",
        retakeImprovementNote: null,
      }
    }

    if (topicAttempts.length === 1) {
      const res = topicAttempts[0].topicBreakdown[topic.id]
      const score =
        res.masteryScore !== null
          ? Math.round(res.masteryScore)
          : Math.round(res.accuracy)

      return {
        topicId: topic.id,
        topicName: topic.name,
        domain: topic.domain,
        status: "baseline",
        attemptsCount: 1,
        currentScore: score,
        previousScore: null,
        scoreChange: null,
        comparableEvidence: false,
        statusLabel: "Baseline (1 attempt)",
        retakeImprovementNote: null,
      }
    }

    // 2 or more attempts covering this topic
    const prevAttempt = topicAttempts[topicAttempts.length - 2]
    const latestTopicAttempt = topicAttempts[topicAttempts.length - 1]

    const prevRes = prevAttempt.topicBreakdown[topic.id]
    const currRes = latestTopicAttempt.topicBreakdown[topic.id]

    const prevScore =
      prevRes.masteryScore !== null
        ? Math.round(prevRes.masteryScore)
        : Math.round(prevRes.accuracy)
    const currScore =
      currRes.masteryScore !== null
        ? Math.round(currRes.masteryScore)
        : Math.round(currRes.accuracy)

    const scoreChange = currScore - prevScore

    // Check item-level improvements on repeated questions
    let retakeImprovementNote: string | null = null
    const prevResponses = (prevAttempt.responses || []).filter(
      (r) => r.topicId === topic.id,
    )
    const currResponses = (latestTopicAttempt.responses || []).filter(
      (r) => r.topicId === topic.id,
    )

    let repeatedCount = 0
    let newlyCorrectCount = 0

    for (const currR of currResponses) {
      const matchingPrev = prevResponses.find(
        (p) => p.questionId === currR.questionId,
      )
      if (
        matchingPrev &&
        matchingPrev.selectedOptionIndex !== null &&
        currR.selectedOptionIndex !== null
      ) {
        repeatedCount++
        if (!matchingPrev.isCorrect && currR.isCorrect) {
          newlyCorrectCount++
        }
      }
    }

    if (repeatedCount > 0) {
      if (newlyCorrectCount > 0) {
        retakeImprovementNote = `Corrected ${newlyCorrectCount} previously missed question${newlyCorrectCount > 1 ? "s" : ""}`
      } else {
        retakeImprovementNote = `${repeatedCount} repeated question${repeatedCount > 1 ? "s" : ""} assessed`
      }
    }

    let status: TopicProgressStatus = "steady"
    if (scoreChange > 0) status = "improved"
    else if (scoreChange < 0) status = "declined"

    const diffSign = scoreChange > 0 ? "+" : ""
    const statusLabel =
      scoreChange !== 0
        ? `${diffSign}${scoreChange} pts vs prior attempt`
        : "Maintained steady score"

    return {
      topicId: topic.id,
      topicName: topic.name,
      domain: topic.domain,
      status,
      attemptsCount: topicAttempts.length,
      currentScore: currScore,
      previousScore: prevScore,
      scoreChange,
      comparableEvidence: true,
      statusLabel,
      retakeImprovementNote,
    }
  })

  // Derived highlights
  const comparableTopics = topicProgress.filter(
    (t) => t.comparableEvidence && t.scoreChange !== null,
  )
  const improvedTopics = comparableTopics
    .filter((t) => (t.scoreChange ?? 0) > 0)
    .sort((a, b) => (b.scoreChange ?? 0) - (a.scoreChange ?? 0))

  const mostImprovedTopic = improvedTopics.length > 0 ? improvedTopics[0] : null

  const topicsNeedingAssessment = topicProgress.filter(
    (t) => t.status === "unassessed" || (t.currentScore !== null && t.currentScore < 60),
  )

  return {
    hasData: true,
    hasMultipleAttempts: totalAttempts >= 2,
    totalAttempts,
    totalTimeSeconds,
    totalTimeFormatted: formatDuration(totalTimeSeconds),
    totalQuestionsAnswered,
    totalCorrectAnswers,
    overallAccuracy,
    averageScore,
    initialScore,
    latestScore,
    overallScoreGrowth,
    overallTrendStatus,
    overallTrendSummary,
    isSingleAssessmentRepeated,
    chartPoints,
    attemptHistory,
    topicProgress,
    mostImprovedTopic,
    topicsNeedingAssessment,
  }
}
