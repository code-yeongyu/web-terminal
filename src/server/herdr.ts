import { z } from "zod"

const DEFAULT_REQUEST_TIMEOUT_MS = 3000
const DEFAULT_START_DEADLINE_MS = 10_000
const START_RETRY_INTERVAL_MS = 150

export class HerdrError extends Error {
  override readonly name = "HerdrError"
  constructor(
    readonly code: "unreachable" | "timeout" | "remote" | "bad-response",
    message: string,
  ) {
    super(message)
  }
}

const herdrWorkspaceSchema = z
  .object({
    workspace_id: z.string(),
    number: z.number().int(),
    label: z.string(),
    focused: z.boolean(),
    pane_count: z.number().int(),
    tab_count: z.number().int(),
    agent_status: z.string(),
  })
  .readonly()

const herdrTabSchema = z
  .object({
    tab_id: z.string(),
    workspace_id: z.string(),
    number: z.number().int(),
    label: z.string(),
    focused: z.boolean(),
    pane_count: z.number().int(),
    agent_status: z.string(),
  })
  .readonly()

const herdrSnapshotSchema = z
  .object({
    snapshot: z
      .object({
        version: z.string(),
        workspaces: z.array(herdrWorkspaceSchema).readonly().default([]),
        tabs: z.array(herdrTabSchema).readonly().default([]),
        agents: z.array(z.record(z.string(), z.unknown()).readonly()).readonly().default([]),
      })
      .readonly(),
  })
  .readonly()

type HerdrSnapshot = z.infer<typeof herdrSnapshotSchema>
type EnsureResult = "already-running" | "started"

type HerdrClientOptions = {
  readonly socketPath: string
  readonly requestTimeoutMs?: number
  readonly startServer?: () => Promise<void>
  readonly startDeadlineMs?: number
}

const responseSchema = z
  .object({
    id: z.string(),
    result: z.unknown().optional(),
    error: z.object({ code: z.string(), message: z.string() }).readonly().optional(),
  })
  .readonly()

export class HerdrClient {
  readonly #socketPath: string
  readonly #requestTimeoutMs: number
  readonly #startServer: (() => Promise<void>) | undefined
  readonly #startDeadlineMs: number
  #requestCounter = 0

  constructor(options: HerdrClientOptions) {
    this.#socketPath = options.socketPath
    this.#requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    this.#startServer = options.startServer
    this.#startDeadlineMs = options.startDeadlineMs ?? DEFAULT_START_DEADLINE_MS
  }

  async request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = `web-terminal:${++this.#requestCounter}`
    const raw = await this.#roundTrip(`${JSON.stringify({ id, method, params })}\n`, id)
    const parsed = responseSchema.safeParse(raw)
    if (!parsed.success) throw new HerdrError("bad-response", parsed.error.message)
    if (parsed.data.error !== undefined) {
      throw new HerdrError("remote", `${parsed.data.error.code}: ${parsed.data.error.message}`)
    }
    return parsed.data.result
  }

  async ping(): Promise<boolean> {
    try {
      await this.request("ping", {})
      return true
    } catch (error) {
      if (error instanceof HerdrError) return false
      throw error
    }
  }

  async focusWorkspace(workspaceId: string): Promise<void> {
    await this.request("workspace.focus", { workspace_id: workspaceId })
  }

  async focusTab(tabId: string): Promise<void> {
    await this.request("tab.focus", { tab_id: tabId })
  }

  async snapshot(): Promise<HerdrSnapshot> {
    const result = await this.request("session.snapshot", {})
    const parsed = herdrSnapshotSchema.safeParse(result)
    if (!parsed.success) throw new HerdrError("bad-response", parsed.error.message)
    return parsed.data
  }

  async ensureRunning(): Promise<EnsureResult> {
    if (await this.ping()) return "already-running"
    if (this.#startServer === undefined) {
      throw new HerdrError("unreachable", `herdr socket dead: ${this.#socketPath}`)
    }
    await this.#startServer()
    const deadline = Date.now() + this.#startDeadlineMs
    while (Date.now() < deadline) {
      if (await this.ping()) return "started"
      await new Promise((resolvePromise) => setTimeout(resolvePromise, START_RETRY_INTERVAL_MS))
    }
    throw new HerdrError("timeout", "herdr server did not come up before deadline")
  }

  #roundTrip(payload: string, id: string): Promise<unknown> {
    return new Promise((resolvePromise, rejectPromise) => {
      let settled = false
      let received = ""
      const settle = (fn: () => void): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        fn()
      }
      const timer = setTimeout(() => {
        settle(() => rejectPromise(new HerdrError("timeout", `no response for ${id}`)))
      }, this.#requestTimeoutMs)
      Bun.connect({
        unix: this.#socketPath,
        socket: {
          open(socket) {
            socket.write(payload)
          },
          data(socket, chunk) {
            received += chunk.toString()
            const newlineAt = received.indexOf("\n")
            if (newlineAt === -1) return
            const line = received.slice(0, newlineAt)
            settle(() => {
              try {
                resolvePromise(JSON.parse(line))
              } catch (error) {
                if (error instanceof SyntaxError) {
                  rejectPromise(new HerdrError("bad-response", error.message))
                } else {
                  rejectPromise(error)
                }
              }
            })
            socket.end()
          },
          error(_socket, error) {
            settle(() => rejectPromise(new HerdrError("unreachable", error.message)))
          },
          close() {
            settle(() => rejectPromise(new HerdrError("unreachable", "socket closed early")))
          },
        },
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        settle(() => rejectPromise(new HerdrError("unreachable", message)))
      })
    })
  }
}
