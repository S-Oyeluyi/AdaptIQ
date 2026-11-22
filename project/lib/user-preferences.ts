export type DailyStudyGoalMinutes = 15 | 30 | 45 | 60

export interface UserPreferences {
  displayName: string
  dailyStudyGoalMinutes: DailyStudyGoalMinutes
  studyRemindersEnabled: boolean
  progressNotificationsEnabled: boolean
}

export const DAILY_STUDY_GOAL_OPTIONS: readonly DailyStudyGoalMinutes[] = [
  15,
  30,
  45,
  60,
]

export const DEFAULT_USER_PREFERENCES: Readonly<UserPreferences> = {
  displayName: "Learner",
  dailyStudyGoalMinutes: 30,
  studyRemindersEnabled: false,
  progressNotificationsEnabled: false,
}

export type UserPreferencesValidationResult =
  | { valid: true; preferences: UserPreferences; errors: [] }
  | { valid: false; errors: string[] }

const preferenceFields = new Set([
  "displayName",
  "dailyStudyGoalMinutes",
  "studyRemindersEnabled",
  "progressNotificationsEnabled",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isDailyStudyGoalMinutes(
  value: unknown,
): value is DailyStudyGoalMinutes {
  return DAILY_STUDY_GOAL_OPTIONS.some((option) => option === value)
}

export function validateUserPreferences(
  value: unknown,
): UserPreferencesValidationResult {
  if (!isRecord(value)) {
    return { valid: false, errors: ["Preferences must be an object."] }
  }

  const errors: string[] = []
  for (const field of Object.keys(value)) {
    if (!preferenceFields.has(field)) {
      errors.push(`Unknown preference field "${field}".`)
    }
  }

  let displayName = DEFAULT_USER_PREFERENCES.displayName
  if (value.displayName !== undefined) {
    if (typeof value.displayName !== "string") {
      errors.push("Display name must be a string.")
    } else {
      displayName = value.displayName.trim()
      if (displayName.length === 0) {
        errors.push("Display name must not be empty.")
      } else if (displayName.length > 80) {
        errors.push("Display name must be 80 characters or fewer.")
      }
    }
  }

  let dailyStudyGoalMinutes =
    DEFAULT_USER_PREFERENCES.dailyStudyGoalMinutes
  if (value.dailyStudyGoalMinutes !== undefined) {
    if (isDailyStudyGoalMinutes(value.dailyStudyGoalMinutes)) {
      dailyStudyGoalMinutes = value.dailyStudyGoalMinutes
    } else {
      errors.push("Daily study goal must be 15, 30, 45, or 60 minutes.")
    }
  }

  let studyRemindersEnabled =
    DEFAULT_USER_PREFERENCES.studyRemindersEnabled
  if (value.studyRemindersEnabled !== undefined) {
    if (typeof value.studyRemindersEnabled === "boolean") {
      studyRemindersEnabled = value.studyRemindersEnabled
    } else {
      errors.push("Study reminders setting must be a boolean.")
    }
  }

  let progressNotificationsEnabled =
    DEFAULT_USER_PREFERENCES.progressNotificationsEnabled
  if (value.progressNotificationsEnabled !== undefined) {
    if (typeof value.progressNotificationsEnabled === "boolean") {
      progressNotificationsEnabled = value.progressNotificationsEnabled
    } else {
      errors.push("Progress notifications setting must be a boolean.")
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors }
  }

  return {
    valid: true,
    preferences: {
      displayName,
      dailyStudyGoalMinutes,
      studyRemindersEnabled,
      progressNotificationsEnabled,
    },
    errors: [],
  }
}
