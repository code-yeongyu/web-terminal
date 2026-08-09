export const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

export const createRecorder = (actions) => (name, pass, detail) => {
  actions.push({ name, pass, detail })
  console.log(`${pass ? "PASS" : "FAIL"} ${name} — ${detail}`)
}

export const terminalLines = (page) =>
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

export async function waitForOutputLine(page, expected, count = 1) {
  try {
    await page.waitForFunction(
      ({ expectedCount, expectedLine }) => {
        const buffer = globalThis.__wt?.terminal?.buffer.active
        if (buffer === undefined) return false
        let matches = 0
        for (let index = 0; index < buffer.length; index += 1) {
          if (buffer.getLine(index)?.translateToString(true).startsWith(expectedLine)) matches += 1
        }
        return matches === expectedCount
      },
      { expectedCount: count, expectedLine: expected },
      { timeout: 10_000 },
    )
    return true
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") return false
    throw error
  }
}

export async function prepareStandaloneSession(context, base, password, title, precreate) {
  const login = await context.request.post(`${base}/api/login`, { data: { password } })
  if (!login.ok()) throw new Error(`QA login failed with ${login.status()}`)
  const before = (await (await context.request.get(`${base}/api/sessions`)).json()).sessions
  let preparedSessionId
  if (precreate) {
    const created = await context.request.post(`${base}/api/sessions`, {
      data: { command: ["/bin/zsh", "-l"], title },
    })
    if (!created.ok()) throw new Error(`session creation failed with ${created.status()}`)
    preparedSessionId = (await created.json()).session.id
    await context.addInitScript((sessionId) => {
      localStorage.setItem("wt:session-id", sessionId)
    }, preparedSessionId)
  }
  return { before, preparedSessionId }
}
