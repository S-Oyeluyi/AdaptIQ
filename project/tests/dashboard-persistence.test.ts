import assert from "node:assert/strict"
import { getQuestionsForAssessment } from "../lib/assessment-data"
import { evaluateAssessment, type AssessmentEvaluation } from "../lib/assessment-engine"
import { computeCognitiveFingerprint } from "../lib/cognitive-fingerprint"
import { generateStudyPlan } from "../lib/adaptive-study-plan"
import { calculateProgressAnalytics } from "../lib/progress-analytics"
import {
  ASSESSMENT_STORAGE_KEY,
  ASSESSMENT_STORAGE_VERSION,
  clearAssessmentAttempts,
  loadAssessmentAttempts,
  saveAssessmentAttempts,
  type AssessmentStorageAdapter,
} from "../lib/assessment-storage"

console.log("=== STARTING STAGE 8B PERSISTENCE INTEGRATION TESTS ===")

class TrackedMemoryStorage implements AssessmentStorageAdapter {
  private values = new Map<string, string>()
  public readCount = 0
  public writeCount = 0
  public clearCount = 0

  getItem(key: string): string | null {
    this.readCount++
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.writeCount++
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.clearCount++
    this.values.delete(key)
  }
}

function makeAttempt(asmId: string, durationSec = 100): AssessmentEvaluation {
  const qs = getQuestionsForAssessment(asmId)
  const answers: Record<string, number> = {}
  for (const q of qs) {
    answers[q.id] = q.correctIndex
  }
  return evaluateAssessment(asmId, qs, answers, durationSec)
}

// ---------------------------------------------------------------------------
// 1. Scenario A: First Visit / Empty Storage
// ---------------------------------------------------------------------------
console.log("\n[1] Testing Scenario A: First visit with empty storage...")
const storage = new TrackedMemoryStorage()
const loadResult1 = loadAssessmentAttempts(storage)
assert.equal(loadResult1.ok, true, "Load should succeed for empty storage")
if (loadResult1.ok) {
  assert.equal(loadResult1.status, "empty", "Status must be 'empty'")
  assert.equal(loadResult1.attempts.length, 0, "No attempts in empty storage")
}
assert.equal(storage.writeCount, 0, "Initial hydration must NOT write to storage")

// Verify derived modules handle empty state safely
const emptyFp = computeCognitiveFingerprint([])
assert.equal(emptyFp.overallMastery, null, "Overall mastery null on first visit")
assert.equal(emptyFp.topicsWithEvidence, 0, "0 topics assessed on first visit")
const emptyPlan = generateStudyPlan(emptyFp)
assert.equal(emptyPlan.hasAnyEvidence, false, "Study plan has no evidence")
const emptyAnalytics = calculateProgressAnalytics([])
assert.equal(emptyAnalytics.hasData, false, "Progress analytics has no data")
console.log("✓ Scenario A verified: Clean empty state, 0 writes on first visit")

// ---------------------------------------------------------------------------
// 2. Scenario B: Assessment Persistence Across Refresh
// ---------------------------------------------------------------------------
console.log("\n[2] Testing Scenario B: Single assessment persistence...")
const attempt1 = makeAttempt("algebra-readiness", 120)

// Simulate dashboard saving the new attempt
const saveResult1 = saveAssessmentAttempts([attempt1], storage)
assert.equal(saveResult1.ok, true, "Saving valid attempt must succeed")
assert.equal(storage.writeCount, 1, "Exactly 1 write for recording attempt")

// Simulate browser refresh: new instance loads from storage
const refreshLoad = loadAssessmentAttempts(storage)
assert.equal(refreshLoad.ok, true, "Load after refresh must succeed")
if (refreshLoad.ok) {
  assert.equal(refreshLoad.status, "loaded", "Status must be 'loaded'")
  assert.equal(refreshLoad.attempts.length, 1, "1 attempt restored")
  assert.equal(refreshLoad.attempts[0].id, attempt1.id, "Attempt ID preserved")
  assert.equal(refreshLoad.attempts[0].overallScore, attempt1.overallScore, "Score preserved")
}
console.log("✓ Scenario B verified: Single attempt survives refresh and restores accurately")

// ---------------------------------------------------------------------------
// 3. Scenario C: Multiple Attempts & Retake Persistence
// ---------------------------------------------------------------------------
console.log("\n[3] Testing Scenario C: Multiple attempts & retakes...")
const attempt2 = makeAttempt("geometry-essentials", 150)
const saveResult2 = saveAssessmentAttempts([attempt2, attempt1], storage)
assert.equal(saveResult2.ok, true, "Saving multiple attempts must succeed")

// Simulate second refresh
const multiLoad = loadAssessmentAttempts(storage)
assert.equal(multiLoad.ok, true)
if (multiLoad.ok) {
  assert.equal(multiLoad.attempts.length, 2, "Both attempts restored")
  assert.equal(multiLoad.attempts[0].id, attempt2.id, "Attempt 2 restored first (newest)")
  assert.equal(multiLoad.attempts[1].id, attempt1.id, "Attempt 1 restored second")
}
console.log("✓ Scenario C verified: Multiple attempts and retakes individually preserved")

// ---------------------------------------------------------------------------
// 4. Scenario D: Derived Intelligence Rebuilds From Restored Evidence
// ---------------------------------------------------------------------------
console.log("\n[4] Testing Scenario D: Derived intelligence after restoration...")
if (multiLoad.ok) {
  const restoredAttempts = multiLoad.attempts

  // Cognitive Fingerprint rebuild
  const restoredFp = computeCognitiveFingerprint(restoredAttempts)
  assert.notEqual(restoredFp.overallMastery, null, "Overall mastery restored")
  assert.equal(restoredFp.topicsWithEvidence, 4, "4 topics have evidence (2 from Algebra, 2 from Geometry)")

  // Study Plan rebuild
  const restoredPlan = generateStudyPlan(restoredFp)
  assert.equal(restoredPlan.hasAnyEvidence, true, "Study plan has evidence")
  assert.ok(restoredPlan.recommendations.length > 0, "Recommendations generated")

  // Progress Analytics rebuild
  const restoredAnalytics = calculateProgressAnalytics(restoredAttempts)
  assert.equal(restoredAnalytics.hasData, true, "Analytics has data")
  assert.equal(restoredAnalytics.totalAttempts, 2, "2 sessions recorded in analytics")
  assert.equal(restoredAnalytics.attemptHistory.length, 2, "Attempt history has 2 records")
}
console.log("✓ Scenario D verified: Fingerprint, Study Plan, and Progress Analytics rebuild faithfully")

// ---------------------------------------------------------------------------
// 5. Scenario E: Corrupt Storage Protection & No Data Destruction
// ---------------------------------------------------------------------------
console.log("\n[5] Testing Scenario E: Storage failure safeguards...")
const corruptStorage = new TrackedMemoryStorage()
const corruptPayload = "{bad-json-payload-that-cannot-parse"
corruptStorage.setItem(ASSESSMENT_STORAGE_KEY, corruptPayload)

const corruptLoad = loadAssessmentAttempts(corruptStorage)
assert.equal(corruptLoad.ok, false, "Must return ok: false for malformed JSON")
if (!corruptLoad.ok) {
  assert.equal(corruptLoad.error.code, "malformed-json", "Error code is 'malformed-json'")
}

// In the dashboard: when storageError exists, the component MUST NOT overwrite storage with []
// Verify the corrupt data remains intact in storage!
assert.equal(
  corruptStorage.getItem(ASSESSMENT_STORAGE_KEY),
  corruptPayload,
  "Corrupt storage payload must NOT be destroyed or overwritten with empty array",
)

// Test unsupported version
const unsupportedStorage = new TrackedMemoryStorage()
const futurePayload = JSON.stringify({ version: 999, attempts: [] })
unsupportedStorage.setItem(ASSESSMENT_STORAGE_KEY, futurePayload)
const futureLoad = loadAssessmentAttempts(unsupportedStorage)
assert.equal(futureLoad.ok, false)
if (!futureLoad.ok) {
  assert.equal(futureLoad.error.code, "unsupported-version")
}
assert.equal(
  unsupportedStorage.getItem(ASSESSMENT_STORAGE_KEY),
  futurePayload,
  "Unsupported version payload must NOT be overwritten",
)
console.log("✓ Scenario E verified: Corrupt or unsupported stored data is preserved without destruction")

// ---------------------------------------------------------------------------
// 6. Scenario F: Clear Storage Operation
// ---------------------------------------------------------------------------
console.log("\n[6] Testing Storage Clearing...")
const clearRes = clearAssessmentAttempts(storage)
assert.equal(clearRes.ok, true, "Clear operation succeeded")
assert.equal(storage.getItem(ASSESSMENT_STORAGE_KEY), null, "Key removed from storage")
const afterClearLoad = loadAssessmentAttempts(storage)
assert.equal(afterClearLoad.ok, true)
if (afterClearLoad.ok) {
  assert.equal(afterClearLoad.status, "empty")
  assert.equal(afterClearLoad.attempts.length, 0)
}
console.log("✓ Clear operation verified")

console.log("\n=== ALL STAGE 8B PERSISTENCE INTEGRATION TESTS PASSED ===")
