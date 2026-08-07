import type { Server } from "bun"
import { z } from "zod"
import { assertNever } from "../shared/assert-never.ts"
import { sessionIdSchema } from "../shared/protocol.ts"
import type { Auth } from "./auth.ts"
import type { ServerConfig } from "./config.ts"
import { type FilesApi, FilesError } from "./files.ts"
import type { HerdrClient } from "./herdr.ts"
import { HerdrError } from "./herdr.ts"
import {
  clientIp,
  isSecureRequest,
  json,
  readCookie,
  requireAuth,
  SESSION_COOKIE,
  sessionCookieHeader,
} from "./http-util.ts"
import type { SessionStore } from "./session-store.ts"

const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7
const loginSchema = z.object({ password: z.string().min(1).max(1024) }).readonly()
const focusWorkspaceSchema = z.union([
  z.object({ workspaceId: z.string().min(1).max(64) }).readonly(),
  z.object({ tabId: z.string().min(1).max(64) }).readonly(),
])
const createSessionSchema = z
  .object({
    title: z.string().min(1).max(64).optional(),
    command: z.array(z.string().min(1)).min(1).max(16).readonly().optional(),
  })
  .readonly()

export type ApiContext = {
  readonly auth: Auth
  readonly config: ServerConfig
  readonly files: FilesApi
  readonly herdr: HerdrClient
  readonly sessions: SessionStore
}

function filesErrorResponse(error: FilesError): Response {
  switch (error.code) {
    case "not-found":
      return json({ error: error.code }, 404)
    case "outside-root":
      return json({ error: error.code }, 403)
    case "not-a-file":
    case "not-a-directory":
      return json({ error: error.code }, 400)
    default:
      return assertNever(error.code)
  }
}

async function readJson(req: Request): Promise<unknown | undefined> {
  try {
    return await req.json()
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

async function handleLogin(
  req: Request,
  server: Server<unknown>,
  ctx: ApiContext,
): Promise<Response> {
  const body = loginSchema.safeParse(await readJson(req))
  if (!body.success) return json({ error: "bad-request" }, 400)
  const ip = clientIp(req, server.requestIP(req)?.address ?? "unknown")
  const result = await ctx.auth.login(body.data.password, ip)
  switch (result.kind) {
    case "ok":
      return json({ ok: true }, 200, {
        "set-cookie": sessionCookieHeader(
          result.token,
          isSecureRequest(req),
          SESSION_COOKIE_MAX_AGE_SECONDS,
        ),
      })
    case "invalid":
      return json({ error: "invalid-password" }, 401)
    case "rate-limited":
      return json({ error: "rate-limited", retryAfterSeconds: result.retryAfterSeconds }, 429, {
        "retry-after": String(result.retryAfterSeconds),
      })
    default:
      return assertNever(result)
  }
}

async function handleFiles(req: Request, url: URL, ctx: ApiContext): Promise<Response> {
  const path = url.searchParams.get("path") ?? ""
  try {
    if (url.pathname === "/api/files" && req.method === "GET") {
      return json({ path, entries: await ctx.files.list(path) })
    }
    if (url.pathname === "/api/files/content" && req.method === "GET") {
      const content = await ctx.files.read(path)
      const download = url.searchParams.get("download") === "1"
      const name = path.split("/").at(-1) ?? "file"
      const headers = new Headers({ "content-type": "application/octet-stream" })
      if (download)
        headers.set("content-disposition", `attachment; filename="${encodeURIComponent(name)}"`)
      return new Response(Uint8Array.from(content), { headers })
    }
    if (url.pathname === "/api/files/content" && req.method === "PUT") {
      await ctx.files.write(path, new Uint8Array(await req.arrayBuffer()))
      return json({ ok: true })
    }
    if (url.pathname === "/api/files/content" && req.method === "DELETE") {
      await ctx.files.remove(path)
      return json({ ok: true })
    }
    return json({ error: "not-found" }, 404)
  } catch (error) {
    if (error instanceof FilesError) return filesErrorResponse(error)
    throw error
  }
}

async function handleHerdrFocus(req: Request, ctx: ApiContext): Promise<Response> {
  const body = focusWorkspaceSchema.safeParse(await readJson(req))
  if (!body.success) return json({ error: "invalid-body" }, 400)
  try {
    await ctx.herdr.ensureRunning()
    if ("tabId" in body.data) await ctx.herdr.focusTab(body.data.tabId)
    else await ctx.herdr.focusWorkspace(body.data.workspaceId)
    return json({ ok: true })
  } catch (error) {
    if (error instanceof HerdrError) return json({ status: "unavailable", reason: error.code }, 503)
    throw error
  }
}

async function handleHerdrSnapshot(ctx: ApiContext): Promise<Response> {
  try {
    await ctx.herdr.ensureRunning()
    const snapshot = await ctx.herdr.snapshot()
    return json({ status: "connected", ...snapshot })
  } catch (error) {
    if (error instanceof HerdrError) return json({ status: "unavailable", reason: error.code }, 503)
    throw error
  }
}

async function handleSessions(req: Request, url: URL, ctx: ApiContext): Promise<Response> {
  if (req.method === "GET") return json({ sessions: ctx.sessions.list() })
  if (req.method === "POST") {
    const body = createSessionSchema.safeParse((await readJson(req)) ?? {})
    if (!body.success) return json({ error: "bad-request" }, 400)
    const session = ctx.sessions.create({
      ...(body.data.title === undefined ? {} : { title: body.data.title }),
      ...(body.data.command === undefined ? {} : { command: body.data.command }),
    })
    return json({ session: session.info() }, 201)
  }
  if (req.method === "DELETE") {
    const id = sessionIdSchema.safeParse(url.searchParams.get("id"))
    if (!id.success) return json({ error: "bad-request" }, 400)
    ctx.sessions.remove(id.data)
    return json({ ok: true })
  }
  return json({ error: "method-not-allowed" }, 405)
}

export async function handleApi(
  req: Request,
  server: Server<unknown>,
  ctx: ApiContext,
  trusted = false,
): Promise<Response | undefined> {
  const url = new URL(req.url)
  if (!url.pathname.startsWith("/api/")) return undefined
  if (url.pathname === "/api/login" && req.method === "POST") return handleLogin(req, server, ctx)
  const denied = requireAuth(req, ctx.auth, trusted)
  if (denied !== undefined) return denied
  if (url.pathname === "/api/logout" && req.method === "POST") {
    const token = readCookie(req, SESSION_COOKIE)
    if (token !== undefined) ctx.auth.logout(token)
    return json({ ok: true }, 200, {
      "set-cookie": sessionCookieHeader("", isSecureRequest(req), 0),
    })
  }
  if (url.pathname === "/api/me") return json({ ok: true })
  if (url.pathname.startsWith("/api/files")) return handleFiles(req, url, ctx)
  if (url.pathname === "/api/herdr/snapshot") return handleHerdrSnapshot(ctx)
  if (url.pathname === "/api/herdr/focus" && req.method === "POST") {
    return handleHerdrFocus(req, ctx)
  }
  if (url.pathname === "/api/sessions") return handleSessions(req, url, ctx)
  return json({ error: "not-found" }, 404)
}
