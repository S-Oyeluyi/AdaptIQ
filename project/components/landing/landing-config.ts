/**
 * Destination for every "Get Started" button on the landing page.
 * Change this (or pass `getStartedHref` to <AdaptIQLanding />) when the
 * dashboard moves to a different route during integration.
 */
export const DEFAULT_GET_STARTED_HREF = "/"

export const NAV_LINKS = [
  { label: "Home", href: "#home" },
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "About", href: "#about" },
] as const

export const EASE_OUT = [0.22, 1, 0.36, 1] as const
