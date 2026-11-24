import "server-only"

const OPENROUTER_CHAT_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions"

export const DEFAULT_OPENROUTER_MODEL = "openrouter/free"
export const DEFAULT_OPENROUTER_TIMEOUT_MS = 45_000
export const MAX_OPENROUTER_TIMEOUT_MS = 60_000
export const DEFAULT_OPENROUTER_OUTPUT_TOKENS = 1024
export const MAX_OPENROUTER_OUTPUT_TOKENS = 4096
const MAX_PROMPT_CHARACTERS = 10_000

export type OpenRouterServiceErrorCode =
  | "missing-api-key"
  | "invalid-input"
  | "timeout"
  | "empty-response"
  | "invalid-response"
  | "api-failure"

export type OpenRouterGenerationClassification =
  | "success"
  | "invalid-input"
  | "local-application-timeout"
  | "provider-timeout"
  | "transport-timeout"
  | "invalid-api-key-or-permission"
  | "model-unavailable"
  | "quota-or-rate-limit"
  | "network-error"
  | "invalid-response"
  | "other-provider-error"
  | "configuration-error"
  | "empty-response"

export interface OpenRouterResponseStructure {
  hasChoices: boolean
  choicesCount: number
  hasMessage: boolean
  hasContent: boolean
  contentType: string | null
  isContentEmpty: boolean | null
  hasFinishReason: boolean
  finishReason: string | null
  hasRefusal: boolean
  hasToolCalls: boolean
  hasInBandError: boolean
  jsonExtractionSucceeded?: boolean | null
  zodValidationSucceeded?: boolean | null
}

export interface OpenRouterGenerationDiagnostics {
  model: string
  elapsedMs: number
  providerStatus: number | null
  providerErrorCode: string | null
  providerMessage: string | null
  upstreamProvider: string | null
  upstreamStatus: number | null
  classification: OpenRouterGenerationClassification
  errorCode: OpenRouterServiceErrorCode | null
  responseStructure?: OpenRouterResponseStructure | null
}

export type OpenRouterDiagnosticsLogger = (
  event: "success" | "failure",
  diagnostics: OpenRouterGenerationDiagnostics,
) => void

export class OpenRouterServiceError extends Error {
  constructor(
    readonly code: OpenRouterServiceErrorCode,
    message: string,
    readonly diagnostics?: OpenRouterGenerationDiagnostics,
  ) {
    super(message)
    this.name = "OpenRouterServiceError"
  }
}

export interface OpenRouterTextGenerationRequest {
  model: string
  prompt: string
  maxOutputTokens: number
  timeoutMs: number
}

export interface OpenRouterTextGenerationResult {
  text?: string | null
  model?: string | null
  providerStatus?: number | null
  responseStructure?: OpenRouterResponseStructure | null
}

export type OpenRouterTextGenerator = (
  request: OpenRouterTextGenerationRequest,
) => Promise<OpenRouterTextGenerationResult>

export interface OpenRouterGenerationOptions {
  generator?: OpenRouterTextGenerator
  fetcher?: typeof fetch
  timeoutMs?: number
  maxOutputTokens?: number
  logger?: OpenRouterDiagnosticsLogger
}

class LocalApplicationTimeoutError extends Error {}

class ProviderRequestError extends Error {
  constructor(
    readonly code: OpenRouterServiceErrorCode,
    readonly classification: OpenRouterGenerationClassification,
    readonly providerStatus: number | null,
    readonly model: string | null = null,
    readonly providerErrorCode: string | null = null,
    readonly providerMessage: string | null = null,
    readonly upstreamProvider: string | null = null,
    readonly upstreamStatus: number | null = null,
    readonly responseStructure: OpenRouterResponseStructure | null = null,
  ) {
    super("OpenRouter request failed.")
  }
}

function logDiagnostics(
  event: "success" | "failure",
  diagnostics: OpenRouterGenerationDiagnostics,
  logger?: OpenRouterDiagnosticsLogger,
): void {
  if (logger) {
    logger(event, diagnostics)
  } else if (event === "success") {
    console.info("[AdaptIQ] OpenRouter generation completed", diagnostics)
  } else {
    console.error("[AdaptIQ] OpenRouter generation failed", diagnostics)
  }
}

function getApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) {
    throw new OpenRouterServiceError(
      "missing-api-key",
      "OPENROUTER_API_KEY is not configured on the server.",
    )
  }
  return apiKey
}

function getModelIdentifier(): string {
  const configuredModel = process.env.OPENROUTER_MODEL?.trim()
  return configuredModel || DEFAULT_OPENROUTER_MODEL
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
): OpenRouterGenerationClassification {
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

function getErrorCode(
  classification: OpenRouterGenerationClassification,
): OpenRouterServiceErrorCode {
  return classification === "provider-timeout" ||
    classification === "transport-timeout" ||
    classification === "local-application-timeout"
    ? "timeout"
    : classification === "invalid-response"
      ? "invalid-response"
      : "api-failure"
}

function safeServiceErrorMessage(code: OpenRouterServiceErrorCode): string {
  switch (code) {
    case "missing-api-key":
      return "OPENROUTER_API_KEY is not configured on the server."
    case "invalid-input":
      return "OpenRouter generation request is invalid."
    case "timeout":
      return "OpenRouter generation exceeded the configured timeout."
    case "empty-response":
      return "OpenRouter returned an empty text response."
    case "invalid-response":
      return "OpenRouter returned an invalid response."
    case "api-failure":
      return "OpenRouter generation failed."
  }
}

function classifyServiceError(
  code: OpenRouterServiceErrorCode,
): OpenRouterGenerationClassification {
  switch (code) {
    case "missing-api-key":
      return "configuration-error"
    case "invalid-input":
      return "invalid-input"
    case "timeout":
      return "transport-timeout"
    case "empty-response":
      return "empty-response"
    case "invalid-response":
      return "invalid-response"
    case "api-failure":
      return "other-provider-error"
  }
}

function createInvalidInputError(
  message: string,
  options: OpenRouterGenerationOptions,
): OpenRouterServiceError {
  const diagnostics: OpenRouterGenerationDiagnostics = {
    model: getModelIdentifier(),
    elapsedMs: 0,
    providerStatus: null,
    providerErrorCode: null,
    providerMessage: null,
    upstreamProvider: null,
    upstreamStatus: null,
    classification: "invalid-input",
    errorCode: "invalid-input",
  }
  logDiagnostics("failure", diagnostics, options.logger)
  return new OpenRouterServiceError("invalid-input", message, diagnostics)
}

function getReturnedModel(value: unknown): string | null {
  if (
    typeof value === "string" &&
    /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(value)
  ) {
    return value
  }
  return null
}

function getSafeCode(value: unknown): string | null {
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
  ) {
    return String(value)
  }

  if (typeof value !== "string") return null
  const code = value.toUpperCase()
  const safeCodes = new Set([
    "INVALID_API_KEY",
    "INVALID_REQUEST",
    "MODEL_NOT_FOUND",
    "NO_AVAILABLE_PROVIDER",
    "PROVIDER_ERROR",
    "RATE_LIMIT_EXCEEDED",
    "UPSTREAM_FAILURE",
  ])
  return safeCodes.has(code) ? code : null
}

function getSafeProviderName(value: unknown): string | null {
  return getReturnedModel(value)
}

function getSafeStatus(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
    ? value
    : null
}

function summarizeProviderMessage(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null

  const message = value.toLowerCase()
  if (/rate.?limit|quota/.test(message)) return "Provider rate limit or quota reached."
  if (/timed?\s*out|timeout|deadline/.test(message)) {
    return "Provider request timed out."
  }
  if (/unauthori[sz]ed|invalid.{0,12}api.?key|permission|forbidden/.test(message)) {
    return "Provider rejected authentication or permissions."
  }
  if (/model.{0,20}(not found|unavailable|does not exist)/.test(message)) {
    return "Requested model is unavailable."
  }
  if (/internal server error|upstream.{0,20}error|service unavailable/.test(message)) {
    return "Upstream provider returned a service error."
  }
  return "Provider returned an error."
}

function getErrorMetadata(body: unknown): {
  code: string | null
  message: string | null
  model: string | null
  upstreamProvider: string | null
  upstreamStatus: number | null
} {
  if (!isRecord(body)) {
    return {
      code: null,
      message: null,
      model: null,
      upstreamProvider: null,
      upstreamStatus: null,
    }
  }

  const error = isRecord(body.error) ? body.error : body
  const metadata = isRecord(error.metadata) ? error.metadata : {}
  return {
    code: getSafeCode(error.code),
    message: summarizeProviderMessage(error.message),
    model: getReturnedModel(body.model) ?? getReturnedModel(error.model),
    upstreamProvider:
      getSafeProviderName(metadata.provider_name) ??
      getSafeProviderName(metadata.provider),
    upstreamStatus:
      getSafeStatus(metadata.upstream_status) ??
      getSafeStatus(metadata.status),
  }
}

function buildResponseStructure(
  body: unknown,
  firstChoice: Record<string, unknown> | null,
): OpenRouterResponseStructure {
  const hasChoices = isRecord(body) && Array.isArray(body.choices)
  const choicesCount = hasChoices ? (body as Record<string, unknown[]>).choices.length : 0
  const message = firstChoice && isRecord(firstChoice.message) ? firstChoice.message : null
  const rawContent = message?.content
  const hasContent = rawContent !== undefined && rawContent !== null
  const contentType =
    rawContent === null ? "null"
    : rawContent === undefined ? "undefined"
    : Array.isArray(rawContent) ? "array"
    : typeof rawContent
  const isContentEmpty =
    contentType === "string" ? (rawContent as string).trim().length === 0
    : contentType === "null" || contentType === "undefined" ? true
    : contentType === "array" ? (rawContent as unknown[]).length === 0
    : null
  const finishReason =
    firstChoice && typeof firstChoice.finish_reason === "string"
      ? firstChoice.finish_reason
      : null
  const hasFinishReason = finishReason !== null
  const hasRefusal =
    message !== null &&
    typeof message.refusal === "string" &&
    message.refusal.length > 0
  const hasToolCalls =
    message !== null && Array.isArray(message.tool_calls) && message.tool_calls.length > 0
  const hasInBandError =
    (isRecord(body) && isRecord((body as Record<string, unknown>).error)) ||
    finishReason === "error" ||
    (firstChoice !== null && isRecord(firstChoice.error))

  return {
    hasChoices,
    choicesCount,
    hasMessage: message !== null,
    hasContent,
    contentType,
    isContentEmpty,
    hasFinishReason,
    finishReason,
    hasRefusal,
    hasToolCalls,
    hasInBandError,
    jsonExtractionSucceeded: null,
    zodValidationSucceeded: null,
  }
}

/**
 * Extracts text content from a choice's message, handling:
 * - string content (standard)
 * - array content parts (multi-part responses: [{ type: "text", text: "..." }])
 * - null/undefined content with fallback to choice.text
 */
function extractContentText(
  choice: Record<string, unknown>,
  message: Record<string, unknown>,
): string | null {
  // Standard: string content
  if (typeof message.content === "string") {
    return message.content
  }

  // Multi-part content: [{ type: "text", text: "..." }, ...]
  if (Array.isArray(message.content)) {
    const textParts = message.content
      .filter(
        (part: unknown) =>
          isRecord(part) &&
          part.type === "text" &&
          typeof part.text === "string",
      )
      .map((part: Record<string, unknown>) => part.text as string)
    if (textParts.length > 0) {
      return textParts.join("")
    }
  }

  // Fallback: some models put text in choice.text
  if (typeof choice.text === "string") {
    return choice.text
  }

  return null
}

async function generateWithOpenRouter(
  request: OpenRouterTextGenerationRequest,
  fetcher: typeof fetch,
): Promise<OpenRouterTextGenerationResult> {
  const apiKey = getApiKey()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs)

  try {
    let response: Response
    try {
      response = await fetcher(OPENROUTER_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: request.model,
          messages: [{ role: "user", content: request.prompt }],
          max_tokens: request.maxOutputTokens,
        }),
        signal: controller.signal,
      })
    } catch (error) {
      if (controller.signal.aborted || isTimeoutError(error)) {
        throw new ProviderRequestError(
          "timeout",
          "transport-timeout",
          null,
        )
      }
      throw new ProviderRequestError("api-failure", "network-error", null)
    }

    if (!response.ok) {
      const classification = classifyProviderFailure(
        undefined,
        response.status,
      )
      let errorBody: unknown
      try {
        errorBody = await response.json()
      } catch {
        errorBody = null
      }
      const metadata = getErrorMetadata(errorBody)
      throw new ProviderRequestError(
        getErrorCode(classification),
        classification,
        response.status,
        metadata.model,
        metadata.code,
        metadata.message,
        metadata.upstreamProvider,
        metadata.upstreamStatus,
      )
    }

    let body: unknown
    try {
      body = await response.json()
    } catch (error) {
      if (controller.signal.aborted || isTimeoutError(error)) {
        throw new ProviderRequestError(
          "timeout",
          "transport-timeout",
          null,
        )
      }
      throw new ProviderRequestError(
        "invalid-response",
        "invalid-response",
        response.status,
      )
    }

    const returnedModel = isRecord(body) ? getReturnedModel(body.model) : null

    // Detect in-band errors (HTTP 200 but body contains error)
    if (isRecord(body) && isRecord(body.error)) {
      const metadata = getErrorMetadata(body)
      const structure = buildResponseStructure(body, null)
      throw new ProviderRequestError(
        "api-failure",
        "other-provider-error",
        response.status,
        metadata.model ?? returnedModel,
        metadata.code,
        metadata.message,
        metadata.upstreamProvider,
        metadata.upstreamStatus,
        structure,
      )
    }

    if (!isRecord(body) || !Array.isArray(body.choices)) {
      const structure = buildResponseStructure(body, null)
      throw new ProviderRequestError(
        "invalid-response",
        "invalid-response",
        response.status,
        returnedModel,
        null,
        null,
        null,
        null,
        structure,
      )
    }

    const firstChoice = body.choices[0]
    if (!isRecord(firstChoice)) {
      const structure = buildResponseStructure(body, null)
      throw new ProviderRequestError(
        "invalid-response",
        "invalid-response",
        response.status,
        returnedModel,
        null,
        null,
        null,
        null,
        structure,
      )
    }

    const structure = buildResponseStructure(body, firstChoice)

    // Detect choice-level errors
    if (
      firstChoice.finish_reason === "error" ||
      isRecord(firstChoice.error)
    ) {
      const errorMsg = isRecord(firstChoice.error) && typeof firstChoice.error.message === "string"
        ? summarizeProviderMessage(firstChoice.error.message)
        : "Provider returned an error in response choice."
      throw new ProviderRequestError(
        "api-failure",
        "other-provider-error",
        response.status,
        returnedModel,
        null,
        errorMsg,
        null,
        null,
        structure,
      )
    }

    if (!isRecord(firstChoice.message)) {
      throw new ProviderRequestError(
        "invalid-response",
        "invalid-response",
        response.status,
        returnedModel,
        null,
        null,
        null,
        null,
        structure,
      )
    }

    // Detect refusal
    if (
      structure.hasRefusal &&
      (firstChoice.message.content === null ||
        firstChoice.message.content === undefined ||
        (typeof firstChoice.message.content === "string" &&
          firstChoice.message.content.trim().length === 0))
    ) {
      throw new ProviderRequestError(
        "api-failure",
        "other-provider-error",
        response.status,
        returnedModel,
        null,
        "Provider refused the request.",
        null,
        null,
        structure,
      )
    }

    // Extract text content (handles string, array content parts, and choice.text fallback)
    const contentText = extractContentText(
      firstChoice,
      firstChoice.message as Record<string, unknown>,
    )

    if (contentText === null) {
      throw new ProviderRequestError(
        "invalid-response",
        "invalid-response",
        response.status,
        returnedModel,
        null,
        null,
        null,
        null,
        structure,
      )
    }

    return {
      text: contentText,
      model: returnedModel,
      providerStatus: response.status,
      responseStructure: structure,
    }
  } finally {
    clearTimeout(timeout)
  }
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

export async function generateOpenRouterText(
  prompt: string,
  options: OpenRouterGenerationOptions = {},
): Promise<string> {
  const normalizedPrompt = prompt.trim()
  if (!normalizedPrompt || normalizedPrompt.length > MAX_PROMPT_CHARACTERS) {
    throw createInvalidInputError(
      `Prompt must contain 1-${MAX_PROMPT_CHARACTERS} characters.`,
      options,
    )
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_OPENROUTER_TIMEOUT_MS
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_OPENROUTER_TIMEOUT_MS
  ) {
    throw createInvalidInputError(
      `Timeout must be between 1 and ${MAX_OPENROUTER_TIMEOUT_MS} milliseconds.`,
      options,
    )
  }

  const maxOutputTokens =
    options.maxOutputTokens ?? DEFAULT_OPENROUTER_OUTPUT_TOKENS
  if (
    !Number.isInteger(maxOutputTokens) ||
    maxOutputTokens < 1 ||
    maxOutputTokens > MAX_OPENROUTER_OUTPUT_TOKENS
  ) {
    throw createInvalidInputError(
      `Output token limit must be between 1 and ${MAX_OPENROUTER_OUTPUT_TOKENS}.`,
      options,
    )
  }

  const model = getModelIdentifier()
  const generator =
    options.generator ??
    ((request: OpenRouterTextGenerationRequest) =>
      generateWithOpenRouter(request, options.fetcher ?? globalThis.fetch))
  const startedAt = Date.now()
  const elapsedMs = () => Math.max(0, Date.now() - startedAt)

  let result: OpenRouterTextGenerationResult
  try {
    result = await withTimeout(
      () =>
        generator({
          model,
          prompt: normalizedPrompt,
          maxOutputTokens,
          timeoutMs,
        }),
      timeoutMs + 2_000,
    )
  } catch (error) {
    if (error instanceof LocalApplicationTimeoutError) {
      const diagnostics: OpenRouterGenerationDiagnostics = {
        model,
        elapsedMs: elapsedMs(),
        providerStatus: null,
        providerErrorCode: null,
        providerMessage: null,
        upstreamProvider: null,
        upstreamStatus: null,
        classification: "local-application-timeout",
        errorCode: "timeout",
      }
      logDiagnostics("failure", diagnostics, options.logger)
      throw new OpenRouterServiceError(
        "timeout",
        safeServiceErrorMessage("timeout"),
        diagnostics,
      )
    }

    if (error instanceof OpenRouterServiceError) {
      const diagnostics =
        error.diagnostics ?? {
          model,
          elapsedMs: elapsedMs(),
          providerStatus: null,
          providerErrorCode: null,
          providerMessage: null,
          upstreamProvider: null,
          upstreamStatus: null,
          classification: classifyServiceError(error.code),
          errorCode: error.code,
        }
      logDiagnostics("failure", diagnostics, options.logger)
      if (error.diagnostics) throw error
      throw new OpenRouterServiceError(
        error.code,
        safeServiceErrorMessage(error.code),
        diagnostics,
      )
    }

    if (error instanceof ProviderRequestError) {
      const diagnostics: OpenRouterGenerationDiagnostics = {
        model: error.model ?? model,
        elapsedMs: elapsedMs(),
        providerStatus: error.providerStatus,
        providerErrorCode: error.providerErrorCode,
        providerMessage: error.providerMessage,
        upstreamProvider: error.upstreamProvider,
        upstreamStatus: error.upstreamStatus,
        classification: error.classification,
        errorCode: error.code,
        responseStructure: error.responseStructure ?? null,
      }
      logDiagnostics("failure", diagnostics, options.logger)
      throw new OpenRouterServiceError(
        error.code,
        safeServiceErrorMessage(error.code),
        diagnostics,
      )
    }

    const providerStatus = getProviderStatus(error)
    const classification = classifyProviderFailure(error, providerStatus)
    const code = getErrorCode(classification)
    const diagnostics: OpenRouterGenerationDiagnostics = {
      model,
      elapsedMs: elapsedMs(),
      providerStatus,
      providerErrorCode: null,
      providerMessage: null,
      upstreamProvider: null,
      upstreamStatus: null,
      classification:
        providerStatus === null && classification === "other-provider-error"
          ? "network-error"
          : classification,
      errorCode: code,
    }
    logDiagnostics("failure", diagnostics, options.logger)
    throw new OpenRouterServiceError(
      code,
      safeServiceErrorMessage(code),
      diagnostics,
    )
  }

  const resultModel = getReturnedModel(result.model) ?? model
  const text = result.text?.trim()
  if (!text) {
    const diagnostics: OpenRouterGenerationDiagnostics = {
      model: resultModel,
      elapsedMs: elapsedMs(),
      providerStatus: result.providerStatus ?? null,
      providerErrorCode: null,
      providerMessage: null,
      upstreamProvider: null,
      upstreamStatus: null,
      classification: "empty-response",
      errorCode: "empty-response",
      responseStructure: result.responseStructure ?? null,
    }
    logDiagnostics("failure", diagnostics, options.logger)
    throw new OpenRouterServiceError(
      "empty-response",
      safeServiceErrorMessage("empty-response"),
      diagnostics,
    )
  }

  logDiagnostics(
    "success",
    {
      model: resultModel,
      elapsedMs: elapsedMs(),
      providerStatus: result.providerStatus ?? null,
      providerErrorCode: null,
      providerMessage: null,
      upstreamProvider: null,
      upstreamStatus: null,
      classification: "success",
      errorCode: null,
      responseStructure: result.responseStructure ?? null,
    },
    options.logger,
  )
  return text
}
