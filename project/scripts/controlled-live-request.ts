import { QUESTIONS, ASSESSMENTS } from "../lib/assessment-data"
import { mistakeExplanationResponseSchema } from "../lib/learning-ai-schemas"
import { handleLearningCoachRequest } from "../lib/server/learning-coach-handler"
import type { OpenRouterGenerationDiagnostics } from "../lib/server/openrouter-service"

async function runControlledLiveRequest() {
  const question = QUESTIONS[0]
  const assessment = ASSESSMENTS.find(
    (item) => item.id === question.assessmentId,
  )!
  const incorrectOptionIndex = question.correctIndex === 0 ? 1 : 0

  const capturedDiagnostics: OpenRouterGenerationDiagnostics[] = []

  const startTime = Date.now()
  const request = new Request("http://localhost:3000/api/learning/coach", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "127.0.0.1",
    },
    body: JSON.stringify({
      task: "mistake-explanation",
      assessmentId: assessment.id,
      questionId: question.id,
      selectedOptionIndex: incorrectOptionIndex,
    }),
  })

  try {
    const response = await handleLearningCoachRequest(request, {
      logger: (_event, diagnostics) => {
        capturedDiagnostics.push(diagnostics)
      },
    })
    const elapsedMs = Date.now() - startTime
    const responseBody: unknown = await response.json()
    const validation = mistakeExplanationResponseSchema.safeParse(responseBody)
    const diagnostics = capturedDiagnostics[0]

    console.log("=== CONTROLLED OPENROUTER REQUEST RESULT ===")
    console.log(`HTTP Status: ${response.status}`)
    console.log(`Elapsed Time: ${elapsedMs} ms`)
    console.log(
      `Actual Model Identifier: ${
        diagnostics?.model ?? "unavailable"
      }`,
    )
    console.log(
      `Provider Status: ${diagnostics?.providerStatus ?? "unavailable"}`,
    )
    console.log(
      `Provider Error Code: ${diagnostics?.providerErrorCode ?? "none"}`,
    )
    console.log(
      `Provider Message: ${diagnostics?.providerMessage ?? "none"}`,
    )
    console.log(
      `Upstream Provider: ${diagnostics?.upstreamProvider ?? "unavailable"}`,
    )
    console.log(
      `Upstream Status: ${diagnostics?.upstreamStatus ?? "unavailable"}`,
    )
    console.log(
      `Classification: ${diagnostics?.classification ?? "unavailable"}`,
    )
    console.log(
      `Error Code: ${diagnostics?.errorCode ?? "none"}`,
    )
    console.log(
      `Valid explanation string: ${
        validation.success &&
        typeof validation.data.explanation === "string"
      }`,
    )
    console.log(
      `Valid nextStep string: ${
        validation.success && typeof validation.data.nextStep === "string"
      }`,
    )
    const struct = diagnostics?.responseStructure
    if (struct) {
      console.log(`Choices Exists: ${struct.hasChoices}`)
      console.log(`Choices Count: ${struct.choicesCount}`)
      console.log(`Message Exists: ${struct.hasMessage}`)
      console.log(`Message Content Exists: ${struct.hasContent}`)
      console.log(`Content Type: ${struct.contentType}`)
      console.log(`Content Is Empty: ${struct.isContentEmpty}`)
      console.log(`Finish Reason Present: ${struct.hasFinishReason}`)
      console.log(`Finish Reason: ${struct.finishReason ?? "none"}`)
      console.log(`Refusal Present: ${struct.hasRefusal}`)
      console.log(`Tool Calls Present: ${struct.hasToolCalls}`)
      console.log(`JSON Extraction Succeeded: ${struct.jsonExtractionSucceeded}`)
      console.log(`Zod Validation Succeeded: ${struct.zodValidationSucceeded}`)
    }
    console.log("===========================================")
  } catch {
    console.log("=== CONTROLLED OPENROUTER REQUEST RESULT ===")
    console.log("HTTP Status: unavailable")
    console.log(`Elapsed Time: ${Date.now() - startTime} ms`)
    const diagnostics = capturedDiagnostics[0]
    console.log(
      `Actual Model Identifier: ${
        diagnostics?.model ?? "unavailable"
      }`,
    )
    console.log(
      `Provider Status: ${diagnostics?.providerStatus ?? "unavailable"}`,
    )
    console.log(
      `Provider Error Code: ${diagnostics?.providerErrorCode ?? "none"}`,
    )
    console.log(
      `Provider Message: ${diagnostics?.providerMessage ?? "none"}`,
    )
    console.log(
      `Upstream Provider: ${diagnostics?.upstreamProvider ?? "unavailable"}`,
    )
    console.log(
      `Upstream Status: ${diagnostics?.upstreamStatus ?? "unavailable"}`,
    )
    console.log(
      `Classification: ${diagnostics?.classification ?? "unavailable"}`,
    )
    console.log(
      `Error Code: ${diagnostics?.errorCode ?? "unavailable"}`,
    )
    console.log("Valid explanation string: false")
    console.log("Valid nextStep string: false")
    const struct = diagnostics?.responseStructure
    if (struct) {
      console.log(`Choices Exists: ${struct.hasChoices}`)
      console.log(`Choices Count: ${struct.choicesCount}`)
      console.log(`Message Exists: ${struct.hasMessage}`)
      console.log(`Message Content Exists: ${struct.hasContent}`)
      console.log(`Content Type: ${struct.contentType}`)
      console.log(`Content Is Empty: ${struct.isContentEmpty}`)
      console.log(`Finish Reason Present: ${struct.hasFinishReason}`)
      console.log(`Finish Reason: ${struct.finishReason ?? "none"}`)
      console.log(`Refusal Present: ${struct.hasRefusal}`)
      console.log(`Tool Calls Present: ${struct.hasToolCalls}`)
      console.log(`JSON Extraction Succeeded: ${struct.jsonExtractionSucceeded}`)
      console.log(`Zod Validation Succeeded: ${struct.zodValidationSucceeded}`)
    }
    console.log("===========================================")
  }
}

void runControlledLiveRequest()
