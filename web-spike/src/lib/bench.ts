// Self-running benchmark (open with ?bench). Builds a small demo scene for a side-by-side
// screenshot with the Godot version, then scatters 2000 props and measures FPS and per-frame
// CPU time at two zoom levels. Results and screenshots go to web-spike/report/.

import * as THREE from 'three'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function run(spike: any) {
  const results: Record<string, unknown> = {
    userAgent: navigator.userAgent,
    devicePixelRatio: devicePixelRatio,
    viewport: [innerWidth, innerHeight],
    gl: rendererName(),
  }
  const measure = async (label: string, seconds = 5) => {
    const samples: { fps: number; cpu: number; frame: number }[] = []
    for (let i = 0; i < seconds; i++) {
      await sleep(1000)
      samples.push({ fps: spike.fps, cpu: spike.cpuMs, frame: spike.frameMs })
    }
    const avg = (k: 'fps' | 'cpu' | 'frame') => Math.round((samples.reduce((s, x) => s + x[k], 0) / samples.length) * 100) / 100
    results[label] = { fps: avg('fps'), cpuMs: avg('cpu'), frameMs: avg('frame'), stats: spike.stats }
  }

  await sleep(2500)
  await measure('empty', 3)

  // Demo-like scene (same props as the Godot --demo) for the side-by-side screenshot.
  const lib = spike.lib
  const pools = [lib.search('tree_oak'), lib.search('tree_default'), lib.search('tree_pine_round'),
    lib.search('rock_large'), lib.search('flower'), lib.search('plant_bush'), lib.search('character')]
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (const [pool, n] of [[pools[0].concat(pools[1], pools[2]), 40], [pools[3], 12], [pools[4].concat(pools[5]), 40], [pools[6], 8]] as const) {
    for (let i = 0; i < n; i++) {
      const p = pool[Math.floor(rnd() * pool.length)]
      await spike.world.add(p, new THREE.Vector3(rnd() * 64 - 24, 0, rnd() * 64 - 24), rnd() * Math.PI * 2)
    }
  }
  spike.rig.focus.set(8, 0, 8)
  spike.rig.zoom = 40
  await sleep(2500)
  await spike.saveShot('web-demo.png')
  await measure('demo_100_props', 3)

  spike.clearAll()
  await spike.scatter(2000)
  spike.rig.focus.set(0, 0, 0)
  spike.rig.zoom = 40
  await sleep(3000)
  await measure('scatter_2000_zoom40')
  await spike.saveShot('web-2000-zoom40.png')
  spike.rig.zoom = 160
  await sleep(3000)
  await measure('scatter_2000_zoom160')
  await spike.saveShot('web-2000-zoom160.png')

  const json = JSON.stringify(results, null, 2)
  await fetch('/__save?name=bench-chrome.json', { method: 'POST', body: 'data:application/json;base64,' + btoa(json) })
  document.title = 'BENCH DONE'
  console.log('bench', json)
}

function rendererName(): string {
  const gl = document.createElement('canvas').getContext('webgl2')
  const ext = gl?.getExtension('WEBGL_debug_renderer_info')
  return ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown'
}
