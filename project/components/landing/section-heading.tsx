import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Reveal } from "./reveal"

type SectionHeadingProps = {
  eyebrow: string
  title: ReactNode
  description?: ReactNode
  align?: "left" | "center"
  id?: string
}

export function SectionHeading({ eyebrow, title, description, align = "center", id }: SectionHeadingProps) {
  return (
    <Reveal className={cn("flex max-w-2xl flex-col gap-4", align === "center" && "mx-auto items-center text-center")}>
      <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-cyan-accent">
        <span className="h-px w-6 bg-gradient-to-r from-transparent to-cyan-accent" aria-hidden="true" />
        {eyebrow}
      </span>
      <h2 id={id} className="font-display text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl md:text-5xl">
        {title}
      </h2>
      {description ? <p className="text-base leading-relaxed text-pretty text-muted-foreground md:text-lg">{description}</p> : null}
    </Reveal>
  )
}
