"use client"

import { Inter, Sora } from "next/font/google"
import { MotionConfig } from "motion/react"
import { cn } from "@/lib/utils"
import { ClosingCtaSection } from "./closing-cta-section"
import { FeaturesSection } from "./features-section"
import { HeroSection } from "./hero-section"
import { HowItWorksSection } from "./how-it-works-section"
import { DEFAULT_GET_STARTED_HREF } from "./landing-config"
import { ProblemSection } from "./problem-section"
import { SiteFooter } from "./site-footer"
import { SiteNav } from "./site-nav"

const sans = Inter({ subsets: ["latin"], variable: "--font-landing-sans", display: "swap" })
const display = Sora({ subsets: ["latin"], variable: "--font-landing-display", display: "swap" })

export type AdaptIQLandingProps = {
  /** Where every "Get Started" button navigates. Defaults to the dashboard route. */
  getStartedHref?: string
  className?: string
}

export function AdaptIQLanding({ getStartedHref = DEFAULT_GET_STARTED_HREF, className }: AdaptIQLandingProps) {
  return (
    <MotionConfig reducedMotion="user">
      <div
        className={cn(
          "adaptiq-landing relative min-h-screen overflow-x-clip bg-background font-landing text-foreground",
          sans.variable,
          display.variable,
          className,
        )}
      >
        <SiteNav getStartedHref={getStartedHref} />
        <main>
          <HeroSection getStartedHref={getStartedHref} />
          <ProblemSection />
          <HowItWorksSection />
          <FeaturesSection />
          <ClosingCtaSection getStartedHref={getStartedHref} />
        </main>
        <SiteFooter />
      </div>
    </MotionConfig>
  )
}

export default AdaptIQLanding
