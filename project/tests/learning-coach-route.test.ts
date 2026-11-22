import assert from "node:assert/strict"
import { POST } from "../app/api/learning/coach/route"
import {
  QUESTIONS,
  ASSESSMENTS,
  TOPICS,
} from "../lib/assessment-data"
import {
  handleLearningCoachRequest,
  InMemoryRateLimiter,
  MAX_REQUEST_BODY_BYTES,
  extractJson,
} from "../lib/server/learning-coach-handler"
import {
  GeminiServiceError,
  type GeminiTextGenerator,
} from "../lib/server/gemini-service"

function createJsonRequest(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  const jsonString = typeof body === "string" ? body : JSON.stringify(body)
  return new Request("http://localhost:3000/api/learning/coach", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: jsonString,
  })
}

async function runLearningCoachRouteTests(): Promise<void> {
  console.log("=== STARTING LEARNING COACH ROUTE TESTS ===")

  const question = QUESTIONS[0] // ALG-EQ-001 (correctIndex = 0)
  const assessment = ASSESSMENTS.find((a) => a.id === question.assessmentId)!
  const topic = TOPICS.find((t) => t.id === question.topicId)!
  const incorrectOptionIndex = question.correctIndex === 0 ? 1 : 0

  // 1. Mistake explanation — valid operation
  console.log("[1] Testing mistake explanation valid operation...")
  {
    const mockGenerator: GeminiTextGenerator = async () => ({
      text: JSON.stringify({
        explanation: "You added 5 instead of subtracting 5 from both sides of the equation.",
        nextStep: "Remember to apply the inverse operation to isolate the variable.",
      }),
    })

    const request = createJsonRequest({
      task: "mistake-explanation",
      assessmentId: assessment.id,
      questionId: question.id,
      selectedOptionIndex: incorrectOptionIndex,
    })

    const response = await handleLearningCoachRequest(request, {
      generator: mockGenerator,
      rateLimiter: null,
    })

    assert.equal(response.status, 200)
    const data = await response.json()
    assert.ok(data.explanation.includes("subtracting 5"))
    assert.ok(data.nextStep.includes("inverse operation"))
  }

  // 2. Targeted practice generation — valid operation
  console.log("[2] Testing targeted practice valid operation...")
  {
    const mockGenerator: GeminiTextGenerator = async () => ({
      text: JSON.stringify({
        questions: [
          {
            prompt: "Solve 2x + 4 = 10.",
            options: ["x = 2", "x = 3", "x = 4", "x = 5"],
            correctIndex: 1,
            explanation: "Subtract 4 from both sides: 2x = 6. Divide by 2: x = 3.",
          },
          {
            prompt: "Solve 3y - 6 = 9.",
            options: ["y = 3", "y = 4", "y = 5", "y = 6"],
            correctIndex: 2,
            explanation: "Add 6 to both sides: 3y = 15. Divide by 3: y = 5.",
          },
        ],
      }),
    })

    const request = createJsonRequest({
      task: "targeted-practice",
      topicId: topic.id,
      difficulty: "core",
      questionCount: 2,
    })

    const response = await handleLearningCoachRequest(request, {
      generator: mockGenerator,
      rateLimiter: null,
    })

    assert.equal(response.status, 200)
    const data = await response.json()
    assert.equal(data.questions.length, 2)
    assert.equal(data.questions[0].correctIndex, 1)
    assert.equal(data.questions[0].options.length, 4)
  }

  // 3. Recommendation explanation — valid operation
  console.log("[3] Testing recommendation explanation valid operation...")
  {
    const mockGenerator: GeminiTextGenerator = async () => ({
      text: JSON.stringify({
        explanation:
          "Linear Equations are essential building blocks for all algebra topics. Strengthening this will boost overall performance.",
      }),
    })

    const request = createJsonRequest({
      task: "recommendation-explanation",
      topicId: topic.id,
      kind: "focus",
      reason: "Provisional mastery is 50% based on recent diagnostic questions.",
      action: "Work through foundational practice questions to close gaps.",
      suggestedDifficulty: "foundational",
      suggestedMinutes: 10,
    })

    const response = await handleLearningCoachRequest(request, {
      generator: mockGenerator,
      rateLimiter: null,
    })

    assert.equal(response.status, 200)
    const data = await response.json()
    assert.ok(data.explanation.includes("Linear Equations are essential"))
  }

  // 4. Markdown code fence JSON extraction
  console.log("[4] Testing JSON extraction from markdown code fences...")
  {
    const mockGenerator: GeminiTextGenerator = async () => ({
      text: "```json\n" + JSON.stringify({
        explanation: "Extracted correctly from markdown code fence.",
      }) + "\n```",
    })

    const request = createJsonRequest({
      task: "recommendation-explanation",
      topicId: topic.id,
      kind: "develop",
      reason: "Solid start.",
      action: "Practice core questions.",
      suggestedDifficulty: "core",
      suggestedMinutes: 15,
    })

    const response = await handleLearningCoachRequest(request, {
      generator: mockGenerator,
      rateLimiter: null,
    })

    assert.equal(response.status, 200)
    const data = await response.json()
    assert.equal(data.explanation, "Extracted correctly from markdown code fence.")
  }

  // 5. Invalid request bodies
  console.log("[5] Testing invalid request bodies (malformed JSON, missing fields, extra fields)...")
  {
    // Malformed JSON
    const malformedReq = createJsonRequest("{ invalid json }")
    const malformedRes = await handleLearningCoachRequest(malformedReq, { rateLimiter: null })
    assert.equal(malformedRes.status, 400)
    const malformedData = await malformedRes.json()
    assert.ok(malformedData.error.includes("Invalid JSON"))

    // Missing task field
    const missingTaskReq = createJsonRequest({
      topicId: topic.id,
      difficulty: "core",
      questionCount: 2,
    })
    const missingTaskRes = await handleLearningCoachRequest(missingTaskReq, { rateLimiter: null })
    assert.equal(missingTaskRes.status, 400)

    // Unrecognized extra field (strict schema rejection)
    const extraFieldReq = createJsonRequest({
      task: "targeted-practice",
      topicId: topic.id,
      difficulty: "core",
      questionCount: 2,
      extraScoreField: 100,
    })
    const extraFieldRes = await handleLearningCoachRequest(extraFieldReq, { rateLimiter: null })
    assert.equal(extraFieldRes.status, 400)
  }

  // 6. Incorrect versus correct answer validation for mistake explanation
  console.log("[6] Testing selectedOptionIndex validation (correct answer rejected)...")
  {
    // Attempting mistake explanation on the correct answer
    const correctOptionReq = createJsonRequest({
      task: "mistake-explanation",
      assessmentId: assessment.id,
      questionId: question.id,
      selectedOptionIndex: question.correctIndex, // Correct answer!
    })

    const response = await handleLearningCoachRequest(correctOptionReq, { rateLimiter: null })
    assert.equal(response.status, 400)
    const data = await response.json()
    assert.ok(
      data.details.some((d: { message: string }) =>
        d.message.includes("incorrect selected answer"),
      ),
    )
  }

  // 7. Unknown IDs validation
  console.log("[7] Testing unknown assessment/question/topic IDs...")
  {
    // Unknown assessment
    const badAsmReq = createJsonRequest({
      task: "mistake-explanation",
      assessmentId: "non-existent-assessment",
      questionId: question.id,
      selectedOptionIndex: incorrectOptionIndex,
    })
    const badAsmRes = await handleLearningCoachRequest(badAsmReq, { rateLimiter: null })
    assert.equal(badAsmRes.status, 400)

    // Unknown question
    const badQReq = createJsonRequest({
      task: "mistake-explanation",
      assessmentId: assessment.id,
      questionId: "non-existent-question",
      selectedOptionIndex: 0,
    })
    const badQRes = await handleLearningCoachRequest(badQReq, { rateLimiter: null })
    assert.equal(badQRes.status, 400)

    // Mismatched assessment and question
    const mismatchedReq = createJsonRequest({
      task: "mistake-explanation",
      assessmentId: "geometry-essentials", // question belongs to algebra-readiness
      questionId: question.id,
      selectedOptionIndex: incorrectOptionIndex,
    })
    const mismatchedRes = await handleLearningCoachRequest(mismatchedReq, { rateLimiter: null })
    assert.equal(mismatchedRes.status, 400)

    // Unknown topic
    const badTopicReq = createJsonRequest({
      task: "targeted-practice",
      topicId: "non-existent-topic",
      difficulty: "core",
      questionCount: 2,
    })
    const badTopicRes = await handleLearningCoachRequest(badTopicReq, { rateLimiter: null })
    assert.equal(badTopicRes.status, 400)
  }

  // 8. Malformed Gemini JSON response
  console.log("[8] Testing malformed Gemini output...")
  {
    const mockGenerator: GeminiTextGenerator = async () => ({
      text: "Sorry, I am not able to generate JSON right now.",
    })

    const request = createJsonRequest({
      task: "recommendation-explanation",
      topicId: topic.id,
      kind: "reinforce",
      reason: "High mastery achieved.",
      action: "Review concepts.",
      suggestedDifficulty: "advanced",
      suggestedMinutes: 5,
    })

    const response = await handleLearningCoachRequest(request, {
      generator: mockGenerator,
      rateLimiter: null,
    })

    assert.equal(response.status, 502)
    const data = await response.json()
    assert.ok(data.error.includes("unparseable response"))
  }

  // 9. Invalid generated question structures (schema failure)
  console.log("[9] Testing invalid generated question structures from AI...")
  {
    // Questions array has only 3 options instead of 4
    const mockGenerator: GeminiTextGenerator = async () => ({
      text: JSON.stringify({
        questions: [
          {
            prompt: "Solve 2x = 4.",
            options: ["x = 1", "x = 2", "x = 3"], // Only 3 options
            correctIndex: 1,
            explanation: "Divide by 2.",
          },
        ],
      }),
    })

    const request = createJsonRequest({
      task: "targeted-practice",
      topicId: topic.id,
      difficulty: "foundational",
      questionCount: 1,
    })

    const response = await handleLearningCoachRequest(request, {
      generator: mockGenerator,
      rateLimiter: null,
    })

    assert.equal(response.status, 502)
    const data = await response.json()
    assert.ok(data.error.includes("invalid response structure"))
  }

  // 10. Gemini API failure and missing key handling
  console.log("[10] Testing Gemini API failure and missing key...")
  {
    const failureGenerator: GeminiTextGenerator = async () => {
      throw new GeminiServiceError("api-failure", "Internal upstream error")
    }

    const request = createJsonRequest({
      task: "recommendation-explanation",
      topicId: topic.id,
      kind: "focus",
      reason: "Needs attention.",
      action: "Study.",
      suggestedDifficulty: null,
      suggestedMinutes: null,
    })

    const response = await handleLearningCoachRequest(request, {
      generator: failureGenerator,
      rateLimiter: null,
    })

    assert.equal(response.status, 502)
    const data = await response.json()
    assert.ok(data.error.includes("temporarily unavailable"))
    // Verify internal error message was NOT leaked
    assert.equal(JSON.stringify(data).includes("Internal upstream error"), false)

    // Missing API key error -> 503
    const missingKeyGenerator: GeminiTextGenerator = async () => {
      throw new GeminiServiceError("missing-api-key", "API key missing")
    }
    const missingKeyReq = createJsonRequest({
      task: "recommendation-explanation",
      topicId: topic.id,
      kind: "focus",
      reason: "Needs attention.",
      action: "Study.",
      suggestedDifficulty: null,
      suggestedMinutes: null,
    })
    const missingKeyRes = await handleLearningCoachRequest(missingKeyReq, {
      generator: missingKeyGenerator,
      rateLimiter: null,
    })
    assert.equal(missingKeyRes.status, 503)

    let invalidInputGeneratorCalled = false
    const invalidInputReq = createJsonRequest({
      task: "recommendation-explanation",
      topicId: topic.id,
      kind: "focus",
      reason: "Needs attention.",
      action: "Study.",
      suggestedDifficulty: null,
      suggestedMinutes: null,
    })
    const invalidInputRes = await handleLearningCoachRequest(invalidInputReq, {
      generator: async () => {
        invalidInputGeneratorCalled = true
        return { text: "unused" }
      },
      timeoutMs: 0,
      rateLimiter: null,
    })
    assert.equal(invalidInputRes.status, 500)
    const invalidInputData = await invalidInputRes.json()
    assert.equal(invalidInputData.error, "AI service request could not be processed.")
    assert.equal(invalidInputData.error.includes("empty"), false)
    assert.equal(invalidInputGeneratorCalled, false)

    const emptyResponseReq = createJsonRequest({
      task: "recommendation-explanation",
      topicId: topic.id,
      kind: "focus",
      reason: "Needs attention.",
      action: "Study.",
      suggestedDifficulty: null,
      suggestedMinutes: null,
    })
    const emptyResponseRes = await handleLearningCoachRequest(emptyResponseReq, {
      generator: async () => ({ text: " " }),
      rateLimiter: null,
    })
    assert.equal(emptyResponseRes.status, 502)
    const emptyResponseData = await emptyResponseRes.json()
    assert.equal(emptyResponseData.error, "AI service returned an empty response.")
  }

  // 11. Timeout handling
  console.log("[11] Testing Gemini timeout handling...")
  {
    const timeoutGenerator: GeminiTextGenerator = async () => {
      throw new GeminiServiceError("timeout", "Generation timed out")
    }

    const request = createJsonRequest({
      task: "recommendation-explanation",
      topicId: topic.id,
      kind: "focus",
      reason: "Needs attention.",
      action: "Study.",
      suggestedDifficulty: null,
      suggestedMinutes: null,
    })

    const response = await handleLearningCoachRequest(request, {
      generator: timeoutGenerator,
      rateLimiter: null,
    })

    assert.equal(response.status, 504)
    const data = await response.json()
    assert.ok(data.error.includes("timed out"))
  }

  // 12. Rate limiting
  console.log("[12] Testing per-IP rate limiting...")
  {
    const customLimiter = new InMemoryRateLimiter({ maxRequests: 2, windowMs: 60_000 })
    const mockGenerator: GeminiTextGenerator = async () => ({
      text: JSON.stringify({ explanation: "Success" }),
    })

    const validReqData = {
      task: "recommendation-explanation",
      topicId: topic.id,
      kind: "focus",
      reason: "Reason text",
      action: "Action text",
      suggestedDifficulty: null,
      suggestedMinutes: null,
    }

    const req1 = createJsonRequest(validReqData, { "x-forwarded-for": "192.168.1.100" })
    const res1 = await handleLearningCoachRequest(req1, {
      generator: mockGenerator,
      rateLimiter: customLimiter,
    })
    assert.equal(res1.status, 200)

    const req2 = createJsonRequest(validReqData, { "x-forwarded-for": "192.168.1.100" })
    const res2 = await handleLearningCoachRequest(req2, {
      generator: mockGenerator,
      rateLimiter: customLimiter,
    })
    assert.equal(res2.status, 200)

    // Third request from same IP should be blocked
    const req3 = createJsonRequest(validReqData, { "x-forwarded-for": "192.168.1.100" })
    const res3 = await handleLearningCoachRequest(req3, {
      generator: mockGenerator,
      rateLimiter: customLimiter,
    })
    assert.equal(res3.status, 429)
    assert.ok(res3.headers.get("retry-after") !== null)
    const res3Data = await res3.json()
    assert.ok(res3Data.error.includes("Too many requests"))

    // Request from a different IP should succeed
    const reqOtherIp = createJsonRequest(validReqData, { "x-forwarded-for": "192.168.1.200" })
    const resOtherIp = await handleLearningCoachRequest(reqOtherIp, {
      generator: mockGenerator,
      rateLimiter: customLimiter,
    })
    assert.equal(resOtherIp.status, 200)
  }

  // 13. Oversized requests (413 Payload Too Large)
  console.log("[13] Testing oversized request handling...")
  {
    // A payload larger than MAX_REQUEST_BODY_BYTES (32KB)
    const hugePadding = "x".repeat(MAX_REQUEST_BODY_BYTES + 500)
    const oversizedBody = JSON.stringify({
      task: "recommendation-explanation",
      topicId: topic.id,
      kind: "focus",
      reason: "Reason",
      action: "Action",
      suggestedDifficulty: null,
      suggestedMinutes: null,
      padding: hugePadding,
    })

    const request = new Request("http://localhost:3000/api/learning/coach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: oversizedBody,
    })

    const response = await handleLearningCoachRequest(request, { rateLimiter: null })
    assert.equal(response.status, 413)
    const data = await response.json()
    assert.ok(data.error.includes("Payload too large"))
  }

  // 14. Direct POST handler route export execution
  console.log("[14] Testing direct route POST handler export...")
  {
    // Calling POST directly with an invalid request (e.g. malformed JSON)
    const invalidReq = new Request("http://localhost:3000/api/learning/coach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not a json string",
    })

    const postResponse = await POST(invalidReq)
    assert.equal(postResponse.status, 400)
    const postData = await postResponse.json()
    assert.ok(postData.error.includes("Invalid JSON"))
  }

  console.log("=== ALL LEARNING COACH ROUTE TESTS PASSED SUCCESSFULLY ===")
}

void runLearningCoachRouteTests().catch((error: unknown) => {
  console.error("Test failure:", error)
  process.exitCode = 1
})
