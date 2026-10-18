import { defineConfig, type Plugin } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import fs from 'node:fs'
import path from 'node:path'

const PACKS = path.resolve(__dirname, '../packs')
const REPORT = path.resolve(__dirname, 'report')

/** Serves the Godot project's packs/ folder at /packs, plus /packs/index.json listing every
 *  pack's manifest files (browsers can't list directories). Dev-only: POST /__save?name=x.png
 *  writes a data-URL screenshot into report/. */
function packs(): Plugin {
  return {
    name: 'pixel-arena-packs',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? '').split('?')[0])
        if (url === '/packs/index.json') {
          const index = fs.readdirSync(PACKS, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => {
              const dir = path.join(PACKS, d.name)
              const list = (sub: string) =>
                fs.existsSync(path.join(dir, sub)) ? fs.readdirSync(path.join(dir, sub)).filter((f) => f.endsWith('.json')) : []
              return { dir: d.name, props: list('props'), kits: list('kits') }
            })
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(index))
          return
        }
        if (url.startsWith('/packs/')) {
          const file = path.join(PACKS, url.slice('/packs/'.length))
          if (!file.startsWith(PACKS) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return next()
          const ext = path.extname(file)
          res.setHeader('Content-Type', ext === '.json' ? 'application/json' : ext === '.png' ? 'image/png' : 'model/gltf-binary')
          fs.createReadStream(file).pipe(res)
          return
        }
        if (url === '/__save' && req.method === 'POST') {
          const name = path.basename(new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? 'shot.png')
          let body = ''
          req.on('data', (c) => (body += c))
          req.on('end', () => {
            fs.mkdirSync(REPORT, { recursive: true })
            fs.writeFileSync(path.join(REPORT, name), Buffer.from(body.replace(/^data:[^,]*;base64,/, ''), 'base64'))
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
  plugins: [svelte(), packs()],
  server: { port: 5199, strictPort: true },
})
