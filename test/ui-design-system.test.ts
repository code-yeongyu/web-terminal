import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createUiFixture, openUi, type UiFixture, uiSnapshot } from "./helpers/ui-browser.ts"

let fixture: UiFixture

beforeAll(async () => {
  fixture = await createUiFixture()
})

afterAll(async () => {
  await fixture.close()
})

describe("rendered UI design system", () => {
  test("desktop uses the Herdr-inspired shell geometry and compact shape tokens", async () => {
    const { context, page } = await openUi(fixture, "desktop")

    try {
      const state = await uiSnapshot(page)

      expect(state.fontSize).toBe(14)
      expect(state.sidebarHidden).toBe(false)
      expect(state.sidebarWidth).toBe(320)
      expect(state.toolbarCount).toBe(0)
      expect(state.overflow).toBeLessThanOrEqual(0)
      expect(state.tokens).toEqual({
        none: "0px",
        overlay: "4px",
        sm: "4px",
        xs: "2px",
      })
      expect(state.sidebarRadius).toBe(0)
      expect(state.tabRadius).toBe(0)
      expect(Math.max(...state.buttonRadii)).toBeLessThanOrEqual(4)
      expect(state.colors).toEqual({
        ansiRed: "#f4736f",
        canvas: "rgb(7, 8, 10)",
        chrome: "rgb(13, 15, 17)",
        terminal: "rgb(5, 6, 7)",
      })
    } finally {
      await context.close()
    }
  })

  test("mobile keeps the compact terminal scale above a fixed square keybar", async () => {
    const { context, page } = await openUi(fixture, "mobile")

    try {
      const state = await uiSnapshot(page)

      expect(state.fontSize).toBe(13)
      expect(state.sidebarHidden).toBe(true)
      expect(state.toolbarCount).toBe(1)
      expect(state.overflow).toBeLessThanOrEqual(0)
      expect(state.toolbarTop).not.toBeNull()
      expect(state.terminalBottom).toBeLessThanOrEqual(state.toolbarTop ?? 0)
      expect(Math.max(...state.buttonRadii)).toBeLessThanOrEqual(4)
    } finally {
      await context.close()
    }
  })

  test("the 768px breakpoint changes structural ownership exactly once", async () => {
    const { context, page } = await openUi(fixture, "mobile")

    try {
      expect((await uiSnapshot(page)).toolbarCount).toBe(1)

      await page.setViewportSize({ height: 844, width: 768 })
      await page.waitForFunction(
        () =>
          document.querySelectorAll('[role="toolbar"]').length === 0 &&
          document.querySelector(".sidebar")?.hasAttribute("hidden") === false,
      )

      const desktop = await uiSnapshot(page)
      expect(desktop.toolbarCount).toBe(0)
      expect(desktop.sidebarHidden).toBe(false)
      expect(desktop.sidebarWidth).toBe(320)
      expect(desktop.overflow).toBeLessThanOrEqual(0)
    } finally {
      await context.close()
    }
  })
})
