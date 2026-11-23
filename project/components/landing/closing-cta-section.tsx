import { ArrowRight } from "lucide-react"
import { CtaLink } from "./cta-link"
import { LogoMark } from "./logo"
import { Reveal } from "./reveal"

export function ClosingCtaSection({ getStartedHref }: { getStartedHref: string }) {
  return (
    <section aria-labelledby="cta-title" className="relative px-6 py-24 md:py-32">
      <Reveal className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-surface-raised to-surface px-6 py-16 text-center md:px-16 md:py-24">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-cyan-accent/15 blur-[100px]" />
          <div className="absolute -right-20 -bottom-32 h-72 w-72 rounded-full bg-violet-accent/15 blur-[100px]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.05)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_60%_70%_at_50%_0%,black,transparent)]" />
        </div>

        <div className="relative flex flex-col items-center gap-7">
          <LogoMark className="size-12" />
          <h2 id="cta-title" className="font-display text-4xl font-semibold tracking-tight text-balance text-foreground md:text-6xl">
            Take control of how you learn.
          </h2>
          <p className="max-w-lg text-lg leading-relaxed text-pretty text-muted-foreground">
            Start with an assessment and let AdaptIQ show you where to focus next.
          </p>
          <CtaLink href={getStartedHref} size="lg">
            Get Started
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </CtaLink>
        </div>
      </Reveal>
    </section>
  )
}
