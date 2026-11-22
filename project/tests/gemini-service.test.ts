import assert from "node:assert/strict"
import { GenerateContentResponse, GoogleGenAI } from "@google/genai"
import {
  DEFAULT_GEMINI_MODEL,
  GeminiServiceError,
  generateGeminiText,
  getGeminiClient,
  type GeminiDiagnosticsLogger,
  type GeminiGenerationClassification,
  type GeminiGenerationDiagnostics,
  type GeminiServiceErrorCode,
  type GeminiTextGenerator,
} from "../lib/server/gemini-service"

type DiagnosticEvent = {
  event: "success" | "failure"
  diagnostics: GeminiGenerationDiagnostics
}

function createLogger(events: DiagnosticEvent[]): GeminiDiagnosticsLogger {
  return (event, diagnostics) => events.push({ event, diagnostics })
}

async function assertDiagnosticError(
  promise: Promise<unknown>,
  code: GeminiServiceErrorCode,
  classification: GeminiGenerationClassification,
  providerStatus: number | null,
  events: DiagnosticEvent[],
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    if (!(error instanceof GeminiServiceError)) return false
    assert.equal(error.code, code)
    assert.equal(error.diagnostics?.classification, classification)
    assert.equal(error.diagnostics?.providerStatus, providerStatus)
    assert.equal(error.diagnostics?.errorCode, code)
    assert.equal(typeof error.diagnostics?.elapsedMs, "number")
    assert.equal(error.message.includes("SENSITIVE_PROVIDER_ERROR"), false)
    return true
  })

  assert.equal(events.length, 1)
  assert.equal(events[0].event, "failure")
  assert.equal(events[0].diagnostics.classification, classification)
  assert.equal(events[0].diagnostics.providerStatus, providerStatus)
  assert.equal(events[0].diagnostics.errorCode, code)
  assert.equal(typeof events[0].diagnostics.elapsedMs, "number")
}

async function runGeminiServiceTests(): Promise<void> {
  const previousApiKey = process.env.GEMINI_API_KEY
  const previousModel = process.env.GEMINI_MODEL

  try {
    delete process.env.GEMINI_API_KEY
    const missingKeyEvents: DiagnosticEvent[] = []
    await assertDiagnosticError(
      generateGeminiText("A test prompt", {
        logger: createLogger(missingKeyEvents),
      }),
      "missing-api-key",
      "configuration-error",
      null,
      missingKeyEvents,
    )

    process.env.GEMINI_API_KEY = "test-placeholder-not-a-real-key"
    const firstClient = getGeminiClient()
    const secondClient = getGeminiClient()
    assert.ok(firstClient instanceof GoogleGenAI)
    assert.strictEqual(firstClient, secondClient)

    process.env.GEMINI_MODEL = "test-model"
    let sdkResponseMimeType: string | undefined
    const originalGenerateContent = firstClient.models.generateContent
    firstClient.models.generateContent = async (request) => {
      sdkResponseMimeType = request.config?.responseMimeType
      const response = new GenerateContentResponse()
      response.candidates = [
        { content: { parts: [{ text: "SDK config test response" }] } },
      ]
      return response
    }
    try {
      assert.equal(
        await generateGeminiText("SDK config test prompt", {
          logger: () => {},
        }),
        "SDK config test response",
      )
    } finally {
      firstClient.models.generateContent = originalGenerateContent
    }
    assert.equal(sdkResponseMimeType, "application/json")

    let capturedRequest: Parameters<GeminiTextGenerator>[0] | undefined
    const successEvents: DiagnosticEvent[] = []
    const successfulGenerator: GeminiTextGenerator = async (request) => {
      capturedRequest = request
      return { text: "  Generated test response.  " }
    }

    assert.equal(
      await generateGeminiText("SENSITIVE_PROMPT", {
        generator: successfulGenerator,
        logger: createLogger(successEvents),
      }),
      "Generated test response.",
    )
    assert.deepEqual(capturedRequest, {
      model: "test-model",
      prompt: "SENSITIVE_PROMPT",
      maxOutputTokens: 1024,
      timeoutMs: 45_000,
    })
    assert.equal(successEvents.length, 1)
    assert.equal(successEvents[0].event, "success")
    assert.equal(successEvents[0].diagnostics.classification, "success")
    assert.equal(successEvents[0].diagnostics.providerStatus, null)
    assert.equal(typeof successEvents[0].diagnostics.elapsedMs, "number")
    assert.equal(JSON.stringify(successEvents).includes("SENSITIVE_PROMPT"), false)
    assert.equal(
      JSON.stringify(successEvents).includes("test-placeholder-not-a-real-key"),
      false,
    )

    const invalidInputEvents: DiagnosticEvent[] = []
    let invalidInputGeneratorCalled = false
    await assertDiagnosticError(
      generateGeminiText(" ", {
        generator: async () => {
          invalidInputGeneratorCalled = true
          return { text: "unused" }
        },
        logger: createLogger(invalidInputEvents),
      }),
      "invalid-input",
      "invalid-input",
      null,
      invalidInputEvents,
    )
    assert.equal(invalidInputGeneratorCalled, false)
    assert.equal(invalidInputEvents[0].diagnostics.elapsedMs, 0)

    delete process.env.GEMINI_MODEL
    let defaultModel: string | undefined
    const defaultModelGenerator: GeminiTextGenerator = async (request) => {
      defaultModel = request.model
      return { text: "ok" }
    }
    await generateGeminiText("A test prompt", {
      generator: defaultModelGenerator,
      logger: () => {},
    })
    assert.equal(defaultModel, DEFAULT_GEMINI_MODEL)

    const providerCases: Array<{
      status: number
      code: GeminiServiceErrorCode
      classification: GeminiGenerationClassification
      nestedStatus?: boolean
    }> = [
      { status: 408, code: "timeout", classification: "provider-timeout" },
      {
        status: 504,
        code: "timeout",
        classification: "provider-timeout",
        nestedStatus: true,
      },
      {
        status: 401,
        code: "api-failure",
        classification: "invalid-api-key-or-permission",
      },
      {
        status: 403,
        code: "api-failure",
        classification: "invalid-api-key-or-permission",
      },
      {
        status: 404,
        code: "api-failure",
        classification: "model-unavailable",
      },
      {
        status: 429,
        code: "api-failure",
        classification: "quota-or-rate-limit",
      },
      {
        status: 500,
        code: "api-failure",
        classification: "other-provider-error",
      },
    ]

    for (const testCase of providerCases) {
      const events: DiagnosticEvent[] = []
      const providerError = new Error("SENSITIVE_PROVIDER_ERROR details")
      const errorWithStatus = testCase.nestedStatus
        ? Object.assign(providerError, {
            response: { status: testCase.status },
          })
        : Object.assign(providerError, { status: testCase.status })

      await assertDiagnosticError(
        generateGeminiText("A test prompt", {
          generator: async () => {
            throw errorWithStatus
          },
          logger: createLogger(events),
        }),
        testCase.code,
        testCase.classification,
        testCase.status,
        events,
      )
      assert.equal(
        JSON.stringify(events).includes("SENSITIVE_PROVIDER_ERROR"),
        false,
      )
    }

    const transportTimeoutEvents: DiagnosticEvent[] = []
    await assertDiagnosticError(
      generateGeminiText("A test prompt", {
        generator: async () => {
          throw Object.assign(new Error("Request timed out"), {
            code: "ETIMEDOUT",
          })
        },
        logger: createLogger(transportTimeoutEvents),
      }),
      "timeout",
      "transport-timeout",
      null,
      transportTimeoutEvents,
    )

    const localTimeoutEvents: DiagnosticEvent[] = []
    await assertDiagnosticError(
      generateGeminiText("A test prompt", {
        timeoutMs: 10,
        generator: () => new Promise(() => {}),
        logger: createLogger(localTimeoutEvents),
      }),
      "timeout",
      "local-application-timeout",
      null,
      localTimeoutEvents,
    )

    const emptyResponseEvents: DiagnosticEvent[] = []
    await assertDiagnosticError(
      generateGeminiText("A test prompt", {
        generator: async () => ({ text: "  " }),
        logger: createLogger(emptyResponseEvents),
      }),
      "empty-response",
      "empty-response",
      null,
      emptyResponseEvents,
    )
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.GEMINI_API_KEY
    } else {
      process.env.GEMINI_API_KEY = previousApiKey
    }
    if (previousModel === undefined) {
      delete process.env.GEMINI_MODEL
    } else {
      process.env.GEMINI_MODEL = previousModel
    }
  }

  console.log("Gemini service tests passed.")
}

void runGeminiServiceTests().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
