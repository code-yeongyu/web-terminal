import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createUiFixture, openUi, setVisualViewport, type UiFixture } from "./helpers/ui-browser.ts"

let fixture: UiFixture

beforeAll(async () => {
  fixture = await createUiFixture()
})

afterAll(async () => {
  await fixture.close()
})

describe("component regression coverage", () => {
  test("Herdr informational agent rows are visually non-interactive", async () => {
    const { context, page } = await openUi(fixture, "desktop", undefined, async (target) => {
      await target.route("**/api/herdr/snapshot", async (route) => {
        await route.fulfill({
          contentType: "application/json",
          json: {
            snapshot: {
              agents: [{ name: "Agent 1", status: "idle" }],
              tabs: [],
              version: "test",
              workspaces: [],
            },
            status: "ok",
          },
        })
      })
    })

    try {
      const row = page.locator(".row", { hasText: "Agent 1" })
      await row.waitFor()
      expect(await row.evaluate((node) => getComputedStyle(node).cursor)).toBe("default")
      const before = await row.evaluate((node) => getComputedStyle(node).backgroundColor)
      await row.hover()
      expect(await row.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(before)
    } finally {
      await context.close()
    }
  })

  test("Files panel replaces stale content with a fixed loading state", async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { context, page } = await openUi(fixture, "desktop", undefined, async (target) => {
      await target.route(/\/api\/files\?path=/, async (route) => {
        await gate
        await route.continue()
      })
    })

    try {
      await page.getByRole("tab", { name: "Files" }).click()
      expect(await page.getByText("Loading files…").count()).toBe(1)
    } finally {
      release()
      await context.close()
    }
  })

  test("mobile editor follows the visual viewport with a 16px text floor", async () => {
    const { context, page } = await openUi(
      fixture,
      "mobile",
      { height: 844, offsetTop: 0 },
      async () => undefined,
    )

    try {
      await page.getByLabel("Toggle panel").tap()
      await page.getByRole("tab", { name: "Files" }).tap()
      await page.getByLabel(`Edit ${fixture.sampleFile}`).tap()
      const editor = page.getByLabel(`Contents of ${fixture.sampleFile}`)
      await editor.waitFor()

      await setVisualViewport(page, { height: 470, offsetTop: 48 })
      await page.waitForFunction(
        () =>
          Math.round(document.querySelector(".dialog")?.getBoundingClientRect().height ?? 0) ===
          470,
      )

      const geometry = await page.evaluate(() => {
        const dialog = document.querySelector(".dialog")
        const editorNode = document.querySelector(".editor")
        const footer = document.querySelector(".dialog__footer")
        if (
          !(dialog instanceof HTMLElement) ||
          !(editorNode instanceof HTMLElement) ||
          !(footer instanceof HTMLElement)
        ) {
          throw new TypeError("editor geometry is unavailable")
        }
        return {
          dialogBottom: Math.round(dialog.getBoundingClientRect().bottom),
          fontSize: getComputedStyle(editorNode).fontSize,
          footerBottom: Math.round(footer.getBoundingClientRect().bottom),
          top: Math.round(dialog.getBoundingClientRect().top),
        }
      })

      expect(geometry.fontSize).toBe("16px")
      expect(geometry.top).toBeGreaterThanOrEqual(48)
      expect(geometry.dialogBottom - geometry.top).toBeLessThanOrEqual(470)
      expect(geometry.footerBottom).toBeLessThanOrEqual(geometry.dialogBottom)
    } finally {
      await context.close()
    }
  })

  test("confirm dialogs use the compact overlay width", async () => {
    const { context, page } = await openUi(fixture, "desktop")

    try {
      await page.locator(".topbar__session").click()
      const sessions = page.locator('.dialog[aria-labelledby="sessions-title"]')
      await sessions.waitFor()
      await sessions
        .getByRole("button", { name: /^Kill / })
        .first()
        .click()
      const confirm = page.locator(".dialog--confirm")
      await confirm.waitFor()
      expect(Math.round((await confirm.boundingBox())?.width ?? 0)).toBeLessThanOrEqual(360)
    } finally {
      await context.close()
    }
  })

  test("session load failure renders inline recovery instead of a blank dialog", async () => {
    const { context, page } = await openUi(fixture, "desktop", undefined, async (target) => {
      await target.route("**/api/sessions", async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({ body: "failed", status: 500 })
          return
        }
        await route.continue()
      })
    })

    try {
      await page.locator(".topbar__session").click()
      await page.getByText("Could not load sessions.").waitFor()
      expect(await page.getByRole("button", { name: "Retry" }).count()).toBe(1)
    } finally {
      await context.close()
    }
  })

  test("adding a toast preserves existing toast DOM identity", async () => {
    const { context, page } = await openUi(fixture, "desktop", undefined, async (target) => {
      await target.route("**/api/sessions", async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({ body: "failed", status: 500 })
          return
        }
        await route.continue()
      })
    })

    try {
      await page.locator(".topbar__session").click()
      const firstToast = page.locator(".toast").first()
      await firstToast.waitFor()
      const firstNode = await firstToast.elementHandle()
      if (firstNode === null) throw new TypeError("first toast is unavailable")

      await page.getByRole("button", { name: "Close" }).click()
      await page.locator(".topbar__session").click()
      await page.locator(".toast").nth(1).waitFor()
      expect(await firstNode.evaluate((node) => node.isConnected)).toBe(true)
    } finally {
      await context.close()
    }
  })
})
