import type {
  MistakeExplanationRequest,
  MistakeExplanationResponse,
  RecommendationExplanationRequest,
  RecommendationExplanationResponse,
  TargetedPracticeRequest,
  TargetedPracticeResponse,
  LearningAiRequest,
} from "../learning-ai-schemas"

export class LearningCoachClientError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
    readonly code: string = "CLIENT_ERROR",
  ) {
    super(message)
    this.name = "LearningCoachClientError"
  }
}

export interface ClientFetchOptions {
  signal?: AbortSignal
  fetcher?: typeof fetch
}

function parseErrorMessage(data: unknown, fallback: string): string {
  if (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof (data as Record<string, unknown>).error === "string"
  ) {
    return (data as { error: string }).error
  }
  return fallback
}

export async function sendLearningCoachRequest<T>(
  payload: LearningAiRequest,
  options: ClientFetchOptions = {},
): Promise<T> {
  const fetcher = options.fetcher ?? globalThis.fetch
  let response: Response

  try {
    response = await fetcher("/api/learning/coach", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new LearningCoachClientError(
        "Request was cancelled.",
        null,
        "ABORTED",
      )
    }
    throw new LearningCoachClientError(
      "Unable to connect to the AI Learning Coach. Please check your connection.",
      null,
      "NETWORK_ERROR",
    )
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = null
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new LearningCoachClientError(
        parseErrorMessage(
          body,
          "The AI Learning Coach is experiencing high traffic. Please wait a moment and try again.",
        ),
        429,
        "RATE_LIMITED",
      )
    }

    if (response.status === 504) {
      throw new LearningCoachClientError(
        parseErrorMessage(
          body,
          "The AI coach took too long to respond. Please try again.",
        ),
        504,
        "TIMEOUT",
      )
    }

    if (response.status === 502 || response.status === 503) {
      throw new LearningCoachClientError(
        parseErrorMessage(
          body,
          "The AI Learning Coach service is temporarily unavailable. Please try again.",
        ),
        response.status,
        "SERVICE_UNAVAILABLE",
      )
    }

    if (response.status === 400) {
      throw new LearningCoachClientError(
        parseErrorMessage(body, "Invalid learning coach request."),
        400,
        "INVALID_REQUEST",
      )
    }

    throw new LearningCoachClientError(
      parseErrorMessage(
        body,
        "An unexpected error occurred while communicating with the AI coach.",
      ),
      response.status,
      "API_ERROR",
    )
  }

  return body as T
}

export async function fetchMistakeExplanation(
  request: Omit<MistakeExplanationRequest, "task">,
  options: ClientFetchOptions = {},
): Promise<MistakeExplanationResponse> {
  return sendLearningCoachRequest<MistakeExplanationResponse>(
    {
      task: "mistake-explanation",
      ...request,
    },
    options,
  )
}

export async function fetchRecommendationExplanation(
  request: Omit<RecommendationExplanationRequest, "task">,
  options: ClientFetchOptions = {},
): Promise<RecommendationExplanationResponse> {
  return sendLearningCoachRequest<RecommendationExplanationResponse>(
    {
      task: "recommendation-explanation",
      ...request,
    },
    options,
  )
}

export async function fetchTargetedPractice(
  request: Omit<TargetedPracticeRequest, "task">,
  options: ClientFetchOptions = {},
): Promise<TargetedPracticeResponse> {
  return sendLearningCoachRequest<TargetedPracticeResponse>(
    {
      task: "targeted-practice",
      ...request,
    },
    options,
  )
}
