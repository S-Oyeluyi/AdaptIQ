import { handleLearningCoachRequest } from "../../../../lib/server/learning-coach-handler"

export const maxDuration = 60

export async function POST(request: Request): Promise<Response> {
  return handleLearningCoachRequest(request)
}
