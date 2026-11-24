import "server-only"

const GROQ_CHAT_COMPLETIONS_URL =
  "https://api.groq.com/openai/v1/chat/completions"

export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b"
export const DEFAULT_GROQ_TIMEOUT_MS = 45_000
export const MAX_GROQ_TIMEOUT_MS = 60_000
export const DEFAULT_GROQ_OUTPUT_TOKENS = 2048
export const MAX_GROQ_OUTPUT_TOKENS = 4096
const MAX_PROMPT_CHARACTERS = 10_000

export type GroqServiceErrorCode =
  | "missing-api-key"
  | "invalid-input"
  | "timeout"
  | "empty-response"
  | "invalid-response"
  | "api-failure"

export type GroqGenerationClassification =
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

export interface GroqResponseStructure {
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
}

export interface GroqGenerationDiagnostics {
  model: string
  elapsedMs: number
  providerStatus: number | null
  providerErrorCode: string | null
  providerMessage: string | null
  classification: GroqGenerationClassification
  errorCode: GroqServiceErrorCode | null
  responseStructure?: GroqResponseStructure | null
}

export type GroqDiagnosticsLogger = (
  event: "success" | "failure",
  diagnostics: GroqGenerationDiagnostics,
) => void

export class GroqServiceError extends Error {
  constructor(
    readonly code: GroqServiceErrorCode,
    message: string,
    readonly diagnostics?: GroqGenerationDiagnostics,
  ) {
    super(message)
    this.name = "GroqServiceError"
  }
}

export interface GroqTextGenerationRequest {
  model: string
  prompt: string
  systemPrompt?: string
  jsonMode?: boolean
  maxOutputTokens: number
  timeoutMs: number
}

export interface GroqTextGenerationResult {
  text?: string | null
  model?: string | null
  providerStatus?: number | null
  responseStructure?: GroqResponseStructure | null
}

export type GroqTextGenerator = (
  request: GroqTextGenerationRequest,
) => Promise<GroqTextGenerationResult>

export interface GroqGenerationOptions {
  model?: string
  systemPrompt?: string
  jsonMode?: boolean
  generator?: GroqTextGenerator
  fetcher?: typeof fetch
  timeoutMs?: number
  maxOutputTokens?: number
  logger?: GroqDiagnosticsLogger
}

class LocalApplicationTimeoutError extends Error {}

class ProviderRequestError extends Error {
  constructor(
    readonly code: GroqServiceErrorCode,
    readonly classification: GroqGenerationClassification,
    readonly providerStatus: number | null,
    readonly model: string | null = null,
    readonly providerErrorCode: string | null = null,
    readonly providerMessage: string | null = null,
    readonly responseStructure: GroqResponseStructure | null = null,
  ) {
    super("Groq request failed.")
  }
}

function logDiagnostics(
  event: "success" | "failure",
  diagnostics: GroqGenerationDiagnostics,
  logger?: GroqDiagnosticsLogger,
): void {
  if (logger) {
    logger(event, diagnostics)
  } else if (event === "success") {
    console.info("[AdaptIQ] Groq generation completed", diagnostics)
  } else {
    console.error("[AdaptIQ] Groq generation failed", diagnostics)
  }
}

function getApiKey(): string {
  const apiKey = process.env.GROQ_API_KEY?.trim()
  if (!apiKey) {
    throw new GroqServiceError(
      "missing-api-key",
      "GROQ_API_KEY is not configured on the server.",
    )
  }
  return apiKey
}

function getModelIdentifier(configuredModel?: string): string {
  if (configuredModel?.trim()) {
    return configuredModel.trim()
  }
  const envModel = process.env.GROQ_MODEL?.trim()
  return envModel || DEFAULT_GROQ_MODEL
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
): GroqGenerationClassification {
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
  classification: GroqGenerationClassification,
): GroqServiceErrorCode {
  return classification === "provider-timeout" ||
    classification === "transport-timeout" ||
    classification === "local-application-timeout"
    ? "timeout"
    : classification === "invalid-response"
      ? "invalid-response"
      : "api-failure"
}

function safeServiceErrorMessage(code: GroqServiceErrorCode): string {
  switch (code) {
    case "missing-api-key":
      return "GROQ_API_KEY is not configured on the server."
    case "invalid-input":
      return "Groq generation request is invalid."
    case "timeout":
      return "Groq generation exceeded the configured timeout."
    case "empty-response":
      return "Groq returned an empty text response."
    case "invalid-response":
      return "Groq returned an invalid response."
    case "api-failure":
      return "Groq generation failed."
  }
}

function classifyServiceError(
  code: GroqServiceErrorCode,
): GroqGenerationClassification {
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
  options: GroqGenerationOptions,
): GroqServiceError {
  const diagnostics: GroqGenerationDiagnostics = {
    model: getModelIdentifier(options.model),
    elapsedMs: 0,
    providerStatus: null,
    providerErrorCode: null,
    providerMessage: null,
    classification: "invalid-input",
    errorCode: "invalid-input",
  }
  logDiagnostics("failure", diagnostics, options.logger)
  return new GroqServiceError("invalid-input", message, diagnostics)
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
    "RATE_LIMIT_EXCEEDED",
    "SERVICE_UNAVAILABLE",
    "INTERNAL_SERVER_ERROR",
  ])
  return safeCodes.has(code) ? code : null
}

function summarizeProviderMessage(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null

  const message = value.toLowerCase()
  if (/rate.?limit|quota|tokens per minute|tpm|rpm/.test(message)) {
    return "Provider rate limit or quota reached."
  }
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
} {
  if (!isRecord(body)) {
    return { code: null, message: null, model: null }
  }

  const error = isRecord(body.error) ? body.error : body
  return {
    code: getSafeCode(error.code),
    message: summarizeProviderMessage(error.message),
    model: getReturnedModel(body.model) ?? getReturnedModel(error.model),
  }
}

function buildResponseStructure(
  body: unknown,
  firstChoice: Record<string, unknown> | null,
): GroqResponseStructure {
  const hasChoices = isRecord(body) && Array.isArray(body.choices)
  const choicesCount = hasChoices
    ? (body as Record<string, unknown[]>).choices.length
    : 0
  const message =
    firstChoice && isRecord(firstChoice.message) ? firstChoice.message : null
  const rawContent = message?.content
  const hasContent = rawContent !== undefined && rawContent !== null
  const contentType =
    rawContent === null
      ? "null"
      : rawContent === undefined
        ? "undefined"
        : Array.isArray(rawContent)
          ? "array"
          : typeof rawContent
  const isContentEmpty =
    contentType === "string"
      ? (rawContent as string).trim().length === 0
      : contentType === "null" || contentType === "undefined"
        ? true
        : contentType === "array"
          ? (rawContent as unknown[]).length === 0
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
    message !== null &&
    Array.isArray(message.tool_calls) &&
    message.tool_calls.length > 0
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
  }
}

async function generateWithGroq(
  request: GroqTextGenerationRequest,
  fetcher: typeof fetch,
): Promise<GroqTextGenerationResult> {
  const apiKey = getApiKey()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs)

  try {
    const messages: Array<{ role: string; content: string }> = []
    if (request.systemPrompt?.trim()) {
      messages.push({
        role: "system",
        content: request.systemPrompt.trim(),
      })
    }
    messages.push({ role: "user", content: request.prompt })

    const requestBody: Record<string, unknown> = {
      model: request.model,
      messages,
      max_completion_tokens: request.maxOutputTokens,
    }

    if (request.jsonMode !== false) {
      requestBody.response_format = { type: "json_object" }
    }

    let response: Response
    try {
      response = await fetcher(GROQ_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
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

    // In-band errors
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
        structure,
      )
    }

    const structure = buildResponseStructure(body, firstChoice)

    if (
      firstChoice.finish_reason === "error" ||
      isRecord(firstChoice.error)
    ) {
      const errorMsg =
        isRecord(firstChoice.error) &&
        typeof firstChoice.error.message === "string"
          ? summarizeProviderMessage(firstChoice.error.message)
          : "Provider returned an error in response choice."
      throw new ProviderRequestError(
        "api-failure",
        "other-provider-error",
        response.status,
        returnedModel,
        null,
        errorMsg,
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
        structure,
      )
    }

    const rawContent = firstChoice.message.content
    let contentText: string | null = null
    if (typeof rawContent === "string") {
      contentText = rawContent
    } else if (typeof firstChoice.text === "string") {
      contentText = firstChoice.text
    }

    if (contentText === null) {
      throw new ProviderRequestError(
        "invalid-response",
        "invalid-response",
        response.status,
        returnedModel,
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

  return Promise.race([
    Promise.resolve().then(operation),
    timeoutPromise,
  ]).finally(() => {
    if (timeout !== undefined) clearTimeout(timeout)
  })
}

export async function generateGroqText(
  prompt: string,
  options: GroqGenerationOptions = {},
): Promise<string> {
  const normalizedPrompt = prompt.trim()
  if (!normalizedPrompt || normalizedPrompt.length > MAX_PROMPT_CHARACTERS) {
    throw createInvalidInputError(
      `Prompt must contain 1-${MAX_PROMPT_CHARACTERS} characters.`,
      options,
    )
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_GROQ_TIMEOUT_MS
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_GROQ_TIMEOUT_MS
  ) {
    throw createInvalidInputError(
      `Timeout must be between 1 and ${MAX_GROQ_TIMEOUT_MS} milliseconds.`,
      options,
    )
  }

  const maxOutputTokens =
    options.maxOutputTokens ?? DEFAULT_GROQ_OUTPUT_TOKENS
  if (
    !Number.isInteger(maxOutputTokens) ||
    maxOutputTokens < 1 ||
    maxOutputTokens > MAX_GROQ_OUTPUT_TOKENS
  ) {
    throw createInvalidInputError(
      `Output token limit must be between 1 and ${MAX_GROQ_OUTPUT_TOKENS}.`,
      options,
    )
  }

  const model = getModelIdentifier(options.model)
  const generator =
    options.generator ??
    ((request: GroqTextGenerationRequest) =>
      generateWithGroq(request, options.fetcher ?? globalThis.fetch))
  const startedAt = Date.now()
  const elapsedMs = () => Math.max(0, Date.now() - startedAt)

  let result: GroqTextGenerationResult
  try {
    result = await withTimeout(
      () =>
        generator({
          model,
          prompt: normalizedPrompt,
          systemPrompt: options.systemPrompt,
          jsonMode: options.jsonMode,
          maxOutputTokens,
          timeoutMs,
        }),
      timeoutMs + 2_000,
    )
  } catch (error) {
    if (error instanceof LocalApplicationTimeoutError) {
      const diagnostics: GroqGenerationDiagnostics = {
        model,
        elapsedMs: elapsedMs(),
        providerStatus: null,
        providerErrorCode: null,
        providerMessage: null,
        classification: "local-application-timeout",
        errorCode: "timeout",
      }
      logDiagnostics("failure", diagnostics, options.logger)
      throw new GroqServiceError(
        "timeout",
        safeServiceErrorMessage("timeout"),
        diagnostics,
      )
    }

    if (error instanceof GroqServiceError) {
      const diagnostics =
        error.diagnostics ?? {
          model,
          elapsedMs: elapsedMs(),
          providerStatus: null,
          providerErrorCode: null,
          providerMessage: null,
          classification: classifyServiceError(error.code),
          errorCode: error.code,
        }
      logDiagnostics("failure", diagnostics, options.logger)
      if (error.diagnostics) throw error
      throw new GroqServiceError(
        error.code,
        safeServiceErrorMessage(error.code),
        diagnostics,
      )
    }

    if (error instanceof ProviderRequestError) {
      const diagnostics: GroqGenerationDiagnostics = {
        model: error.model ?? model,
        elapsedMs: elapsedMs(),
        providerStatus: error.providerStatus,
        providerErrorCode: error.providerErrorCode,
        providerMessage: error.providerMessage,
        classification: error.classification,
        errorCode: error.code,
        responseStructure: error.responseStructure ?? null,
      }
      logDiagnostics("failure", diagnostics, options.logger)
      throw new GroqServiceError(
        error.code,
        safeServiceErrorMessage(error.code),
        diagnostics,
      )
    }

    const providerStatus = getProviderStatus(error)
    const classification = classifyProviderFailure(error, providerStatus)
    const code = getErrorCode(classification)
    const diagnostics: GroqGenerationDiagnostics = {
      model,
      elapsedMs: elapsedMs(),
      providerStatus,
      providerErrorCode: null,
      providerMessage: null,
      classification:
        providerStatus === null && classification === "other-provider-error"
          ? "network-error"
          : classification,
      errorCode: code,
    }
    logDiagnostics("failure", diagnostics, options.logger)
    throw new GroqServiceError(
      code,
      safeServiceErrorMessage(code),
      diagnostics,
    )
  }

  const resultModel = getReturnedModel(result.model) ?? model
  const text = result.text?.trim()
  if (!text) {
    const diagnostics: GroqGenerationDiagnostics = {
      model: resultModel,
      elapsedMs: elapsedMs(),
      providerStatus: result.providerStatus ?? null,
      providerErrorCode: null,
      providerMessage: null,
      classification: "empty-response",
      errorCode: "empty-response",
      responseStructure: result.responseStructure ?? null,
    }
    logDiagnostics("failure", diagnostics, options.logger)
    throw new GroqServiceError(
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
      classification: "success",
      errorCode: null,
      responseStructure: result.responseStructure ?? null,
    },
    options.logger,
  )

  return text
}
