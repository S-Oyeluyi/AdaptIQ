"use client"

import type { PointerEvent, ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"
import { EASE_OUT } from "./landing-config"

type FeatureCardProps = {
  icon: LucideIcon
  title: string
  description: string
  accent?: "cyan" | "violet"
  visual?: ReactNode
  className?: string
  visualClassName?: string
  delay?: number
}

function trackPointer(event: PointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect()
  event.currentTarget.style.setProperty("--spot-x", `${event.clientX - rect.left}px`)
  event.currentTarget.style.setProperty("--spot-y", `${event.clientY - rect.top}px`)
}

export function FeatureCard({ icon: Icon, title, description, accent = "cyan", visual, className, visualClassName, delay = 0 }: FeatureCardProps) {
  const isViolet = accent === "violet"

  return (
    <motion.article
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -80px 0px" }}
      transition={{ duration: 0.7, delay, ease: EASE_OUT }}
      onPointerMove={trackPointer}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-b from-surface-raised/60 to-surface/60 p-7 transition-[border-color,transform,box-shadow] duration-500 hover:border-white/15 hover:shadow-[0_30px_80px_-40px_rgba(34,211,238,0.35)] motion-safe:hover:-translate-y-1",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100",
          isViolet
            ? "bg-[radial-gradient(380px_circle_at_var(--spot-x,50%)_var(--spot-y,0%),rgba(167,139,250,0.12),transparent_60%)]"
            : "bg-[radial-gradient(380px_circle_at_var(--spot-x,50%)_var(--spot-y,0%),rgba(34,211,238,0.12),transparent_60%)]",
        )}
      />

      <div className="relative flex items-center gap-3">
        <span
          className={cn(
            "grid size-11 place-items-center rounded-xl border",
            isViolet
              ? "border-violet-accent/30 bg-violet-accent/10 text-violet-accent"
              : "border-cyan-accent/30 bg-cyan-accent/10 text-cyan-accent",
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <h3 className="font-display text-xl font-medium text-foreground">{title}</h3>
      </div>
      <p className="relative mt-4 max-w-md leading-relaxed text-pretty text-muted-foreground">{description}</p>

      {visual ? (
        <div className={cn("relative mt-8 flex flex-1 items-end", visualClassName)} aria-hidden="true">
          {visual}
        </div>
      ) : null}
    </motion.article>
  )
}
