import { defineConfig, type Plugin } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '../..')
const PACKS = path.join(ROOT, 'packs')
const FIXTURES = path.resolve(__dirname, 'fixtures')
const SHOTS = path.resolve(__dirname, 'shots')

const TYPES: Record<string, string> = {
  '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary', '.pxmap': 'application/zip',
}

/** The packs directory listing the library loads first (browsers can't list directories). */
function packIndex() {
  const list = (dir: string, sub: string) =>
    fs.existsSync(path.join(dir, sub)) ? fs.readdirSync(path.join(dir, sub)).filter((f: string) => f.endsWith('.json')) : []
  return fs.readdirSync(PACKS, { withFileTypes: true }).filter((d) => d.isDirectory())
    .map((d) => ({ dir: d.name, props: list(path.join(PACKS, d.name), 'props'), kits: list(path.join(PACKS, d.name), 'kits'), terrain: list(path.join(PACKS, d.name), 'terrain'), buildings: list(path.join(PACKS, d.name), 'buildings') }))
}

/** Static web build (PAGES_BASE set, e.g. /pixel-arena/ for GitHub Pages): copies the packs,
 *  their index and the sample maps into dist so the site works without a server. The desktop
 *  build leaves them out; it ships packs and fixtures next to the app instead. */
function staticFiles(): Plugin {
  let outDir = ''
  return {
    name: 'pixel-arena-static-files',
    apply: 'build',
    configResolved(c) { outDir = path.resolve(c.root, c.build.outDir) },
    closeBundle() {
      if (!process.env.PAGES_BASE) return
      fs.cpSync(PACKS, path.join(outDir, 'packs'), { recursive: true, filter: (f) => !f.endsWith('.DS_Store') })
      fs.writeFileSync(path.join(outDir, 'packs/index.json'), JSON.stringify(packIndex()))
      fs.cpSync(FIXTURES, path.join(outDir, 'fixtures'), { recursive: true })
    },
  }
}

/** Dev server extras: /packs (the repo's prop packs, plus /packs/index.json listing manifest
 *  files since browsers can't list directories), /fixtures (sample .pxmap files) and, for
 *  automated checks, POST /__save?name=x.png which writes a data URL into shots/. */
function devFiles(): Plugin {
  const serveFrom = (base: string, dir: string, url: string, res: any): boolean => {
    const file = path.join(dir, url.slice(base.length))
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return false
    res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream')
    fs.createReadStream(file).pipe(res)
    return true
  }
  return {
    name: 'pixel-arena-dev-files',
    configureServer(server) {
      server.middlewares.use((req: any, res: any, next: () => void) => {
        const url = decodeURIComponent((req.url ?? '').split('?')[0])
        if (url === '/packs/index.json') {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(packIndex()))
          return
        }
        if (url.startsWith('/packs/') && serveFrom('/packs/', PACKS, url, res)) return
        if (url.startsWith('/fixtures/') && serveFrom('/fixtures/', FIXTURES, url, res)) return
        if (url === '/__save' && req.method === 'POST') {
          const name = path.basename(new URL(req.url, 'http://x').searchParams.get('name') ?? 'shot.png')
          let body = ''
          req.on('data', (c: string) => (body += c))
          req.on('end', () => {
            fs.mkdirSync(SHOTS, { recursive: true })
            fs.writeFileSync(path.join(SHOTS, name), Buffer.from(body.replace(/^data:[^,]*;base64,/, ''), 'base64'))
            res.end('ok')
          })
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  base: process.env.PAGES_BASE ?? '/',
  plugins: [svelte(), devFiles(), staticFiles()],
  server: { port: 5200, strictPort: true },
})
