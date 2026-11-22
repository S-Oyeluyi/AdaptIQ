import {
  DEFAULT_USER_PREFERENCES,
  validateUserPreferences,
  type UserPreferences,
} from "./user-preferences"

export const USER_PREFERENCES_STORAGE_KEY = "adaptiq:user-preferences"
export const USER_PREFERENCES_STORAGE_VERSION = 1

export interface UserPreferencesStorageAdapter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type UserPreferencesStorageErrorCode =
  | "unavailable"
  | "read-failed"
  | "write-failed"
  | "clear-failed"
  | "malformed-json"
  | "unsupported-version"
  | "invalid-data"

export interface UserPreferencesStorageError {
  code: UserPreferencesStorageErrorCode
  message: string
}

export type LoadUserPreferencesResult =
  | {
      ok: true
      preferences: UserPreferences
      status: "loaded" | "defaulted"
    }
  | { ok: false; error: UserPreferencesStorageError }

export type UserPreferencesStorageOperationResult =
  | { ok: true }
  | { ok: false; error: UserPreferencesStorageError }

interface StoredUserPreferences {
  version: number
  preferences: UserPreferences
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function failure(
  code: UserPreferencesStorageErrorCode,
  message: string,
): Extract<UserPreferencesStorageOperationResult, { ok: false }> {
  return { ok: false, error: { code, message } }
}

function getStorage(
  storage?: UserPreferencesStorageAdapter,
): UserPreferencesStorageAdapter | undefined {
  if (storage) return storage
  if (typeof window === "undefined") return undefined

  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export function saveUserPreferences(
  preferences: unknown,
  storage?: UserPreferencesStorageAdapter,
): UserPreferencesStorageOperationResult {
  const validation = validateUserPreferences(preferences)
  if (!validation.valid) {
    return failure(
      "invalid-data",
      `Preferences were not saved: ${validation.errors.join(" ")}`,
    )
  }

  const target = getStorage(storage)
  if (!target) {
    return failure("unavailable", "Browser storage is not available.")
  }

  try {
    const envelope: StoredUserPreferences = {
      version: USER_PREFERENCES_STORAGE_VERSION,
      preferences: validation.preferences,
    }
    target.setItem(USER_PREFERENCES_STORAGE_KEY, JSON.stringify(envelope))
    return { ok: true }
  } catch {
    return failure("write-failed", "User preferences could not be saved.")
  }
}

export function loadUserPreferences(
  storage?: UserPreferencesStorageAdapter,
): LoadUserPreferencesResult {
  const target = getStorage(storage)
  if (!target) {
    return failure("unavailable", "Browser storage is not available.")
  }

  let serialized: string | null
  try {
    serialized = target.getItem(USER_PREFERENCES_STORAGE_KEY)
  } catch {
    return failure("read-failed", "User preferences could not be read.")
  }

  if (serialized === null) {
    return {
      ok: true,
      preferences: { ...DEFAULT_USER_PREFERENCES },
      status: "defaulted",
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    return failure("malformed-json", "Saved preferences are not valid JSON.")
  }

  if (!isRecord(parsed) || !Number.isInteger(parsed.version)) {
    return failure("invalid-data", "Saved preferences have an invalid format.")
  }
  if (parsed.version !== USER_PREFERENCES_STORAGE_VERSION) {
    return failure(
      "unsupported-version",
      `Saved preferences version ${parsed.version} is not supported.`,
    )
  }

  const validation = validateUserPreferences(parsed.preferences)
  if (!validation.valid) {
    return failure(
      "invalid-data",
      `Saved preferences failed validation: ${validation.errors.join(" ")}`,
    )
  }

  return {
    ok: true,
    preferences: validation.preferences,
    status: "loaded",
  }
}

export function clearUserPreferences(
  storage?: UserPreferencesStorageAdapter,
): UserPreferencesStorageOperationResult {
  const target = getStorage(storage)
  if (!target) {
    return failure("unavailable", "Browser storage is not available.")
  }

  try {
    target.removeItem(USER_PREFERENCES_STORAGE_KEY)
    return { ok: true }
  } catch {
    return failure("clear-failed", "User preferences could not be cleared.")
  }
}
