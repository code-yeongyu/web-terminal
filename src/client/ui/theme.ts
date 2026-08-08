const MOBILE_BREAKPOINT_PX = 768

export function isMobile(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT_PX
}

export function terminalFontSize(): number {
  const stored = Number(localStorage.getItem("wt:font-size"))
  if (Number.isFinite(stored) && stored >= 8 && stored <= 24) return stored
  return isMobile() ? 13 : 14
}

/** DESIGN.md 2.2-2.3: accessible ANSI palette on the sunken terminal surface. */
export const terminalTheme = {
  background: "#050607",
  foreground: "#D6DAE0",
  cursor: "#5AB2FF",
  cursorAccent: "#050607",
  selectionBackground: "rgba(90, 178, 255, 0.30)",
  selectionForeground: "#F2F3F5",
  selectionInactiveBackground: "rgba(255, 255, 255, 0.12)",
  scrollbarSliderBackground: "rgba(255, 255, 255, 0.14)",
  scrollbarSliderHoverBackground: "rgba(255, 255, 255, 0.22)",
  scrollbarSliderActiveBackground: "rgba(255, 255, 255, 0.30)",
  black: "#15181B",
  red: "#F4736F",
  green: "#5FD68A",
  yellow: "#E7B455",
  blue: "#6AABF0",
  magenta: "#C79AF0",
  cyan: "#5FC9D6",
  white: "#C3C8CE",
  brightBlack: "#787F87",
  brightRed: "#FF9490",
  brightGreen: "#88E9AA",
  brightYellow: "#F7CE7A",
  brightBlue: "#93C6F7",
  brightMagenta: "#DCBBF8",
  brightCyan: "#8CDEE8",
  brightWhite: "#F2F3F5",
} as const

/** Mirrors the design contract's terminal font-family / default font-size. */
export const GHOSTTY_FONT_FAMILY = '"GeistMono", ui-monospace, Menlo, monospace'
export const GHOSTTY_FONT_SIZE_PX = 14
export const GHOSTTY_CURSOR_STYLE = "block" as const
export const GHOSTTY_CURSOR_BLINK = true
