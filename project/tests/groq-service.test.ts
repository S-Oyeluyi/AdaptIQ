import assert from "node:assert/strict"
import {
  DEFAULT_GROQ_OUTPUT_TOKENS,
  DEFAULT_GROQ_MODEL,
  MAX_GROQ_OUTPUT_TOKENS,
  GroqServiceError,
  generateGroqText,
  type GroqDiagnosticsLogger,
  type GroqGenerationClassification,
  type GroqGenerationDiagnostics,
  type GroqServiceErrorCode,
  type GroqTextGenerator,
} from "../lib/server/groq-service"

type DiagnosticEvent = {
  event: "success" | "failure"
  diagnostics: GroqGenerationDiagnostics
}

function createLogger(events: DiagnosticEvent[]): GroqDiagnosticsLogger {
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
  code: GroqServiceErrorCode,
  classification: GroqGenerationClassification,
  providerStatus: number | null,
  events: DiagnosticEvent[],
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    if (!(error instanceof GroqServiceError)) return false
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

async function runGroqServiceTests(): Promise<void> {
  console.log("=== STARTING GROQ SERVICE TESTS ===")
  const previousApiKey = process.env.GROQ_API_KEY
  const previousModel = process.env.GROQ_MODEL

  try {
    // 1. Missing API Key
    console.log("[1] Testing missing GROQ_API_KEY handling...")
    delete process.env.GROQ_API_KEY
    const missingKeyEvents: DiagnosticEvent[] = []
    let missingKeyFetchCalled = false
    await assertDiagnosticError(
      generateGroqText("A test prompt", {
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

    // 2. Successful generation with default options
    console.log("[2] Testing successful generation with default options...")
    process.env.GROQ_API_KEY = "test-placeholder-groq-key"
    process.env.GROQ_MODEL = "openai/gpt-oss-120b"
    let capturedUrl: string | undefined
    let capturedAuthorization: string | null = null
    let capturedBody: unknown
    const successEvents: DiagnosticEvent[] = []
    const successText = JSON.stringify({
      explanation: "A test explanation from Groq.",
      nextStep: "A test next step.",
    })
    const successFetcher: typeof fetch = async (input, init) => {
      capturedUrl = String(input)
      capturedAuthorization = new Headers(init?.headers).get("Authorization")
      capturedBody = JSON.parse(String(init?.body))
      return createResponse({
        model: "openai/gpt-oss-120b",
        choices: [
          {
            message: { content: successText },
            finish_reason: "stop",
          },
        ],
      })
    }

    const generated = await generateGroqText("SENSITIVE_PROMPT", {
      fetcher: successFetcher,
      logger: createLogger(successEvents),
    })
    assert.equal(generated, successText)
    assert.equal(capturedUrl, "https://api.groq.com/openai/v1/chat/completions")
    assert.equal(capturedAuthorization, "Bearer test-placeholder-groq-key")
    assert.deepEqual(capturedBody, {
      model: "openai/gpt-oss-120b",
      messages: [{ role: "user", content: "SENSITIVE_PROMPT" }],
      max_completion_tokens: DEFAULT_GROQ_OUTPUT_TOKENS,
      response_format: { type: "json_object" },
    })
    assert.equal(successEvents.length, 1)
    assert.equal(successEvents[0].event, "success")
    assert.equal(successEvents[0].diagnostics.classification, "success")
    assert.equal(successEvents[0].diagnostics.providerStatus, 200)

    // 3. Custom model, system prompt and JSON mode options
    console.log("[3] Testing custom options (systemPrompt, jsonMode: false, custom token limit)...")
    let customCapturedBody: unknown
    const customFetcher: typeof fetch = async (_input, init) => {
      customCapturedBody = JSON.parse(String(init?.body))
      return createResponse({
        model: "custom-groq-model",
        choices: [{ message: { content: "plain response" } }],
      })
    }

    await generateGroqText("User question", {
      model: "custom-groq-model",
      systemPrompt: "You are a math coach.",
      jsonMode: false,
      maxOutputTokens: 500,
      fetcher: customFetcher,
    })

    assert.deepEqual(customCapturedBody, {
      model: "custom-groq-model",
      messages: [
        { role: "system", content: "You are a math coach." },
        { role: "user", content: "User question" },
      ],
      max_completion_tokens: 500,
    })

    // 4. Input validation: Empty prompt, oversized prompt, invalid tokens/timeout
    console.log("[4] Testing input validation...")
    const invalidInputEvents: DiagnosticEvent[] = []
    await assertDiagnosticError(
      generateGroqText("   ", {
        logger: createLogger(invalidInputEvents),
      }),
      "invalid-input",
      "invalid-input",
      null,
      invalidInputEvents,
    )

    const longPromptEvents: DiagnosticEvent[] = []
    await assertDiagnosticError(
      generateGroqText("a".repeat(10_001), {
        logger: createLogger(longPromptEvents),
      }),
      "invalid-input",
      "invalid-input",
      null,
      longPromptEvents,
    )

    const invalidTimeoutEvents: DiagnosticEvent[] = []
    await assertDiagnosticError(
      generateGroqText("Valid prompt", {
        timeoutMs: -5,
        logger: createLogger(invalidTimeoutEvents),
      }),
      "invalid-input",
      "invalid-input",
      null,
      invalidTimeoutEvents,
    )

    const invalidTokensEvents: DiagnosticEvent[] = []
    await assertDiagnosticError(
      generateGroqText("Valid prompt", {
        maxOutputTokens: 5000,
        logger: createLogger(invalidTokensEvents),
      }),
      "invalid-input",
      "invalid-input",
      null,
      invalidTokensEvents,
    )

    // 5. Upstream HTTP status error handling and secret masking
    console.log("[5] Testing upstream HTTP status handling and secret protection...")
    const providerStatusCases: Array<{
      status: number
      code: GroqServiceErrorCode
      classification: GroqGenerationClassification
    }> = [
      {
        status: 401,
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
        status: 503,
        code: "api-failure",
        classification: "other-provider-error",
      },
      {
        status: 504,
        code: "timeout",
        classification: "provider-timeout",
      },
    ]

    for (const testCase of providerStatusCases) {
      const events: DiagnosticEvent[] = []
      await assertDiagnosticError(
        generateGroqText("Prompt", {
          fetcher: async () =>
            createResponse(
              { error: { message: "SENSITIVE_PROVIDER_ERROR" } },
              testCase.status,
            ),
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

    // 6. Network failure & transport timeout
    console.log("[6] Testing network failure and timeout handling...")
    const networkEvents: DiagnosticEvent[] = []
    await assertDiagnosticError(
      generateGroqText("Prompt", {
        fetcher: async () => {
          throw new Error("SENSITIVE_NETWORK_ERROR")
        },
        logger: createLogger(networkEvents),
      }),
      "api-failure",
      "network-error",
      null,
      networkEvents,
    )
    assert.equal(
      JSON.stringify(networkEvents).includes("SENSITIVE_NETWORK_ERROR"),
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
      generateGroqText("Prompt", {
        timeoutMs: 10,
        fetcher: timeoutFetcher,
        logger: createLogger(transportTimeoutEvents),
      }),
      "timeout",
      "transport-timeout",
      null,
      transportTimeoutEvents,
    )

    // 7. Malformed responses: invalid JSON, empty choices, null content
    console.log("[7] Testing provider response edge cases...")
    const invalidJsonEvents: DiagnosticEvent[] = []
    await assertDiagnosticError(
      generateGroqText("Prompt", {
        fetcher: async () => new Response("{malformed json", { status: 200 }),
        logger: createLogger(invalidJsonEvents),
      }),
      "invalid-response",
      "invalid-response",
      200,
      invalidJsonEvents,
    )

    const emptyChoicesEvents: DiagnosticEvent[] = []
    await assertDiagnosticError(
      generateGroqText("Prompt", {
        fetcher: async () => createResponse({ choices: [] }),
        logger: createLogger(emptyChoicesEvents),
      }),
      "invalid-response",
      "invalid-response",
      200,
      emptyChoicesEvents,
    )

    const emptyTextEvents: DiagnosticEvent[] = []
    await assertDiagnosticError(
      generateGroqText("Prompt", {
        fetcher: async () =>
          createResponse({ choices: [{ message: { content: "   " } }] }),
        logger: createLogger(emptyTextEvents),
      }),
      "empty-response",
      "empty-response",
      200,
      emptyTextEvents,
    )

    // 8. Custom generator injection
    console.log("[8] Testing custom generator injection...")
    const mockGenerator: GroqTextGenerator = async (req) => ({
      text: JSON.stringify({ result: "mocked", model: req.model }),
      model: req.model,
      providerStatus: 200,
    })
    const generatedFromMock = await generateGroqText("Custom generator prompt", {
      generator: mockGenerator,
    })
    assert.equal(
      generatedFromMock,
      JSON.stringify({ result: "mocked", model: "openai/gpt-oss-120b" }),
    )

    console.log("=== ALL GROQ SERVICE TESTS PASSED SUCCESSFULLY ===")
  } finally {
    if (previousApiKey !== undefined) {
      process.env.GROQ_API_KEY = previousApiKey
    } else {
      delete process.env.GROQ_API_KEY
    }
    if (previousModel !== undefined) {
      process.env.GROQ_MODEL = previousModel
    } else {
      delete process.env.GROQ_MODEL
    }
  }
}

void runGroqServiceTests().catch((error: unknown) => {
  console.error("Groq service test failure:", error)
  process.exitCode = 1
})
