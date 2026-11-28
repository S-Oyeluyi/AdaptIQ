"use client"

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import {
  BookOpenText,
  Bot,
  CircleHelp,
  ClipboardList,
  Copy,
  Lightbulb,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"

type ChatRole = "user" | "assistant"
type ChatMessage = {
  id: number
  role: ChatRole
  content: string
  time: string
}

const suggestions = [
  {
    icon: CircleHelp,
    title: "Explain a difficult concept",
    description: "Make a tricky idea easier to understand.",
    prompt: "Can you explain a difficult concept in simple terms?",
  },
  {
    icon: BookOpenText,
    title: "Help me understand this topic",
    description: "Build a clear picture from the basics up.",
    prompt: "Help me understand quadratic equations from the basics.",
  },
  {
    icon: Lightbulb,
    title: "Give me practice questions",
    description: "Check what you know with a few questions.",
    prompt: "Give me some practice questions on probability.",
  },
  {
    icon: ClipboardList,
    title: "Break down a complex problem",
    description: "Work through a problem one step at a time.",
    prompt: "Break down how to solve 2x + 5 = 13, step by step.",
  },
]

function createMockResponse(prompt: string) {
  const normalized = prompt.toLowerCase()

  if (normalized.includes("practice") || normalized.includes("question")) {
    return `Let’s practise probability. Try these one at a time:

1. A fair coin is flipped. What is the probability of getting tails?
2. A fair six-sided die is rolled. What is the probability of rolling an even number?
3. A bag has 3 red and 2 blue counters. What is the probability of picking a blue counter?

Start with question 1. Think about how many outcomes you want compared with the total number of equally likely outcomes.`
  }

  if (normalized.includes("solve") || normalized.includes("problem") || normalized.includes("break down") || normalized.includes("step by step")) {
    return `Let’s solve **2x + 5 = 13** step by step.

1. **Undo the +5.** Subtract 5 from both sides: 2x = 8.
2. **Undo the multiplication by 2.** Divide both sides by 2: x = 4.
3. **Check your answer.** Substitute 4 into the original equation: 2 × 4 + 5 = 13.

So, **x = 4**. The key idea is to keep both sides balanced by doing the same operation to each.`
  }

  if (normalized.includes("photosynthesis")) {
    return `**Photosynthesis** is how plants use light energy to make sugar (glucose) from water and carbon dioxide. Think of a leaf as a tiny solar-powered food factory.

1. **Capture light:** Chlorophyll in the leaves absorbs energy from sunlight.
2. **Take in the ingredients:** Roots absorb water, and leaves take in carbon dioxide from the air.
3. **Make sugar:** The light energy helps turn water and carbon dioxide into glucose. Oxygen is released as a by-product.

A simplified word equation is:

\`\`\`text
carbon dioxide + water + light energy → glucose + oxygen
\`\`\`

The plant uses glucose for energy and growth. Want to explore where each ingredient enters the plant?`
  }

  if (normalized.includes("quadratic") || normalized.includes("topic")) {
    return `A **quadratic equation** is an equation where the highest power of the unknown is 2. Its graph makes a U-shaped curve called a parabola.

A common form is:

\`\`\`text
ax² + bx + c = 0
\`\`\`

For example, x² − 5x + 6 = 0 is quadratic because the highest power of x is 2. You can often solve one by factoring: (x − 2)(x − 3) = 0, so x = 2 or x = 3.

Would you like to try factoring one together?`
  }

  return `Let’s make the idea feel more manageable. Start by identifying the key pieces, then connect each one to something you already know.

- **Name the idea:** What is the concept trying to describe?
- **Find a simple example:** Use small, familiar numbers or a real-world situation.
- **Explain it back:** Put the idea into your own words, then notice which part still feels unclear.

Tell me the specific concept or subject you’re working on and I can tailor the explanation to it.`
}

function MessageText({ content }: { content: string }) {
  const lines = content.split("\n")
  const blocks: { type: "paragraph" | "list" | "ordered" | "code"; lines: string[] }[] = []
  let codeMode = false

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (codeMode) {
        codeMode = false
      } else {
        blocks.push({ type: "code", lines: [] })
        codeMode = true
      }
      continue
    }

    if (codeMode) {
      blocks[blocks.length - 1]?.lines.push(line)
      continue
    }

    const type = /^\s*[-*]\s/.test(line) ? "list" : /^\s*\d+\.\s/.test(line) ? "ordered" : "paragraph"
    if (line.trim() === "") continue
    const previous = blocks[blocks.length - 1]
    if (previous?.type === type && type !== "paragraph") previous.lines.push(line)
    else blocks.push({ type, lines: [line] })
  }

  const renderInline = (text: string) => text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part,
  )

  return (
    <div className="coach-message-text">
      {blocks.map((block, index) => {
        if (block.type === "code") return <pre key={index}><code>{block.lines.join("\n")}</code></pre>
        if (block.type === "list") return <ul key={index}>{block.lines.map((line, itemIndex) => <li key={itemIndex}>{renderInline(line.replace(/^\s*[-*]\s/, ""))}</li>)}</ul>
        if (block.type === "ordered") return <ol key={index}>{block.lines.map((line, itemIndex) => <li key={itemIndex}>{renderInline(line.replace(/^\s*\d+\.\s/, ""))}</li>)}</ol>
        return <p key={index}>{renderInline(block.lines.join(" "))}</p>
      })}
    </div>
  )
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

export function LearningCoachChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const nextId = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const sendMessage = (value: string) => {
    const content = value.trim()
    if (!content || isTyping) return

    const now = new Date()
    setMessages((current) => [
      ...current,
      { id: nextId.current++, role: "user", content, time: formatTime(now) },
    ])
    setDraft("")
    setIsTyping(true)

    timer.current = setTimeout(() => {
      setMessages((current) => [
        ...current,
        { id: nextId.current++, role: "assistant", content: createMockResponse(content), time: formatTime(new Date()) },
      ])
      setIsTyping(false)
      timer.current = null
    }, 950)
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    sendMessage(draft)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
      event.preventDefault()
      sendMessage(draft)
    }
  }

  const newChat = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setMessages([])
    setDraft("")
    setIsTyping(false)
    textareaRef.current?.focus()
  }

  return (
    <section className="coach-chat" aria-label="AI Learning Coach chat">
      <div className="coach-chat-heading">
        <div className="coach-chat-heading-copy">
          <div className="coach-chat-kicker"><span className="coach-ready-dot" /> Your personal AI tutor, ready to help you learn.</div>
          <p>Ask a question, explore an idea, or work through a problem together.</p>
        </div>
        <Button variant="outline" className="coach-new-chat" onClick={newChat}>
          <Plus data-icon="inline-start" /> New Chat
        </Button>
      </div>

      <div className={`coach-chat-panel ${messages.length ? "has-messages" : "is-empty"}`}>
        {messages.length === 0 ? (
          <div className="coach-empty-state">
            <div className="coach-empty-orb"><Sparkles aria-hidden="true" /></div>
            <div className="coach-empty-copy">
              <div className="coach-chat-eyebrow">A LITTLE CLARITY GOES A LONG WAY</div>
              <h2 id="coach-chat-title">What would you like to learn today?</h2>
              <p>I can explain concepts, solve problems step by step, share examples, or help you prepare for revision.</p>
            </div>
            <div className="coach-suggestions">
              {suggestions.map(({ icon: Icon, title, description, prompt }) => (
                <button key={title} className="coach-suggestion" onClick={() => sendMessage(prompt)}>
                  <span className="coach-suggestion-icon"><Icon aria-hidden="true" /></span>
                  <span className="coach-suggestion-copy"><strong>{title}</strong><span>{description}</span></span>
                  <span className="coach-suggestion-arrow" aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <MessageScrollerProvider>
            <MessageScroller className="coach-transcript">
              <MessageScrollerViewport className="coach-transcript-viewport">
                <MessageScrollerContent className="coach-transcript-content">
                  {messages.map((message) => (
                    <MessageScrollerItem key={message.id} scrollAnchor className="coach-transcript-item">
                      <Message align={message.role === "user" ? "end" : "start"} className="coach-message-row">
                        {message.role === "assistant" && (
                          <MessageAvatar className="coach-assistant-avatar"><Bot aria-hidden="true" /></MessageAvatar>
                        )}
                        <MessageContent className="coach-message-content">
                          <div className="coach-message-meta">
                            <span>{message.role === "assistant" ? "Learning Coach" : "You"}</span>
                            <time>{message.time}</time>
                          </div>
                          <Bubble align={message.role === "user" ? "end" : "start"} variant={message.role === "user" ? "muted" : "outline"} className={`coach-bubble ${message.role === "user" ? "coach-bubble-user" : "coach-bubble-assistant"}`}>
                            <BubbleContent><MessageText content={message.content} /></BubbleContent>
                          </Bubble>
                          {message.role === "assistant" && (
                            <div className="coach-message-actions" aria-label="Response actions">
                              <button type="button" aria-label="Copy response" title="Copy response"><Copy aria-hidden="true" /></button>
                              <button type="button" aria-label="Regenerate response" title="Regenerate response"><RefreshCw aria-hidden="true" /></button>
                            </div>
                          )}
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  ))}
                  {isTyping && (
                    <MessageScrollerItem scrollAnchor className="coach-transcript-item">
                      <Message className="coach-message-row">
                        <MessageAvatar className="coach-assistant-avatar"><Bot aria-hidden="true" /></MessageAvatar>
                        <MessageContent className="coach-message-content">
                          <div className="coach-message-meta"><span>Learning Coach</span><span className="coach-typing-label">Thinking</span></div>
                          <div className="coach-typing-indicator" role="status" aria-label="Learning Coach is typing"><i /><i /><i /></div>
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  )}
                </MessageScrollerContent>
              </MessageScrollerViewport>
            </MessageScroller>
          </MessageScrollerProvider>
        )}

        <form className="coach-composer" onSubmit={submit}>
          <label htmlFor="coach-prompt" className="sr-only">Ask your Learning Coach anything</label>
          <div className="coach-composer-box">
            <textarea
              ref={textareaRef}
              id="coach-prompt"
              rows={2}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask your Learning Coach anything..."
              disabled={isTyping}
            />
            <Button type="submit" className="coach-send-button" aria-label="Send message" disabled={!draft.trim() || isTyping}>
              <Send aria-hidden="true" />
            </Button>
          </div>
          <div className="coach-composer-footer">
            <span><Sparkles aria-hidden="true" /> AI responses can make mistakes. Verify important information.</span>
            <span className="coach-key-hint">Enter to send <i /> Shift + Enter for a new line</span>
          </div>
        </form>
      </div>
    </section>
  )
}
