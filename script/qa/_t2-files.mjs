import { chromium, devices } from "playwright"
const b = await chromium.launch()
const ctx = await b.newContext({ ...devices["iPhone 13"], viewport: { width: 375, height: 812 }, hasTouch: true })
const p = await ctx.newPage()
await p.goto("http://127.0.0.1:7822")
await p.fill("#password", "jakilinux1^^")
await p.click("button[type=submit]")
await p.waitForSelector(".terminal canvas", { timeout: 15000 })
await p.waitForTimeout(2000)
// open drawer, switch to Files tab
const buttons = await p.locator("header button, .topbar button").all()
for (const btn of buttons) {
  const label = await btn.getAttribute("aria-label")
  if (label?.toLowerCase().includes("panel") || label?.toLowerCase().includes("menu")) { await btn.tap(); break }
}
await p.waitForTimeout(700)
await p.getByRole("tab", { name: "Files" }).tap()
await p.waitForTimeout(1500)
const t2 = await p.evaluate(() => {
  const bodies = [...document.querySelectorAll(".scroll-body")]
  const body = bodies.find((el) => el.scrollHeight > el.clientHeight) ?? bodies[0]
  if (body === undefined) return { err: "no scroll-body" }
  const cs = getComputedStyle(body)
  const rect = body.getBoundingClientRect()
  const mk = (y) => new Touch({ identifier: 3, target: body, clientX: rect.x + 50, clientY: y })
  const fire = (type, y) => body.dispatchEvent(new TouchEvent(type, { touches: type === "touchend" ? [] : [mk(y)], changedTouches: [mk(y)], bubbles: true, cancelable: true }))
  const before = body.scrollTop
  fire("touchstart", rect.y + 300)
  for (let i = 1; i <= 6; i++) fire("touchmove", rect.y + 300 - i * 25)
  fire("touchend", 0)
  return {
    overflowY: cs.overflowY,
    overflows: body.scrollHeight > body.clientHeight,
    scrollH: body.scrollHeight,
    clientH: body.clientHeight,
    scrollTopBefore: before,
    scrollTopAfter: body.scrollTop,
    touchAction: cs.touchAction,
  }
})
console.log("T2-files:", JSON.stringify(t2))
await b.close()
