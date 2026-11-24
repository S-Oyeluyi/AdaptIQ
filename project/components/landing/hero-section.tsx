"use client"

import { motion } from "motion/react"
import { ArrowRight, Sparkles } from "lucide-react"
import { CtaLink } from "./cta-link"
import { HeroVisual } from "./hero-visual"
import { EASE_OUT } from "./landing-config"

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
}

const item = {
  hidden: { opacity: 0, y: 24, filter: "blur(8px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.8, ease: EASE_OUT } },
}

export function HeroSection({ getStartedHref }: { getStartedHref: string }) {
  return (
    <section id="home" aria-labelledby="hero-title" className="relative overflow-hidden pt-32 pb-20 md:pt-40 md:pb-28">
      <HeroBackdrop />

      <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
        <motion.div variants={container} initial="hidden" animate="show" className="flex flex-col items-start gap-7">
          <motion.span
            variants={item}
            className="inline-flex items-center gap-2 rounded-full border border-cyan-accent/20 bg-cyan-accent/[0.06] px-3 py-1.5 text-xs font-medium text-cyan-accent"
          >
            <Sparkles className="size-3.5" aria-hidden="true" />
            AI-powered adaptive learning
          </motion.span>

          <motion.h1
            id="hero-title"
            variants={item}
            className="font-display text-5xl leading-[1.02] font-semibold tracking-tight text-balance text-foreground sm:text-6xl lg:text-7xl"
          >
            Learning That{" "}
            <span className="bg-gradient-to-r from-cyan-accent via-[#7dd3fc] to-violet-accent bg-clip-text text-transparent">
              Adapts
            </span>{" "}
            to You.
          </motion.h1>

          <motion.p variants={item} className="max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
            AdaptIQ analyses your assessment performance to reveal exactly where your knowledge gaps are, then helps you
            decide what to study next, so every session moves you forward.
          </motion.p>

          <motion.div variants={item} className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <CtaLink href={getStartedHref} size="lg">
              Get Started
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </CtaLink>
            <CtaLink href="#features" variant="secondary" size="lg">
              Explore Features
            </CtaLink>
          </motion.div>
        </motion.div>

        <HeroVisual />
      </div>
    </section>
  )
}

function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,black,transparent)]" />
      <div className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-cyan-accent/[0.08] blur-[120px]" />
      <div className="absolute top-40 right-[-10%] h-[420px] w-[420px] rounded-full bg-violet-accent/[0.1] blur-[120px]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background" />
    </div>
  )
}
