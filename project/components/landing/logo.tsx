import { cn } from "@/lib/utils"

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-9 place-items-center rounded-xl border border-cyan-accent/25 bg-gradient-to-br from-[#163346] to-[#101a2a] text-cyan-accent shadow-[inset_0_0_15px_rgba(34,211,238,0.08)]",
        className,
      )}
    >
      <svg viewBox="0 0 30 30" fill="none" aria-hidden="true" className="size-6">
        <path d="M15 4.5 5 23h8l2-4 2 4h8L15 4.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <circle cx="15" cy="13" r="2.2" fill="currentColor" />
        <path
          d="M15 15.2v3.4M9.7 19.5l3.2-2M20.3 19.5l-3.2-2"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-display text-lg font-semibold tracking-tight text-foreground">
        Adapt<span className="text-cyan-accent">IQ</span>
      </span>
    </span>
  )
}
