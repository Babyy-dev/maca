const fs = require("fs")
const path = require("path")

const root = path.resolve(__dirname, "..")
const distDir = path.join(root, "frontend-vue", "dist")
const targetDir = path.join(root, "public", "vue-game")

if (!fs.existsSync(distDir)) {
  throw new Error(
    "frontend-vue/dist not found. Run `npm run vue:build` before `npm run vue:sync`.",
  )
}

fs.rmSync(targetDir, { recursive: true, force: true })
fs.mkdirSync(targetDir, { recursive: true })
fs.cpSync(distDir, targetDir, { recursive: true })

console.log(`Synced Vue game build to ${targetDir}`)
