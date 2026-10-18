<script lang="ts">
  // Pixel Arena (web): viewport + editor shell. Camera input (MMB / Space+drag pan, RMB /
  // Alt+drag orbit, wheel zoom, WASD, Q/E) is handled here; the left button and unhandled keys go
  // to the active tool (see editor/editor.ts).
  //
  // URL parameters (for automated checks): map=<url of .pxmap>, camera=<x>,<z>,<zoom>,
  // time=<hours>, pixel=<n>, outline=0|1, grid=0|1, cutaway=<level>, scatter=<n> (adds n random
  // props; chars=0 leaves out animated characters), shot=<file.png> (saves the canvas into
  // web/app/shots/ once everything has loaded, plus <file>.json with fps and draw stats),
  // selftest=place|select|terrain|building|branches (drives the tools end to end, writes shots/selftest-<name>.json),
  // tool=select|terrain|water|building (start with that tool).
  import { onMount } from 'svelte'
  import * as THREE from 'three'
  import { MapSession, openProject, saveProject, Vec3 } from '@pixel-arena/core'
  import { Library, type PropDef } from './library/library'
  import { Thumbnails } from './library/thumbs'
  import { CameraRig, PixelRenderer } from './render/pixel'
  import { DayCycle } from './render/day-cycle'
  import { Ground } from './render/ground'
  import { TerrainView } from './render/terrain-view'
  import { showGrid } from './render/terrain-shading'
  import { WorldView } from './world/world-view'
  import { Editor, type BoxRect, type Pointer } from './editor/editor'
  import { PlaceTool } from './editor/place-tool'
  import { SelectTool } from './editor/select-tool'
  import { TerrainTool } from './editor/terrain-tool'
  import { WaterTool } from './editor/water-tool'
  import TerrainOptions from './ui/TerrainOptions.svelte'
  import { BuildingTool } from './editor/building-tool'
  import BuildingOptions from './ui/BuildingOptions.svelte'
  import HistoryPanel from './ui/HistoryPanel.svelte'
  import Dialogs, { type DialogState } from './ui/Dialogs.svelte'
  import { buildReview, resolutions } from './ui/merge-review'
  import PropBrowser from './ui/PropBrowser.svelte'
  import { runSelfTest } from './editor/selftest'

  const params = new URLSearchParams(location.search)
  const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d)

  let canvas: HTMLCanvasElement
  let fileInput: HTMLInputElement
  let status = $state('Loading library…')
  let mapName = $state('Untitled')
  let dirty = $state(false)
  let pixelSize = $state(num('pixel', 3))
  let outline = $state(num('outline', 1) === 1)
  let grid = $state(num('grid', 1) === 1)
  let timeOfDay = $state(num('time', 10))
  let cycle = $state(false)
  let cutaway = $state(num('cutaway', -1))
  let fps = $state(0)
  let stats = $state('')
  let toolInfo = $state('')
  let activeTool = $state('select')
  let selected = $state(0)
  let boxRect: BoxRect | null = $state(null)
  let placing: string | null = $state(null)
  let randomRotation = $state(false)
  let canUndo = $state(false)
  let canRedo = $state(false)
  let library: Library | null = $state(null)
  let dialog: DialogState = $state(null)
  let editorReady = $state(false)
  let thumbnails: Thumbnails | null = $state(null)

  let pixel: PixelRenderer
  let rig: CameraRig
  let day: DayCycle
  let ground: Ground
  let terrain: TerrainView
  let world: WorldView
  let editor: Editor | null = null
  const scene = new THREE.Scene()
  let drag: null | { kind: 'pan' | 'orbit'; x: number; y: number } = null
  let toolPressed = false
  const keys = new Set<string>()
  let unbindHistory = () => {}

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
    if (editor) editor.viewCutaway = cutaway
    if (activeTool !== 'building') world?.setCutaway(cutaway)
  })
  $effect(() => {
    if (editor?.tool instanceof PlaceTool) editor.tool.randomRotation = randomRotation
  })
  $effect(() => {
    document.title = `Pixel Arena — ${mapName}${dirty ? ' •' : ''}`
  })

  function resize() {
    pixel.resize(canvas.clientWidth, canvas.clientHeight)
  }

  function setSession(s: MapSession, name: string) {
    mapName = name
    dirty = false
    world.bind(s.doc)
    terrain.bind(s.doc)
    unbindHistory()
    unbindHistory = s.historyChanged.connect(() => {
      dirty = true
      refreshHistory()
    })
    editor?.setSession(s)
    refreshHistory()
  }

  function refreshHistory() {
    canUndo = editor?.session.canUndo() ?? false
    canRedo = editor?.session.canRedo() ?? false
  }

  // --- Files --------------------------------------------------------------------------

  function newMap() {
    if (dirty && !confirm('Discard unsaved changes?')) return
    setSession(new MapSession(), 'Untitled')
  }

  async function openUrl(url: string) {
    status = `Opening ${url}…`
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
    setSession(openProject(bytes), url.split('/').pop() ?? url)
    status = ''
  }

  async function openFile(file: File) {
    if (dirty && !confirm('Discard unsaved changes?')) return
    try {
      setSession(openProject(new Uint8Array(await file.arrayBuffer())), file.name)
      status = ''
    } catch (e) {
      status = `Couldn't open ${file.name}: ${(e as Error).message}`
    }
  }

  /** Browser build: downloads the project. (The desktop build will write files directly.) */
  function save() {
    if (!editor) return
    const name = mapName.endsWith('.pxmap') ? mapName : `${mapName}.pxmap`
    const url = URL.createObjectURL(new Blob([saveProject(editor.session)], { type: 'application/zip' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
    mapName = name
    dirty = false
  }

  function undo() {
    editor?.session.undo()
  }

  function redo() {
    editor?.session.redo()
  }

  // --- Tools --------------------------------------------------------------------------

  const TOOLS = [
    { name: 'select', label: 'Select', key: 'V' },
    { name: 'terrain', label: 'Terrain', key: 'T' },
    { name: 'water', label: 'Water', key: 'O' },
    { name: 'building', label: 'Build', key: 'B' },
  ]

  // --- Branches ------------------------------------------------------------------------

  function askNewBranch(from: string, seq: number) {
    if (!editor) return
    const ed = editor
    dialog = { kind: 'name', title: 'New branch', initial: `Branch ${ed.session.branches.size}`, submit: (n) => ed.newBranch(from, seq, n) }
  }

  function askRename(id: string) {
    if (!editor) return
    const ed = editor
    dialog = { kind: 'name', title: 'Rename branch', initial: ed.session.branches.get(id)!.name, submit: (n) => ed.session.renameBranch(id, n) }
  }

  function askMerge(id: string) {
    if (!editor || !library) return
    const ed = editor
    const review = buildReview(ed.session, id, library)
    dialog = { kind: 'merge', review, merge: (take) => ed.mergeBranch(id, resolutions(review.rows, take)) }
  }

  function askDiscard(id: string) {
    if (!editor) return
    const ed = editor
    const b = ed.session.branches.get(id)!
    const kids = ed.session.childrenOf(id).length
    dialog = {
      kind: 'confirm', title: 'Discard branch', confirmLabel: 'Discard',
      message: `Discard “${b.name}” and its ${b.txns.length} edits${kids ? ` and ${kids} sub-branch${kids === 1 ? '' : 'es'}` : ''}? This can't be undone.`,
      confirm: () => ed.discardBranch(id),
    }
  }

  function setToolByName(name: string) {
    if (!editor) return
    if (name !== 'select') editor.selection.clear()
    editor.setTool(
      name === 'terrain' ? new TerrainTool(editor)
        : name === 'water' ? new WaterTool(editor)
          : name === 'building' ? new BuildingTool(editor)
            : new SelectTool(editor),
    )
  }

  function choose(prop: PropDef) {
    if (!editor) return
    const tool = new PlaceTool(editor, prop)
    tool.randomRotation = randomRotation
    editor.setTool(tool)
  }

  function pointer(e: MouseEvent): Pointer {
    const r = canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top, shift: e.shiftKey, alt: e.altKey, cmd: e.metaKey || e.ctrlKey }
  }

  function onPointerDown(e: PointerEvent) {
    canvas.setPointerCapture(e.pointerId)
    ;(document.activeElement as HTMLElement | null)?.blur()
    if (e.button === 1 || (e.button === 0 && keys.has(' '))) drag = { kind: 'pan', x: e.clientX, y: e.clientY }
    else if (e.button === 2 || (e.button === 0 && e.altKey)) drag = { kind: 'orbit', x: e.clientX, y: e.clientY }
    else if (e.button === 0 && editor) {
      toolPressed = true
      editor.tool.pointerDown?.(pointer(e))
    }
  }

  function onPointerMove(e: PointerEvent) {
    const p = pointer(e)
    if (editor) editor.cursor = p
    if (drag?.kind === 'pan' && editor) {
      rig.panScreen(editor.groundAt({ ...p, x: p.x + drag.x - e.clientX, y: p.y + drag.y - e.clientY }), editor.groundAt(p))
    } else if (drag?.kind === 'orbit') {
      rig.rotateBy(-(e.clientX - drag.x) * 0.008)
      rig.pitch = Math.max(-1.55, Math.min(-0.15, rig.pitch - (e.clientY - drag.y) * 0.006))
    }
    if (drag) drag = { ...drag, x: e.clientX, y: e.clientY }
    else editor?.tool.pointerMove?.(p)
  }

  function onPointerUp(e: PointerEvent) {
    drag = null
    if (toolPressed && e.button === 0) {
      toolPressed = false
      editor?.tool.pointerUp?.(pointer(e))
    }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    if (!editor) return
    const p = pointer(e)
    const before = editor.groundAt(p)
    rig.zoom = Math.max(4, Math.min(400, rig.zoom * Math.pow(1.0015, e.deltaY)))
    rig.update(0)
    rig.panScreen(before, editor.groundAt(p))
  }

  function onKey(e: KeyboardEvent, down: boolean) {
    if ((e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'checkbox') return
    if (dialog) return
    const k = e.key.toLowerCase()
    if (down) keys.add(k)
    else keys.delete(k)
    if (!down) return
    const cmd = e.metaKey || e.ctrlKey
    if (cmd && ['z', 'y', 's', 'o'].includes(k)) {
      if (k === 'z') e.shiftKey ? redo() : undo()
      else if (k === 'y') redo()
      else if (k === 's') save()
      else fileInput.click()
      e.preventDefault()
      return
    }
    if (editor?.tool.key?.(e)) {
      e.preventDefault()
      return
    }
    if (cmd) return
    if (k === 'v') setToolByName('select')
    else if (k === 't') setToolByName('terrain')
    else if (k === 'o') setToolByName('water')
    else if (k === 'b') setToolByName('building')
    else if (k === 'q') rig.rotateBy(Math.PI / 4)
    else if (k === 'e') rig.rotateBy(-Math.PI / 4)
  }

  /** Adds `n` random props over a 220 m square (performance checks). */
  function scatter(lib: Library, s: MapSession, n: number) {
    const pool = [...lib.search('tree', 'forest'), ...lib.search('rock'), ...lib.search('plant bush'),
      ...lib.search('flower'), ...lib.search('fence'), ...(params.get('chars') === '0' ? [] : lib.search('character')), ...lib.search('wall wood')]
    let seed = 7
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    s.edit(`Scatter ${n}`, () => {
      for (let i = 0; i < n; i++) {
        const p = pool[Math.floor(rnd() * pool.length)]
        s.createObject('prop', { prop: p.id, position: new Vec3((rnd() - 0.5) * 220, 0, (rnd() - 0.5) * 220), rotation: Math.floor(rnd() * 8) * (Math.PI / 4), anim_offset: rnd() })
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
      const thumbs = new Thumbnails(pixel.renderer)
      editor = new Editor(new MapSession(), lib, thumbs, world, rig, pixel, scene)
      const ed = editor
      ed.defaultTool = () => new SelectTool(ed)
      ed.toolChanged.connect((t) => {
        placing = t instanceof PlaceTool ? t.prop.id : null
        activeTool = t.name
        toolInfo = t instanceof PlaceTool
          ? `Placing ${t.prop.name}: click to place · R rotate · Cmd = no snap · Esc stop`
          : t instanceof WaterTool
            ? 'Water: click corners · click the first corner or Enter to finish · Backspace undo corner · Esc'
            : t instanceof TerrainTool || t instanceof BuildingTool
              ? ''
              : 'Click / drag-box to select · drag to move · R rotate · PgUp/PgDn raise · Del · Cmd+D · Cmd+C/V · I pick prop · F focus'
      })
      ed.selection.changed.connect(() => (selected = ed.selection.size))
      ed.box.connect((r) => (boxRect = r))
      library = lib
      thumbnails = thumbs
      editorReady = true
      setSession(editor.session, 'Untitled')
      status = ''
      if (params.get('map')) await openUrl(params.get('map')!)
      if (params.get('scatter')) scatter(lib, editor.session, Number(params.get('scatter')))
      if (params.get('tool')) setToolByName(params.get('tool')!)
      if (params.get('shot')) screenshotWhenReady(params.get('shot')!)
      if (params.get('selftest')) runSelfTest(params.get('selftest')!, editor, () => world.busy)
    })
    ;(window as any).pixelArena = { get editor() { return editor }, rig, scene, pixel }

    let last = performance.now()
    let frames = 0
    let acc = 0
    let raf = 0
    const loop = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.1)
      last = t
      const dx = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0)
      const dz = (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0)
      if ((dx || dz) && !keys.has('meta') && !keys.has('control')) rig.panRelative(dx * 0.8 * dt, dz * 0.8 * dt)
      rig.update(dt)
      day.update(dt)
      if (cycle) timeOfDay = day.timeOfDay
      day.follow(rig.focus, rig.zoom * 1.2)
      ground.follow(rig.focus)
      terrain.flush()
      world?.update(dt, rig.camera)
      editor?.tool.update?.(dt)
      editor?.thumbnails.tick()
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

<div class="app">
  {#if library && thumbnails}
    <PropBrowser {library} {thumbnails} selected={placing} bind:randomRotation onchoose={choose} />
  {:else}
    <aside class="browser-loading">Loading props…</aside>
  {/if}

  <main>
    <canvas bind:this={canvas} onpointerdown={onPointerDown} onpointermove={onPointerMove}
      onpointerup={onPointerUp} onwheel={onWheel} oncontextmenu={(e) => e.preventDefault()}></canvas>
    {#if boxRect}
      <div class="boxsel" style:left="{boxRect.x}px" style:top="{boxRect.y}px" style:width="{boxRect.w}px" style:height="{boxRect.h}px"></div>
    {/if}

    <header class="bar">
      <button onclick={newMap} title="New map">New</button>
      <button onclick={() => fileInput.click()} title="Open (Cmd+O)">Open…</button>
      <button onclick={save} title="Save (Cmd+S)">Save</button>
      <span class="sep"></span>
      <button onclick={undo} disabled={!canUndo} title="Undo (Cmd+Z)">Undo</button>
      <button onclick={redo} disabled={!canRedo} title="Redo (Cmd+Shift+Z)">Redo</button>
      <span class="sep"></span>
      <div class="tools" role="group" aria-label="Tools">
        {#each TOOLS as t (t.name)}
          <button class:on={activeTool === t.name} title="{t.label} ({t.key})" onclick={() => setToolByName(t.name)}>{t.label}</button>
        {/each}
      </div>
      <span class="name">{mapName}{dirty ? ' •' : ''}</span>
      <input bind:this={fileInput} type="file" accept=".pxmap" hidden onchange={(e) => {
        const f = (e.currentTarget as HTMLInputElement).files?.[0]
        if (f) openFile(f)
        ;(e.currentTarget as HTMLInputElement).value = ''
      }} />
    </header>

    {#if activeTool === 'terrain'}<TerrainOptions />{/if}
    {#if activeTool === 'building' && editor}<BuildingOptions {editor} />{/if}

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

    {#if editorReady && editor}
      <HistoryPanel {editor} onnew={askNewBranch} onmerge={askMerge} onrename={askRename} ondiscard={askDiscard} />
    {/if}

    <footer class="status">
      {#if status}{status}{:else}{#if toolInfo}{toolInfo}<br />{/if}{selected ? `${selected} selected · ` : ''}{fps} fps · {stats}{/if}
    </footer>
  </main>
</div>

<Dialogs bind:dialog />
