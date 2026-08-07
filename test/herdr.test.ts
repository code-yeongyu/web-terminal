import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { z } from "zod"
import { HerdrClient, HerdrError } from "../src/server/herdr.ts"

type MockServer = { readonly stop: () => void }

const requestSchema = z.object({ id: z.string(), method: z.string() }).readonly()

const SNAPSHOT_RESULT = {
  type: "session_snapshot",
  snapshot: {
    version: "0.8.0",
    protocol: 19,
    focused_workspace_id: "w1",
    tabs: [
      {
        tab_id: "w1:t1",
        workspace_id: "w1",
        number: 1,
        label: "main",
        focused: true,
        pane_count: 1,
        agent_status: "unknown",
      },
    ],
    workspaces: [
      {
        workspace_id: "w1",
        number: 1,
        label: "web-terminal",
        focused: true,
        pane_count: 1,
        tab_count: 1,
        active_tab_id: "w1:t1",
        agent_status: "idle",
      },
    ],
    agents: [],
  },
}

function startMockHerdr(socketPath: string): MockServer {
  const listener = Bun.listen({
    unix: socketPath,
    socket: {
      data(socket, chunk) {
        for (const line of chunk.toString().split("\n")) {
          if (line.trim() === "") continue
          const request = requestSchema.parse(JSON.parse(line))
          const respond = (body: Record<string, unknown>): void => {
            socket.write(`${JSON.stringify({ id: request.id, ...body })}\n`)
          }
          if (request.method === "ping") respond({ result: { type: "pong" } })
          else if (request.method === "tab.focus")
            respond({ result: { type: "tab_info", tab: { tab_id: "w1:t1" } } })
          else if (request.method === "workspace.focus")
            respond({
              result: { type: "workspace_info", workspace: { workspace_id: "w9" } },
            })
          else if (request.method === "session.snapshot") respond({ result: SNAPSHOT_RESULT })
          else respond({ error: { code: "unknown_method", message: request.method } })
        }
      },
    },
  })
  return { stop: () => listener.stop(true) }
}

let dir = ""
let mock: MockServer | undefined

afterEach(async () => {
  mock?.stop()
  mock = undefined
  if (dir !== "") await rm(dir, { recursive: true, force: true })
})

describe("HerdrClient", () => {
  test("ping succeeds against a live socket", async () => {
    dir = await mkdtemp(join(tmpdir(), "wt-herdr-"))
    const sock = join(dir, "herdr.sock")
    mock = startMockHerdr(sock)
    const client = new HerdrClient({ socketPath: sock })
    expect(await client.ping()).toBe(true)
  })

  test("ping fails against a dead socket", async () => {
    dir = await mkdtemp(join(tmpdir(), "wt-herdr-"))
    const client = new HerdrClient({ socketPath: join(dir, "missing.sock") })
    expect(await client.ping()).toBe(false)
  })

  test("snapshot parses workspaces", async () => {
    dir = await mkdtemp(join(tmpdir(), "wt-herdr-"))
    const sock = join(dir, "herdr.sock")
    mock = startMockHerdr(sock)
    const client = new HerdrClient({ socketPath: sock })
    const snapshot = await client.snapshot()
    expect(snapshot.snapshot.version).toBe("0.8.0")
    expect(snapshot.snapshot.workspaces[0]?.label).toBe("web-terminal")
  })

  test("snapshot preserves the tabs array", async () => {
    dir = await mkdtemp(join(tmpdir(), "wt-herdr-"))
    const sock = join(dir, "herdr.sock")
    mock = startMockHerdr(sock)
    const client = new HerdrClient({ socketPath: sock })
    const snapshot = await client.snapshot()
    expect(snapshot.snapshot.tabs?.[0]?.tab_id).toBe("w1:t1")
    expect(snapshot.snapshot.tabs?.[0]?.focused).toBe(true)
  })

  test("focusTab round-trips tab.focus over the socket", async () => {
    dir = await mkdtemp(join(tmpdir(), "wt-herdr-"))
    const sock = join(dir, "herdr.sock")
    mock = startMockHerdr(sock)
    const client = new HerdrClient({ socketPath: sock })
    await expect(client.focusTab("w1:t1")).resolves.toBeUndefined()
  })

  test("focusWorkspace round-trips workspace.focus over the socket", async () => {
    dir = await mkdtemp(join(tmpdir(), "wt-herdr-"))
    const sock = join(dir, "herdr.sock")
    mock = startMockHerdr(sock)
    const client = new HerdrClient({ socketPath: sock })
    await expect(client.focusWorkspace("w9")).resolves.toBeUndefined()
  })

  test("remote error surfaces as HerdrError", async () => {
    dir = await mkdtemp(join(tmpdir(), "wt-herdr-"))
    const sock = join(dir, "herdr.sock")
    mock = startMockHerdr(sock)
    const client = new HerdrClient({ socketPath: sock })
    await expect(client.request("no.such.method", {})).rejects.toThrow(HerdrError)
  })

  test("ensureRunning returns already-running for live server", async () => {
    dir = await mkdtemp(join(tmpdir(), "wt-herdr-"))
    const sock = join(dir, "herdr.sock")
    mock = startMockHerdr(sock)
    const client = new HerdrClient({ socketPath: sock })
    expect(await client.ensureRunning()).toBe("already-running")
  })

  test("ensureRunning starts the server when socket is dead", async () => {
    dir = await mkdtemp(join(tmpdir(), "wt-herdr-"))
    const sock = join(dir, "herdr.sock")
    const client = new HerdrClient({
      socketPath: sock,
      startServer: async () => {
        mock = startMockHerdr(sock)
      },
      startDeadlineMs: 3000,
    })
    expect(await client.ensureRunning()).toBe("started")
    expect(await client.ping()).toBe(true)
  })

  test("ensureRunning without startServer hook throws unreachable", async () => {
    dir = await mkdtemp(join(tmpdir(), "wt-herdr-"))
    const client = new HerdrClient({ socketPath: join(dir, "missing.sock") })
    await expect(client.ensureRunning()).rejects.toThrow(HerdrError)
  })
})
