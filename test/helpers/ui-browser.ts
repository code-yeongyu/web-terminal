import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type Browser, type BrowserContext, chromium, devices, type Page } from "playwright"
import { startServer } from "../../src/server/index.ts"

const PASSWORD = "qa-password-123"

export type UiFixture = {
  readonly base: string
  readonly browser: Browser
  readonly close: () => Promise<void>
  readonly sampleFile: string
}

export type OpenedUi = {
  readonly context: BrowserContext
  readonly page: Page
}

export type UiSnapshot = {
  readonly buttonRadii: readonly number[]
  readonly colors: {
    readonly ansiRed: string | undefined
    readonly canvas: string
    readonly chrome: string
    readonly terminal: string
  }
  readonly expanded: string | null
  readonly fontSize: number
  readonly overflow: number
  readonly sessionId: string | undefined
  readonly sidebarHidden: boolean
  readonly sidebarRadius: number
  readonly sidebarWidth: number
  readonly tabRadius: number
  readonly terminalBottom: number
  readonly terminalWidth: number
  readonly toolbarCount: number
  readonly toolbarTop: number | null
  readonly tokens: {
    readonly none: string
    readonly overlay: string
    readonly sm: string
    readonly xs: string
  }
}

export type VisualViewportState = {
  readonly height: number
  readonly offsetTop: number
}

export async function createUiFixture(): Promise<UiFixture> {
  const root = await mkdtemp(join(tmpdir(), "web-terminal-ui-"))
  const sampleFile = "qa-file.txt"
  await writeFile(join(root, sampleFile), "hello from browser QA\n")
  const server = await startServer({
    WT_FILES_ROOT: root,
    WT_HERDR_ATTACH: "0",
    WT_HERDR_SOCKET: join(root, "no-herdr.sock"),
    WT_PASSWORD: PASSWORD,
    WT_PORT: "0",
  })
  const browser = await chromium.launch({ headless: true })
  let closed = false

  return {
    base: `http://127.0.0.1:${server.port}`,
    browser,
    sampleFile,
    close: async () => {
      if (closed) return
      closed = true
      await browser.close()
      server.stopAll(true)
      await rm(root, { force: true, recursive: true })
    },
  }
}

export async function openUi(
  fixture: UiFixture,
  mode: "desktop" | "mobile",
  visualViewport?: VisualViewportState,
  beforeGoto?: (page: Page) => Promise<void>,
): Promise<OpenedUi> {
  const context =
    mode === "mobile"
      ? await fixture.browser.newContext({
          ...devices["iPhone 13"],
          hasTouch: true,
          viewport: { height: 844, width: 390 },
        })
      : await fixture.browser.newContext({
          viewport: { height: 1000, width: 1440 },
        })

  await context.addInitScript(() => {
    localStorage.removeItem("wt:font-size")
    localStorage.removeItem("wt:session-id")
  })
  if (visualViewport !== undefined) {
    await context.addInitScript((initial) => {
      const viewport = new EventTarget()
      const state = {
        height: initial.height,
        offsetLeft: 0,
        offsetTop: initial.offsetTop,
        pageLeft: 0,
        pageTop: initial.offsetTop,
        scale: 1,
        width: window.innerWidth,
      }
      for (const [key, value] of Object.entries(state)) Reflect.set(viewport, key, value)
      Reflect.defineProperty(window, "visualViewport", {
        configurable: true,
        value: viewport,
      })
      Reflect.set(globalThis, "__setVisualViewport", (next: VisualViewportState) => {
        Reflect.set(viewport, "height", next.height)
        Reflect.set(viewport, "offsetTop", next.offsetTop)
        Reflect.set(viewport, "pageTop", next.offsetTop)
        viewport.dispatchEvent(new Event("resize"))
        viewport.dispatchEvent(new Event("scroll"))
      })
    }, visualViewport)
  }

  const page = await context.newPage()
  await beforeGoto?.(page)
  await page.goto(fixture.base)
  await page.locator("#password").fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.locator(".terminal canvas").waitFor()
  await page.waitForFunction(() => {
    const app = Reflect.get(globalThis, "__wt")
    if (typeof app !== "object" || app === null) return false
    const terminal = Reflect.get(app, "terminal")
    if (typeof terminal !== "object" || terminal === null) return false
    return Number(Reflect.get(terminal, "cols")) > 0 && Number(Reflect.get(terminal, "rows")) > 0
  })

  return { context, page }
}

export async function setVisualViewport(page: Page, state: VisualViewportState): Promise<void> {
  await page.evaluate((next) => {
    const update = Reflect.get(globalThis, "__setVisualViewport")
    if (typeof update !== "function") throw new TypeError("visual viewport hook is unavailable")
    Reflect.apply(update, undefined, [next])
  }, state)
}

export async function uiSnapshot(page: Page): Promise<UiSnapshot> {
  return page.evaluate(() => {
    const app = Reflect.get(globalThis, "__wt")
    if (typeof app !== "object" || app === null) throw new TypeError("terminal app is unavailable")
    const terminalApp = Reflect.get(app, "terminal")
    if (typeof terminalApp !== "object" || terminalApp === null)
      throw new TypeError("terminal instance is unavailable")
    const options = Reflect.get(terminalApp, "options")
    if (typeof options !== "object" || options === null)
      throw new TypeError("terminal options are unavailable")
    const connection = Reflect.get(app, "connection")
    const sessionId =
      typeof connection === "object" && connection !== null
        ? Reflect.get(connection, "sessionId")
        : undefined
    const theme = Reflect.get(options, "theme")
    const ansiRed =
      typeof theme === "object" && theme !== null ? Reflect.get(theme, "red") : undefined

    const terminal = document.querySelector(".terminal")
    const sidebar = document.querySelector(".sidebar")
    const tab = document.querySelector(".tab")
    const toolbar = document.querySelector('[role="toolbar"]')
    const toggle = document.querySelector('[aria-label="Toggle panel"]')
    const topbar = document.querySelector(".topbar")
    if (
      !(terminal instanceof HTMLElement) ||
      !(sidebar instanceof HTMLElement) ||
      !(topbar instanceof HTMLElement)
    ) {
      throw new TypeError("app shell did not render")
    }

    const radius = (element: Element): number =>
      Number.parseFloat(getComputedStyle(element).borderStartStartRadius) || 0
    const visibleButtons = Array.from(document.querySelectorAll("button")).filter(
      (button) => button.getClientRects().length > 0,
    )
    const rootStyle = getComputedStyle(document.documentElement)
    const terminalRect = terminal.getBoundingClientRect()
    const toolbarRect = toolbar instanceof HTMLElement ? toolbar.getBoundingClientRect() : undefined

    return {
      buttonRadii: visibleButtons.map(radius),
      colors: {
        ansiRed: typeof ansiRed === "string" ? ansiRed.toLowerCase() : undefined,
        canvas: getComputedStyle(document.body).backgroundColor,
        chrome: getComputedStyle(topbar).backgroundColor,
        terminal: getComputedStyle(terminal).backgroundColor,
      },
      expanded: toggle?.getAttribute("aria-expanded") ?? null,
      fontSize: Number(Reflect.get(options, "fontSize")),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      sessionId: typeof sessionId === "string" ? sessionId : undefined,
      sidebarHidden: sidebar.hasAttribute("hidden"),
      sidebarRadius: radius(sidebar),
      sidebarWidth: sidebar.getBoundingClientRect().width,
      tabRadius: tab instanceof HTMLElement ? radius(tab) : 0,
      terminalBottom: terminalRect.bottom,
      terminalWidth: terminalRect.width,
      toolbarCount: document.querySelectorAll('[role="toolbar"]').length,
      toolbarTop: toolbarRect?.top ?? null,
      tokens: {
        none: rootStyle.getPropertyValue("--radius-none").trim(),
        overlay: rootStyle.getPropertyValue("--radius-overlay").trim(),
        sm: rootStyle.getPropertyValue("--radius-sm").trim(),
        xs: rootStyle.getPropertyValue("--radius-xs").trim(),
      },
    }
  })
}
