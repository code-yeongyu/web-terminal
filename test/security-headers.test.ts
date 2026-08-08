import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { startServer } from "../src/server/index.ts"

let base: string
let stop: () => void

beforeAll(async () => {
  const server = await startServer({
    WT_FILES_ROOT: "/tmp",
    WT_HERDR_SOCKET: "/tmp/wt-security-no-herdr.sock",
    WT_PASSWORD: "test-password-123",
    WT_PORT: "0",
  })
  base = `http://127.0.0.1:${server.port}`
  stop = () => server.stopAll(true)
})

afterAll(() => {
  stop()
})

function expectSecurityHeaders(response: Response): void {
  const headers = response.headers
  const csp = headers.get("content-security-policy")
  expect(csp).toContain("default-src 'self'")
  expect(csp).toContain("frame-ancestors 'none'")
  expect(csp).toContain("connect-src 'self' ws: wss:")
  expect(headers.get("cross-origin-opener-policy")).toBe("same-origin")
  expect(headers.get("cross-origin-resource-policy")).toBe("same-origin")
  expect(headers.get("permissions-policy")).toBe("camera=(), geolocation=(), microphone=()")
  expect(headers.get("referrer-policy")).toBe("no-referrer")
  expect(headers.get("x-content-type-options")).toBe("nosniff")
  expect(headers.get("x-frame-options")).toBe("DENY")
}

describe("browser-facing security headers", () => {
  test("app shell and unauthorized API responses share the hardened policy", async () => {
    const forwarded = { "x-forwarded-proto": "https" }
    const page = await fetch(`${base}/`, { headers: forwarded })
    const me = await fetch(`${base}/api/me`, { headers: forwarded })

    expect(page.status).toBe(200)
    expect(me.status).toBe(401)
    expectSecurityHeaders(page)
    expectSecurityHeaders(me)
    expect(page.headers.get("strict-transport-security")).toBe(
      "max-age=31536000; includeSubDomains",
    )
    expect(me.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains")
  })

  test("HSTS is omitted on a direct plaintext origin request", async () => {
    const page = await fetch(`${base}/`)
    expectSecurityHeaders(page)
    expect(page.headers.get("strict-transport-security")).toBeNull()
  })
})
