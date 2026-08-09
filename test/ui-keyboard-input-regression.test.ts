import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createUiFixture, openUi, type UiFixture } from "./helpers/ui-browser.ts"

let fixture: UiFixture

beforeAll(async () => {
  fixture = await createUiFixture()
})

afterAll(async () => {
  await fixture.close()
})

async function captureCompositionSequence(
  page: Awaited<ReturnType<typeof openUi>>["page"],
  events: readonly Readonly<{ data: string | null; inputType: string }>[],
): Promise<readonly string[]> {
  return page.evaluate((inputEvents) => {
    const app = Reflect.get(globalThis, "__wt")
    if (typeof app !== "object" || app === null) throw new TypeError("terminal app is unavailable")
    const connection = Reflect.get(app, "connection")
    const terminal = Reflect.get(app, "terminal")
    if (typeof connection !== "object" || connection === null)
      throw new TypeError("terminal connection is unavailable")
    if (typeof terminal !== "object" || terminal === null)
      throw new TypeError("terminal is unavailable")
    const original = Reflect.get(connection, "sendInput")
    const textarea = Reflect.get(terminal, "textarea")
    if (typeof original !== "function") throw new TypeError("sendInput is unavailable")
    if (!(textarea instanceof HTMLTextAreaElement))
      throw new TypeError("terminal textarea is unavailable")

    const sent: string[] = []
    Reflect.set(connection, "sendInput", (data: string): void => {
      sent.push(data)
      Reflect.apply(original, connection, [data])
    })

    textarea.focus()
    textarea.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }))
    textarea.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "한" }))
    for (const event of inputEvents) {
      textarea.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          data: event.data,
          inputType: event.inputType,
        }),
      )
    }
    return sent
  }, events)
}

describe("keyboard input regression", () => {
  test("mobile composition does not swallow immediate Enter or Backspace", async () => {
    const { context, page } = await openUi(fixture, "mobile")
    try {
      const sent = await captureCompositionSequence(page, [
        { data: null, inputType: "insertLineBreak" },
        { data: null, inputType: "deleteContentBackward" },
      ])
      expect(sent).toEqual(["한", "\r", "\u007f"])
    } finally {
      await context.close()
    }
  })

  test("mobile composition only deduplicates the matching insertText echo", async () => {
    const { context, page } = await openUi(fixture, "mobile")
    try {
      const sent = await captureCompositionSequence(page, [
        { data: "한", inputType: "insertText" },
        { data: "글", inputType: "insertText" },
      ])
      expect(sent).toEqual(["한", "글"])
    } finally {
      await context.close()
    }
  })
})
