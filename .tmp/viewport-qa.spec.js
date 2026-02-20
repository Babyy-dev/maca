const { test, expect } = require("playwright/test")
const fs = require("fs")
const path = require("path")

const BASE_URL = process.env.QA_BASE_URL || "http://127.0.0.1:3010"
const OUTPUT_DIR = path.resolve(".tmp", "viewport-qa")

const PUBLIC_ROUTES = [
  "/",
  "/auth/login",
  "/auth/register",
]

const PROTECTED_ROUTES = [
  "/lobby",
  "/game/single-player",
  "/spectator",
  "/wallet",
  "/leaderboard",
  "/profile",
  "/referrals",
  "/admin",
]

const VIEWPORTS = [
  { name: "360x800", width: 360, height: 800 },
  { name: "390x844", width: 390, height: 844 },
  { name: "412x915", width: 412, height: 915 },
  { name: "768x1024", width: 768, height: 1024 },
]

function slugifyRoute(route) {
  return route === "/" ? "home" : route.replace(/^\//, "").replace(/\//g, "__")
}

test.describe.configure({ mode: "serial" })
test.setTimeout(10 * 60 * 1000)

test("viewport QA screenshots and overflow checks", async ({ browser }) => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  const results = []
  const scenarios = [
    { name: "public", routes: PUBLIC_ROUTES, seedToken: false },
    { name: "authed-shell", routes: PROTECTED_ROUTES, seedToken: true },
  ]

  for (const scenario of scenarios) {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      })
      if (scenario.seedToken) {
        await context.addInitScript(() => {
          localStorage.setItem("maca_access_token", "qa-mobile-token")
        })
      }
      const page = await context.newPage()

      for (const route of scenario.routes) {
        const url = `${BASE_URL}${route}`
        const routeSlug = slugifyRoute(route)
        const routeDir = path.join(OUTPUT_DIR, scenario.name, routeSlug)
        fs.mkdirSync(routeDir, { recursive: true })
        const screenshotPath = path.join(routeDir, `${vp.name}.png`)

        let status = "ok"
        let overflowX = false
        let scrollWidth = 0
        let clientWidth = vp.width
        let finalUrl = ""

        try {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 })
          await page.waitForTimeout(2200)
          finalUrl = page.url()

          const metrics = await page.evaluate(() => {
            const doc = document.documentElement
            const body = document.body
            const scrollWidth = Math.max(
              doc ? doc.scrollWidth : 0,
              body ? body.scrollWidth : 0,
            )
            const clientWidth = Math.max(
              doc ? doc.clientWidth : 0,
              body ? body.clientWidth : 0,
            )
            return { scrollWidth, clientWidth }
          })

          scrollWidth = metrics.scrollWidth
          clientWidth = metrics.clientWidth
          overflowX = scrollWidth > clientWidth + 1
          await page.screenshot({ path: screenshotPath, fullPage: true })
        } catch (error) {
          status = `error: ${String(error?.message || error)}`
        }

        results.push({
          scenario: scenario.name,
          viewport: vp.name,
          route,
          finalUrl,
          status,
          overflowX,
          scrollWidth,
          clientWidth,
          screenshotPath,
        })
      }

      await context.close()
    }
  }

  const resultFile = path.join(OUTPUT_DIR, "results.json")
  fs.writeFileSync(resultFile, JSON.stringify(results, null, 2))

  const failures = results.filter((item) => item.status !== "ok" || item.overflowX)
  if (failures.length > 0) {
    const details = failures
      .map(
        (item) =>
          `${item.viewport} ${item.route} status=${item.status} overflow=${item.overflowX} width=${item.scrollWidth}/${item.clientWidth} finalUrl=${item.finalUrl}`,
      )
      .join("\n")
    expect(failures.length, details).toBe(0)
  } else {
    expect(failures.length).toBe(0)
  }
})
