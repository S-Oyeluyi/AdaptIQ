import "server-only"

import {
  QUESTIONS,
  getAssessmentById,
  getTopicById,
  type DiagnosticQuestion,
  type Topic,
} from "../assessment-data"
import {
  learningAiRequestSchema,
  mistakeExplanationResponseSchema,
  recommendationExplanationResponseSchema,
  targetedPracticeResponseSchema,
  type MistakeExplanationRequest,
  type RecommendationExplanationRequest,
  type TargetedPracticeRequest,
} from "../learning-ai-schemas"
import {
  generateGeminiText,
  GeminiServiceError,
  type GeminiTextGenerator,
  type GeminiDiagnosticsLogger,
} from "./gemini-service"

export const MAX_REQUEST_BODY_BYTES = 32_768 // 32 KB limit
export const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 20 // 20 requests per minute per IP
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000 // 1 minute window

interface RateLimitRecord {
  count: number
  resetAt: number
}

export interface RateLimiterOptions {
  windowMs?: number
  maxRequests?: number
}

/**
 * In-memory best-effort per-IP rate limiter.
 *
 * NOTE ON DEPLOYMENT LIMITATIONS:
 * This limiter maintains state in memory within the current Node/server process.
 * In serverless environments (such as Vercel or AWS Lambda) or horizontally scaled
 * multi-container deployments, each instance manages its own in-memory table, and
 * instances reset upon cold start. For production multi-instance environments,
 * a distributed store (e.g. Redis / Upstash) should be used.
 */
export class InMemoryRateLimiter {
  private readonly windowMs: number
  private readonly maxRequests: number
  private readonly records = new Map<string, RateLimitRecord>()

  constructor(options: RateLimiterOptions = {}) {
    this.windowMs = options.windowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS
    this.maxRequests = options.maxRequests ?? DEFAULT_RATE_LIMIT_MAX_REQUESTS
  }

  check(ip: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now()
    const record = this.records.get(ip)

    if (!record || now >= record.resetAt) {
      this.records.set(ip, { count: 1, resetAt: now + this.windowMs })
      this.prune(now)
      return { allowed: true, retryAfterSeconds: 0 }
    }

    if (record.count >= this.maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000))
      return { allowed: false, retryAfterSeconds }
    }

    record.count += 1
    return { allowed: true, retryAfterSeconds: 0 }
  }

  reset(): void {
    this.records.clear()
  }

  private prune(now: number): void {
    if (this.records.size > 1000) {
      for (const [key, val] of this.records) {
        if (now >= val.resetAt) {
          this.records.delete(key)
        }
      }
    }
  }
}

export const defaultRateLimiter = new InMemoryRateLimiter()

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0].trim()
    if (first) return first
  }
  const realIp = request.headers.get("x-real-ip")
  if (realIp) return realIp.trim()
  return "127.0.0.1"
}

export function extractJson(rawText: string): unknown {
  const trimmed = rawText.trim()

  try {
    return JSON.parse(trimmed)
  } catch {
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim())
      } catch {
        // Fall through to brace matching
      }
    }

    const firstBrace = trimmed.indexOf("{")
    const lastBrace = trimmed.lastIndexOf("}")
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1))
      } catch {
        // Fall through
      }
    }

    throw new Error("Could not parse JSON from AI response.")
  }
}

function buildMistakeExplanationPrompt(
  request: MistakeExplanationRequest,
  question: DiagnosticQuestion,
  assessmentTitle: string,
  topicName: string,
): string {
  const optionsFormatted = question.options
    .map(
      (opt, idx) =>
        `  Option ${idx}: "${opt}"${
          idx === question.correctIndex ? " (CORRECT ANSWER)" : ""
        }${idx === request.selectedOptionIndex ? " (STUDENT'S INCORRECT SELECTION)" : ""}`,
    )
    .join("\n")

  return `You are an expert, encouraging tutor for AdaptIQ, a learning system.
A student answered an assessment question incorrectly. Explain their misconception in a clear, supportive, and pedagogical manner.

Context:
- Assessment: ${assessmentTitle}
- Topic: ${topicName}
- Question Prompt: ${question.text}
${question.codeSnippet ? `- Code / Formula Context:\n${question.codeSnippet}\n` : ""}- Options:
${optionsFormatted}
- Student's Selected Answer: Option ${request.selectedOptionIndex} ("${question.options[request.selectedOptionIndex]}")
- Authoritative Correct Answer: Option ${question.correctIndex} ("${question.options[question.correctIndex]}")
- Canonical Solution Explanation: ${question.explanation}

Instructions:
1. Explain specifically why Option ${request.selectedOptionIndex} is incorrect and what common conceptual mistake or confusion led to choosing it.
2. Explain clearly why Option ${question.correctIndex} is the correct answer based on foundational principles.
3. Provide a constructive, actionable next step for the student to keep in mind for similar problems.
4. Keep the explanation under 1200 characters and the next step under 500 characters.
5. Do NOT change or dispute the correct answer, question text, or scoring.
6. Return ONLY a single valid JSON object with no surrounding commentary or formatting other than standard JSON:
{
  "explanation": "Clear explanation of the error and correct concept (max 1200 characters)",
  "nextStep": "Actionable strategy or tip for future problems (max 500 characters)"
}`
}

function buildTargetedPracticePrompt(
  request: TargetedPracticeRequest,
  topic: Topic,
): string {
  return `You are an expert curriculum developer for AdaptIQ.
Generate targeted multiple-choice practice questions for a student based on their learning profile.

Target Specifications:
- Topic: ${topic.name}
- Domain: ${topic.domain}
- Topic Description: ${topic.description}
- Difficulty Level: ${request.difficulty}
- Number of Questions Required: ${request.questionCount}

Instructions:
1. Generate exactly ${request.questionCount} high-quality, original multiple-choice questions aligned with ${request.difficulty} difficulty for the topic "${topic.name}".
2. Each question must have:
   - "prompt": concise, unambiguous question statement (max 500 characters)
   - "options": an array of exactly 4 distinct and plausible answer options (each max 200 characters)
   - "correctIndex": integer between 0 and 3 indicating the single correct option in "options"
   - "explanation": pedagogical explanation of why that option is correct and why the other options are incorrect (max 1200 characters)
3. Return ONLY a single valid JSON object with no surrounding commentary or formatting other than standard JSON:
{
  "questions": [
    {
      "prompt": "Question text here",
      "options": ["Option 0", "Option 1", "Option 2", "Option 3"],
      "correctIndex": 0,
      "explanation": "Why option 0 is correct..."
    }
  ]
}`
}

function buildRecommendationExplanationPrompt(
  request: RecommendationExplanationRequest,
  topic: Topic,
): string {
  return `You are an encouraging adaptive learning coach for AdaptIQ.
Explain to a student why a specific study recommendation was generated for them and how to approach it.

Recommendation Details:
- Topic: ${topic.name} (${topic.domain})
- Topic Description: ${topic.description}
- Recommendation Category: ${request.kind}
- System Reason: ${request.reason}
- Suggested Action: ${request.action}
- Suggested Practice Level: ${request.suggestedDifficulty ?? "Not specified"}
- Suggested Time Allocation: ${
    request.suggestedMinutes !== null ? `${request.suggestedMinutes} minutes` : "Not specified"
  }

Instructions:
1. Explain why focusing on ${topic.name} right now matters for the student's mastery and confidence.
2. Explain what specific cognitive insight or skill the student will gain by completing "${request.action}".
3. Provide practical guidance on how to approach this study session effectively.
4. Do NOT alter the recommended topic, category, priority, duration, or action.
5. Keep the explanation under 1200 characters.
6. Return ONLY a single valid JSON object with no surrounding commentary or formatting other than standard JSON:
{
  "explanation": "Your coaching explanation here (max 1200 characters)"
}`
}

export interface LearningCoachHandlerOptions {
  generator?: GeminiTextGenerator
  timeoutMs?: number
  rateLimiter?: InMemoryRateLimiter | null
  logger?: GeminiDiagnosticsLogger
}

export async function handleLearningCoachRequest(
  request: Request,
  options: LearningCoachHandlerOptions = {},
): Promise<Response> {
  // 1. Rate limiting check
  const limiter = options.rateLimiter === undefined ? defaultRateLimiter : options.rateLimiter
  if (limiter !== null) {
    const ip = getClientIp(request)
    const rateCheck = limiter.check(ip)
    if (!rateCheck.allowed) {
      return Response.json(
        { error: "Too many requests. Please wait before trying again." },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateCheck.retryAfterSeconds),
          },
        },
      )
    }
  }

  // 2. Body size check (Content-Length header)
  const contentLength = request.headers.get("content-length")
  if (contentLength && parseInt(contentLength, 10) > MAX_REQUEST_BODY_BYTES) {
    return Response.json(
      { error: "Payload too large. Request body must be 32KB or smaller." },
      { status: 413 },
    )
  }

  // 3. Read body text and verify byte length
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return Response.json(
      { error: "Failed to read request body." },
      { status: 400 },
    )
  }

  if (Buffer.byteLength(rawBody, "utf8") > MAX_REQUEST_BODY_BYTES) {
    return Response.json(
      { error: "Payload too large. Request body must be 32KB or smaller." },
      { status: 413 },
    )
  }

  // 4. Parse JSON
  let bodyJson: unknown
  try {
    bodyJson = JSON.parse(rawBody)
  } catch {
    return Response.json(
      { error: "Invalid JSON in request body." },
      { status: 400 },
    )
  }

  // 5. Validate against discriminated union request schema
  const parsedRequest = learningAiRequestSchema.safeParse(bodyJson)
  if (!parsedRequest.success) {
    return Response.json(
      {
        error: "Invalid request payload.",
        details: parsedRequest.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    )
  }

  const reqData = parsedRequest.data

  // 6. Construct prompt based on validated task and canonical data
  let prompt: string
  if (reqData.task === "mistake-explanation") {
    const question = QUESTIONS.find((q) => q.id === reqData.questionId)!
    const assessment = getAssessmentById(reqData.assessmentId)!
    const topic = getTopicById(question.topicId)
    const topicName = topic?.name ?? question.topicLabel

    prompt = buildMistakeExplanationPrompt(
      reqData,
      question,
      assessment.title,
      topicName,
    )
  } else if (reqData.task === "targeted-practice") {
    const topic = getTopicById(reqData.topicId)!
    prompt = buildTargetedPracticePrompt(reqData, topic)
  } else {
    // recommendation-explanation
    const topic = getTopicById(reqData.topicId)!
    prompt = buildRecommendationExplanationPrompt(reqData, topic)
  }

  // 7. Invoke Gemini service
  let geminiText: string
  try {
    geminiText = await generateGeminiText(prompt, {
      generator: options.generator,
      timeoutMs: options.timeoutMs,
      logger: options.logger,
    })
  } catch (error) {
    if (error instanceof GeminiServiceError) {
      switch (error.code) {
        case "missing-api-key":
          return Response.json(
            { error: "AI learning coach is currently unavailable." },
            { status: 503 },
          )
        case "timeout":
          return Response.json(
            { error: "AI service request timed out. Please try again." },
            { status: 504 },
          )
        case "invalid-input":
          return Response.json(
            { error: "AI service request could not be processed." },
            { status: 500 },
          )
        case "empty-response":
          return Response.json(
            { error: "AI service returned an empty response." },
            { status: 502 },
          )
        case "api-failure":
        default:
          return Response.json(
            { error: "AI service is temporarily unavailable. Please try again later." },
            { status: 502 },
          )
      }
    }

    return Response.json(
      { error: "An unexpected error occurred while processing the request." },
      { status: 500 },
    )
  }

  // 8. Extract JSON from Gemini response
  let aiData: unknown
  try {
    aiData = extractJson(geminiText)
  } catch {
    return Response.json(
      { error: "AI service returned an unparseable response." },
      { status: 502 },
    )
  }

  // 9. Validate extracted JSON against task-specific response schema
  if (reqData.task === "mistake-explanation") {
    const validated = mistakeExplanationResponseSchema.safeParse(aiData)
    if (!validated.success) {
      return Response.json(
        { error: "AI service returned an invalid response structure." },
        { status: 502 },
      )
    }
    return Response.json(validated.data, { status: 200 })
  }

  if (reqData.task === "targeted-practice") {
    const validated = targetedPracticeResponseSchema.safeParse(aiData)
    if (!validated.success) {
      return Response.json(
        { error: "AI service returned an invalid response structure." },
        { status: 502 },
      )
    }
    return Response.json(validated.data, { status: 200 })
  }

  // recommendation-explanation
  const validated = recommendationExplanationResponseSchema.safeParse(aiData)
  if (!validated.success) {
    return Response.json(
      { error: "AI service returned an invalid response structure." },
      { status: 502 },
    )
  }
  return Response.json(validated.data, { status: 200 })
}
