import type { Metadata } from "next"
import AdaptIQDashboard from "@/components/adaptiq-dashboard"

export const metadata: Metadata = {
  title: "AdaptIQ Dashboard — Learning Space",
  description:
    "Your personalised learning space with diagnostic assessments, Cognitive Fingerprint, and adaptive study recommendations.",
}

export default function DashboardPage() {
  return <AdaptIQDashboard />
}
