import { chromium, devices } from "playwright"
const b = await chromium.launch()
const ctx = await b.newContext({ ...devices["iPhone 13"], viewport: { width: 375, height: 812 }, hasTouch: true })
const p = await ctx.newPage()
await p.goto("http://127.0.0.1:7821")
await p.fill("#password", "jakilinux1^^")
await p.click("button[type=submit]")
await p.waitForSelector(".terminal canvas", { timeout: 15000 })
await p.waitForTimeout(2500)

// T2: open the drawer, measure the herdr panel scroller
await p.tap("button[aria-label='Open panel'], .topbar button:last-child").catch(() => p.tap("button:has(.icon)"))
await p.waitForTimeout(700)
const t2 = await p.evaluate(() => {
  const body = document.querySelector(".drawer .scroll-body") ?? document.querySelector(".scroll-body")
  if (body === null) return { err: "no scroll-body" }
  const cs = getComputedStyle(body)
  const before = body.scrollTop
  // synthetic one-finger drag upward on the panel list
  const rect = body.getBoundingClientRect()
  const mk = (y) => new Touch({ identifier: 3, target: body, clientX: rect.x + 50, clientY: y })
  const fire = (type, y) => body.dispatchEvent(new TouchEvent(type, { touches: type === "touchend" ? [] : [mk(y)], changedTouches: [mk(y)], bubbles: true, cancelable: true }))
  fire("touchstart", rect.y + 200)
  for (let i = 1; i <= 5; i++) fire("touchmove", rect.y + 200 - i * 20)
  fire("touchend", 0)
  return {
    overflowY: cs.overflowY,
    scrollH: body.scrollHeight,
    clientH: body.clientHeight,
    overflows: body.scrollHeight > body.clientHeight,
    scrollTopBefore: before,
    scrollTopAfter: body.scrollTop,
  }
})
console.log("T2:", JSON.stringify(t2))
await p.keyboard.press("Escape").catch(() => {})
await p.waitForTimeout(500)

// T3: drag-scroll on the terminal must NOT focus the textarea
const t3 = await p.evaluate(async () => {
  const ta = document.querySelector(".terminal textarea")
  if (document.activeElement === ta) ta.blur()
  await new Promise((r) => setTimeout(r, 100))
  const cont = document.querySelector(".terminal")
  const canvas = cont.querySelector("canvas")
  const mk = (y) => new Touch({ identifier: 8, target: canvas, clientX: 180, clientY: y })
  const fire = (el, type, y) => el.dispatchEvent(new TouchEvent(type, { touches: type === "touchend" ? [] : [mk(y)], changedTouches: [mk(y)], bubbles: true, cancelable: true }))
  // drag on the CANVAS (bubbles through container) like a real finger
  fire(canvas, "touchstart", 400)
  for (let i = 1; i <= 5; i++) fire(canvas, "touchmove", 400 - i * 15)
  fire(canvas, "touchend", 325)
  await new Promise((r) => setTimeout(r, 200))
  const afterDrag = document.activeElement === ta
  // now a plain tap
  fire(canvas, "touchstart", 400)
  fire(canvas, "touchend", 400)
  await new Promise((r) => setTimeout(r, 200))
  const afterTap = document.activeElement === ta
  return { focusStolenByDrag: afterDrag, tapFocuses: afterTap }
})
console.log("T3:", JSON.stringify(t3))
await b.close()
