import assert from "node:assert/strict"
import {
  ASSESSMENTS,
  TOPICS,
  getAssessmentById,
  getTopicById,
  getQuestionsForAssessment,
  type DiagnosticQuestion,
} from "../lib/assessment-data"
import {
  evaluateAssessment,
  AssessmentEvaluationError,
  type AssessmentEvaluation,
} from "../lib/assessment-engine"
import {
  computeCognitiveFingerprint,
} from "../lib/cognitive-fingerprint"
import {
  generateStudyPlan,
} from "../lib/adaptive-study-plan"
import {
  calculateProgressAnalytics,
} from "../lib/progress-analytics"

console.log("=== STARTING ADAPTIQ LEARNING ENGINE RELIABILITY AUDIT ===")

// ---------------------------------------------------------------------------
// 1. Data Integrity Tests
// ---------------------------------------------------------------------------
console.log("\n[1] Testing Assessment Data Integrity...")
assert.equal(ASSESSMENTS.length, 3, "Expected 3 assessments")
assert.equal(TOPICS.length, 6, "Expected 6 topics")

for (const asm of ASSESSMENTS) {
  assert.ok(asm.topicIds.length >= 2, `Assessment ${asm.id} must have at least 2 topics`)
  for (const tid of asm.topicIds) {
    assert.ok(getTopicById(tid), `Topic ${tid} in assessment ${asm.id} must exist in TOPICS`)
  }
  const qs = getQuestionsForAssessment(asm.id)
  assert.ok(qs.length > 0, `Assessment ${asm.id} must have questions`)
  for (const q of qs) {
    assert.ok(q.options.length >= 2, `Question ${q.id} must have >= 2 options`)
    assert.ok(q.correctIndex >= 0 && q.correctIndex < q.options.length, `Question ${q.id} valid correctIndex`)
    assert.ok(q.weight > 0, `Question ${q.id} weight must be > 0`)
  }
}
console.log("✓ Assessment and question bank definitions verified")

// ---------------------------------------------------------------------------
// 2. Assessment Engine: Perfect, Zero, and Partial Attempts
// ---------------------------------------------------------------------------
console.log("\n[2] Testing Assessment Scoring & Evaluation...")
const algQuestions = getQuestionsForAssessment("algebra-readiness")

// 2a. Perfect assessment
const perfectAnswers: Record<string, number> = {}
for (const q of algQuestions) {
  perfectAnswers[q.id] = q.correctIndex
}
const perfectAttempt = evaluateAssessment("algebra-readiness", algQuestions, perfectAnswers, 120)
assert.equal(perfectAttempt.overallScore, 100, "Perfect attempt should score 100%")
assert.equal(perfectAttempt.correctCount, algQuestions.length, "All answers correct")
assert.equal(perfectAttempt.answeredQuestions, algQuestions.length, "All questions answered")
assert.equal(perfectAttempt.earnedWeightedScore, perfectAttempt.maximumWeightedScore, "All weight earned")

// 2b. Zero-score assessment (all answered incorrectly)
const zeroAnswers: Record<string, number> = {}
for (const q of algQuestions) {
  zeroAnswers[q.id] = (q.correctIndex + 1) % q.options.length
}
const zeroAttempt = evaluateAssessment("algebra-readiness", algQuestions, zeroAnswers, 90)
assert.equal(zeroAttempt.overallScore, 0, "Zero attempt should score 0%")
assert.equal(zeroAttempt.correctCount, 0, "Zero correct answers")
assert.equal(zeroAttempt.earnedWeightedScore, 0, "Zero weight earned")
assert.equal(zeroAttempt.answeredQuestions, algQuestions.length, "All questions were answered")

// 2c. Partially answered assessment (unanswered receive no marks)
// Answer only the first question correctly; leave the rest unanswered
const partialAnswers: Record<string, number | null> = {
  [algQuestions[0].id]: algQuestions[0].correctIndex,
}
const partialAttempt = evaluateAssessment("algebra-readiness", algQuestions, partialAnswers, 60)
assert.equal(partialAttempt.answeredQuestions, 1, "Only 1 question answered")
assert.equal(partialAttempt.correctCount, 1, "1 correct answer")
// Unanswered questions MUST remain in denominator
assert.ok(partialAttempt.overallScore > 0 && partialAttempt.overallScore < 100, "Partial overallScore is proportional to total questions")
assert.equal(partialAttempt.earnedWeightedScore, algQuestions[0].weight * 1, "Earned weight matches question 1")
assert.ok(partialAttempt.earnedWeightedScore < partialAttempt.maximumWeightedScore, "Maximum includes unanswered questions")

// 2d. Error handling
assert.throws(() => {
  evaluateAssessment("unknown-assessment-id", algQuestions, {})
}, AssessmentEvaluationError, "Should throw for unknown assessment ID")
assert.throws(() => {
  evaluateAssessment("algebra-readiness", algQuestions, { [algQuestions[0].id]: 999 })
}, AssessmentEvaluationError, "Should throw for out-of-bounds answer index")
console.log("✓ Assessment evaluation rules (perfect, zero, partial, errors) verified")

// ---------------------------------------------------------------------------
// 3. Cognitive Fingerprint: Unanswered Evidence & Retake Safeguards
// ---------------------------------------------------------------------------
console.log("\n[3] Testing Cognitive Fingerprint Aggregation...")

// 3a. No-attempt state
const emptyFp = computeCognitiveFingerprint([])
assert.equal(emptyFp.overallMastery, null, "Overall mastery null when no attempts")
assert.equal(emptyFp.topicsWithEvidence, 0, "0 topics with evidence")
assert.equal(emptyFp.totalAnsweredQuestions, 0, "0 answered questions")
for (const t of emptyFp.topics) {
  assert.equal(t.evidenceStatus, "none", "All topics have status 'none'")
  assert.equal(t.masteryEstimate, null, "All mastery estimates null")
}

// 3b. Unanswered questions do NOT count as evidence of incorrect understanding
// In partialAttempt, only question 0 was answered (for linear-equations).
// Topic functions had 0 answered questions.
const partialFp = computeCognitiveFingerprint([partialAttempt])
const linearFp = partialFp.topics.find((t) => t.topicId === "linear-equations")!
const functionsFp = partialFp.topics.find((t) => t.topicId === "functions")!

assert.equal(linearFp.evidenceStatus, "sufficient", "Linear equations has evidence")
assert.equal(linearFp.answeredQuestions, 1, "Linear equations has 1 answered question")
assert.equal(linearFp.accuracy, 100, "100% accuracy on answered question")
assert.equal(linearFp.masteryEstimate, 100, "100% provisional mastery on answered question (not penalized by unanswered items)")

assert.equal(functionsFp.evidenceStatus, "none", "Functions has no evidence because questions were unanswered")
assert.equal(functionsFp.masteryEstimate, null, "Functions masteryEstimate is null, not 0%")

// 3c. Retake handling: latest answered response is used, unanswered retake does NOT erase evidence
const q0 = algQuestions[0]
const q1 = algQuestions[1]

// Attempt A: answered q0 correctly, q1 incorrectly
const attemptA = evaluateAssessment("algebra-readiness", algQuestions, {
  [q0.id]: q0.correctIndex,
  [q1.id]: (q1.correctIndex + 1) % q1.options.length,
}, 100)

// Attempt B (retake): answered q1 correctly, left q0 unanswered
const attemptB = evaluateAssessment("algebra-readiness", algQuestions, {
  [q1.id]: q1.correctIndex,
}, 100)

const retakeFp = computeCognitiveFingerprint([attemptA, attemptB])
const retakeLinear = retakeFp.topics.find((t) => t.topicId === "linear-equations")!

// q0 was answered in attemptA and skipped in attemptB -> evidence for q0 must NOT be erased!
// q1 was answered in attemptA (wrong) and retaken in attemptB (correct) -> latest answered (correct) must be used!
assert.equal(retakeLinear.answeredQuestions, 2, "Both q0 and q1 have active evidence")
assert.equal(retakeLinear.correctAnswers, 2, "Both q0 (from attempt A) and q1 (from attempt B) are correct")
assert.equal(retakeLinear.accuracy, 100, "100% accuracy after retake correction")
assert.equal(retakeFp.totalAnsweredQuestions, 2, "Repeated questions do NOT inflate unique question count")
console.log("✓ Cognitive Fingerprint rules (unanswered evidence, retake preservation, deduplication) verified")

// ---------------------------------------------------------------------------
// 4. Adaptive Study Plan: Safeguards & Dynamic Recommendations
// ---------------------------------------------------------------------------
console.log("\n[4] Testing Adaptive Study Plan Consistency...")

// 4a. No evidence: all topics are classified as 'run-diagnostic', NEVER as weaknesses
const emptyPlan = generateStudyPlan(emptyFp)
assert.equal(emptyPlan.hasAnyEvidence, false, "hasAnyEvidence is false")
assert.equal(emptyPlan.focusItems.length, 0, "No focus items when no evidence exists")
assert.equal(emptyPlan.diagnosticItems.length, 6, "All 6 topics awaiting diagnostics")
for (const item of emptyPlan.diagnosticItems) {
  assert.equal(item.kind, "run-diagnostic", "Must be run-diagnostic kind")
  assert.ok(!item.reason.includes("gap") && !item.reason.includes("weakness"), "Must not label as weakness")
}

// 4b. Plan updates dynamically with evidence
const planFromRetake = generateStudyPlan(retakeFp)
assert.equal(planFromRetake.hasAnyEvidence, true, "hasAnyEvidence is true")
const linearRec = planFromRetake.recommendations.find((r) => r.topicId === "linear-equations")!
assert.equal(linearRec.kind, "reinforce", "100% mastery classified as reinforce")

// Topic with low score classified as focus
const geomQuestions = getQuestionsForAssessment("geometry-essentials")
const lowGeomAttempt = evaluateAssessment("geometry-essentials", geomQuestions, {
  [geomQuestions[0].id]: (geomQuestions[0].correctIndex + 1) % 4,
  [geomQuestions[1].id]: (geomQuestions[1].correctIndex + 1) % 4,
}, 100)
const geomFp = computeCognitiveFingerprint([lowGeomAttempt])
const geomPlan = generateStudyPlan(geomFp)
const anglesRec = geomPlan.recommendations.find((r) => r.topicId === "angles-and-lines")!
assert.equal(anglesRec.kind, "focus", "0% mastery on angles-and-lines classified as focus")
assert.equal(anglesRec.priorityLabel, "High priority", "Focus items receive High priority")
console.log("✓ Adaptive Study Plan consistency and safeguards verified")

// ---------------------------------------------------------------------------
// 5. Progress Analytics: Repeated vs Cross-Assessment & Topic Progression
// ---------------------------------------------------------------------------
console.log("\n[5] Testing Progress Analytics Reliability...")

// 5a. Empty state (0 attempts)
const emptyAnalytics = calculateProgressAnalytics([])
assert.equal(emptyAnalytics.hasData, false, "hasData false")
assert.equal(emptyAnalytics.hasMultipleAttempts, false, "hasMultipleAttempts false")
assert.equal(emptyAnalytics.overallTrendStatus, "no-data", "Trend is no-data")
assert.equal(emptyAnalytics.overallScoreGrowth, null, "No invented growth")

// 5b. Single attempt baseline (no trend or growth invented)
const singleAnalytics = calculateProgressAnalytics([attemptA])
assert.equal(singleAnalytics.hasData, true, "hasData true")
assert.equal(singleAnalytics.hasMultipleAttempts, false, "hasMultipleAttempts false")
assert.equal(singleAnalytics.overallTrendStatus, "baseline-only", "Trend is baseline-only")
assert.equal(singleAnalytics.overallScoreGrowth, null, "No growth percentage invented for single attempt")

// 5c. Repeated attempts at the SAME assessment (comparable)
const repeatedAnalytics = calculateProgressAnalytics([attemptA, attemptB])
assert.equal(repeatedAnalytics.hasMultipleAttempts, true, "hasMultipleAttempts true")
assert.equal(repeatedAnalytics.isSingleAssessmentRepeated, true, "isSingleAssessmentRepeated true")
assert.notEqual(repeatedAnalytics.overallScoreGrowth, null, "Growth is calculated for repeat assessments")
assert.equal(repeatedAnalytics.attemptHistory.length, 2, "Both historical attempts individually preserved")

// 5d. Cross-assessment comparison (different assessments NOT presented as direct growth)
const crossAnalytics = calculateProgressAnalytics([attemptA, lowGeomAttempt])
assert.equal(crossAnalytics.hasMultipleAttempts, true, "hasMultipleAttempts true")
assert.equal(crossAnalytics.isSingleAssessmentRepeated, false, "isSingleAssessmentRepeated false")
assert.equal(crossAnalytics.overallTrendStatus, "cross-assessment", "Trend marked as cross-assessment")
assert.equal(crossAnalytics.overallScoreGrowth, null, "Cross-assessment does NOT invent a growth percentage")
assert.ok(crossAnalytics.overallTrendSummary.includes("different subjects"), "Summary notes distinct subject domains")

// 5e. Topic Progression: skipped topic does not cause false score drop
// attemptA covered algebra-readiness (linear-equations answered).
// lowGeomAttempt covered geometry-essentials (linear-equations was not in this assessment).
const topicProgLinear = crossAnalytics.topicProgress.find((t) => t.topicId === "linear-equations")!
assert.equal(topicProgLinear.attemptsCount, 1, "Linear equations only counted in attempts that included it")
assert.equal(topicProgLinear.status, "baseline", "Topic remains at baseline, not falsely marked declined")

// 5f. Retake item analysis
assert.ok(repeatedAnalytics.topicProgress.find((t) => t.topicId === "linear-equations")?.retakeImprovementNote !== undefined, "Retake note generated")

console.log("✓ Progress Analytics reliability (comparable vs cross-assessment, retakes, baseline) verified")

// ---------------------------------------------------------------------------
// 6. Overview Dashboard Live Data Derivations
// ---------------------------------------------------------------------------
console.log("\n[6] Testing Overview Live Data Derivations...")

// 6a. Zero attempts empty-state derivations
const ovZeroFp = computeCognitiveFingerprint([])
const ovZeroPlan = generateStudyPlan(ovZeroFp)
const ovZeroAnalytics = calculateProgressAnalytics([])

assert.equal(ovZeroFp.overallMastery, null, "Overview mastery is null with zero attempts")
assert.equal(ovZeroFp.topicsWithEvidence, 0, "Overview topics assessed is 0")
assert.equal(ovZeroPlan.recommendations.filter((r) => r.kind === "focus").length, 0, "Overview needs attention is 0 with zero attempts")
assert.equal(ovZeroAnalytics.totalAttempts, 0, "Overview assessment activity is 0 sessions")
assert.equal(ovZeroFp.topics.filter((t) => t.evidenceStatus === "sufficient").length, 0, "No radar vertices for zero attempts")
assert.equal(ovZeroPlan.hasAnyEvidence, false, "Recommended next is diagnostic recommendation")
assert.ok(ovZeroPlan.recommendations[0].assessmentTitle !== null, "Recommended start links to valid diagnostic assessment")

// 6b. Single assessment live updates
const ovSingleAttempt = evaluateAssessment("algebra-readiness", algQuestions, {
  [algQuestions[0].id]: algQuestions[0].correctIndex, // linear-equations
  [algQuestions[3].id]: algQuestions[3].correctIndex, // functions
}, 110)
const ovSingleFp = computeCognitiveFingerprint([ovSingleAttempt])
const ovSinglePlan = generateStudyPlan(ovSingleFp)
const ovSingleAnalytics = calculateProgressAnalytics([ovSingleAttempt])

assert.notEqual(ovSingleFp.overallMastery, null, "Overview mastery established after 1 assessment")
assert.equal(ovSingleFp.topicsWithEvidence, 2, "2 topics assessed in Algebra Readiness")
assert.equal(ovSingleAnalytics.totalAttempts, 1, "Overview shows 1 assessment session")
assert.equal(ovSingleAnalytics.chartPoints.length, 1, "Overview chart has 1 point")
assert.equal(ovSinglePlan.hasAnyEvidence, true, "Plan has evidence")

// 6c. Multi-assessment radar threshold safeguard
// Evidenced topics count is 2 (less than 3 required for 2D radar polygon), so alternative list visual is triggered
const ovEvidencedCount = ovSingleFp.topics.filter((t) => t.evidenceStatus === "sufficient").length
assert.ok(ovEvidencedCount < 3, "Less than 3 topics correctly triggers safe non-radar representation")

// When geometry is also completed, 4 topics have evidence (>= 3), safely rendering radar without 0% false points
const ovMultiAttemptGeom = evaluateAssessment("geometry-essentials", geomQuestions, {
  [geomQuestions[0].id]: geomQuestions[0].correctIndex, // angles-and-lines
  [geomQuestions[3].id]: geomQuestions[3].correctIndex, // area-and-perimeter
}, 100)
const ovMultiFp = computeCognitiveFingerprint([ovSingleAttempt, ovMultiAttemptGeom])
const ovMultiEvidenced = ovMultiFp.topics.filter((t) => t.evidenceStatus === "sufficient")
assert.equal(ovMultiEvidenced.length, 4, "4 topics have evidence across 2 different assessments")
assert.ok(ovMultiEvidenced.length >= 3, ">= 3 topics allows safe polygon radar rendering")

console.log("✓ Overview live derivations and safety safeguards verified")

console.log("\n=== ALL 6 AUDIT & INTEGRATION DOMAINS PASSED SUCCESSFULLY ===")
