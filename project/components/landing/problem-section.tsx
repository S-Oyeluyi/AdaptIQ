import { CircleHelp, Copy, EyeOff } from "lucide-react"
import { Reveal } from "./reveal"
import { SectionHeading } from "./section-heading"

const painPoints = [
  {
    icon: Copy,
    title: "Same material for everyone",
    description: "Generic courses move every student through identical content, regardless of what they already know.",
  },
  {
    icon: EyeOff,
    title: "Scores without insight",
    description: "A single mark tells you how you did, but not which topics are holding you back.",
  },
  {
    icon: CircleHelp,
    title: "Guessing what to revise",
    description: "Without clear direction, study time drifts toward comfortable topics instead of real gaps.",
  },
]

export function ProblemSection() {
  return (
    <section id="about" aria-labelledby="problem-title" className="relative py-24 md:py-32">
      <div className="mx-auto grid max-w-6xl gap-14 px-6 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
        <div className="flex flex-col gap-6 lg:sticky lg:top-32 lg:self-start">
          <SectionHeading
            id="problem-title"
            align="left"
            eyebrow="Why AdaptIQ"
            title={
              <>
                Generic learning leaves <span className="text-muted-foreground">individual gaps</span> behind.
              </>
            }
            description="Every learner has a different mix of strengths and blind spots. When study is one-size-fits-all, those blind spots quietly stay put. AdaptIQ was built to make them visible and actionable."
          />
        </div>

        <ul className="flex flex-col gap-4">
          {painPoints.map((point, index) => (
            <li key={point.title}>
              <Reveal
                delay={index * 0.08}
                className="flex gap-5 rounded-2xl border border-white/[0.07] bg-gradient-to-br from-surface/80 to-surface/30 p-6 transition-colors duration-300 hover:border-white/15"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-surface-raised text-muted-foreground">
                  <point.icon className="size-5" aria-hidden="true" />
                </span>
                <div className="flex flex-col gap-1.5">
                  <h3 className="font-display text-lg font-medium text-foreground">{point.title}</h3>
                  <p className="leading-relaxed text-muted-foreground">{point.description}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
