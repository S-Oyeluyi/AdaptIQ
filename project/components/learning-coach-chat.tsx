"use client"

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import {
  BookOpenText,
  Bot,
  Check,
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

const MAX_HISTORY_MESSAGES = 12
const CHAT_ENDPOINT = "/api/learning/chat"

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const nextId = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => () => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
  }, [])

  const requestAssistantReply = async (
    conversation: ChatMessage[],
    replaceMessageId?: number,
  ) => {
    if (abortControllerRef.current) return

    const controller = new AbortController()
    abortControllerRef.current = controller
    setIsTyping(true)
    setErrorMessage(null)

    try {
      const recentMessages = conversation
        .slice(-MAX_HISTORY_MESSAGES)
        .map(({ role, content }) => ({ role, content }))

      const response = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: recentMessages }),
        signal: controller.signal,
      })

      let data: { reply?: unknown; error?: unknown } | null = null
      try {
        data = (await response.json()) as { reply?: unknown; error?: unknown }
      } catch {
        data = null
      }

      if (controller.signal.aborted) return

      if (!response.ok) {
        const serverError =
          typeof data?.error === "string" && data.error.trim().length > 0
            ? data.error
            : "Unable to get a response from the Learning Coach. Please try again."
        setErrorMessage(serverError)
        return
      }

      if (typeof data?.reply !== "string" || data.reply.trim().length === 0) {
        setErrorMessage("The Learning Coach returned an empty response. Please try again.")
        return
      }

      const reply = data.reply
      const newMessage: ChatMessage = {
        id: nextId.current++,
        role: "assistant",
        content: reply,
        time: formatTime(new Date()),
      }

      if (replaceMessageId !== undefined) {
        // Regenerate: replace the target assistant message and drop everything after it.
        // Only applied on success so the original conversation is preserved on failure.
        setMessages((current) => {
          const targetIndex = current.findIndex((m) => m.id === replaceMessageId)
          if (targetIndex === -1) return [...current, newMessage]
          return [...current.slice(0, targetIndex), newMessage]
        })
      } else {
        setMessages((current) => [...current, newMessage])
      }
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        return
      }
      setErrorMessage("Network error while contacting the Learning Coach. Please check your connection and try again.")
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
        setIsTyping(false)
      }
    }
  }

  const sendMessage = (value: string) => {
    const content = value.trim()
    if (!content || isTyping || abortControllerRef.current) return

    const userMessage: ChatMessage = {
      id: nextId.current++,
      role: "user",
      content,
      time: formatTime(new Date()),
    }
    const updatedConversation = [...messages, userMessage]

    setMessages(updatedConversation)
    setDraft("")
    void requestAssistantReply(updatedConversation)
  }

  const regenerateResponse = (assistantMessageId: number) => {
    if (isTyping || abortControllerRef.current) return

    const targetIndex = messages.findIndex(
      (message) => message.id === assistantMessageId && message.role === "assistant",
    )
    if (targetIndex <= 0) return

    // Pass the conversation up to (but not including) the target message,
    // and the message ID so the response handler can replace it on success.
    const conversationBeforeTarget = messages.slice(0, targetIndex)
    void requestAssistantReply(conversationBeforeTarget, assistantMessageId)
  }

  const handleCopy = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopiedId(message.id)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => {
        setCopiedId((current) => (current === message.id ? null : current))
      }, 2000)
    } catch {
      setErrorMessage("Unable to copy message to clipboard.")
    }
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
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setMessages([])
    setDraft("")
    setErrorMessage(null)
    setCopiedId(null)
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
                              <button
                                type="button"
                                aria-label={copiedId === message.id ? "Copied response" : "Copy response"}
                                title={copiedId === message.id ? "Copied" : "Copy response"}
                                onClick={() => void handleCopy(message)}
                              >
                                {copiedId === message.id ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                              </button>
                              <button
                                type="button"
                                aria-label="Regenerate response"
                                title="Regenerate response"
                                disabled={isTyping}
                                onClick={() => regenerateResponse(message.id)}
                              >
                                <RefreshCw aria-hidden="true" />
                              </button>
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
          {errorMessage && (
            <div className="eval-error-box" role="alert">
              {errorMessage}
            </div>
          )}
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
