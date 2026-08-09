import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { chromium } from "playwright"
import {
  arg,
  createRecorder,
  prepareStandaloneSession,
  terminalLines,
  waitForOutputLine,
} from "./keyboard-qa-support.mjs"

const base = arg("base", "http://127.0.0.1:7821")
const password = arg("password", "qa-password-123")
const evidenceDir = arg("evidence-dir", ".omo/evidence/keyboard-input/red/desktop")
const precreateSession = process.argv.includes("--precreate-session")

if (base === undefined || password === undefined || evidenceDir === undefined) {
  throw new TypeError("keyboard QA arguments are unavailable")
}

await mkdir(evidenceDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { height: 1000, width: 1440 } })
const page = await context.newPage()
const actions = []
let herdrRequestCount = 0
const record = createRecorder(actions)

try {
  await page.route("**/api/herdr/**", async (route) => {
    herdrRequestCount += 1
    await route.fulfill({
      contentType: "application/json",
      json: { status: "unavailable" },
      status: 503,
    })
  })

  const { before: beforeSessions, preparedSessionId } = await prepareStandaloneSession(
    context,
    base,
    password,
    "keyboard-qa",
    precreateSession,
  )

  await page.goto(base)
  await page.locator(".terminal canvas").waitFor()
  await page.waitForFunction(() => globalThis.__wt?.connection.sessionId !== undefined)
  if (precreateSession) await waitForOutputLine(page, "__WT_QA_READY__")

  const isolation = await page.evaluate(async () => {
    const response = await fetch("/api/sessions")
    const body = await response.json()
    const sessionId = globalThis.__wt?.connection.sessionId
    return {
      persistedSessionId: localStorage.getItem("wt:session-id"),
      sessionId,
      sessions: body.sessions,
    }
  })
  const isolated =
    typeof isolation.sessionId === "string" &&
    isolation.persistedSessionId === isolation.sessionId &&
    isolation.sessions.length >= beforeSessions.length + 1 &&
    !beforeSessions.some((session) => session.id === isolation.sessionId) &&
    (preparedSessionId === undefined || isolation.sessionId === preparedSessionId)
  record(
    "fresh standalone session",
    isolated,
    `session=${isolation.sessionId} before=${beforeSessions.length} after=${isolation.sessions.length}`,
  )

  await page.evaluate(() => {
    const connection = globalThis.__wt?.connection
    if (connection === undefined) throw new TypeError("terminal connection is unavailable")
    globalThis.__keyboardQaSent = []
    const original = connection.sendInput.bind(connection)
    connection.sendInput = (data) => {
      globalThis.__keyboardQaSent.push(data)
      original(data)
    }
    globalThis.__wt?.terminal.textarea?.focus()
  })

  await page.keyboard.type("printf 'PTY-PROBE:한\\n'")
  await page.keyboard.press("Enter")
  await waitForOutputLine(page, "PTY-PROBE:한")
  const probeLines = await terminalLines(page)
  record(
    "CJK PTY probe",
    probeLines.filter((line) => line === "PTY-PROBE:한").length === 1,
    "exact output line PTY-PROBE:한 rendered once",
  )

  await page.keyboard.type("printf 'EDIT-OK:XY")
  await page.keyboard.press("Backspace")
  await page.keyboard.type("Z\\n'")
  await page.keyboard.press("Enter")
  const edited = await waitForOutputLine(page, "EDIT-OK:XZ")
  await page.keyboard.press("ArrowUp")
  await page.keyboard.press("Enter")
  const replayed = await waitForOutputLine(page, "EDIT-OK:XZ", 2)
  const editingLines = await terminalLines(page)
  record(
    "editing keys",
    edited && replayed,
    `edited=${edited} replayed=${replayed} tail=${JSON.stringify(editingLines.slice(-8))}`,
  )

  const inputState = await page.evaluate(() => ({
    activeIsTextarea: document.activeElement === globalThis.__wt?.terminal.textarea,
    sent: globalThis.__keyboardQaSent,
  }))
  record(
    "terminal focus",
    inputState.activeIsTextarea,
    `active element remains hidden terminal textarea=${inputState.activeIsTextarea}`,
  )
  record(
    "Herdr route isolation",
    herdrRequestCount >= 1,
    `${herdrRequestCount} requests intercepted`,
  )

  await page.screenshot({ path: join(evidenceDir, "desktop-pty-probe.png"), fullPage: true })
  await writeFile(
    join(evidenceDir, "desktop-actions.json"),
    `${JSON.stringify({ actions, herdrRequestCount, inputState, isolation, preparedSessionId }, null, 2)}\n`,
  )
} finally {
  await context.close()
  await browser.close()
}

const failed = actions.filter((action) => !action.pass)
console.log(`${actions.length - failed.length}/${actions.length} keyboard scenarios passed`)
process.exit(failed.length === 0 ? 0 : 1)
