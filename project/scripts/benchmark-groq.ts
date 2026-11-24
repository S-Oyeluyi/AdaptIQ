
import { loadEnvConfig } from "@next/env"
import { z } from "zod"
import {
  mistakeExplanationResponseSchema,
  targetedPracticeResponseSchema,
  recommendationExplanationResponseSchema,
} from "../lib/learning-ai-schemas"

loadEnvConfig(process.cwd())

const apiKey = process.env.GROQ_API_KEY

if (!apiKey) {
  throw new Error("GROQ_API_KEY was not found in .env.local")
}

const MODEL = "openai/gpt-oss-120b"
const URL = "https://api.groq.com/openai/v1/chat/completions"

async function testTask(
  name: string,
  prompt: string,
  schema: z.ZodType,
) {
  for (let run = 1; run <= 3; run++) {
    console.log(`\nAttempt ${run}/3`)
    console.log(`\n--- ${name} ---`)
    const start = Date.now()

    try {
      const response = await fetch(URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "system",
              content: "You are a helpful educational tutor. Return only valid JSON.",
            },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          max_completion_tokens: 4096,
        }),
      })

      const elapsed = Date.now() - start
      const data = await response.json()

      console.log("HTTP:", response.status)
      console.log("Elapsed:", `${elapsed} ms`)

      if (!response.ok) {
        console.log("Provider error:", data.error?.message ?? "Unknown error")
        return
      }

      const choice = data.choices?.[0]
      const content = choice?.message?.content

      console.log("Model:", data.model)
      console.log("Finish reason:", choice?.finish_reason)
      console.log("Tokens:", JSON.stringify(data.usage ?? {}))

      if (!content) {
        console.log("FAIL: Empty response content")
        return
      }

      let parsed: unknown

      try {
        parsed = JSON.parse(content)
      } catch {
        console.log("FAIL: Invalid JSON")
        console.log(content)
        return
      }

      const result = schema.safeParse(parsed)

      if (!result.success) {
        console.log("FAIL: Zod validation")
        console.log(result.error.issues)
        return
      }

      console.log("PASS: Valid JSON and Zod schema")
      console.log(JSON.stringify(result.data, null, 2))
    } catch (error) {
      console.log("FAIL:", error instanceof Error ? error.message : error)
    }
  }
}

async function main() {
  await testTask(
    "Mistake explanation",
    `You are an expert, encouraging tutor for AdaptIQ.

Assessment: Algebra readiness
Topic: Linear Equations
Question: Solve 3x + 5 = 20.
Options:
0: "3" (STUDENT'S INCORRECT SELECTION)
1: "5" (CORRECT ANSWER)
2: "8"
3: "15"

Student selected Option 0: "3"
Correct answer Option 1: "5"
Canonical explanation: Subtracting 5 from both sides gives 3x = 15. Dividing both sides by 3 gives x = 5.

Explain why the selected answer is incorrect, why 5 is correct, and give an actionable next step.

Return only:
{"explanation":"...","nextStep":"..."}`,
    mistakeExplanationResponseSchema,
  )

  await testTask(
    "Recommendation explanation",
    `You are an encouraging adaptive learning coach for AdaptIQ.

Topic: Linear Equations (Mathematics)
Description: Solve linear equations and use equivalent operations to isolate a variable.
Recommendation category: focus
System reason: Current provisional mastery is low based on diagnostic evidence.
Suggested action: Review foundational equation-solving and complete targeted practice.
Suggested difficulty: foundational
Suggested time: 15 minutes

Explain why this topic matters, what skill the student will gain, and how to approach the session. Do not alter the recommendation.

Return only:
{"explanation":"..."}`,
    recommendationExplanationResponseSchema,
  )

  await testTask(
    "Targeted practice",
    `Create exactly 3 original foundational multiple-choice questions about Linear Equations (Mathematics).
Topic scope: Solve linear equations and use equivalent operations to isolate a variable.

Return only this JSON shape:
{"questions":[{"prompt":"Question","options":["A","B","C","D"],"correctIndex":0,"explanation":"Brief explanation"}]}

Requirements:
- Exactly 3 questions.
- Four distinct options per question.
- Exactly one correct answer per question.
- correctIndex must be 0-3.
- Prompts must be at most 220 characters.
- Options must be at most 80 characters.
- Explanations must be at most 320 characters.
- No additional fields.
- Every question must have exactly ONE defensibly correct option.
- All three distractors must be mathematically incorrect or conceptually invalid.
- Never include two equivalent operations as competing options.
- For questions asking for a solution, independently verify the correct answer by substitution.
- For questions asking about a step, ensure the wording accurately describes that step.
- Avoid ambiguous wording and multiple interpretations.
- Check every question and all four options before returning the JSON.`,
    targetedPracticeResponseSchema,
  )
}

main()
