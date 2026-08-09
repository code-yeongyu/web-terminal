import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { chromium, devices } from "playwright"

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

const base = arg("base", "http://127.0.0.1:7821")
const password = arg("password", "qa-password-123")
const evidenceDir = arg("evidence-dir", ".omo/evidence/keyboard-input/green/mobile")

if (base === undefined || password === undefined || evidenceDir === undefined) {
  throw new TypeError("mobile keyboard QA arguments are unavailable")
}

await mkdir(evidenceDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  ...devices["iPhone 13"],
  hasTouch: true,
  viewport: { height: 844, width: 390 },
})
const page = await context.newPage()
const actions = []
let herdrRequestCount = 0

const record = (name, pass, detail) => {
  actions.push({ name, pass, detail })
  console.log(`${pass ? "PASS" : "FAIL"} ${name} — ${detail}`)
}

const waitForExactLine = async (expected) => {
  try {
    await page.waitForFunction(
      (expectedLine) => {
        const buffer = globalThis.__wt?.terminal?.buffer.active
        if (buffer === undefined) return false
        for (let index = 0; index < buffer.length; index += 1) {
          if (buffer.getLine(index)?.translateToString(true) === expectedLine) return true
        }
        return false
      },
      expected,
      { timeout: 10_000 },
    )
    return true
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") return false
    throw error
  }
}

const terminalLines = () =>
  page.evaluate(() => {
    const buffer = globalThis.__wt?.terminal?.buffer.active
    if (buffer === undefined) return []
    const lines = []
    for (let index = 0; index < buffer.length; index += 1) {
      const line = buffer.getLine(index)
      if (line !== undefined) lines.push(line.translateToString(true))
    }
    return lines
  })

const resetCapture = () =>
  page.evaluate(() => {
    globalThis.__mobileKeyboardSent = []
  })

const sentInput = () => page.evaluate(() => globalThis.__mobileKeyboardSent)

const dispatchComposition = (events) =>
  page.evaluate((inputEvents) => {
    const textarea = globalThis.__wt?.terminal.textarea
    if (!(textarea instanceof HTMLTextAreaElement))
      throw new TypeError("terminal textarea is unavailable")
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
  }, events)

try {
  await page.route("**/api/herdr/**", async (route) => {
    herdrRequestCount += 1
    await route.fulfill({
      contentType: "application/json",
      json: { status: "unavailable" },
      status: 503,
    })
  })

  const login = await context.request.post(`${base}/api/login`, { data: { password } })
  if (!login.ok()) throw new Error(`QA login failed with ${login.status()}`)
  const before = (await (await context.request.get(`${base}/api/sessions`)).json()).sessions

  await page.goto(base)
  await page.locator(".terminal canvas").waitFor()
  await page.waitForFunction(() => globalThis.__wt?.connection.sessionId !== undefined)
  const initialSessionId = await page.evaluate(() => globalThis.__wt?.connection.sessionId)
  const after = (await (await context.request.get(`${base}/api/sessions`)).json()).sessions
  record(
    "fresh mobile session",
    typeof initialSessionId === "string" &&
      after.length === before.length + 1 &&
      !before.some((session) => session.id === initialSessionId),
    `session=${initialSessionId} before=${before.length} after=${after.length}`,
  )

  await page.evaluate(() => {
    const connection = globalThis.__wt?.connection
    if (connection === undefined) throw new TypeError("terminal connection is unavailable")
    globalThis.__mobileKeyboardSent = []
    const original = connection.sendInput.bind(connection)
    connection.sendInput = (data) => {
      globalThis.__mobileKeyboardSent.push(data)
      original(data)
    }
    globalThis.__wt?.terminal.textarea?.focus()
  })

  await resetCapture()
  await page.keyboard.type("printf 'MOBILE-IME:")
  await dispatchComposition([
    { data: "한", inputType: "insertText" },
    { data: "글", inputType: "insertText" },
  ])
  await page.keyboard.type("\\n'")
  await page.evaluate(() => {
    globalThis.__wt?.terminal.textarea?.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        data: null,
        inputType: "insertLineBreak",
      }),
    )
  })
  const imeRendered = await waitForExactLine("MOBILE-IME:한글")
  const imeSent = (await sentInput()).join("")
  record(
    "mobile composition plus immediate text and Enter",
    imeRendered && imeSent === "printf 'MOBILE-IME:한글\\n'\r",
    `rendered=${imeRendered} sent=${JSON.stringify(imeSent)} tail=${JSON.stringify((await terminalLines()).slice(-8))}`,
  )

  await resetCapture()
  await page.keyboard.type("printf 'MOBILE-BS:")
  await dispatchComposition([{ data: null, inputType: "deleteContentBackward" }])
  await page.keyboard.type("글\\n'")
  await page.evaluate(() => {
    globalThis.__wt?.terminal.textarea?.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        data: null,
        inputType: "insertLineBreak",
      }),
    )
  })
  const backspaceRendered = await waitForExactLine("MOBILE-BS:글")
  const backspaceSent = (await sentInput()).join("")
  record(
    "mobile composition plus immediate Backspace",
    backspaceRendered && backspaceSent === "printf 'MOBILE-BS:한\u007f글\\n'\r",
    `rendered=${backspaceRendered} sent=${JSON.stringify(backspaceSent)} tail=${JSON.stringify((await terminalLines()).slice(-8))}`,
  )

  await resetCapture()
  await page.locator('[data-key="shift"]').tap()
  await page.locator('[data-key="tab"]').tap()
  await page.locator('[data-key="shift"]').tap()
  await page.locator('[data-key="up"]').tap()
  await page.locator('[data-key="ctrl"]').tap()
  await page.keyboard.press("a")
  await page.locator('[data-key="alt"]').tap()
  await page.keyboard.press("x")
  await page.locator('[data-key="esc"]').tap()
  await page.locator('[data-key="tab"]').tap()
  await page.locator('[data-key="left"]').tap()
  const modifierSent = (await sentInput()).join("")
  const expectedModifiers = "\u001b[Z\u001b[1;2A\u0001\u001bx\u001b\t\u001b[D"
  record(
    "keybar modifiers and navigation sequences",
    modifierSent === expectedModifiers,
    `sent=${JSON.stringify(modifierSent)}`,
  )

  await page.locator('[data-key="kbd-hide"]').tap()
  const focusAfterDismiss = await page.evaluate(
    () => document.activeElement === globalThis.__wt?.terminal.textarea,
  )
  await page.tap(".terminal")
  const focusAfterDismissTap = await page.evaluate(
    () => document.activeElement === globalThis.__wt?.terminal.textarea,
  )
  record(
    "keyboard dismiss and explicit refocus",
    !focusAfterDismiss && focusAfterDismissTap,
    `afterDismiss=${focusAfterDismiss} afterTap=${focusAfterDismissTap}`,
  )

  await page.getByLabel("Toggle panel").tap()
  await page.locator(".drawer").waitFor()
  await page.getByLabel("Close panel").tap()
  await page.locator(".overlay").waitFor({ state: "detached" })
  const focusBeforeTap = await page.evaluate(
    () => document.activeElement === globalThis.__wt?.terminal.textarea,
  )
  await page.tap(".terminal")
  const focusAfterTap = await page.evaluate(
    () => document.activeElement === globalThis.__wt?.terminal.textarea,
  )
  await page.keyboard.type("printf 'MOBILE-OVERLAY:42\\n'")
  await page.keyboard.press("Enter")
  await waitForExactLine("MOBILE-OVERLAY:42")
  record(
    "overlay close requires explicit terminal refocus",
    !focusBeforeTap && focusAfterTap,
    `beforeTap=${focusBeforeTap} afterTap=${focusAfterTap}`,
  )

  await page.reload()
  await page.locator(".terminal canvas").waitFor()
  await page.waitForFunction(() => globalThis.__wt?.connection.sessionId !== undefined)
  const reattachedSessionId = await page.evaluate(() => globalThis.__wt?.connection.sessionId)
  await page.tap(".terminal")
  await page.keyboard.type("printf 'MOBILE-REATTACH:73\\n'")
  await page.keyboard.press("Enter")
  await waitForExactLine("MOBILE-REATTACH:73")
  record(
    "input after session reattach",
    reattachedSessionId === initialSessionId,
    `initial=${initialSessionId} reattached=${reattachedSessionId}`,
  )

  record(
    "Herdr route isolation",
    herdrRequestCount >= 1,
    `${herdrRequestCount} requests intercepted`,
  )
  await page.screenshot({ path: join(evidenceDir, "mobile-keyboard.png"), fullPage: true })
  await writeFile(
    join(evidenceDir, "mobile-actions.json"),
    `${JSON.stringify({ actions, herdrRequestCount, initialSessionId }, null, 2)}\n`,
  )
} finally {
  await context.close()
  await browser.close()
}

const failed = actions.filter((action) => !action.pass)
console.log(`${actions.length - failed.length}/${actions.length} mobile keyboard scenarios passed`)
process.exit(failed.length === 0 ? 0 : 1)
