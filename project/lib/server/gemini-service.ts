import "server-only"

import { GoogleGenAI } from "@google/genai"

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
export const DEFAULT_GEMINI_TIMEOUT_MS = 45_000
export const MAX_GEMINI_TIMEOUT_MS = 60_000
export const MAX_GEMINI_OUTPUT_TOKENS = 1024
const MAX_PROMPT_CHARACTERS = 10_000

export type GeminiServiceErrorCode =
  | "missing-api-key"
  | "invalid-input"
  | "timeout"
  | "empty-response"
  | "api-failure"

export type GeminiGenerationClassification =
  | "success"
  | "invalid-input"
  | "local-application-timeout"
  | "provider-timeout"
  | "transport-timeout"
  | "invalid-api-key-or-permission"
  | "model-unavailable"
  | "quota-or-rate-limit"
  | "other-provider-error"
  | "configuration-error"
  | "empty-response"

export interface GeminiGenerationDiagnostics {
  model: string
  elapsedMs: number
  providerStatus: number | null
  classification: GeminiGenerationClassification
  errorCode: GeminiServiceErrorCode | null
}

export type GeminiDiagnosticsLogger = (
  event: "success" | "failure",
  diagnostics: GeminiGenerationDiagnostics,
) => void

export class GeminiServiceError extends Error {
  constructor(
    readonly code: GeminiServiceErrorCode,
    message: string,
    readonly diagnostics?: GeminiGenerationDiagnostics,
  ) {
    super(message)
    this.name = "GeminiServiceError"
  }
}

export interface GeminiTextGenerationRequest {
  model: string
  prompt: string
  maxOutputTokens: number
  timeoutMs: number
  responseMimeType?: string
}

export interface GeminiTextGenerationResult {
  text?: string | null
}

export type GeminiTextGenerator = (
  request: GeminiTextGenerationRequest,
) => Promise<GeminiTextGenerationResult>

export interface GeminiGenerationOptions {
  generator?: GeminiTextGenerator
  timeoutMs?: number
  logger?: GeminiDiagnosticsLogger
  responseMimeType?: string
}

let cachedClient: GoogleGenAI | undefined
let cachedApiKey: string | undefined

class LocalApplicationTimeoutError extends Error {}

function logDiagnostics(
  event: "success" | "failure",
  diagnostics: GeminiGenerationDiagnostics,
  logger?: GeminiDiagnosticsLogger,
): void {
  if (logger) {
    logger(event, diagnostics)
  } else if (event === "success") {
    console.info("[AdaptIQ] Gemini generation completed", diagnostics)
  } else {
    console.error("[AdaptIQ] Gemini generation failed", diagnostics)
  }
}

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    throw new GeminiServiceError(
      "missing-api-key",
      "GEMINI_API_KEY is not configured on the server.",
    )
  }

  if (!cachedClient || cachedApiKey !== apiKey) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: DEFAULT_GEMINI_TIMEOUT_MS },
    })
    cachedApiKey = apiKey
  }

  return cachedClient
}

function getModelIdentifier(): string {
  const configuredModel = process.env.GEMINI_MODEL?.trim()
  return configuredModel || DEFAULT_GEMINI_MODEL
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === "AbortError" || error.name === "TimeoutError") return true

  const code =
    "code" in error && typeof error.code === "string" ? error.code : ""
  return (
    code === "ETIMEDOUT" ||
    code === "ECONNABORTED" ||
    /timed?\s*out|timeout|deadline exceeded/i.test(error.message)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function getProviderStatus(error: unknown): number | null {
  if (!isRecord(error)) return null

  const directStatus = error.status
  if (
    typeof directStatus === "number" &&
    directStatus >= 100 &&
    directStatus <= 599
  ) {
    return directStatus
  }

  if (isRecord(error.response)) {
    const responseStatus = error.response.status
    if (
      typeof responseStatus === "number" &&
      responseStatus >= 100 &&
      responseStatus <= 599
    ) {
      return responseStatus
    }
  }

  return null
}

function classifyProviderFailure(
  error: unknown,
  providerStatus: number | null,
): GeminiGenerationClassification {
  if (providerStatus === 408 || providerStatus === 504) {
    return "provider-timeout"
  }
  if (providerStatus === 401 || providerStatus === 403) {
    return "invalid-api-key-or-permission"
  }
  if (providerStatus === 404) return "model-unavailable"
  if (providerStatus === 429) return "quota-or-rate-limit"
  if (isTimeoutError(error)) return "transport-timeout"
  return "other-provider-error"
}

function safeServiceErrorMessage(code: GeminiServiceErrorCode): string {
  switch (code) {
    case "missing-api-key":
      return "GEMINI_API_KEY is not configured on the server."
    case "invalid-input":
      return "Gemini generation request is invalid."
    case "timeout":
      return "Gemini generation exceeded the configured timeout."
    case "empty-response":
      return "Gemini returned an empty text response."
    case "api-failure":
      return "Gemini generation failed."
  }
}

function classifyServiceError(
  code: GeminiServiceErrorCode,
): GeminiGenerationClassification {
  switch (code) {
    case "missing-api-key":
      return "configuration-error"
    case "timeout":
      return "transport-timeout"
    case "invalid-input":
      return "invalid-input"
    case "empty-response":
      return "empty-response"
    case "api-failure":
      return "other-provider-error"
  }
}

function createInvalidInputError(
  message: string,
  options: GeminiGenerationOptions,
): GeminiServiceError {
  const diagnostics: GeminiGenerationDiagnostics = {
    model: getModelIdentifier(),
    elapsedMs: 0,
    providerStatus: null,
    classification: "invalid-input",
    errorCode: "invalid-input",
  }
  logDiagnostics("failure", diagnostics, options.logger)
  return new GeminiServiceError("invalid-input", message, diagnostics)
}

function generateWithSdk(
  request: GeminiTextGenerationRequest,
): Promise<GeminiTextGenerationResult> {
  return getGeminiClient()
    .models.generateContent({
      model: request.model,
      contents: request.prompt,
      config: {
        maxOutputTokens: request.maxOutputTokens,
        httpOptions: { timeout: request.timeoutMs },
        responseMimeType: request.responseMimeType ?? "application/json",
      },
    })
    .then((response) => ({ text: response.text }))
}

function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new LocalApplicationTimeoutError()),
      timeoutMs,
    )
  })

  return Promise.race([Promise.resolve().then(operation), timeoutPromise]).finally(
    () => {
      if (timeout !== undefined) clearTimeout(timeout)
    },
  )
}

export async function generateGeminiText(
  prompt: string,
  options: GeminiGenerationOptions = {},
): Promise<string> {
  const normalizedPrompt = prompt.trim()
  if (!normalizedPrompt || normalizedPrompt.length > MAX_PROMPT_CHARACTERS) {
    throw createInvalidInputError(
      `Prompt must contain 1-${MAX_PROMPT_CHARACTERS} characters.`,
      options,
    )
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_GEMINI_TIMEOUT_MS
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_GEMINI_TIMEOUT_MS
  ) {
    throw createInvalidInputError(
      `Timeout must be between 1 and ${MAX_GEMINI_TIMEOUT_MS} milliseconds.`,
      options,
    )
  }

  const model = getModelIdentifier()
  const generator = options.generator ?? generateWithSdk
  const responseMimeType = options.responseMimeType ?? "application/json"
  const startedAt = Date.now()
  const elapsedMs = () => Math.max(0, Date.now() - startedAt)

  let result: GeminiTextGenerationResult
  try {
    result = await withTimeout(
      () =>
        generator({
          model,
          prompt: normalizedPrompt,
          maxOutputTokens: MAX_GEMINI_OUTPUT_TOKENS,
          timeoutMs,
          responseMimeType,
        }),
      timeoutMs + 2_000,
    )
  } catch (error) {
    if (error instanceof LocalApplicationTimeoutError) {
      const diagnostics: GeminiGenerationDiagnostics = {
        model,
        elapsedMs: elapsedMs(),
        providerStatus: null,
        classification: "local-application-timeout",
        errorCode: "timeout",
      }
      logDiagnostics("failure", diagnostics, options.logger)
      throw new GeminiServiceError(
        "timeout",
        safeServiceErrorMessage("timeout"),
        diagnostics,
      )
    }

    if (error instanceof GeminiServiceError) {
      const diagnostics =
        error.diagnostics ?? {
          model,
          elapsedMs: elapsedMs(),
          providerStatus: null,
          classification: classifyServiceError(error.code),
          errorCode: error.code,
        }
      logDiagnostics("failure", diagnostics, options.logger)
      if (error.diagnostics) throw error
      throw new GeminiServiceError(
        error.code,
        safeServiceErrorMessage(error.code),
        diagnostics,
      )
    }

    const providerStatus = getProviderStatus(error)
    const classification = classifyProviderFailure(error, providerStatus)
    const code =
      classification === "provider-timeout" ||
      classification === "transport-timeout"
        ? "timeout"
        : "api-failure"
    const diagnostics: GeminiGenerationDiagnostics = {
      model,
      elapsedMs: elapsedMs(),
      providerStatus,
      classification,
      errorCode: code,
    }
    logDiagnostics("failure", diagnostics, options.logger)
    throw new GeminiServiceError(
      code,
      safeServiceErrorMessage(code),
      diagnostics,
    )
  }

  const text = result.text?.trim()
  if (!text) {
    const diagnostics: GeminiGenerationDiagnostics = {
      model,
      elapsedMs: elapsedMs(),
      providerStatus: null,
      classification: "empty-response",
      errorCode: "empty-response",
    }
    logDiagnostics("failure", diagnostics, options.logger)
    throw new GeminiServiceError(
      "empty-response",
      safeServiceErrorMessage("empty-response"),
      diagnostics,
    )
  }

  logDiagnostics(
    "success",
    {
      model,
      elapsedMs: elapsedMs(),
      providerStatus: null,
      classification: "success",
      errorCode: null,
    },
    options.logger,
  )
  return text
}
