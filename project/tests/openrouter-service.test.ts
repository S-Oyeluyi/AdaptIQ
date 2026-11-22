import assert from "node:assert/strict"
import {
  DEFAULT_OPENROUTER_MODEL,
  OpenRouterServiceError,
  generateOpenRouterText,
  type OpenRouterDiagnosticsLogger,
  type OpenRouterGenerationClassification,
  type OpenRouterGenerationDiagnostics,
  type OpenRouterServiceErrorCode,
  type OpenRouterTextGenerator,
} from "../lib/server/openrouter-service"

type DiagnosticEvent = {
  event: "success" | "failure"
  diagnostics: OpenRouterGenerationDiagnostics
}

function createLogger(events: DiagnosticEvent[]): OpenRouterDiagnosticsLogger {
  return (event, diagnostics) => events.push({ event, diagnostics })
}

function createResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

async function assertDiagnosticError(
  promise: Promise<unknown>,
  code: OpenRouterServiceErrorCode,
  classification: OpenRouterGenerationClassification,
  providerStatus: number | null,
  events: DiagnosticEvent[],
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    if (!(error instanceof OpenRouterServiceError)) return false
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

async function runOpenRouterServiceTests(): Promise<void> {
  const previousApiKey = process.env.OPENROUTER_API_KEY
  const previousModel = process.env.OPENROUTER_MODEL

  try {
    delete process.env.OPENROUTER_API_KEY
    const missingKeyEvents: DiagnosticEvent[] = []
    let missingKeyFetchCalled = false
    await assertDiagnosticError(
      generateOpenRouterText("A test prompt", {
        fetcher: async () => {
          missingKeyFetchCalled = true
          return createResponse({})
        },
        logger: createLogger(missingKeyEvents),
      }),
      "missing-api-key",
      "configuration-error",
      null,
      missingKeyEvents,
    )
    assert.equal(missingKeyFetchCalled, false)

    process.env.OPENROUTER_API_KEY = "test-placeholder-not-a-real-key"
    process.env.OPENROUTER_MODEL = "openrouter/test-alias"
    let capturedUrl: string | undefined
    let capturedAuthorization: string | null = null
    let capturedBody: unknown
    const successEvents: DiagnosticEvent[] = []
    const successText = JSON.stringify({
      explanation: "A test explanation.",
      nextStep: "A test next step.",
    })
    const successFetcher: typeof fetch = async (input, init) => {
      capturedUrl = String(input)
      capturedAuthorization = new Headers(init?.headers).get("Authorization")
      capturedBody = JSON.parse(String(init?.body))
      return createResponse({
        model: "provider/actual-model:free",
        choices: [{ message: { content: successText } }],
      })
    }

    assert.equal(
      await generateOpenRouterText("SENSITIVE_PROMPT", {
        fetcher: successFetcher,
        logger: createLogger(successEvents),
      }),
      successText,
    )
    assert.equal(
      capturedUrl,
      "https://openrouter.ai/api/v1/chat/completions",
    )
    assert.equal(
      capturedAuthorization,
      "Bearer test-placeholder-not-a-real-key",
    )
    assert.deepEqual(capturedBody, {
      model: "openrouter/test-alias",
      messages: [{ role: "user", content: "SENSITIVE_PROMPT" }],
      max_tokens: 1024,
    })
    assert.equal(successEvents.length, 1)
    assert.equal(successEvents[0].event, "success")
    assert.equal(successEvents[0].diagnostics.model, "provider/actual-model:free")
    assert.equal(successEvents[0].diagnostics.classification, "success")
    assert.equal(successEvents[0].diagnostics.providerStatus, 200)
    assert.equal(JSON.stringify(successEvents).includes("SENSITIVE_PROMPT"), false)
    assert.equal(
      JSON.stringify(successEvents).includes("test-placeholder-not-a-real-key"),
      false,
    )

    let capturedGenerationRequest:
      | Parameters<OpenRouterTextGenerator>[0]
      | undefined
    const injectedGenerator: OpenRouterTextGenerator = async (request) => {
      capturedGenerationRequest = request
      return { text: "  Generated test response.  " }
    }
    assert.equal(
      await generateOpenRouterText("SENSITIVE_PROMPT", {
        generator: injectedGenerator,
        logger: () => {},
      }),
      "Generated test response.",
    )
    assert.deepEqual(capturedGenerationRequest, {
      model: "openrouter/test-alias",
      prompt: "SENSITIVE_PROMPT",
      maxOutputTokens: 1024,
      timeoutMs: 45_000,
    })

    const invalidInputEvents: DiagnosticEvent[] = []
    let invalidInputGeneratorCalled = false
    await assertDiagnosticError(
      generateOpenRouterText(" ", {
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

    delete process.env.OPENROUTER_MODEL
    let defaultModel: string | undefined
    await generateOpenRouterText("A test prompt", {
      generator: async (request) => {
        defaultModel = request.model
        return { text: "ok" }
      },
      logger: () => {},
    })
    assert.equal(defaultModel, DEFAULT_OPENROUTER_MODEL)

    const providerCases: Array<{
      status: number
      code: OpenRouterServiceErrorCode
      classification: OpenRouterGenerationClassification
    }> = [
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
      {
        status: 504,
        code: "timeout",
        classification: "provider-timeout",
      },
    ]

    for (const testCase of providerCases) {
      const events: DiagnosticEvent[] = []
      await assertDiagnosticError(
        generateOpenRouterText("A test prompt", {
          fetcher: async () =>
            createResponse({ error: "SENSITIVE_PROVIDER_ERROR" }, testCase.status),
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

    const provider502Events: DiagnosticEvent[] = []
    await assertDiagnosticError(
      generateOpenRouterText("SENSITIVE_PROMPT", {
        fetcher: async () =>
          createResponse(
            {
              error: {
                code: "upstream_failure",
                message:
                  "Upstream provider internal server error while processing SENSITIVE_PROMPT and secret-token",
                metadata: {
                  provider_name: "provider/model:free",
                  upstream_status: 503,
                  raw: "SENSITIVE_PROVIDER_ERROR",
                },
              },
            },
            502,
          ),
        logger: createLogger(provider502Events),
      }),
      "api-failure",
      "other-provider-error",
      502,
      provider502Events,
    )
    assert.deepEqual(
      {
        providerErrorCode:
          provider502Events[0].diagnostics.providerErrorCode,
        providerMessage: provider502Events[0].diagnostics.providerMessage,
        upstreamProvider: provider502Events[0].diagnostics.upstreamProvider,
        upstreamStatus: provider502Events[0].diagnostics.upstreamStatus,
      },
      {
        providerErrorCode: "UPSTREAM_FAILURE",
        providerMessage: "Upstream provider returned a service error.",
        upstreamProvider: "provider/model:free",
        upstreamStatus: 503,
      },
    )
    assert.equal(
      JSON.stringify(provider502Events).includes("SENSITIVE_PROMPT"),
      false,
    )
    assert.equal(
      JSON.stringify(provider502Events).includes("secret-token"),
      false,
    )
    assert.equal(
      JSON.stringify(provider502Events).includes("SENSITIVE_PROVIDER_ERROR"),
      false,
    )

    const networkFailureEvents: DiagnosticEvent[] = []
    await assertDiagnosticError(
      generateOpenRouterText("A test prompt", {
        fetcher: async () => {
          throw new Error("SENSITIVE_PROVIDER_ERROR")
        },
        logger: createLogger(networkFailureEvents),
      }),
      "api-failure",
      "network-error",
      null,
      networkFailureEvents,
    )
    assert.equal(
      JSON.stringify(networkFailureEvents).includes("SENSITIVE_PROVIDER_ERROR"),
      false,
    )

    const transportTimeoutEvents: DiagnosticEvent[] = []
    const timeoutFetcher: typeof fetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        if (!signal) {
          reject(new Error("Missing abort signal"))
          return
        }
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        )
      })
    await assertDiagnosticError(
      generateOpenRouterText("A test prompt", {
        timeoutMs: 10,
        fetcher: timeoutFetcher,
        logger: createLogger(transportTimeoutEvents),
      }),
      "timeout",
      "transport-timeout",
      null,
      transportTimeoutEvents,
    )

    const invalidJsonEvents: DiagnosticEvent[] = []
    await assertDiagnosticError(
      generateOpenRouterText("A test prompt", {
        fetcher: async () => new Response("{invalid json", { status: 200 }),
        logger: createLogger(invalidJsonEvents),
      }),
      "invalid-response",
      "invalid-response",
      200,
      invalidJsonEvents,
    )
    assert.equal(invalidJsonEvents[0].diagnostics.providerStatus, 200)

    const malformedShapeEvents: DiagnosticEvent[] = []
    await assertDiagnosticError(
      generateOpenRouterText("A test prompt", {
        fetcher: async () =>
          createResponse({
            model: "provider/actual-model:free",
            choices: [],
          }),
        logger: createLogger(malformedShapeEvents),
      }),
      "invalid-response",
      "invalid-response",
      200,
      malformedShapeEvents,
    )
    assert.equal(malformedShapeEvents[0].diagnostics.providerStatus, 200)
    assert.equal(
      malformedShapeEvents[0].diagnostics.model,
      "provider/actual-model:free",
    )
    assert.equal(
      malformedShapeEvents[0].diagnostics.classification,
      "invalid-response",
    )

    const emptyResponseEvents: DiagnosticEvent[] = []
    await assertDiagnosticError(
      generateOpenRouterText("A test prompt", {
        fetcher: async () =>
          createResponse({
            model: "provider/actual-model:free",
            choices: [{ message: { content: "  " } }],
          }),
        logger: createLogger(emptyResponseEvents),
      }),
      "empty-response",
      "empty-response",
      200,
      emptyResponseEvents,
    )

    const localTimeoutEvents: DiagnosticEvent[] = []
    await assertDiagnosticError(
      generateOpenRouterText("A test prompt", {
        timeoutMs: 10,
        generator: () => new Promise(() => {}),
        logger: createLogger(localTimeoutEvents),
      }),
      "timeout",
      "local-application-timeout",
      null,
      localTimeoutEvents,
    )

    // --- New tests for robust response handling ---

    // Test: Array content parts should be concatenated into a single string
    const arrayContentEvents: DiagnosticEvent[] = []
    const arrayContentText = JSON.stringify({
      explanation: "Array content explanation.",
      nextStep: "Array content next step.",
    })
    const arrayContentResult = await generateOpenRouterText("A test prompt", {
      fetcher: async () =>
        createResponse({
          model: "provider/array-model:free",
          choices: [{
            message: {
              content: [
                { type: "text", text: arrayContentText },
              ],
            },
            finish_reason: "stop",
          }],
        }),
      logger: createLogger(arrayContentEvents),
    })
    assert.equal(arrayContentResult, arrayContentText)
    assert.equal(arrayContentEvents.length, 1)
    assert.equal(arrayContentEvents[0].event, "success")
    assert.equal(arrayContentEvents[0].diagnostics.model, "provider/array-model:free")

    // Test: Multi-part array content should be concatenated
    const multiPartEvents: DiagnosticEvent[] = []
    const multiPartResult = await generateOpenRouterText("A test prompt", {
      fetcher: async () =>
        createResponse({
          model: "provider/multi-part:free",
          choices: [{
            message: {
              content: [
                { type: "text", text: '{"explanation":' },
                { type: "text", text: '"Multi-part.",' },
                { type: "text", text: '"nextStep":"Step."}' },
              ],
            },
            finish_reason: "stop",
          }],
        }),
      logger: createLogger(multiPartEvents),
    })
    assert.equal(multiPartResult, '{"explanation":"Multi-part.","nextStep":"Step."}')
    assert.equal(multiPartEvents[0].event, "success")

    // Test: Fallback to choice.text when message.content is null
    const choiceTextEvents: DiagnosticEvent[] = []
    const choiceTextPayload = JSON.stringify({
      explanation: "From choice.text.",
      nextStep: "Choice text step.",
    })
    const choiceTextResult = await generateOpenRouterText("A test prompt", {
      fetcher: async () =>
        createResponse({
          model: "provider/text-field:free",
          choices: [{
            message: { content: null },
            text: choiceTextPayload,
            finish_reason: "stop",
          }],
        }),
      logger: createLogger(choiceTextEvents),
    })
    assert.equal(choiceTextResult, choiceTextPayload)
    assert.equal(choiceTextEvents[0].event, "success")

    // Test: In-band error (HTTP 200 with body.error) should throw api-failure
    const inBandErrorEvents: DiagnosticEvent[] = []
    await assertDiagnosticError(
      generateOpenRouterText("A test prompt", {
        fetcher: async () =>
          createResponse({
            error: {
              code: "PROVIDER_ERROR",
              message: "Upstream provider returned a service error.",
              metadata: {
                provider_name: "some-provider/model",
                upstream_status: 500,
              },
            },
            model: "provider/error-model:free",
          }),
        logger: createLogger(inBandErrorEvents),
      }),
      "api-failure",
      "other-provider-error",
      200,
      inBandErrorEvents,
    )
    assert.equal(inBandErrorEvents[0].diagnostics.responseStructure?.hasInBandError, true)

    // Test: finish_reason "error" should throw api-failure
    const finishReasonErrorEvents: DiagnosticEvent[] = []
    await assertDiagnosticError(
      generateOpenRouterText("A test prompt", {
        fetcher: async () =>
          createResponse({
            model: "provider/finish-err:free",
            choices: [{
              message: { content: null },
              finish_reason: "error",
              error: { message: "Internal server error from upstream" },
            }],
          }),
        logger: createLogger(finishReasonErrorEvents),
      }),
      "api-failure",
      "other-provider-error",
      200,
      finishReasonErrorEvents,
    )
    assert.equal(finishReasonErrorEvents[0].diagnostics.responseStructure?.finishReason, "error")
    assert.equal(finishReasonErrorEvents[0].diagnostics.responseStructure?.hasInBandError, true)

    // Test: Refusal with no content should throw api-failure
    const refusalEvents: DiagnosticEvent[] = []
    await assertDiagnosticError(
      generateOpenRouterText("A test prompt", {
        fetcher: async () =>
          createResponse({
            model: "provider/refusal-model:free",
            choices: [{
              message: {
                content: null,
                refusal: "I cannot answer that.",
              },
              finish_reason: "stop",
            }],
          }),
        logger: createLogger(refusalEvents),
      }),
      "api-failure",
      "other-provider-error",
      200,
      refusalEvents,
    )
    assert.equal(refusalEvents[0].diagnostics.responseStructure?.hasRefusal, true)
    assert.equal(refusalEvents[0].diagnostics.responseStructure?.contentType, "null")

    // Test: null content without refusal or fallback should throw invalid-response
    const nullContentEvents: DiagnosticEvent[] = []
    await assertDiagnosticError(
      generateOpenRouterText("A test prompt", {
        fetcher: async () =>
          createResponse({
            model: "provider/null-content:free",
            choices: [{
              message: { content: null },
              finish_reason: "stop",
            }],
          }),
        logger: createLogger(nullContentEvents),
      }),
      "invalid-response",
      "invalid-response",
      200,
      nullContentEvents,
    )
    assert.equal(nullContentEvents[0].diagnostics.responseStructure?.contentType, "null")
    assert.equal(nullContentEvents[0].diagnostics.responseStructure?.isContentEmpty, true)

    // Test: Structural diagnostics are populated on success
    const structDiagEvents: DiagnosticEvent[] = []
    await generateOpenRouterText("A test prompt", {
      fetcher: async () =>
        createResponse({
          model: "provider/diag-model:free",
          choices: [{
            message: { content: '{"explanation":"ok","nextStep":"ok"}' },
            finish_reason: "stop",
          }],
        }),
      logger: createLogger(structDiagEvents),
    })
    assert.equal(structDiagEvents[0].event, "success")
    assert.equal(structDiagEvents[0].diagnostics.responseStructure?.hasChoices, true)
    assert.equal(structDiagEvents[0].diagnostics.responseStructure?.choicesCount, 1)
    assert.equal(structDiagEvents[0].diagnostics.responseStructure?.hasMessage, true)
    assert.equal(structDiagEvents[0].diagnostics.responseStructure?.hasContent, true)
    assert.equal(structDiagEvents[0].diagnostics.responseStructure?.contentType, "string")
    assert.equal(structDiagEvents[0].diagnostics.responseStructure?.isContentEmpty, false)
    assert.equal(structDiagEvents[0].diagnostics.responseStructure?.hasFinishReason, true)
    assert.equal(structDiagEvents[0].diagnostics.responseStructure?.finishReason, "stop")
    assert.equal(structDiagEvents[0].diagnostics.responseStructure?.hasRefusal, false)
    assert.equal(structDiagEvents[0].diagnostics.responseStructure?.hasToolCalls, false)

    // Test: response_format is NOT sent in the request body (removed for free model compatibility)
    let noFormatBody: unknown
    await generateOpenRouterText("A test prompt", {
      fetcher: async (_input, init) => {
        noFormatBody = JSON.parse(String(init?.body))
        return createResponse({
          model: "provider/no-format:free",
          choices: [{ message: { content: '{"explanation":"ok","nextStep":"ok"}' } }],
        })
      },
      logger: () => {},
    })
    assert.equal(
      Object.prototype.hasOwnProperty.call(noFormatBody, "response_format"),
      false,
      "response_format should not be sent in the request body",
    )
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY
    } else {
      process.env.OPENROUTER_API_KEY = previousApiKey
    }
    if (previousModel === undefined) {
      delete process.env.OPENROUTER_MODEL
    } else {
      process.env.OPENROUTER_MODEL = previousModel
    }
  }

  console.log("OpenRouter service tests passed.")
}

void runOpenRouterServiceTests().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
