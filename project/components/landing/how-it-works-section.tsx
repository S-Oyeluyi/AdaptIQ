import { ClipboardCheck, Fingerprint, RefreshCw } from "lucide-react"
import { Reveal } from "./reveal"
import { SectionHeading } from "./section-heading"

const steps = [
  {
    icon: ClipboardCheck,
    label: "Assess",
    title: "Complete diagnostic assessments",
    description: "Answer focused questions across your subject so AdaptIQ can gather evidence about what you know.",
  },
  {
    icon: Fingerprint,
    label: "Understand",
    title: "See your Cognitive Fingerprint",
    description: "Discover your topic-level strengths and weaknesses in a single, clear profile of your understanding.",
  },
  {
    icon: RefreshCw,
    label: "Adapt",
    title: "Follow a personalised Study Plan",
    description: "Get a plan built around your gaps that updates as new evidence from your assessments becomes available.",
  },
]

export function HowItWorksSection() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="relative py-24 md:py-32">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-1/2 h-[480px] -translate-y-1/2 bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,rgba(167,139,250,0.07),transparent)]"
      />
      <div className="relative mx-auto max-w-6xl px-6">
        <SectionHeading
          id="how-title"
          eyebrow="How it works"
          title="Three steps to studying smarter"
          description="A continuous loop: every assessment sharpens your profile, and every update sharpens your plan."
        />

        <div className="relative mt-16">
        <div
          aria-hidden="true"
          className="absolute top-[3.75rem] right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-cyan-accent/0 via-cyan-accent/40 to-violet-accent/0 md:block"
        />
        <ol className="relative grid gap-6 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.label} className="relative">
              <Reveal
                delay={index * 0.12}
                className="flex h-full flex-col items-center gap-5 rounded-3xl border border-white/[0.07] bg-surface/50 p-8 text-center backdrop-blur-sm"
              >
                <div className="relative">
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-2xl bg-cyan-accent/20 blur-xl"
                  />
                  <span className="relative grid size-14 place-items-center rounded-2xl border border-cyan-accent/30 bg-gradient-to-br from-surface-raised to-surface text-cyan-accent">
                    <step.icon className="size-6" aria-hidden="true" />
                  </span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
                    {`0${index + 1}`} <span aria-hidden="true">/</span> <span className="text-violet-accent">{step.label.toUpperCase()}</span>
                  </span>
                  <h3 className="font-display text-xl font-medium text-balance text-foreground">{step.title}</h3>
                  <p className="leading-relaxed text-pretty text-muted-foreground">{step.description}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
        </div>
      </div>
    </section>
  )
}
