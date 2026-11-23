"use client"

import { useState } from "react"
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react"
import { ArrowRight, Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { CtaLink } from "./cta-link"
import { EASE_OUT, NAV_LINKS } from "./landing-config"
import { Logo } from "./logo"

export function SiteNav({ getStartedHref }: { getStartedHref: string }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const { scrollY } = useScroll()

  useMotionValueEvent(scrollY, "change", (value) => setScrolled(value > 12))

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4">
      <nav
        aria-label="Primary"
        className={cn(
          "mx-auto flex max-w-6xl items-center justify-between rounded-2xl border px-3 py-2.5 transition-all duration-500 md:px-4",
          scrolled || open
            ? "border-white/10 bg-[#0b1422]/75 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.6)] backdrop-blur-xl"
            : "border-transparent bg-transparent",
        )}
      >
        <a href="#home" className="rounded-lg" aria-label="AdaptIQ home">
          <Logo />
        </a>

        <ul className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="rounded-full px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <CtaLink href={getStartedHref} size="sm" className="hidden sm:inline-flex">
            Get Started
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </CtaLink>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-foreground md:hidden"
          >
            {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open ? (
          <motion.div
            id="mobile-nav"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
            className="mx-auto mt-2 max-w-6xl rounded-2xl border border-white/10 bg-[#0b1422]/90 p-3 backdrop-blur-xl md:hidden"
          >
            <ul className="flex flex-col">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-xl px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <CtaLink href={getStartedHref} className="mt-2 w-full">
              Get Started
              <ArrowRight className="size-4" aria-hidden="true" />
            </CtaLink>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  )
}
