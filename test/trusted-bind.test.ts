import { afterAll, expect, test } from "bun:test"
import { startServer } from "../src/server/index.ts"

const stops: Array<() => void> = []

afterAll(() => {
  for (const stop of stops) stop()
})

const BASE_ENV = {
  WT_PASSWORD: "test-password-123",
  WT_FILES_ROOT: "/tmp",
  WT_HERDR_SOCKET: "/tmp/wt-trust-no-herdr.sock",
} as const

test("untrusted surface never authenticates from spoofable headers", async () => {
  const server = await startServer({ ...BASE_ENV, WT_PORT: "0" })
  stops.push(() => server.stopAll(true))
  const base = `http://127.0.0.1:${server.port}`

  // Every header an attacker can set on a request through Cloudflare must be inert.
  const spoofs: readonly Record<string, string>[] = [
    { "cf-connecting-ip": "100.68.81.17" },
    { "x-forwarded-for": "100.68.81.17" },
    { "x-real-ip": "100.68.81.17" },
    { "x-tailscale-ip": "100.68.81.17" },
    { "tailscale-user-login": "code.yeon.gyu@" },
    { "x-forwarded-for": "100.68.81.17, 1.2.3.4", "cf-connecting-ip": "100.68.81.17" },
  ]
  for (const headers of spoofs) {
    const res = await fetch(`${base}/api/me`, { headers })
    expect(res.status).toBe(401)
  }

  // The WebSocket upgrade must be equally unforgeable.
  const ws = await fetch(`${base}/ws`, {
    headers: {
      "cf-connecting-ip": "100.68.81.17",
      connection: "Upgrade",
      upgrade: "websocket",
      "sec-websocket-version": "13",
      "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
    },
  })
  expect(ws.status).toBe(401)
})

test("trusted bind serves pre-authenticated requests without a password", async () => {
  const server = await startServer({
    ...BASE_ENV,
    WT_PORT: "0",
    WT_HOST: "127.0.0.1",
    WT_TRUSTED_BIND: "127.0.0.1",
    WT_TRUSTED_PORT: "0",
  })
  stops.push(() => server.stopAll(true))
  const trusted = server.trustedServer
  expect(trusted).toBeDefined()
  if (trusted === undefined) throw new Error("unreachable")

  const res = await fetch(`http://127.0.0.1:${trusted.port}/api/me`, {})
  expect(res.status).toBe(200)

  // ...while the public surface on the same process still demands the password.
  const publicRes = await fetch(`http://127.0.0.1:${server.port}/api/me`)
  expect(publicRes.status).toBe(401)
})

test("trusted bind is off by default (fails closed)", async () => {
  const server = await startServer({ ...BASE_ENV, WT_PORT: "0" })
  stops.push(() => server.stopAll(true))
  expect(server.trustedServer).toBeUndefined()
})
