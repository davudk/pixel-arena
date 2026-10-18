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
          const list = (dir: string, sub: string) =>
            fs.existsSync(path.join(dir, sub)) ? fs.readdirSync(path.join(dir, sub)).filter((f: string) => f.endsWith('.json')) : []
          const index = fs.readdirSync(PACKS, { withFileTypes: true }).filter((d: any) => d.isDirectory())
            .map((d: any) => ({ dir: d.name, props: list(path.join(PACKS, d.name), 'props'), kits: list(path.join(PACKS, d.name), 'kits') }))
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(index))
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
  plugins: [svelte(), devFiles()],
  server: { port: 5200, strictPort: true },
})
