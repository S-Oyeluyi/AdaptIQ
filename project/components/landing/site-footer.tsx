import { NAV_LINKS } from "./landing-config"
import { Logo } from "./logo"

export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.06]">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12 md:flex-row md:items-start md:justify-between">
        <div className="flex max-w-sm flex-col gap-4">
          <Logo />
          <p className="text-sm leading-relaxed text-muted-foreground">
            AdaptIQ is an AI-powered adaptive learning platform that turns assessment results into a clear
            understanding of your knowledge and a personalised plan for what to study next.
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-3">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="mx-auto max-w-6xl px-6 pb-10">
        <p className="text-xs text-muted-foreground">
          {"\u00A9"} {new Date().getFullYear()} AdaptIQ. Built as a university software engineering project.
        </p>
      </div>
    </footer>
  )
}
