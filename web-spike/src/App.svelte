<script lang="ts">
  import { onMount } from 'svelte'
  import * as THREE from 'three'
  import { Library, type PropDef } from './lib/library'
  import { PixelRenderer, CameraRig } from './lib/pixel'
  import { World, makeGhost } from './lib/world'
  import { Thumbnails } from './lib/thumbs'

  let canvas: HTMLCanvasElement
  let lib: Library | null = $state(null)
  let query = $state('')
  let theme = $state('')
  let category = $state('')
  let selected: PropDef | null = $state(null)
  let thumbs: Record<string, string> = $state({})
  let fps = $state(0)
  let frameMs = $state(0)
  let cpuMs = $state(0)
  let stats = $state({ props: 0, kinds: 0, instancedMeshes: 0, drawCalls: 0, triangles: 0 })
  let pixelSize = $state(3)
  let outline = $state(true)
  let busy = $state('')

  const results = $derived(lib ? lib.search(query, theme, category) : [])
  const shown = $derived(results.slice(0, 240))
  const categories = $derived(lib ? [...lib.categories()] : [])

  let pixel: PixelRenderer
  let rig: CameraRig
  let world: World
  let thumbnailer: Thumbnails
  let ghost: THREE.Object3D | null = null
  let yaw = 0
  let mouse = { x: 0, y: 0 }
  let drag: null | { kind: 'pan' | 'orbit'; x: number; y: number } = null
  const keys = new Set<string>()

  $effect(() => {
    if (thumbnailer) thumbnailer.prioritize(shown)
  })
  $effect(() => {
    if (pixel) {
      pixel.pixelSize = pixelSize
      pixel.outline = outline ? 0.55 : 0
      resize()
    }
  })

  function thumb(p: PropDef): string | undefined {
    return thumbs[p.id] ?? thumbnailer?.get(p) ?? undefined
  }

  function resize() {
    pixel.resize(canvas.clientWidth, canvas.clientHeight)
  }

  function ndc(e: { clientX: number; clientY: number }) {
    const r = canvas.getBoundingClientRect()
    return pixel.toNdc(e.clientX - r.left, e.clientY - r.top, rig)
  }

  function groundAt(e: { clientX: number; clientY: number }): THREE.Vector3 | null {
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc(e), rig.camera)
    const p = new THREE.Vector3()
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)
  }

  async function choose(p: PropDef) {
    selected = p
    if (ghost) world.scene.remove(ghost)
    ghost = await makeGhost(p)
    world.scene.add(ghost)
    updateGhost({ clientX: mouse.x, clientY: mouse.y })
  }

  function cancelPlacing() {
    selected = null
    if (ghost) world.scene.remove(ghost)
    ghost = null
  }

  function updateGhost(e: { clientX: number; clientY: number; metaKey?: boolean; ctrlKey?: boolean }) {
    if (!ghost || !selected) return
    const hit = world.pick(ndc(e), rig.camera)
    ghost.visible = !!hit
    if (!hit) return
    ghost.position.copy(world.placementFor(selected, hit, yaw, !!(e.metaKey || e.ctrlKey)))
    ghost.rotation.y = yaw
  }

  function onPointerDown(e: PointerEvent) {
    canvas.setPointerCapture(e.pointerId)
    if (e.button === 1 || (e.button === 0 && keys.has(' '))) drag = { kind: 'pan', x: e.clientX, y: e.clientY }
    else if (e.button === 2 || (e.button === 0 && e.altKey)) drag = { kind: 'orbit', x: e.clientX, y: e.clientY }
    else if (e.button === 0 && selected && ghost?.visible) {
      world.add(selected, ghost.position.clone(), yaw).then(refreshStats)
    }
  }

  function onPointerMove(e: PointerEvent) {
    mouse = { x: e.clientX, y: e.clientY }
    if (drag?.kind === 'pan') {
      rig.panScreen(groundAt({ clientX: drag.x, clientY: drag.y }), groundAt(e))
    } else if (drag?.kind === 'orbit') {
      rig.rotateBy(-(e.clientX - drag.x) * 0.008)
      rig.pitch = Math.max(-1.55, Math.min(-0.15, rig.pitch - (e.clientY - drag.y) * 0.006))
    }
    if (drag) drag = { ...drag, x: e.clientX, y: e.clientY }
    updateGhost(e)
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
    if (!down) return
    if (k === 'q') rig.rotateBy(Math.PI / 4)
    if (k === 'e') rig.rotateBy(-Math.PI / 4)
    if (k === 'escape') cancelPlacing()
    if (k === 'r' && selected) {
      yaw += ((e.shiftKey ? -1 : 1) * selected.rotateSnapDeg * Math.PI) / 180
      updateGhost({ clientX: mouse.x, clientY: mouse.y })
    }
  }

  function refreshStats() {
    stats = { ...world.stats(), drawCalls: pixel.sceneInfo.calls, triangles: pixel.sceneInfo.triangles }
  }

  async function scatter(n: number) {
    if (!lib) return
    busy = `Scattering ${n} props…`
    const pool = [
      ...lib.search('tree', 'forest'), ...lib.search('rock'), ...lib.search('plant bush'),
      ...lib.search('flower'), ...lib.search('fence'), ...lib.search('character'), ...lib.search('wall wood'),
    ]
    const rng = mulberry32(7)
    const jobs: Promise<void>[] = []
    for (let i = 0; i < n; i++) {
      const p = pool[Math.floor(rng() * pool.length)]
      const x = (rng() - 0.5) * 220
      const z = (rng() - 0.5) * 220
      jobs.push(world.add(p, new THREE.Vector3(x, 0, z), Math.floor(rng() * 8) * (Math.PI / 4)))
    }
    await Promise.all(jobs)
    busy = ''
    refreshStats()
  }

  function clearAll() {
    world.clear()
    refreshStats()
  }

  /** Saves the canvas to web-spike/report/<name> (dev server only). */
  async function saveShot(name: string) {
    await fetch(`/__save?name=${encodeURIComponent(name)}`, { method: 'POST', body: canvas.toDataURL('image/png') })
  }

  function mulberry32(a: number) {
    return () => {
      a |= 0
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  onMount(() => {
    pixel = new PixelRenderer(canvas)
    rig = new CameraRig(pixel)
    world = new World()
    thumbnailer = new Thumbnails(pixel.renderer)
    thumbnailer.onReady = (id, url) => (thumbs[id] = url)
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    Library.load().then((l) => {
      lib = l
      if (location.search.includes('bench')) import('./lib/bench').then((b) => b.run((window as any).spike))
    })
    // Exposed for automated measurements (scatter, FPS, screenshots).
    ;(window as any).spike = {
      scatter, clearAll, saveShot, rig, world, get lib() { return lib },
      get fps() { return fps },
      get cpuMs() { return cpuMs },
      get frameMs() { return frameMs },
      get stats() { return stats },
    }

    let last = performance.now()
    let frames = 0
    let acc = 0
    let cpu = 0
    let raf = 0
    const loop = (t: number) => {
      const start = performance.now()
      const dt = Math.min((t - last) / 1000, 0.1)
      last = t
      const dx = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0)
      const dz = (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0)
      if (dx || dz) rig.panRelative(dx * 0.8 * dt, dz * 0.8 * dt)
      rig.update(dt)
      world.follow(rig.focus, rig.zoom)
      pixel.render(world.scene, rig)
      thumbnailer.tick()
      cpu += performance.now() - start
      frames++
      acc += dt
      if (acc >= 1) {
        fps = Math.round(frames / acc)
        frameMs = Math.round((acc / frames) * 1000 * 10) / 10
        cpuMs = Math.round((cpu / frames) * 100) / 100
        cpu = 0
        frames = 0
        acc = 0
        refreshStats()
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  })
</script>

<svelte:window onkeydown={(e) => onKey(e, true)} onkeyup={(e) => onKey(e, false)} />

<div class="app">
  <aside class="browser">
    <input class="search" placeholder="Search props…" bind:value={query} />
    <div class="chips">
      <button class:on={theme === ''} onclick={() => (theme = '')}>all</button>
      {#each lib?.themes() ?? [] as t (t)}
        <button class:on={theme === t} onclick={() => (theme = theme === t ? '' : t)}>{t}</button>
      {/each}
    </div>
    <nav class="categories">
      <button class:on={category === ''} onclick={() => (category = '')}>All props <span>{lib?.props.size ?? 0}</span></button>
      {#each categories as [path, count] (path)}
        <button class:on={category === path} style:padding-left="{10 + (path.split('/').length - 1) * 14}px"
          onclick={() => (category = path)}>{path.split('/').pop()} <span>{count}</span></button>
      {/each}
    </nav>
    <div class="grid">
      {#each shown as p (p.id)}
        <button class="tile" class:on={selected?.id === p.id} title="{p.name}&#10;{p.category} · {p.themes.join(', ')}" onclick={() => choose(p)}>
          {#if thumb(p)}<img src={thumb(p)} alt="" />{:else}<div class="ph"></div>{/if}
          <span>{p.name}</span>
        </button>
      {/each}
    </div>
    <footer>
      {#if selected}
        <strong>{selected.name}</strong> · {selected.category}<br />
        {lib?.packs.get(selected.packId)?.name} by {selected.attribution.author} ({selected.attribution.license})
      {:else}
        {results.length} props{results.length > shown.length ? ` (showing ${shown.length})` : ''}
      {/if}
    </footer>
  </aside>

  <main>
    <canvas bind:this={canvas} onpointerdown={onPointerDown} onpointermove={onPointerMove}
      onpointerup={() => (drag = null)} onwheel={onWheel} oncontextmenu={(e) => e.preventDefault()}></canvas>
    <header class="toolbar">
      <button onclick={() => scatter(2000)}>Scatter 2000</button>
      <button onclick={clearAll}>Clear</button>
      <label>Pixel <select bind:value={pixelSize}>{#each [1, 2, 3, 4, 6] as n (n)}<option value={n}>{n}</option>{/each}</select></label>
      <label><input type="checkbox" bind:checked={outline} /> Outline</label>
      {#if busy}<span class="busy">{busy}</span>{/if}
    </header>
    <div class="status">
      {fps} fps · {frameMs} ms frame · {cpuMs} ms CPU · {stats.props} props ({stats.kinds} kinds) · {stats.drawCalls} draw calls · {(stats.triangles / 1000).toFixed(0)}k tris
      {#if selected}<br />Placing {selected.name}: click to place · R rotate · Cmd = no snap · Esc{/if}
    </div>
  </main>
</div>
