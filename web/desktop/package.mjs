// Packages the desktop app into plain folders under web/desktop/out/ (Steam depots are folders,
// so no installers):
//   node package.mjs                 -> macOS arm64 + x64, Windows x64
//   node package.mjs darwin-arm64    -> just that target
// Run `npm run build -w app` first (the `package` script does). Builds are unsigned: macOS
// needs Developer ID signing + notarization before release (osxSign/osxNotarize options).

import { packager } from '@electron/packager'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const out = path.join(here, 'out')
const pkg = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8'))
const electronVersion = JSON.parse(fs.readFileSync(path.resolve(here, '../node_modules/electron/package.json'), 'utf8')).version

const ALL = ['darwin-arm64', 'darwin-x64', 'win32-x64']
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ALL
// steamworks.js ships native bindings for every platform; keep only the target's.
const STEAM_DIST = { darwin: 'osx', win32: 'win64' }

const web = path.resolve(here, '../app/dist')
if (!fs.existsSync(path.join(web, 'index.html'))) throw new Error('web/app/dist is missing: run npm run build -w app')

/** The app folder packager wraps: main, preload, a trimmed package.json and steamworks.js. */
function stage(platform) {
  const dir = path.join(out, `.stage-${platform}`)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  for (const f of ['main.cjs', 'preload.cjs']) fs.copyFileSync(path.join(here, f), path.join(dir, f))
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'pixel-arena', productName: 'Pixel Arena', version: pkg.version, main: 'main.cjs', dependencies: pkg.dependencies,
  }, null, 2))
  const steamSrc = path.resolve(here, '../node_modules/steamworks.js')
  const steamDst = path.join(dir, 'node_modules/steamworks.js')
  fs.cpSync(steamSrc, steamDst, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(steamSrc, src).split(path.sep)
      return rel[0] !== 'dist' || rel.length < 2 || rel[1] === STEAM_DIST[platform]
    },
  })
  return dir
}

/** Web build, packs and sample maps go next to the app as Resources/{web,packs,fixtures}. */
function resources() {
  const dir = path.join(out, '.resources')
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  fs.cpSync(web, path.join(dir, 'web'), { recursive: true })
  fs.cpSync(path.join(root, 'packs'), path.join(dir, 'packs'), {
    recursive: true, filter: (src) => !/\.(gdignore|import)$/.test(src),
  })
  fs.cpSync(path.resolve(here, '../app/fixtures'), path.join(dir, 'fixtures'), { recursive: true })
  return ['web', 'packs', 'fixtures'].map((d) => path.join(dir, d))
}

const extraResource = resources()
for (const target of targets) {
  const [platform, arch] = target.split('-')
  const t0 = Date.now()
  const paths = await packager({
    dir: stage(platform),
    out,
    platform,
    arch,
    electronVersion,
    name: 'Pixel Arena',
    executableName: platform === 'win32' ? 'PixelArena' : 'Pixel Arena',
    appBundleId: 'com.pixelarena.editor',
    appCategoryType: 'public.app-category.graphics-design',
    appCopyright: 'Pixel Arena',
    // Native modules can't load from inside an asar archive.
    asar: { unpack: '**/*.{node,dylib,dll}' },
    extraResource,
    prune: false, // node_modules is staged by hand above
    overwrite: true,
    quiet: true,
    win32metadata: { CompanyName: 'Pixel Arena', ProductName: 'Pixel Arena', FileDescription: 'Pixel Arena map editor' },
  })
  console.log(`${target}: ${paths.join(', ')} (${((Date.now() - t0) / 1000).toFixed(1)} s)`)
}
for (const d of fs.readdirSync(out)) if (d.startsWith('.')) fs.rmSync(path.join(out, d), { recursive: true, force: true })
