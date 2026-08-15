import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createUiFixture, openUi, type UiFixture } from "./helpers/ui-browser.ts"

let fixture: UiFixture

beforeAll(async () => {
  fixture = await createUiFixture()
})

afterAll(async () => {
  await fixture.close()
})

type InputEventSpec = {
  readonly kind: "paste" | "composition-start" | "composition-end" | "beforeinput"
  readonly data?: string | null
  readonly inputType?: string
}

type PasteCapture = {
  readonly pasted: readonly string[]
  readonly sent: readonly string[]
}

async function capturePasteSequence(
  page: Awaited<ReturnType<typeof openUi>>["page"],
  events: readonly InputEventSpec[],
): Promise<PasteCapture> {
  return page.evaluate((inputEvents) => {
    const app = Reflect.get(globalThis, "__wt")
    if (typeof app !== "object" || app === null) throw new TypeError("terminal app is unavailable")
    const terminal = Reflect.get(app, "terminal")
    const connection = Reflect.get(app, "connection")
    if (typeof terminal !== "object" || terminal === null)
      throw new TypeError("terminal is unavailable")
    if (typeof connection !== "object" || connection === null)
      throw new TypeError("terminal connection is unavailable")
    const textarea = Reflect.get(terminal, "textarea")
    if (!(textarea instanceof HTMLTextAreaElement))
      throw new TypeError("terminal textarea is unavailable")
    const originalPaste = Reflect.get(terminal, "paste")
    const originalSend = Reflect.get(connection, "sendInput")
    if (typeof originalPaste !== "function") throw new TypeError("terminal.paste is unavailable")
    if (typeof originalSend !== "function") throw new TypeError("sendInput is unavailable")

    const pasted: string[] = []
    Reflect.set(terminal, "paste", (text: string): void => {
      pasted.push(text)
      Reflect.apply(originalPaste, terminal, [text])
    })
    const sent: string[] = []
    Reflect.set(connection, "sendInput", (data: string): void => {
      sent.push(data)
      Reflect.apply(originalSend, connection, [data])
    })

    textarea.focus()
    for (const event of inputEvents) {
      if (event.kind === "paste") {
        const dataTransfer = new DataTransfer()
        dataTransfer.setData("text/plain", event.data ?? "")
        textarea.dispatchEvent(
          new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: dataTransfer,
          }),
        )
      } else if (event.kind === "composition-start") {
        textarea.dispatchEvent(
          new CompositionEvent("compositionstart", { bubbles: true, data: "" }),
        )
      } else if (event.kind === "composition-end") {
        textarea.dispatchEvent(
          new CompositionEvent("compositionend", { bubbles: true, data: event.data ?? "" }),
        )
      } else {
        textarea.dispatchEvent(
          new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            data: event.data ?? null,
            inputType: event.inputType ?? "insertText",
          }),
        )
      }
    }
    return { pasted, sent }
  }, events)
}

describe("paste input regression", () => {
  test("native paste on the focused textarea reaches terminal.paste exactly once", async () => {
    const { context, page } = await openUi(fixture, "mobile")
    try {
      const { pasted, sent } = await capturePasteSequence(page, [{ kind: "paste", data: "hello" }])
      expect(pasted).toEqual(["hello"])
      expect(sent).toEqual(["hello"])
    } finally {
      await context.close()
    }
  })

  test("multiline paste is forwarded intact exactly once", async () => {
    const { context, page } = await openUi(fixture, "mobile")
    try {
      const { pasted, sent } = await capturePasteSequence(page, [
        { kind: "paste", data: "line1\nline2\r\nline3" },
      ])
      expect(pasted).toEqual(["line1\nline2\r\nline3"])
      expect(sent).toEqual(["line1\nline2\r\nline3"])
    } finally {
      await context.close()
    }
  })

  test("empty clipboard paste forwards nothing and does not throw", async () => {
    const { context, page } = await openUi(fixture, "mobile")
    try {
      const { pasted, sent } = await capturePasteSequence(page, [{ kind: "paste", data: "" }])
      expect(pasted).toEqual([])
      expect(sent).toEqual([])
    } finally {
      await context.close()
    }
  })

  test("a paste followed by insertFromPaste is not double-sent", async () => {
    const { context, page } = await openUi(fixture, "mobile")
    try {
      // Some browsers follow a paste with a beforeinput insertFromPaste; the
      // IME forwarding ignores that inputType, so the text reaches the PTY once.
      const { pasted, sent } = await capturePasteSequence(page, [
        { kind: "paste", data: "once" },
        { kind: "beforeinput", data: "once", inputType: "insertFromPaste" },
      ])
      expect(pasted).toEqual(["once"])
      expect(sent).toEqual(["once"])
    } finally {
      await context.close()
    }
  })

  test("paste does not interfere with composition or beforeinput text handling", async () => {
    const { context, page } = await openUi(fixture, "mobile")
    try {
      const { pasted, sent } = await capturePasteSequence(page, [
        { kind: "composition-start" },
        { kind: "composition-end", data: "한" },
        // The browser echoes the composition as insertText within the dedup
        // window; the IME forwarding suppresses that duplicate echo.
        { kind: "beforeinput", data: "한", inputType: "insertText" },
        { kind: "paste", data: "pasted" },
        { kind: "beforeinput", data: "typed", inputType: "insertText" },
      ])
      expect(pasted).toEqual(["pasted"])
      expect(sent).toEqual(["한", "pasted", "typed"])
    } finally {
      await context.close()
    }
  })

  test("toolbar paste reads the clipboard when allowed", async () => {
    const { context, page } = await openUi(fixture, "mobile")
    try {
      await page.evaluate(() => {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: { readText: async (): Promise<string> => "toolbar text" },
        })
        const app = Reflect.get(globalThis, "__wt")
        const terminal = Reflect.get(app, "terminal")
        const original = Reflect.get(terminal, "paste")
        const pasted: string[] = []
        Reflect.set(terminal, "paste", (text: string): void => {
          pasted.push(text)
          Reflect.apply(original, terminal, [text])
        })
        Reflect.set(globalThis, "__wtPasted", pasted)
      })
      await page.locator('[data-key="paste"]').click()
      const pasted = await page.evaluate(() => Reflect.get(globalThis, "__wtPasted"))
      expect(pasted).toEqual(["toolbar text"])
    } finally {
      await context.close()
    }
  })

  test("toolbar paste blocked by Safari focuses the terminal and explains the fallback", async () => {
    const { context, page } = await openUi(fixture, "mobile")
    try {
      await page.evaluate(() => {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            readText: async (): Promise<string> => {
              throw new DOMException("Read permission denied.", "NotAllowedError")
            },
          },
        })
      })
      await page.locator('[data-key="paste"]').click()
      const toast = page.locator('.toast[data-tone="error"]')
      await toast.waitFor()
      const message = await toast.textContent()
      expect(message).toContain("Safari blocked clipboard access")
      const focused = await page.evaluate(() => {
        const app = Reflect.get(globalThis, "__wt")
        const terminal = Reflect.get(app, "terminal")
        const textarea = Reflect.get(terminal, "textarea")
        return textarea instanceof HTMLTextAreaElement && document.activeElement === textarea
      })
      expect(focused).toBe(true)
    } finally {
      await context.close()
    }
  })
})
