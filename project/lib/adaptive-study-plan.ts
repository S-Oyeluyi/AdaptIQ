/**
 * adaptive-study-plan.ts
 *
 * Generates study recommendations from a CognitiveFingerprint.
 *
 * Rules:
 * - Only topics with evidence (evidenceStatus === "sufficient") are ranked
 *   as focus or reinforcement activities.
 * - Topics without evidence (evidenceStatus === "none") receive a "run the
 *   diagnostic" recommendation — they are never labelled as weaknesses.
 * - Ranking within evidenced topics is by masteryEstimate ascending (lowest
 *   mastery → highest priority).
 * - The 60 / 75 thresholds below are configurable classification guides, not
 *   scientifically established ability cut-scores.
 * - Recommendations are deterministic: the same fingerprint always produces
 *   the same output.
 * - No external resource links are invented.
 *
 * Daily goal integration (optional dailyGoalMinutes parameter):
 * - When supplied, each recommendation receives a suggestedMinutes value
 *   that reflects the student's available time.
 * - The goal budget is split proportionally: focus/develop items get weight 2,
 *   reinforce items get weight 1. No single item exceeds MAX_ITEM_MINUTES.
 * - estimatedMinutes sums the allocated suggestedMinutes across all evidenced
 *   items so the UI can display a goal-aware total.
 * - When no goal is supplied the heuristic defaults apply (focus/develop: 8
 *   min, reinforce: 4 min) and those values are stored in suggestedMinutes.
 * - run-diagnostic items always have suggestedMinutes === null.
 */

import { ASSESSMENTS } from "./assessment-data"
import type { CognitiveFingerprint, TopicFingerprint } from "./cognitive-fingerprint"

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Valid daily study goal values (minutes). Matches UserPreferences. */
export type DailyGoalMinutes = 15 | 30 | 45 | 60

export interface RecommendationThresholds {
  /** Topics with mastery below this are classified as "needs focus" */
  focusBelow: number
  /** Topics with mastery at or above this are classified as "strong" */
  strongAt: number
}

export const DEFAULT_THRESHOLDS: RecommendationThresholds = {
  focusBelow: 60,
  strongAt: 75,
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type RecommendationKind =
  | "focus"           // topic has evidence; mastery is below the focus threshold
  | "develop"         // topic has evidence; mastery is between thresholds
  | "reinforce"       // topic has evidence; mastery is at or above the strong threshold
  | "run-diagnostic"  // topic has no assessment evidence yet

export type PracticeDifficulty = "foundational" | "core" | "advanced"

export interface StudyRecommendation {
  topicId: string
  topicName: string
  domain: string
  kind: RecommendationKind
  priority: number           // 1 = highest; unique across all recommendations
  priorityLabel: string      // Human-readable: "High priority", "Build momentum", etc.
  /** Provisional mastery estimate, or null when no evidence */
  masteryEstimate: number | null
  /** Number of unique answered questions supporting this estimate */
  evidenceCount: number
  /** Why this topic appears in the plan */
  reason: string
  /** What the student should do */
  action: string
  /** Appropriate practice difficulty given the evidence; null for run-diagnostic */
  suggestedDifficulty: PracticeDifficulty | null
  /**
   * Suggested time to spend on this activity (minutes).
   * Scaled to the student's daily goal when one is provided; falls back to
   * fixed heuristics (focus/develop: 8 min, reinforce: 4 min) otherwise.
   * Always null for run-diagnostic items.
   */
  suggestedMinutes: number | null
  /**
   * The assessment the student should take or retake.
   * Present for run-diagnostic; also present for evidenced topics so the UI
   * can link to "Retake assessment" where appropriate.
   */
  assessmentId: string | null
  assessmentTitle: string | null
}

export interface AdaptiveStudyPlan {
  /** All recommendations, ordered by priority ascending (1 = most urgent) */
  recommendations: StudyRecommendation[]
  /** Subset: topics with evidence needing focus or development */
  focusItems: StudyRecommendation[]
  /** Subset: topics with evidence that are strong */
  reinforceItems: StudyRecommendation[]
  /** Subset: topics without assessment evidence */
  diagnosticItems: StudyRecommendation[]
  /** True when the student has completed at least one assessment */
  hasAnyEvidence: boolean
  /**
   * Estimated total active-study time (minutes).
   * When a daily goal is supplied this reflects the goal-scaled allocation.
   * Without a goal it uses the fixed heuristics (focus/develop: 8 min,
   * reinforce: 4 min).
   */
  estimatedMinutes: number
  /**
   * The daily goal that was used to produce this plan, or null if the default
   * heuristic was used. The UI can display this for transparency.
   */
  dailyGoalMinutes: DailyGoalMinutes | null
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Map topicId → { assessmentId, assessmentTitle } */
function buildTopicAssessmentMap(): Map<string, { id: string; title: string }> {
  const map = new Map<string, { id: string; title: string }>()
  for (const a of ASSESSMENTS) {
    for (const tid of a.topicIds) {
      map.set(tid, { id: a.id, title: a.title })
    }
  }
  return map
}

function classifyKind(
  t: TopicFingerprint,
  thresholds: RecommendationThresholds,
): RecommendationKind {
  if (t.evidenceStatus === "none") return "run-diagnostic"
  if (t.masteryEstimate === null) return "run-diagnostic"
  if (t.masteryEstimate < thresholds.focusBelow) return "focus"
  if (t.masteryEstimate < thresholds.strongAt) return "develop"
  return "reinforce"
}

function priorityLabel(kind: RecommendationKind): string {
  switch (kind) {
    case "focus":          return "High priority"
    case "develop":        return "Build momentum"
    case "reinforce":      return "Keep it strong"
    case "run-diagnostic": return "Start here"
  }
}

function suggestedDifficulty(
  kind: RecommendationKind,
  masteryEstimate: number | null,
  thresholds: RecommendationThresholds,
): PracticeDifficulty | null {
  if (kind === "run-diagnostic") return null
  if (masteryEstimate === null) return null
  if (masteryEstimate < thresholds.focusBelow) return "foundational"
  if (masteryEstimate < thresholds.strongAt) return "core"
  return "advanced"
}

function buildReason(
  t: TopicFingerprint,
  kind: RecommendationKind,
): string {
  if (kind === "run-diagnostic") {
    return `No assessment evidence yet for ${t.topicName}. A short diagnostic will establish your starting point.`
  }

  const pct = Math.round(t.masteryEstimate!)
  const q = t.answeredQuestions
  const correct = t.correctAnswers

  if (kind === "focus") {
    return (
      `Your provisional mastery for ${t.topicName} is ${pct}% ` +
      `(${correct} of ${q} answered question${q !== 1 ? "s" : ""} correct). ` +
      `This is the highest-impact gap in your current evidence.`
    )
  }

  if (kind === "develop") {
    return (
      `Your provisional mastery for ${t.topicName} is ${pct}% ` +
      `(${correct} of ${q} answered question${q !== 1 ? "s" : ""} correct). ` +
      `Targeted practice here will build on your existing foundation.`
    )
  }

  // reinforce
  return (
    `Your provisional mastery for ${t.topicName} is ${pct}% ` +
    `based on ${q} answered question${q !== 1 ? "s" : ""}. ` +
    `A short review will help consolidate what you already know.`
  )
}

function buildAction(kind: RecommendationKind, topicName: string): string {
  switch (kind) {
    case "focus":
      return `Work through foundational practice questions on ${topicName} to close the most significant gap in your profile.`
    case "develop":
      return `Practise core-difficulty questions on ${topicName} to deepen your developing understanding.`
    case "reinforce":
      return `Complete a short retrieval exercise on ${topicName} to consolidate your strong performance.`
    case "run-diagnostic":
      return `Take the diagnostic assessment that covers ${topicName} to generate your first evidence for this topic.`
  }
}

// ---------------------------------------------------------------------------
// Daily-goal time allocation
// ---------------------------------------------------------------------------

/**
 * Heuristic fallback minutes when no daily goal is supplied.
 * Focus/develop items get 8 min; reinforce items get 4 min.
 */
const HEURISTIC_FOCUS_MINUTES = 8
const HEURISTIC_REINFORCE_MINUTES = 4

/** Hard cap so no single activity ever consumes the whole day's budget. */
const MAX_ITEM_MINUTES = 20

/**
 * Allocate the daily goal budget across evidenced recommendations.
 *
 * Allocation strategy:
 *   - focus / develop items receive weight 2 each
 *   - reinforce items receive weight 1 each
 *   - Total weighted units = (focusCount * 2) + (reinforceCount * 1)
 *   - Each item's share = (weight / totalUnits) * dailyGoalMinutes
 *   - Capped at MAX_ITEM_MINUTES per item
 *   - Values are rounded to the nearest whole minute (minimum 1)
 *
 * Returns a Map<topicId, allocatedMinutes>.
 */
function allocateDailyGoal(
  focusItems: StudyRecommendation[],
  reinforceItems: StudyRecommendation[],
  dailyGoalMinutes: DailyGoalMinutes,
): Map<string, number> {
  const result = new Map<string, number>()

  const focusUnits = focusItems.length * 2
  const reinforceUnits = reinforceItems.length * 1
  const totalUnits = focusUnits + reinforceUnits

  if (totalUnits === 0) return result

  const minutesPerUnit = dailyGoalMinutes / totalUnits

  interface AllocationItem {
    topicId: string
    kind: "focus" | "develop" | "reinforce"
    priority: number
    raw: number
    allocated: number
  }

  const items: AllocationItem[] = []

  for (const item of focusItems) {
    const raw = minutesPerUnit * 2
    const rounded = Math.max(1, Math.min(MAX_ITEM_MINUTES, Math.round(raw)))
    items.push({
      topicId: item.topicId,
      kind: item.kind as "focus" | "develop",
      priority: item.priority,
      raw,
      allocated: rounded,
    })
  }

  for (const item of reinforceItems) {
    const raw = minutesPerUnit * 1
    const rounded = Math.max(1, Math.min(MAX_ITEM_MINUTES, Math.round(raw)))
    items.push({
      topicId: item.topicId,
      kind: "reinforce",
      priority: item.priority,
      raw,
      allocated: rounded,
    })
  }

  // Deficit adjustment: ensure total allocated minutes NEVER exceed the daily goal due to rounding.
  let currentTotal = items.reduce((sum, it) => sum + it.allocated, 0)
  if (currentTotal > dailyGoalMinutes) {
    // Sort items to deduct minutes from:
    // 1. Largest upward rounding error (allocated - raw) descending
    // 2. Reinforce items before focus/develop items
    // 3. Lowest urgency (higher priority number) descending
    const deductionOrder = [...items].sort((a, b) => {
      const deltaA = a.allocated - a.raw
      const deltaB = b.allocated - b.raw
      if (Math.abs(deltaA - deltaB) > 1e-6) {
        return deltaB - deltaA
      }
      if (a.kind !== b.kind) {
        return a.kind === "reinforce" ? -1 : 1
      }
      return b.priority - a.priority
    })

    for (const entry of deductionOrder) {
      if (currentTotal <= dailyGoalMinutes) break
      if (entry.allocated > 1) {
        entry.allocated -= 1
        currentTotal -= 1
      }
    }
  }

  for (const entry of items) {
    result.set(entry.topicId, entry.allocated)
  }

  return result
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate an AdaptiveStudyPlan from a CognitiveFingerprint.
 *
 * The same fingerprint + options always produces the same plan (deterministic).
 *
 * @param fingerprint  - The student's current Cognitive Fingerprint.
 * @param thresholds   - Override the default 60/75 mastery cut-points.
 * @param dailyGoalMinutes - Optional daily study goal (15 | 30 | 45 | 60).
 *   When supplied, each recommendation's suggestedMinutes is scaled from this
 *   budget. When omitted, the fixed heuristics apply.
 *
 * Existing callers that pass only `fingerprint` or `fingerprint, thresholds`
 * continue to work without modification.
 */
export function generateStudyPlan(
  fingerprint: CognitiveFingerprint,
  thresholds: RecommendationThresholds = DEFAULT_THRESHOLDS,
  dailyGoalMinutes?: DailyGoalMinutes,
): AdaptiveStudyPlan {
  const topicAssessmentMap = buildTopicAssessmentMap()

  // Build a recommendation for each topic (suggestedMinutes assigned below)
  const raw: StudyRecommendation[] = fingerprint.topics.map((t) => {
    const kind = classifyKind(t, thresholds)
    const asmInfo = topicAssessmentMap.get(t.topicId) ?? null

    return {
      topicId: t.topicId,
      topicName: t.topicName,
      domain: t.domain,
      kind,
      priority: 0, // assigned below
      priorityLabel: priorityLabel(kind),
      masteryEstimate: t.masteryEstimate,
      evidenceCount: t.answeredQuestions,
      reason: buildReason(t, kind),
      action: buildAction(kind, t.topicName),
      suggestedDifficulty: suggestedDifficulty(kind, t.masteryEstimate, thresholds),
      suggestedMinutes: null, // filled in after sort
      assessmentId: asmInfo?.id ?? null,
      assessmentTitle: asmInfo?.title ?? null,
    }
  })

  // Sort: focus first (by mastery asc), then develop (mastery asc),
  // then reinforce (mastery desc — highest first so we consolidate strengths),
  // then run-diagnostic last.
  const kindOrder: Record<RecommendationKind, number> = {
    focus: 0,
    develop: 1,
    reinforce: 2,
    "run-diagnostic": 3,
  }

  raw.sort((a, b) => {
    const ko = kindOrder[a.kind] - kindOrder[b.kind]
    if (ko !== 0) return ko
    // Within focus/develop: lowest mastery first (most urgent)
    if (a.kind === "focus" || a.kind === "develop") {
      const am = a.masteryEstimate ?? 0
      const bm = b.masteryEstimate ?? 0
      return am - bm
    }
    // Within reinforce: highest mastery first
    if (a.kind === "reinforce") {
      const am = a.masteryEstimate ?? 0
      const bm = b.masteryEstimate ?? 0
      return bm - am
    }
    // run-diagnostic: preserve TOPICS order (already matched)
    return 0
  })

  // Assign 1-based priority
  raw.forEach((r, i) => { r.priority = i + 1 })

  const focusItems = raw.filter((r) => r.kind === "focus" || r.kind === "develop")
  const reinforceItems = raw.filter((r) => r.kind === "reinforce")
  const diagnosticItems = raw.filter((r) => r.kind === "run-diagnostic")
  const hasAnyEvidence = fingerprint.topicsWithEvidence > 0

  // Assign suggestedMinutes to each evidenced item
  if (dailyGoalMinutes !== undefined) {
    const allocation = allocateDailyGoal(focusItems, reinforceItems, dailyGoalMinutes)
    for (const r of raw) {
      if (r.kind !== "run-diagnostic") {
        r.suggestedMinutes = allocation.get(r.topicId) ?? null
      }
    }
  } else {
    // Heuristic fallback
    for (const r of raw) {
      if (r.kind === "focus" || r.kind === "develop") {
        r.suggestedMinutes = HEURISTIC_FOCUS_MINUTES
      } else if (r.kind === "reinforce") {
        r.suggestedMinutes = HEURISTIC_REINFORCE_MINUTES
      }
      // run-diagnostic stays null
    }
  }

  // estimatedMinutes: sum of suggestedMinutes for all evidenced items
  const estimatedMinutes = raw.reduce(
    (sum, r) => sum + (r.suggestedMinutes ?? 0),
    0,
  )

  return {
    recommendations: raw,
    focusItems,
    reinforceItems,
    diagnosticItems,
    hasAnyEvidence,
    estimatedMinutes,
    dailyGoalMinutes: dailyGoalMinutes ?? null,
  }
}
