import { afterAll, expect, test } from "bun:test"
import { startServer } from "../src/server/index.ts"

const stops: Array<() => void> = []

afterAll(() => {
  for (const stop of stops) stop()
})

test("server boots, serves the app shell, and rejects unauthenticated API", async () => {
  const server = await startServer({
    WT_PORT: "0",
    WT_PASSWORD: "test-password-123",
    WT_FILES_ROOT: "/tmp",
    WT_HERDR_SOCKET: "/tmp/wt-smoke-no-herdr.sock",
  })
  stops.push(() => server.stopAll(true))
  const base = `http://127.0.0.1:${server.port}`
  const page = await fetch(`${base}/`)
  expect(page.status).toBe(200)
  expect(await page.text()).toContain('<div id="app">')
  const me = await fetch(`${base}/api/me`)
  expect(me.status).toBe(401)
  const login = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "test-password-123" }),
  })
  expect(login.status).toBe(200)
  const cookie = login.headers.get("set-cookie") ?? ""
  expect(cookie).toContain("wt_session=")
  const authed = await fetch(`${base}/api/me`, { headers: { cookie } })
  expect(authed.status).toBe(200)
  const wasm = await fetch(`${base}/ghostty-vt.wasm`)
  expect(wasm.status).toBe(200)
  expect(wasm.headers.get("content-type")).toBe("application/wasm")
})
