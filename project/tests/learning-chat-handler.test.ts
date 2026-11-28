import assert from "node:assert/strict"
import { handleLearningChatRequest } from "../lib/server/learning-chat-handler"
import {
  GroqServiceError,
  type GroqGenerationOptions,
} from "../lib/server/groq-service"

function createRequest(messages: unknown, method = "POST"): Request {
  return new Request("http://localhost:3000/api/learning/chat", {
    method,
    headers: { "content-type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify({ messages }),
  })
}

async function runLearningChatHandlerTests(): Promise<void> {
  console.log("=== STARTING LEARNING CHAT HANDLER TESTS ===")

  {
    let generatedPrompt = ""
    let generationOptions: GroqGenerationOptions | undefined

    const response = await handleLearningChatRequest(
      createRequest([
        { role: "user", content: "Explain photosynthesis." },
      ]),
      {
        rateLimiter: null,
        generateText: async (prompt, options) => {
          generatedPrompt = prompt
          generationOptions = options
          return "Plants convert light into chemical energy."
        },
      },
    )

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      reply: "Plants convert light into chemical energy.",
    })
    assert.ok(generatedPrompt.includes("Student: Explain photosynthesis."))
    assert.equal(generationOptions?.jsonMode, false)
    assert.equal(generationOptions?.maxOutputTokens, 1200)
  }

  {
    let generationCalled = false
    const response = await handleLearningChatRequest(
      createRequest([
        { role: "user", content: "Explain photosynthesis." },
        { role: "assistant", content: "Plants convert light into energy." },
      ]),
      {
        rateLimiter: null,
        generateText: async () => {
          generationCalled = true
          return "Reply"
        },
      },
    )

    assert.equal(response.status, 400)
    assert.equal(generationCalled, false)
  }

  {
    const response = await handleLearningChatRequest(
      createRequest([{ role: "user", content: "Explain photosynthesis." }]),
      {
        rateLimiter: null,
        generateText: async () => {
          throw new GroqServiceError("timeout", "timeout")
        },
      },
    )

    assert.equal(response.status, 504)
  }

  console.log("=== LEARNING CHAT HANDLER TESTS PASSED ===")
}

void runLearningChatHandlerTests().catch((error: unknown) => {
  console.error("Test failure:", error)
  process.exitCode = 1
})
