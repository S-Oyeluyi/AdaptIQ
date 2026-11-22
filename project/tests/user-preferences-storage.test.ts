import assert from "node:assert/strict"
import {
  DEFAULT_USER_PREFERENCES,
  validateUserPreferences,
} from "../lib/user-preferences"
import {
  USER_PREFERENCES_STORAGE_KEY,
  USER_PREFERENCES_STORAGE_VERSION,
  clearUserPreferences,
  loadUserPreferences,
  saveUserPreferences,
  type UserPreferencesStorageAdapter,
} from "../lib/user-preferences-storage"

class MemoryStorage implements UserPreferencesStorageAdapter {
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

class FailingStorage implements UserPreferencesStorageAdapter {
  getItem(): string | null {
    throw new Error("Read blocked")
  }

  setItem(): void {
    throw new Error("Write blocked")
  }

  removeItem(): void {
    throw new Error("Clear blocked")
  }
}

const validPreferences = {
  displayName: "  Alex Learner  ",
  dailyStudyGoalMinutes: 45,
  studyRemindersEnabled: true,
  progressNotificationsEnabled: false,
}

function runUserPreferencesStorageTests(): void {
  const defaultValidation = validateUserPreferences({})
  assert.equal(defaultValidation.valid, true)
  if (defaultValidation.valid) {
    assert.deepEqual(defaultValidation.preferences, DEFAULT_USER_PREFERENCES)
  }

  const storage = new MemoryStorage()
  assert.deepEqual(saveUserPreferences(validPreferences, storage), { ok: true })
  const envelope = JSON.parse(storage.getItem(USER_PREFERENCES_STORAGE_KEY)!)
  assert.equal(envelope.version, USER_PREFERENCES_STORAGE_VERSION)
  assert.deepEqual(loadUserPreferences(storage), {
    ok: true,
    preferences: {
      displayName: "Alex Learner",
      dailyStudyGoalMinutes: 45,
      studyRemindersEnabled: true,
      progressNotificationsEnabled: false,
    },
    status: "loaded",
  })

  const missingStorage = new MemoryStorage()
  assert.deepEqual(loadUserPreferences(missingStorage), {
    ok: true,
    preferences: DEFAULT_USER_PREFERENCES,
    status: "defaulted",
  })

  const partialStorage = new MemoryStorage()
  partialStorage.setItem(
    USER_PREFERENCES_STORAGE_KEY,
    JSON.stringify({
      version: USER_PREFERENCES_STORAGE_VERSION,
      preferences: { dailyStudyGoalMinutes: 60 },
    }),
  )
  assert.deepEqual(loadUserPreferences(partialStorage), {
    ok: true,
    preferences: {
      ...DEFAULT_USER_PREFERENCES,
      dailyStudyGoalMinutes: 60,
    },
    status: "loaded",
  })

  const malformedStorage = new MemoryStorage()
  malformedStorage.setItem(USER_PREFERENCES_STORAGE_KEY, "{not-json")
  const malformed = loadUserPreferences(malformedStorage)
  assert.equal(malformed.ok, false)
  if (!malformed.ok) assert.equal(malformed.error.code, "malformed-json")

  const unsupportedStorage = new MemoryStorage()
  unsupportedStorage.setItem(
    USER_PREFERENCES_STORAGE_KEY,
    JSON.stringify({
      version: USER_PREFERENCES_STORAGE_VERSION + 1,
      preferences: validPreferences,
    }),
  )
  const unsupported = loadUserPreferences(unsupportedStorage)
  assert.equal(unsupported.ok, false)
  if (!unsupported.ok) {
    assert.equal(unsupported.error.code, "unsupported-version")
  }

  const invalidPreferenceCases: Array<[string, unknown]> = [
    ["daily study goal", { ...validPreferences, dailyStudyGoalMinutes: 20 }],
    ["display name", { ...validPreferences, displayName: "   " }],
    ["notification setting", { ...validPreferences, studyRemindersEnabled: "yes" }],
    ["progress notification setting", { ...validPreferences, progressNotificationsEnabled: 1 }],
  ]
  for (const [label, invalid] of invalidPreferenceCases) {
    const result = validateUserPreferences(invalid)
    assert.equal(result.valid, false, `${label} should be rejected`)
  }

  const invalidStorage = new MemoryStorage()
  invalidStorage.setItem(
    USER_PREFERENCES_STORAGE_KEY,
    JSON.stringify({
      version: USER_PREFERENCES_STORAGE_VERSION,
      preferences: { ...validPreferences, dailyStudyGoalMinutes: 20 },
    }),
  )
  const invalidLoaded = loadUserPreferences(invalidStorage)
  assert.equal(invalidLoaded.ok, false)
  if (!invalidLoaded.ok) assert.equal(invalidLoaded.error.code, "invalid-data")

  const unavailable = loadUserPreferences()
  assert.equal(unavailable.ok, false)
  if (!unavailable.ok) assert.equal(unavailable.error.code, "unavailable")

  const failingStorage = new FailingStorage()
  const readFailure = loadUserPreferences(failingStorage)
  assert.equal(readFailure.ok, false)
  if (!readFailure.ok) assert.equal(readFailure.error.code, "read-failed")
  const writeFailure = saveUserPreferences(validPreferences, failingStorage)
  assert.equal(writeFailure.ok, false)
  if (!writeFailure.ok) assert.equal(writeFailure.error.code, "write-failed")
  const clearFailure = clearUserPreferences(failingStorage)
  assert.equal(clearFailure.ok, false)
  if (!clearFailure.ok) assert.equal(clearFailure.error.code, "clear-failed")

  const protectedStorage = new MemoryStorage()
  assert.deepEqual(saveUserPreferences(validPreferences, protectedStorage), {
    ok: true,
  })
  const existingValue = protectedStorage.getItem(USER_PREFERENCES_STORAGE_KEY)
  const rejectedSave = saveUserPreferences(
    { ...validPreferences, progressNotificationsEnabled: "enabled" },
    protectedStorage,
  )
  assert.equal(rejectedSave.ok, false)
  if (!rejectedSave.ok) assert.equal(rejectedSave.error.code, "invalid-data")
  assert.equal(
    protectedStorage.getItem(USER_PREFERENCES_STORAGE_KEY),
    existingValue,
    "Invalid preferences must not replace valid stored preferences.",
  )

  assert.deepEqual(clearUserPreferences(storage), { ok: true })
  assert.deepEqual(loadUserPreferences(storage), {
    ok: true,
    preferences: DEFAULT_USER_PREFERENCES,
    status: "defaulted",
  })

  console.log("✓ User preferences: defaults, validation, versioning, and storage failure cases verified")
}

runUserPreferencesStorageTests()
