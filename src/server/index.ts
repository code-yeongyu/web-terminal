import indexPage from "../client/index.html"
import { type ApiContext, handleApi } from "./api-routes.ts"
import { Auth } from "./auth.ts"
import { loadConfig } from "./config.ts"
import { FilesApi } from "./files.ts"
import { HerdrClient } from "./herdr.ts"
import { checkOrigin, requireAuth } from "./http-util.ts"
import { withSecurityHeaders } from "./security-headers.ts"
import { SessionStore } from "./session-store.ts"
import { createWsHandlers, type WsData } from "./ws-handler.ts"

const GHOSTTY_WASM_PATH = new URL("../../node_modules/ghostty-web/ghostty-vt.wasm", import.meta.url)
  .pathname

type StartServerOptions = {
  readonly ensureHerdrAtBoot?: boolean
  readonly sessions?: SessionStore
  readonly startHerdr?: () => Promise<void>
}

export async function startServer(
  env: Readonly<Record<string, string | undefined>> = process.env,
  options: StartServerOptions = {},
) {
  const config = await loadConfig(env)
  const auth = new Auth({ passwordHash: config.passwordHash })
  const sessions = options.sessions ?? new SessionStore()
  const herdr = new HerdrClient({
    socketPath: config.herdrSocket,
    startServer:
      options.startHerdr ??
      (async () => {
        Bun.spawn(["herdr", "server"], {
          stdout: "ignore",
          stderr: "ignore",
          stdin: "ignore",
        }).unref()
      }),
  })
  const ctx: ApiContext = { auth, config, files: new FilesApi(config.filesRoot), herdr, sessions }
  const wsHandlers = createWsHandlers(sessions)
  const assets = Bun.serve({
    development: env["WT_DEV"] === "1",
    fetch: () => new Response("not found", { status: 404 }),
    hostname: "127.0.0.1",
    port: 0,
    routes: { "/": indexPage },
  })

  /**
   * One handler, two listeners. `trusted` is fixed per listener at bind time, so
   * it can never be influenced by a request: the public listener is always false.
   */
  const handleRequest = async (
    req: Request,
    serverInstance: Bun.Server<WsData>,
    trusted: boolean,
  ): Promise<Response | undefined> => {
    const url = new URL(req.url)
    if (url.pathname === "/ghostty-vt.wasm") {
      return new Response(Bun.file(GHOSTTY_WASM_PATH), {
        headers: { "content-type": "application/wasm" },
      })
    }
    if (url.pathname === "/ws") {
      if (!checkOrigin(req, config.allowedOrigins))
        return new Response("forbidden origin", { status: 403 })
      const denied = requireAuth(req, auth, trusted)
      if (denied !== undefined) return denied
      const upgraded = serverInstance.upgrade(req, {
        data: { detach: undefined, session: undefined },
      })
      if (upgraded) return undefined
      return new Response("upgrade failed", { status: 400 })
    }
    const api = await handleApi(req, serverInstance, ctx, trusted)
    if (api !== undefined) return api
    if (req.method !== "GET" && req.method !== "HEAD")
      return new Response("not found", { status: 404 })
    const assetUrl = new URL(req.url)
    assetUrl.hostname = "127.0.0.1"
    assetUrl.port = String(assets.port)
    assetUrl.protocol = "http:"
    return fetch(new Request(assetUrl, req))
  }

  const listen = (hostname: string, port: number, trusted: boolean) =>
    Bun.serve<WsData>({
      port,
      hostname,
      // Dev mode adds a Host-header guard that rejects requests arriving through a
      // tunnel or reverse proxy. Enable it only when explicitly developing locally.
      development: env["WT_DEV"] === "1",
      fetch: async (req, serverInstance) => {
        const response = await handleRequest(req, serverInstance, trusted)
        return response === undefined ? undefined : withSecurityHeaders(req, response)
      },
      websocket: { ...wsHandlers, perMessageDeflate: true },
    })

  const server = listen(config.host, config.port, false)
  const trustedServer =
    config.trustedBind === undefined
      ? undefined
      : listen(config.trustedBind, config.trustedPort ?? config.port, true)

  if (options.ensureHerdrAtBoot !== false) {
    void herdr.ensureRunning().catch((error: unknown) => {
      console.error("herdr ensure failed at boot:", error instanceof Error ? error.message : error)
    })
  }

  return Object.assign(server, {
    trustedServer,
    stopAll: (closeActiveConnections?: boolean) => {
      trustedServer?.stop(closeActiveConnections)
      server.stop(closeActiveConnections)
      assets.stop(closeActiveConnections)
    },
  })
}

if (import.meta.main) {
  const server = await startServer()
  console.log(`web-terminal listening on http://${server.hostname}:${server.port}`)
}
