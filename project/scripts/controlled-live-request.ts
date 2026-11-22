import { QUESTIONS, ASSESSMENTS } from "../lib/assessment-data"
import { handleLearningCoachRequest } from "../lib/server/learning-coach-handler"
import type { GeminiGenerationDiagnostics } from "../lib/server/gemini-service"

async function runControlledLiveRequest() {
  const question = QUESTIONS[0] // ALG-EQ-001
  const assessment = ASSESSMENTS.find((a) => a.id === question.assessmentId)!
  const incorrectOptionIndex = question.correctIndex === 0 ? 1 : 0

  let capturedDiagnostics: GeminiGenerationDiagnostics | null = null

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
        capturedDiagnostics = diagnostics
      },
    })

    const elapsedMs = Date.now() - startTime
    const responseBody = await response.json()

    console.log("=== CONTROLLED LIVE REQUEST RESULT ===")
    console.log(`HTTP Status: ${response.status}`)
    console.log(`Elapsed Time: ${elapsedMs} ms`)
    if (capturedDiagnostics) {
      console.log(`Model Identifier: ${(capturedDiagnostics as GeminiGenerationDiagnostics).model}`)
      console.log(`Provider Status: ${(capturedDiagnostics as GeminiGenerationDiagnostics).providerStatus}`)
      console.log(`Classification: ${(capturedDiagnostics as GeminiGenerationDiagnostics).classification}`)
      console.log(`Error Code: ${(capturedDiagnostics as GeminiGenerationDiagnostics).errorCode ?? "none"}`)
      console.log("Sanitised Diagnostics:", JSON.stringify(capturedDiagnostics, null, 2))
    } else {
      console.log("Sanitised Diagnostics: None captured (request failed prior to Gemini call)")
    }

    if (response.status === 200) {
      console.log("Response Verification: Success (Received valid explanation structure)")
      console.log(`Has explanation: ${typeof responseBody.explanation === "string"}`)
      console.log(`Has nextStep: ${typeof responseBody.nextStep === "string"}`)
    } else {
      console.log("Response Error Payload:", JSON.stringify(responseBody, null, 2))
    }
    console.log("======================================")
  } catch (err: unknown) {
    const elapsedMs = Date.now() - startTime
    console.error("Unexpected execution error:", err)
    console.log(`Elapsed Time: ${elapsedMs} ms`)
  }
}

void runControlledLiveRequest()
