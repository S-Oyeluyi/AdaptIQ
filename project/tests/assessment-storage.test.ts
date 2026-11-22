import assert from "node:assert/strict"
import {
  getQuestionsForAssessment,
} from "../lib/assessment-data"
import {
  evaluateAssessment,
  type AssessmentEvaluation,
} from "../lib/assessment-engine"
import {
  ASSESSMENT_STORAGE_KEY,
  ASSESSMENT_STORAGE_VERSION,
  clearAssessmentAttempts,
  loadAssessmentAttempts,
  saveAssessmentAttempts,
  type AssessmentStorageAdapter,
} from "../lib/assessment-storage"

class MemoryStorage implements AssessmentStorageAdapter {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

class FailingStorage implements AssessmentStorageAdapter {
  getItem(): string | null {
    throw new Error("Storage read blocked")
  }

  setItem(): void {
    throw new Error("Storage write blocked")
  }

  removeItem(): void {
    throw new Error("Storage clear blocked")
  }
}

function createAttempt(): AssessmentEvaluation {
  const questions = getQuestionsForAssessment("algebra-readiness")
  const answers = Object.fromEntries(
    questions.map((question) => [question.id, question.correctIndex]),
  )
  return evaluateAssessment("algebra-readiness", questions, answers, 90)
}

function runAssessmentStorageTests(): void {
  const validAttempt = createAttempt()

  // Valid attempts round-trip through the versioned envelope.
  const storage = new MemoryStorage()
  assert.deepEqual(saveAssessmentAttempts([validAttempt], storage), { ok: true })
  const savedEnvelope = JSON.parse(storage.getItem(ASSESSMENT_STORAGE_KEY)!)
  assert.equal(savedEnvelope.version, ASSESSMENT_STORAGE_VERSION)
  assert.deepEqual(loadAssessmentAttempts(storage), {
    ok: true,
    attempts: [validAttempt],
    status: "loaded",
  })

  // Missing data is a normal empty state, distinct from a storage error.
  const emptyLoad = loadAssessmentAttempts(new MemoryStorage())
  assert.deepEqual(emptyLoad, { ok: true, attempts: [], status: "empty" })

  const malformedStorage = new MemoryStorage()
  malformedStorage.setItem(ASSESSMENT_STORAGE_KEY, "{not-json")
  const malformedLoad = loadAssessmentAttempts(malformedStorage)
  assert.equal(malformedLoad.ok, false)
  if (!malformedLoad.ok) assert.equal(malformedLoad.error.code, "malformed-json")

  const unsupportedStorage = new MemoryStorage()
  unsupportedStorage.setItem(
    ASSESSMENT_STORAGE_KEY,
    JSON.stringify({ version: ASSESSMENT_STORAGE_VERSION + 1, attempts: [] }),
  )
  const unsupportedLoad = loadAssessmentAttempts(unsupportedStorage)
  assert.equal(unsupportedLoad.ok, false)
  if (!unsupportedLoad.ok) {
    assert.equal(unsupportedLoad.error.code, "unsupported-version")
  }

  const invalidStorage = new MemoryStorage()
  const invalidAttempt: AssessmentEvaluation = {
    ...validAttempt,
    responses: validAttempt.responses.map((response, index) =>
      index === 0 ? { ...response, topicId: "unknown-topic" } : response,
    ),
  }
  invalidStorage.setItem(
    ASSESSMENT_STORAGE_KEY,
    JSON.stringify({
      version: ASSESSMENT_STORAGE_VERSION,
      attempts: [invalidAttempt],
    }),
  )
  const invalidLoad = loadAssessmentAttempts(invalidStorage)
  assert.equal(invalidLoad.ok, false)
  if (!invalidLoad.ok) assert.equal(invalidLoad.error.code, "invalid-data")

  assert.deepEqual(clearAssessmentAttempts(storage), { ok: true })
  assert.deepEqual(loadAssessmentAttempts(storage), {
    ok: true,
    attempts: [],
    status: "empty",
  })

  // Server-side calls and browser storage failures are explicit, not thrown.
  const unavailableLoad = loadAssessmentAttempts()
  assert.equal(unavailableLoad.ok, false)
  if (!unavailableLoad.ok) assert.equal(unavailableLoad.error.code, "unavailable")

  const failingStorage = new FailingStorage()
  const readFailure = loadAssessmentAttempts(failingStorage)
  assert.equal(readFailure.ok, false)
  if (!readFailure.ok) assert.equal(readFailure.error.code, "read-failed")
  const writeFailure = saveAssessmentAttempts([validAttempt], failingStorage)
  assert.equal(writeFailure.ok, false)
  if (!writeFailure.ok) assert.equal(writeFailure.error.code, "write-failed")
  const clearFailure = clearAssessmentAttempts(failingStorage)
  assert.equal(clearFailure.ok, false)
  if (!clearFailure.ok) assert.equal(clearFailure.error.code, "clear-failed")

  // Invalid new data is rejected before touching existing valid data.
  const protectedStorage = new MemoryStorage()
  assert.deepEqual(saveAssessmentAttempts([validAttempt], protectedStorage), {
    ok: true,
  })
  const originalSerialized = protectedStorage.getItem(ASSESSMENT_STORAGE_KEY)
  const invalidForSave = { ...validAttempt, overallScore: 101 }
  const rejectedSave = saveAssessmentAttempts(
    [invalidForSave],
    protectedStorage,
  )
  assert.equal(rejectedSave.ok, false)
  if (!rejectedSave.ok) assert.equal(rejectedSave.error.code, "invalid-data")
  assert.equal(
    protectedStorage.getItem(ASSESSMENT_STORAGE_KEY),
    originalSerialized,
  )
  assert.deepEqual(loadAssessmentAttempts(protectedStorage), {
    ok: true,
    attempts: [validAttempt],
    status: "loaded",
  })

  console.log("✓ Assessment storage: save/load, validation, versioning, and failure cases verified")
}

runAssessmentStorageTests()
