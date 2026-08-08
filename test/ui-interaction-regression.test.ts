import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import {
  createUiFixture,
  openUi,
  setVisualViewport,
  type UiFixture,
  uiSnapshot,
} from "./helpers/ui-browser.ts"

let fixture: UiFixture

beforeAll(async () => {
  fixture = await createUiFixture()
})

afterAll(async () => {
  await fixture.close()
})

describe("UI interaction preservation", () => {
  test("desktop panel visibility and disclosure state stay synchronized", async () => {
    const { context, page } = await openUi(fixture, "desktop")
    const toggle = page.getByLabel("Toggle panel")

    try {
      const initial = await uiSnapshot(page)
      expect(initial.sidebarHidden).toBe(false)
      expect(initial.expanded).toBe("true")

      await toggle.click()
      const collapsed = await uiSnapshot(page)
      expect(collapsed.sidebarHidden).toBe(true)
      expect(collapsed.expanded).toBe("false")
      expect(collapsed.terminalWidth).toBeGreaterThan(initial.terminalWidth)
      expect(collapsed.sessionId).toBe(initial.sessionId)

      await toggle.click()
      const reopened = await uiSnapshot(page)
      expect(reopened.sidebarHidden).toBe(false)
      expect(reopened.expanded).toBe("true")
      expect(reopened.terminalWidth).toBe(initial.terminalWidth)
      expect(reopened.sessionId).toBe(initial.sessionId)
    } finally {
      await context.close()
    }
  })

  test("mobile drawer exposes its own header, tabpanel, and close control", async () => {
    const { context, page } = await openUi(fixture, "mobile")
    const toggle = page.getByLabel("Toggle panel")

    try {
      await toggle.tap()
      const drawer = page.locator('.drawer[role="dialog"][aria-modal="true"]')
      await drawer.waitFor()

      const geometry = await page.evaluate(() => {
        const header = document.querySelector(".drawer .sidebar__header")
        const topbar = document.querySelector(".topbar")
        const panel = document.querySelector("#sidebar-panel")
        const terminal = document.querySelector(".terminal")
        if (
          !(header instanceof HTMLElement) ||
          !(topbar instanceof HTMLElement) ||
          !(panel instanceof HTMLElement)
        ) {
          throw new TypeError("drawer geometry is unavailable")
        }
        const headerRect = header.getBoundingClientRect()
        const topbarRect = topbar.getBoundingClientRect()
        return {
          expanded: document
            .querySelector('[aria-label="Toggle panel"]')
            ?.getAttribute("aria-expanded"),
          focusInside: drawerContainsFocus(),
          headerTop: headerRect.top,
          panelRole: panel.getAttribute("role"),
          terminalInert: terminal?.hasAttribute("inert"),
          topbarBottom: topbarRect.bottom,
        }

        function drawerContainsFocus(): boolean {
          const currentDrawer = document.querySelector(".drawer")
          return (
            currentDrawer instanceof HTMLElement && currentDrawer.contains(document.activeElement)
          )
        }
      })

      expect(geometry.expanded).toBe("true")
      expect(geometry.headerTop).toBeGreaterThanOrEqual(geometry.topbarBottom)
      expect(geometry.panelRole).toBe("tabpanel")
      expect(geometry.terminalInert).toBe(true)
      expect(geometry.focusInside).toBe(true)

      await page.getByLabel("Close panel").tap()
      await page.locator(".overlay").waitFor({ state: "detached" })
      expect(await toggle.getAttribute("aria-expanded")).toBe("false")
      expect(await toggle.evaluate((node) => node === document.activeElement)).toBe(true)
    } finally {
      await context.close()
    }
  })

  test("opening an overlay resets locked modifiers without changing keybar height", async () => {
    const { context, page } = await openUi(fixture, "mobile")
    const ctrl = page.getByRole("button", { name: "Ctrl" })

    try {
      const before = await page.locator('[role="toolbar"]').boundingBox()
      await ctrl.tap()
      await ctrl.tap()
      expect(await ctrl.getAttribute("data-locked")).toBe("true")

      const armed = await page.locator('[role="toolbar"]').boundingBox()
      expect(armed?.height).toBe(before?.height)

      await page.getByLabel("Toggle panel").tap()
      await page.locator(".drawer").waitFor()
      expect(await ctrl.getAttribute("aria-pressed")).toBe("false")
      expect(await ctrl.getAttribute("data-locked")).toBeNull()
    } finally {
      await context.close()
    }
  })

  test("visual viewport offsets resize shell and overlays without transformed IME ancestors", async () => {
    const { context, page } = await openUi(fixture, "mobile", {
      height: 844,
      offsetTop: 0,
    })

    try {
      await page.addStyleTag({
        content: ":root { --safe-left: 20px; --safe-right: 24px; }",
      })
      await setVisualViewport(page, { height: 470, offsetTop: 48 })
      await page.waitForFunction(
        () =>
          Math.round(document.querySelector(".shell")?.getBoundingClientRect().height ?? 0) === 470,
      )

      const shellState = await page.evaluate(() => {
        const shell = document.querySelector(".shell")
        const topbar = document.querySelector(".topbar")
        if (!(shell instanceof HTMLElement) || !(topbar instanceof HTMLElement))
          throw new TypeError("viewport shell is unavailable")
        const shellRect = shell.getBoundingClientRect()
        const topbarStyle = getComputedStyle(topbar)
        return {
          height: Math.round(shellRect.height),
          paddingLeft: topbarStyle.paddingLeft,
          paddingRight: topbarStyle.paddingRight,
          top: Math.round(shellRect.top),
          transform: getComputedStyle(shell).transform,
        }
      })

      expect(shellState).toEqual({
        height: 470,
        paddingLeft: "32px",
        paddingRight: "36px",
        top: 48,
        transform: "none",
      })

      await page.getByLabel("Toggle panel").tap()
      const overlay = page.locator(".overlay")
      await overlay.waitFor()
      const overlayRect = await overlay.boundingBox()
      expect(Math.round(overlayRect?.y ?? -1)).toBe(48)
      expect(Math.round(overlayRect?.height ?? -1)).toBe(470)
    } finally {
      await context.close()
    }
  })

  test("an open mobile drawer migrates into one docked desktop panel", async () => {
    const { context, page } = await openUi(fixture, "mobile")
    const toggle = page.getByLabel("Toggle panel")

    try {
      const sessionId = (await uiSnapshot(page)).sessionId
      await toggle.tap()
      await page.locator(".drawer").waitFor()

      await page.setViewportSize({ height: 844, width: 768 })
      await page.locator(".overlay").waitFor({ state: "detached" })
      await page.waitForFunction(
        () =>
          document.querySelectorAll('[role="toolbar"]').length === 0 &&
          document.querySelector(".sidebar")?.hasAttribute("hidden") === false,
      )

      const migrated = await uiSnapshot(page)
      expect(migrated.expanded).toBe("true")
      expect(migrated.sidebarHidden).toBe(false)
      expect(migrated.sidebarWidth).toBe(320)
      expect(migrated.toolbarCount).toBe(0)
      expect(migrated.sessionId).toBe(sessionId)
      expect(migrated.overflow).toBeLessThanOrEqual(0)
      expect(
        await page.evaluate(() => document.querySelector(".terminal")?.hasAttribute("inert")),
      ).toBe(false)
    } finally {
      await context.close()
    }
  })

  test("session kill requires confirmation and dialogs close before the fallback", async () => {
    const { context, page } = await openUi(fixture, "desktop")
    let deleteCount = 0
    await page.route(/\/api\/sessions\?id=/, async (route) => {
      deleteCount += 1
      await route.fulfill({ body: "", status: 204 })
    })

    try {
      await page.locator(".topbar__session").click()
      const sessions = page.locator('.dialog[aria-labelledby="sessions-title"]')
      await sessions.waitFor()
      await sessions
        .getByRole("button", { name: /^Kill / })
        .first()
        .click()

      expect(deleteCount).toBe(0)
      expect(await page.locator(".dialog--confirm").count()).toBe(1)

      await page.getByRole("button", { name: "Cancel" }).click()
      await page.locator(".dialog--confirm").waitFor({ state: "detached", timeout: 300 })
      expect(deleteCount).toBe(0)

      await sessions.getByRole("button", { name: "Close" }).click()
      await page.locator('.dialog[aria-labelledby="sessions-title"]').waitFor({
        state: "detached",
        timeout: 300,
      })
    } finally {
      await context.close()
    }
  })
})
