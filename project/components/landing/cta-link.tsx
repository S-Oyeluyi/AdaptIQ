import Link from "next/link"
import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

type CtaLinkProps = ComponentProps<typeof Link> & {
  variant?: "primary" | "secondary"
  size?: "sm" | "md" | "lg"
}

const sizes = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-base",
}

const variants = {
  primary:
    "bg-cyan-accent text-[#061119] shadow-[0_0_0_1px_rgba(34,211,238,0.4),0_8px_30px_-8px_rgba(34,211,238,0.55)] hover:bg-[#5ee3f5] hover:shadow-[0_0_0_1px_rgba(34,211,238,0.6),0_10px_40px_-8px_rgba(34,211,238,0.7)]",
  secondary:
    "border border-white/10 bg-white/[0.03] text-foreground backdrop-blur-md hover:border-white/20 hover:bg-white/[0.07]",
}

export function CtaLink({ variant = "primary", size = "md", className, children, ...props }: CtaLinkProps) {
  return (
    <Link
      className={cn(
        "group inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-accent motion-safe:active:scale-[0.98]",
        sizes[size],
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  )
}
