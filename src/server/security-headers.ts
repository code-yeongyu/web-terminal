const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'none'",
  "connect-src 'self' ws: wss:",
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
].join("; ")

const SECURITY_HEADERS = {
  "content-security-policy": CONTENT_SECURITY_POLICY,
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), geolocation=(), microphone=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const

function isSecureRequest(req: Request): boolean {
  if (new URL(req.url).protocol === "https:") return true
  if (req.headers.get("x-forwarded-proto")?.toLowerCase() === "https") return true
  const visitor = req.headers.get("cf-visitor")
  if (visitor === null) return false
  try {
    const parsed: unknown = JSON.parse(visitor)
    return (
      typeof parsed === "object" && parsed !== null && Reflect.get(parsed, "scheme") === "https"
    )
  } catch {
    return false
  }
}

export function withSecurityHeaders(req: Request, response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value)
  if (isSecureRequest(req)) {
    headers.set("strict-transport-security", "max-age=31536000; includeSubDomains")
  }
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}
