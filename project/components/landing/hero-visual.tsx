"use client"

import type { ReactNode } from "react"
import { motion } from "motion/react"
import { BrainCircuit, CalendarCheck2, Crosshair, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { EASE_OUT } from "./landing-config"

const masteryRows = [
  { topic: "Linear equations", value: 86, tone: "cyan" },
  { topic: "Triangles & angles", value: 72, tone: "cyan" },
  { topic: "Probability", value: 48, tone: "violet" },
  { topic: "Data & averages", value: 64, tone: "cyan" },
] as const

const radarAxes = ["Algebra", "Geometry", "Statistics", "Ratios", "Graphs", "Reasoning"]
const radarValues = [0.86, 0.72, 0.48, 0.78, 0.6, 0.68]

function radarPoint(index: number, radius: number, center = 70) {
  const angle = (Math.PI * 2 * index) / radarAxes.length - Math.PI / 2
  return [center + Math.cos(angle) * radius, center + Math.sin(angle) * radius] as const
}

function polygon(scale: (i: number) => number) {
  return radarAxes.map((_, i) => radarPoint(i, scale(i)).join(",")).join(" ")
}

export function HeroVisual() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 1, delay: 0.35, ease: EASE_OUT }}
      className="relative mx-auto w-full max-w-xl lg:max-w-none"
      role="img"
      aria-label="Illustrative preview of the AdaptIQ dashboard showing a Cognitive Fingerprint chart, topic mastery bars and a study plan recommendation."
    >
      <div aria-hidden="true" className="absolute inset-6 rounded-[2rem] bg-gradient-to-br from-cyan-accent/20 to-violet-accent/20 blur-3xl" />

      <div className="relative rounded-3xl border border-white/10 bg-gradient-to-b from-surface-raised/80 to-surface/80 p-1.5 shadow-[0_40px_100px_-30px_rgba(0,0,0,0.8)] backdrop-blur-xl">
        <div className="rounded-[1.2rem] border border-white/[0.06] bg-[#0b1524]/90 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-white/10" />
              <span className="size-2.5 rounded-full bg-white/10" />
              <span className="size-2.5 rounded-full bg-white/10" />
            </div>
            <span className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[10px] tracking-wider text-muted-foreground">
              DASHBOARD
            </span>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-[150px_1fr]">
            <div className="rounded-2xl border border-white/[0.06] bg-surface/70 p-3">
              <p className="text-[11px] font-medium text-muted-foreground">Cognitive Fingerprint</p>
              <svg viewBox="0 0 140 140" className="mx-auto mt-1 w-full max-w-[150px]">
                <defs>
                  <linearGradient id="radar-fill" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.35" />
                  </linearGradient>
                </defs>
                {[0.33, 0.66, 1].map((ring) => (
                  <polygon key={ring} points={polygon(() => 54 * ring)} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="0.8" />
                ))}
                {radarAxes.map((axis, i) => {
                  const [x, y] = radarPoint(i, 54)
                  return <line key={axis} x1="70" y1="70" x2={x} y2={y} stroke="rgba(148,163,184,0.12)" strokeWidth="0.8" />
                })}
                <motion.polygon
                  points={polygon((i) => 54 * radarValues[i])}
                  fill="url(#radar-fill)"
                  stroke="#22d3ee"
                  strokeWidth="1.4"
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 1.1, delay: 0.8, ease: EASE_OUT }}
                  style={{ transformOrigin: "70px 70px" }}
                />
                {radarAxes.map((axis, i) => {
                  const [x, y] = radarPoint(i, 54 * radarValues[i])
                  return <circle key={axis} cx={x} cy={y} r="2.2" fill="#f1f5f9" />
                })}
              </svg>
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-surface/70 p-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium text-muted-foreground">Topic mastery</p>
                <TrendingUp className="size-3.5 text-cyan-accent" aria-hidden="true" />
              </div>
              <ul className="mt-3 flex flex-col gap-3">
                {masteryRows.map((row, index) => (
                  <li key={row.topic} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-foreground/90">{row.topic}</span>
                      <span className="font-mono text-muted-foreground">{row.value}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <motion.div
                        className={cn(
                          "h-full rounded-full",
                          row.tone === "violet"
                            ? "bg-gradient-to-r from-violet-accent/70 to-violet-accent"
                            : "bg-gradient-to-r from-cyan-accent/60 to-cyan-accent",
                        )}
                        initial={{ width: 0 }}
                        animate={{ width: `${row.value}%` }}
                        transition={{ duration: 1.2, delay: 0.9 + index * 0.1, ease: EASE_OUT }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-cyan-accent/15 bg-gradient-to-r from-cyan-accent/[0.07] to-transparent p-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cyan-accent/10 text-cyan-accent">
              <CalendarCheck2 className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground">Next in your study plan</p>
              <p className="truncate text-sm font-medium text-foreground">Probability: independent events</p>
            </div>
            <span className="hidden rounded-full bg-cyan-accent px-3 py-1 text-[11px] font-semibold text-[#061119] sm:inline">
              Start
            </span>
          </div>
        </div>
      </div>

      <FloatingCard className="-top-6 -left-4 sm:-left-10" delay={1.1} duration={6}>
        <span className="grid size-9 place-items-center rounded-xl bg-violet-accent/15 text-violet-accent">
          <Crosshair className="size-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-[11px] text-muted-foreground">Knowledge gap found</p>
          <p className="text-sm font-medium text-foreground">Probability</p>
        </div>
      </FloatingCard>

      <FloatingCard className="-right-3 -bottom-8 sm:-right-8" delay={1.3} duration={7}>
        <MasteryRing value={86} />
        <div>
          <p className="text-[11px] text-muted-foreground">Topic mastery</p>
          <p className="text-sm font-medium text-foreground">Linear equations</p>
        </div>
      </FloatingCard>

      <FloatingCard className="-top-12 -right-6 hidden xl:flex" delay={1.5} duration={8}>
        <span className="grid size-9 place-items-center rounded-xl bg-cyan-accent/10 text-cyan-accent">
          <BrainCircuit className="size-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-[11px] text-muted-foreground">Study plan</p>
          <p className="text-sm font-medium text-foreground">Updated just now</p>
        </div>
      </FloatingCard>
    </motion.div>
  )
}

function FloatingCard({
  children,
  className,
  delay,
  duration,
}: {
  children: ReactNode
  className?: string
  delay: number
  duration: number
}) {
  return (
    <motion.div
      aria-hidden="true"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay, ease: EASE_OUT }}
      className={cn("absolute z-10 flex", className)}
    >
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration, repeat: Infinity, ease: "easeInOut", delay }}
        className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#101d2b]/80 py-2.5 pr-4 pl-2.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

function MasteryRing({ value }: { value: number }) {
  const circumference = 2 * Math.PI * 15
  return (
    <span className="relative grid size-9 place-items-center">
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
        <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          stroke="#22d3ee"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
        />
      </svg>
      <span className="font-mono text-[9px] font-semibold text-foreground">{value}</span>
    </span>
  )
}
