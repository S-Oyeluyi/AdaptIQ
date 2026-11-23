import type { Metadata } from "next"
import { AdaptIQLanding } from "@/components/landing/adaptiq-landing"

export const metadata: Metadata = {
  title: "AdaptIQ — Learning That Adapts to You",
  description:
    "AdaptIQ analyses your assessment performance to reveal knowledge gaps and builds a personalised study plan that adapts as you learn.",
}

export default function LandingPage() {
  return <AdaptIQLanding getStartedHref="/" />
}
