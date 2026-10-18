<script lang="ts">
  // Pixel Arena (web) — viewport for now: renders a .pxmap with the full look (pixel filter,
  // outlines, lighting / time of day, terrain, water, buildings, animated props). Editing tools
  // come in the next port steps.
  //
  // URL parameters (for automated checks): map=<url of .pxmap>, camera=<x>,<z>,<zoom>,
  // time=<hours>, pixel=<n>, outline=0|1, grid=0|1, cutaway=<level>, scatter=<n> (adds n random
  // props for performance checks; chars=0 leaves out animated characters), shot=<file.png> (saves the canvas into web/app/shots/ once
  // everything has loaded, plus <file>.json with fps and draw stats).
  import { onMount } from 'svelte'
  import * as THREE from 'three'
  import { MapSession, openProject, terrainEdit, Vec3 } from '@pixel-arena/core'
  import type { Library as Lib } from './library/library'
  import { Library } from './library/library'
  import { CameraRig, PixelRenderer } from './render/pixel'
  import { DayCycle } from './render/day-cycle'
  import { Ground } from './render/ground'
  import { TerrainView } from './render/terrain-view'
  import { showGrid } from './render/terrain-shading'
  import { WorldView } from './world/world-view'

  const params = new URLSearchParams(location.search)
  const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d)

  let canvas: HTMLCanvasElement
  let fileInput: HTMLInputElement
  let status = $state('Loading library…')
  let mapName = $state('Untitled')
  let pixelSize = $state(num('pixel', 3))
  let outline = $state(num('outline', 1) === 1)
  let grid = $state(num('grid', 1) === 1)
  let timeOfDay = $state(num('time', 10))
  let cycle = $state(false)
  let cutaway = $state(num('cutaway', -1))
  let fps = $state(0)
  let stats = $state('')

  let pixel: PixelRenderer
  let rig: CameraRig
  let day: DayCycle
  let ground: Ground
  let terrain: TerrainView
  let world: WorldView
  let session = new MapSession()
  const scene = new THREE.Scene()
  let drag: null | { kind: 'pan' | 'orbit'; x: number; y: number } = null
  const keys = new Set<string>()

  $effect(() => {
    if (!pixel) return
    pixel.pixelSize = pixelSize
    pixel.outline = outline ? 0.55 : 0
    resize()
  })
  $effect(() => {
    showGrid.value = grid
  })
  $effect(() => {
    if (!day) return
    day.timeOfDay = timeOfDay
    day.mode = cycle ? 'cycle' : 'fixed'
    day.apply()
  })
  $effect(() => {
    world?.setCutaway(cutaway)
  })

  function resize() {
    pixel.resize(canvas.clientWidth, canvas.clientHeight)
  }

  function setSession(s: MapSession, name: string) {
    session = s
    mapName = name
    world.bind(s.doc)
    terrain.bind(s.doc)
  }

  async function openUrl(url: string) {
    status = `Opening ${url}…`
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
    setSession(openProject(bytes), url.split('/').pop() ?? url)
    status = ''
  }

  async function openFile(file: File) {
    try {
      setSession(openProject(new Uint8Array(await file.arrayBuffer())), file.name)
      status = ''
    } catch (e) {
      status = `Couldn't open ${file.name}: ${(e as Error).message}`
    }
  }

  /** Terrain point under a screen position (uses the core's heightfield raycast). */
  function groundAt(e: { clientX: number; clientY: number }): THREE.Vector3 | null {
    const r = canvas.getBoundingClientRect()
    const ray = new THREE.Raycaster()
    ray.setFromCamera(pixel.toNdc(e.clientX - r.left, e.clientY - r.top, rig), rig.camera)
    const o = ray.ray.origin.clone().addScaledVector(ray.ray.direction, -2000)
    const d = ray.ray.direction
    const hit = terrainEdit.raycast(session.doc, new Vec3(o.x, o.y, o.z), new Vec3(d.x, d.y, d.z))
    return hit ? new THREE.Vector3(hit.x, hit.y, hit.z) : null
  }

  function onPointerDown(e: PointerEvent) {
    canvas.setPointerCapture(e.pointerId)
    if (e.button === 1 || (e.button === 0 && keys.has(' '))) drag = { kind: 'pan', x: e.clientX, y: e.clientY }
    else if (e.button === 2 || (e.button === 0 && e.altKey)) drag = { kind: 'orbit', x: e.clientX, y: e.clientY }
  }

  function onPointerMove(e: PointerEvent) {
    if (drag?.kind === 'pan') rig.panScreen(groundAt({ clientX: drag.x, clientY: drag.y }), groundAt(e))
    else if (drag?.kind === 'orbit') {
      rig.rotateBy(-(e.clientX - drag.x) * 0.008)
      rig.pitch = Math.max(-1.55, Math.min(-0.15, rig.pitch - (e.clientY - drag.y) * 0.006))
    }
    if (drag) drag = { ...drag, x: e.clientX, y: e.clientY }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    const before = groundAt(e)
    rig.zoom = Math.max(4, Math.min(400, rig.zoom * Math.pow(1.0015, e.deltaY)))
    rig.update(0)
    rig.panScreen(before, groundAt(e))
  }

  function onKey(e: KeyboardEvent, down: boolean) {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    const k = e.key.toLowerCase()
    if (down) keys.add(k)
    else keys.delete(k)
    if (down && k === 'q') rig.rotateBy(Math.PI / 4)
    if (down && k === 'e') rig.rotateBy(-Math.PI / 4)
  }

  /** Adds `n` random props over a 220 m square (performance checks). */
  function scatter(lib: Lib, n: number) {
    const pool = [...lib.search('tree', 'forest'), ...lib.search('rock'), ...lib.search('plant bush'),
      ...lib.search('flower'), ...lib.search('fence'), ...(params.get('chars') === '0' ? [] : lib.search('character')), ...lib.search('wall wood')]
    let seed = 7
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    session.edit(`Scatter ${n}`, () => {
      for (let i = 0; i < n; i++) {
        const p = pool[Math.floor(rnd() * pool.length)]
        session.createObject('prop', { prop: p.id, position: new Vec3((rnd() - 0.5) * 220, 0, (rnd() - 0.5) * 220), rotation: Math.floor(rnd() * 8) * (Math.PI / 4), anim_offset: rnd() })
      }
    })
  }

  async function screenshotWhenReady(name: string) {
    const start = performance.now()
    while ((world.busy || status) && performance.now() - start < 30000) await new Promise((r) => setTimeout(r, 250))
    await new Promise((r) => setTimeout(r, 1500))
    await fetch(`/__save?name=${encodeURIComponent(name)}`, { method: 'POST', body: canvas.toDataURL('image/png') })
    const samples: number[] = []
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      samples.push(fps)
    }
    const report = { fps: samples, stats, devicePixelRatio, canvas: [canvas.width, canvas.height] }
    await fetch(`/__save?name=${encodeURIComponent(name.replace(/\.png$/, '.json'))}`, {
      method: 'POST', body: 'data:application/json;base64,' + btoa(JSON.stringify(report, null, 2)),
    })
    document.title = 'SHOT DONE'
  }

  onMount(() => {
    pixel = new PixelRenderer(canvas)
    rig = new CameraRig(pixel)
    day = new DayCycle(scene)
    ground = new Ground()
    terrain = new TerrainView()
    terrain.onChunksChanged = (chunks) => ground.setHoles(chunks)
    scene.add(ground.mesh, terrain.root)
    const cam = params.get('camera')?.split(',').map(Number)
    if (cam?.length === 3) {
      rig.focus.set(cam[0], 0, cam[1])
      rig.zoom = cam[2]
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    Library.load().then(async (lib) => {
      world = new WorldView(lib)
      scene.add(world.root)
      world.setCutaway(cutaway)
      setSession(session, 'Untitled')
      status = ''
      if (params.get('map')) await openUrl(params.get('map')!)
      if (params.get('scatter')) scatter(lib, Number(params.get('scatter')))
      if (params.get('shot')) screenshotWhenReady(params.get('shot')!)
    })
    ;(window as any).pixelArena = { get session() { return session }, rig, scene, pixel }

    let last = performance.now()
    let frames = 0
    let acc = 0
    let raf = 0
    const loop = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.1)
      last = t
      const dx = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0)
      const dz = (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0)
      if (dx || dz) rig.panRelative(dx * 0.8 * dt, dz * 0.8 * dt)
      rig.update(dt)
      day.update(dt)
      if (cycle) timeOfDay = day.timeOfDay
      day.follow(rig.focus, rig.zoom * 1.2)
      ground.follow(rig.focus)
      terrain.flush()
      world?.update(dt, rig.camera)
      pixel.render(scene, rig)
      frames++
      acc += dt
      if (acc >= 1) {
        fps = Math.round(frames / acc)
        const s = world?.stats()
        stats = s ? `${s.instanced} instanced · ${s.singles} other · ${pixel.sceneInfo.calls} draws · ${(pixel.sceneInfo.triangles / 1000).toFixed(0)}k tris` : ''
        frames = 0
        acc = 0
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  })

  const clock = $derived(`${String(Math.floor(timeOfDay)).padStart(2, '0')}:${String(Math.floor((timeOfDay % 1) * 60)).padStart(2, '0')}`)
</script>

<svelte:window onkeydown={(e) => onKey(e, true)} onkeyup={(e) => onKey(e, false)} />

<main>
  <canvas bind:this={canvas} onpointerdown={onPointerDown} onpointermove={onPointerMove}
    onpointerup={() => (drag = null)} onwheel={onWheel} oncontextmenu={(e) => e.preventDefault()}></canvas>

  <header class="bar">
    <button onclick={() => fileInput.click()}>Open…</button>
    <input bind:this={fileInput} type="file" accept=".pxmap" hidden onchange={(e) => {
      const f = (e.currentTarget as HTMLInputElement).files?.[0]
      if (f) openFile(f)
    }} />
    <span class="name">{mapName}</span>
  </header>

  <aside class="panel">
    <h2>View</h2>
    <label>Pixel size <select bind:value={pixelSize}>{#each [1, 2, 3, 4, 6] as n (n)}<option value={n}>{n}</option>{/each}</select></label>
    <label><input type="checkbox" bind:checked={outline} /> Outlines</label>
    <label><input type="checkbox" bind:checked={grid} /> Grid</label>
    <label class="time">Time <input type="range" min="0" max="24" step="0.25" bind:value={timeOfDay} /> <span>{clock}</span></label>
    <label><input type="checkbox" bind:checked={cycle} /> Day/night cycle</label>
    <label>Building level
      <select bind:value={cutaway}>
        <option value={-1}>All</option>
        {#each [0, 1, 2, 3] as l (l)}<option value={l}>Up to {l}</option>{/each}
      </select>
    </label>
  </aside>

  <footer class="status">
    {#if status}{status}{:else}{fps} fps · {stats}{/if}
  </footer>
</main>
