const http = require("http")
const path = require("path")
const { spawn, spawnSync } = require("child_process")

const ROOT = path.resolve(__dirname, "..")
const BACKEND_DIR = path.join(ROOT, "backend")
const BASE_URL = "http://127.0.0.1:3010"
const IS_WIN = process.platform === "win32"
const args = new Set(process.argv.slice(2))
const runBackend = !args.has("--frontend-only")
const runFrontend = !args.has("--backend-only")

let devServer = null

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || ROOT,
      env: options.env || process.env,
      stdio: options.stdio || "inherit",
      shell: options.shell ?? IS_WIN,
    })

    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`))
      }
    })
  })
}

function checkUrl(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume()
      resolve(res.statusCode >= 200 && res.statusCode < 500)
    })
    req.on("error", () => resolve(false))
    req.setTimeout(1500, () => {
      req.destroy()
      resolve(false)
    })
  })
}

async function waitForUrl(url, timeoutMs = 120000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await checkUrl(url)
    if (ok) return
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 1500))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function stopDevServer() {
  if (!devServer || devServer.exitCode !== null) return

  if (IS_WIN) {
    spawnSync("taskkill", ["/PID", String(devServer.pid), "/T", "/F"], {
      stdio: "ignore",
      shell: true,
    })
    return
  }

  devServer.kill("SIGTERM")
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (devServer && devServer.exitCode === null) {
        devServer.kill("SIGKILL")
      }
      resolve()
    }, 4000)
    devServer.on("exit", () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

async function main() {
  process.on("SIGINT", async () => {
    await stopDevServer()
    process.exit(130)
  })
  process.on("SIGTERM", async () => {
    await stopDevServer()
    process.exit(143)
  })

  if (runBackend) {
    console.log("==> Running backend smoke tests")
    await run("python", ["-m", "pytest", "tests", "-q"], {
      cwd: BACKEND_DIR,
      env: { ...process.env, DEBUG: "false" },
    })
  }

  if (runFrontend) {
    console.log("==> Starting Next.js dev server on :3010")
    devServer = spawn("npm", ["run", "dev", "--", "-p", "3010"], {
      cwd: ROOT,
      env: process.env,
      shell: IS_WIN,
      stdio: ["ignore", "pipe", "pipe"],
    })
    devServer.stdout.on("data", (chunk) => process.stdout.write(`[dev] ${chunk}`))
    devServer.stderr.on("data", (chunk) => process.stderr.write(`[dev] ${chunk}`))

    await waitForUrl(BASE_URL, 150000)

    console.log("==> Running frontend smoke tests")
    await run("npx", ["playwright", "test", ".tmp/viewport-qa.spec.js", "--reporter=line"], {
      cwd: ROOT,
      env: { ...process.env, QA_BASE_URL: BASE_URL },
    })
  }
}

main()
  .then(async () => {
    await stopDevServer()
    console.log("==> Smoke tests passed")
  })
  .catch(async (error) => {
    await stopDevServer()
    console.error(`Smoke test failed: ${error.message}`)
    process.exit(1)
  })
