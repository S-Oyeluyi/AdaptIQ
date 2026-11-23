import { Bot, CalendarRange, Fingerprint, Target } from "lucide-react"
import { FeatureCard } from "./feature-card"
import { SectionHeading } from "./section-heading"

const fingerprintTopics = [
  { label: "Algebra", value: 82 },
  { label: "Geometry", value: 68 },
  { label: "Statistics", value: 41 },
  { label: "Ratios", value: 74 },
  { label: "Graphs", value: 57 },
  { label: "Reasoning", value: 63 },
]

export function FeaturesSection() {
  return (
    <section id="features" aria-labelledby="features-title" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          id="features-title"
          eyebrow="Features"
          title="Everything you need to learn with intent"
          description="Four connected tools that turn assessment results into a clear, personal path forward."
        />

        <div className="mt-16 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            className="lg:col-span-2"
            icon={Fingerprint}
            title="Cognitive Fingerprint"
            description="A topic-by-topic profile of your understanding, built from your assessment evidence. See strengths and weaknesses at a glance."
            visual={<FingerprintVisual />}
          />
          <FeatureCard
            delay={0.08}
            icon={CalendarRange}
            accent="violet"
            title="Adaptive Study Plan"
            description="A prioritised plan focused on your gaps, refreshed whenever new results come in."
            visual={<StudyPlanVisual />}
          />
          <FeatureCard
            delay={0.04}
            icon={Bot}
            accent="violet"
            title="AI Learning Coach"
            description="Ask questions and get explanations of why a topic was recommended and how to approach it."
            visual={<CoachVisual />}
          />
          <FeatureCard
            className="md:self-start lg:col-span-2"
            visualClassName="mt-6 flex-none"
            delay={0.12}
            icon={Target}
            title="Targeted Practice"
            description="Practise exactly where it matters. Questions are focused on the topics your profile shows need the most attention."
            visual={<PracticeVisual />}
          />
        </div>
      </div>
    </section>
  )
}

function FingerprintVisual() {
  return (
    <div className="grid w-full grid-cols-6 items-end gap-2 sm:gap-3">
      {fingerprintTopics.map((topic) => (
        <div key={topic.label} className="flex flex-col items-center gap-2">
          <div className="flex h-28 w-full items-end overflow-hidden rounded-lg bg-white/[0.03]">
            <div
              className={
                topic.value < 50
                  ? "w-full rounded-lg bg-gradient-to-t from-violet-accent/20 to-violet-accent/70"
                  : "w-full rounded-lg bg-gradient-to-t from-cyan-accent/15 to-cyan-accent/70"
              }
              style={{ height: `${topic.value}%` }}
            />
          </div>
          <span className="truncate text-[10px] text-muted-foreground sm:text-xs">{topic.label}</span>
        </div>
      ))}
    </div>
  )
}

function StudyPlanVisual() {
  const items = [
    { label: "Probability basics", state: "Focus" },
    { label: "Scatter graphs", state: "Next" },
    { label: "Area & perimeter", state: "Review" },
  ]
  return (
    <ul className="flex w-full flex-col gap-2">
      {items.map((item, index) => (
        <li
          key={item.label}
          className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-background/40 px-3 py-2.5 text-sm"
        >
          <span className="flex items-center gap-2.5 text-foreground/90">
            <span className={index === 0 ? "size-1.5 rounded-full bg-violet-accent" : "size-1.5 rounded-full bg-white/20"} />
            {item.label}
          </span>
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">{item.state}</span>
        </li>
      ))}
    </ul>
  )
}

function CoachVisual() {
  return (
    <div className="flex w-full flex-col gap-2 text-sm">
      <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-surface-raised px-3.5 py-2.5 text-foreground/90">
        Why should I study probability next?
      </p>
      <p className="max-w-[90%] rounded-2xl rounded-bl-md border border-violet-accent/20 bg-violet-accent/[0.08] px-3.5 py-2.5 text-foreground/90">
        Your recent results show it as your weakest topic, and it builds on skills you already have.
      </p>
    </div>
  )
}

function PracticeVisual() {
  const options = ["1/2", "1/4", "1/6", "1/12"]
  return (
    <div className="flex w-full flex-col gap-4 rounded-2xl border border-white/[0.06] bg-background/40 p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] tracking-wider text-cyan-accent uppercase">Probability</span>
        <span className="text-sm text-foreground/90">A fair die is rolled. What is P(rolling a 4)?</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {options.map((option) => (
          <span
            key={option}
            className={
              option === "1/6"
                ? "rounded-lg border border-cyan-accent/50 bg-cyan-accent/10 px-3 py-2 text-center font-mono text-sm text-cyan-accent"
                : "rounded-lg border border-white/10 px-3 py-2 text-center font-mono text-sm text-muted-foreground"
            }
          >
            {option}
          </span>
        ))}
      </div>
    </div>
  )
}
