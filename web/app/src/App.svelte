<script lang="ts">
  // Pixel Arena (web): viewport + editor shell. Camera input (MMB / Space+drag pan, RMB /
  // Alt+drag orbit, mouse wheel zoom, Alt+scroll rotate, trackpad two-finger pan / pinch zoom /
  // rotate, WASD, Q/E) is handled here; the left button and unhandled keys go to the active tool
  // (see editor/editor.ts).
  //
  // URL parameters (for automated checks): map=<url of .pxmap>, camera=<x>,<z>,<zoom>,
  // time=<hours>, pixel=<n>, outline=<0-1>, grid=0|1, filter=<preset> (view params apply to this
  // page load only and aren't saved), cutaway=<level>, scatter=<n> (adds n random
  // props; chars=0 leaves out animated characters), shot=<file.png> (saves the canvas into
  // web/app/shots/ once everything has loaded, plus <file>.json with fps and draw stats),
  // selftest=place|select|terrain|building|branches|filters|export|gestures|camera|panels|materials|desktop (drives the tools end to end, writes shots/selftest-<name>.json),
  // tool=select|terrain|water|building (start with that tool).
  import { onMount } from 'svelte'
  import * as THREE from 'three'
  import { MapSession, openProject, saveProject, terrainEdit, Vec3 } from '@pixel-arena/core'
  import { Library, type PropDef } from './library/library'
  import { Thumbnails } from './library/thumbs'
  import { CameraRig, ISO_PITCH, PixelRenderer, TOP_PITCH } from './render/pixel'
  import { WalkCamera } from './render/walk'
  import { gridUniforms } from './render/grid'
  import { DayCycle } from './render/day-cycle'
  import { Ground } from './render/ground'
  import { TerrainView } from './render/terrain-view'
  import { loadTerrainMaterials, showGrid } from './render/terrain-shading'
  import { ViewSettings } from './render/view-settings'
  import ViewPanel from './ui/ViewPanel.svelte'
  import Popover from './ui/Popover.svelte'
  import ExportDialog, { type ExportRequest } from './ui/ExportDialog.svelte'
  import { download, Exporter, type ExportImage } from './render/exporter'
  import { WorldView } from './world/world-view'
  import { Editor, type BoxRect, type Pointer } from './editor/editor'
  import { PlaceTool } from './editor/place-tool'
  import { SelectTool } from './editor/select-tool'
  import Hotbar from './ui/Hotbar.svelte'
  import { activeId, saveTool, useSaved } from './ui/saved-tools'
  import { params as toolParams, paramsChanged, restoreParams } from './editor/tool-params'
  import { idOf, inHand, MODE_TOOLS, pickUp, putDown, TOOLS, type ToolId } from './editor/tools'
  import TerrainPanel from './ui/TerrainPanel.svelte'
  import WaterPanel from './ui/WaterPanel.svelte'
  import Outliner from './ui/Outliner.svelte'
  import ToolsBox from './ui/ToolsBox.svelte'
  import { key, withKey } from './ui/keys'
  import { canGroup, canUngroup, groupSelected, toggleLockSelected, ungroupSelected } from './ui/object-actions'
  import BuildPanel from './ui/BuildPanel.svelte'
  import HistoryPanel from './ui/HistoryPanel.svelte'
  import Modal from './ui/Modal.svelte'
  import Dialogs, { type DialogState } from './ui/Dialogs.svelte'
  import { buildReview, resolutions } from './ui/merge-review'
  import PropBrowser from './ui/PropBrowser.svelte'
  import { runSelfTest } from './editor/selftest'
  import { desktop, type MenuCommand, type SteamStatus } from './platform'
  import { pinchFactor, WheelClassifier, wheelFactor } from './editor/gestures'
  import Icon from './ui/Icon.svelte'
  import Resizer from './ui/Resizer.svelte'
  import Section from './ui/Section.svelte'
  import SelectionPanel from './ui/SelectionPanel.svelte'
  import { noteRecent, persistUi, thumbUrls, ui, type Mode } from './ui/ui-state.svelte'
  import { usageCounts } from './ui/prop-list'

  const params = new URLSearchParams(location.search)
  const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d)

  let canvas: HTMLCanvasElement
  let fileInput: HTMLInputElement
  let status = $state('Loading library…')
  let mapName = $state('Untitled')
  let filePath: string | null = $state(null) // desktop: where the map is saved
  let steam: SteamStatus | null = $state(null)
  let dirty = $state(false)
  let timeOfDay = $state(10)
  // URL view params are one-off: they don't touch the viewer's saved settings.
  const viewParams = ['pixel', 'outline', 'grid', 'time', 'filter'].filter((k) => params.has(k))
  const settings = new ViewSettings(viewParams.length === 0)
  if (params.has('filter')) settings.chooseFilter(params.get('filter')!)
  if (params.has('pixel')) settings.setOverride('pixel_size', num('pixel', 3))
  if (params.has('outline')) settings.setOverride('outline', num('outline', 0.55))
  if (params.has('grid')) settings.setOverride('grid', num('grid', 1) === 1)
  if (params.has('time')) settings.setOverride('time_of_day', num('time', 10))
  let appliedTime: number | null = null
  let cutaway = $state(num('cutaway', -1))
  let fps = $state(0)
  let stats = $state('')
  let activeTool = $state('select')
  let selected = $state(0)
  let boxRect: BoxRect | null = $state(null)
  let placing: string | null = $state(null)
  let selectionRev = $state(0)
  /** Whether the selection can be grouped / ungrouped (bottom bar). */
  const grouping = $derived.by(() => {
    selectionRev
    return editorReady && editor ? { group: canGroup(editor), ungroup: canUngroup(editor) } : { group: false, ungroup: false }
  })
  let canUndo = $state(false)
  let canRedo = $state(false)
  let library: Library | null = $state(null)
  let dialog: DialogState = $state(null)
  let editorReady = $state(false)
  let exportOpen = $state(false)
  /** The View popover (from the top bar) and its button. */
  let viewOpen = $state(false)
  /** The History dialog (branches and edits). */
  let historyOpen = $state(false)
  let viewButton: HTMLButtonElement = $state()!
  /** Below this top-bar width the file buttons fold into a File menu. */
  const COMPACT_TOPBAR = 490
  let topbarWidth = $state(1000)
  let fileOpen = $state(false)
  let fileButton: HTMLButtonElement = $state()!
  let exporter: Exporter | null = null
  let thumbnails: Thumbnails | null = $state(null)
  let usage: Map<string, number> = $state(new Map())
  persistUi()
  const GAP = 10
  const RAIL = 48
  // Room the rail and side panels take from the window edges (plus gaps); bars stay clear of it.
  /** The tools container shows in every mode but Select (unless hidden with Tab); with the
   *  catalogue collapsed, only while a tool is in hand. */
  const showTools = $derived(editorReady && ui.mode !== 'select' && !ui.toolsHidden && (!ui.leftHidden || activeTool !== 'select'))
  const leftVisible = $derived(showTools || !ui.leftHidden)
  const leftSpace = $derived(GAP + RAIL + GAP + (leftVisible ? ui.leftWidth + GAP : 0))
  /** The right side's Selection sits under the top bar and above the bottom row, so nothing
   *  else makes room for it. */
  const rightSpace = 0
  const BAR_H = 44
  /** Width of the bottom row's left zone, and the bottom row's height (hotbar placement). */
  let leftZone = $state(0)
  let bottomRow = $state(0)
  /** Too little room left of the bottom bar for a couple of cards: the hotbar gets its own row. */
  const hotbarAbove = $derived(leftZone - leftSpace - GAP < 140)

  let pixel: PixelRenderer
  let rig: CameraRig
  let walk: WalkCamera
  /** Walk preview: first person on the terrain, UI hidden (see render/walk.ts). */
  let walking = $state(false)
  /** The pointer is locked to the canvas (mouse looks around without a button held). */
  let pointerLocked = $state(false)
  /** The editor view looks straight down (or is easing there). */
  let topDown = $state(false)
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

  /** Applies resolved view settings to the renderer, grid and lighting. */
  function applySettings() {
    if (!pixel || !day) return
    const o = settings.filterOptions()
    pixel.pixelSize = Number(o.pixel_size)
    pixel.pass.applyFilter(o)
    resize()
    showGrid.value = Boolean(settings.get('grid'))
    day.mode = settings.get('time_mode') === 'cycle' ? 'cycle' : 'fixed'
    day.dayLength = Number(settings.get('day_length'))
    // Only jump the clock when the time setting itself changed, so a running cycle isn't reset.
    const t = Number(settings.get('time_of_day'))
    if (t !== appliedTime) {
      appliedTime = t
      day.timeOfDay = t
      timeOfDay = t
    }
    day.apply()
  }

  /** Runs an export and downloads the result. Returns a summary for the dialog. */
  async function runExport(r: ExportRequest): Promise<string> {
    if (!editor || !exporter) return ''
    const filter = settings.filterOptions()
    const px = Math.max(1, Math.round(Number(filter.pixel_size)))
    let images: ExportImage[] = []
    if (r.mode === 'snapshot') images = [exporter.snapshot(canvas, r.scale)]
    else if (r.mode === 'top-down') {
      const img = exporter.topDown(editor.session.doc, filter, r.ppm, px, r.grid)
      images = img ? [img] : []
    } else images = exporter.angles(editor.session.doc, filter, r.size, px, r.grid)
    if (images.length === 0) return 'Nothing to export.'
    await download(images, mapName.replace(/\.pxmap$/, ''))
    ;(window as any).pixelArena.lastExport = images
    return images.map((i) => `${i.name}: ${i.width} × ${i.height}`).join(' · ')
  }

  function makeMapDefaults() {
    if (!editor) return
    const s = editor.session
    const list = settings.mapDefaultOps()
    s.edit('Set map view defaults', () => list.forEach((op) => s.apply(op)))
    settings.clearOverrides()
  }
  $effect(() => {
    if (editor) editor.viewCutaway = cutaway
    if (activeTool !== 'build') world?.setCutaway(cutaway)
  })
  $effect(() => {
    document.title = `Pixel Arena — ${mapName}${dirty ? ' •' : ''}`
    desktop?.setDocument({ name: mapName, path: filePath, dirty })
  })

  function resize() {
    pixel.resize(canvas.clientWidth, canvas.clientHeight)
  }

  function setSession(s: MapSession, name: string, path: string | null = null) {
    mapName = name
    filePath = path
    dirty = false
    world.bind(s.doc)
    terrain.bind(s.doc)
    settings.bind(s.doc)
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
    selectionRev++ // grouping can change with any edit
    if (editor) usage = usageCounts(editor.session.doc.objects.values())
  }

  /** The select tool, switching to it first if another tool is active. */
  function selectTool(): SelectTool {
    putDown(editor!)
    return editor!.tool as SelectTool
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
    openBytes(new Uint8Array(await file.arrayBuffer()), file.name, null)
  }

  function openBytes(bytes: Uint8Array, name: string, path: string | null) {
    try {
      setSession(openProject(bytes), name, path)
      status = ''
    } catch (e) {
      status = `Couldn't open ${name}: ${(e as Error).message}`
    }
  }

  // One native dialog or write at a time (a menu accelerator and the page's own shortcut may
  // both fire for the same key press).
  let fileBusy = false
  async function fileOp(fn: () => Promise<void>) {
    if (fileBusy) return
    fileBusy = true
    try {
      await fn()
    } catch (e) {
      status = `File error: ${(e as Error).message}`
    } finally {
      fileBusy = false
    }
  }

  /** Desktop: native open dialog. Browser: the hidden file input. */
  function openDialog() {
    if (!desktop) return fileInput.click()
    const d = desktop
    fileOp(async () => {
      if (dirty && !confirm('Discard unsaved changes?')) return
      const f = await d.openFile()
      if (f) openBytes(f.bytes, f.name, f.path)
    })
  }

  /** Desktop only: opens a file the main process already allowed (self-tests, recent files). */
  async function openPath(path: string) {
    const f = await desktop!.readFile(path)
    openBytes(f.bytes, f.name, f.path)
  }

  /** Desktop: writes to the map's file (asking where the first time). Browser: downloads it. */
  function save() {
    if (!editor) return
    if (desktop) return fileOp(() => (filePath ? writeTo(filePath) : saveAsDesktop()))
    const name = mapName.endsWith('.pxmap') ? mapName : `${mapName}.pxmap`
    const url = URL.createObjectURL(new Blob([saveProject(editor.session) as Uint8Array<ArrayBuffer>], { type: 'application/zip' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
    mapName = name
    dirty = false
  }

  function saveAs() {
    if (!desktop) return save()
    return fileOp(saveAsDesktop)
  }

  async function saveAsDesktop() {
    if (!editor) return
    const ref = await desktop!.saveFileAs(mapName.replace(/\.pxmap$/, ''), saveProject(editor.session))
    if (ref) saved(ref.name, ref.path)
  }

  async function writeTo(path: string) {
    if (!editor) return
    const ref = await desktop!.saveFile(path, saveProject(editor.session))
    saved(ref.name, ref.path)
  }

  function saved(name: string, path: string) {
    mapName = name
    filePath = path
    dirty = false
    status = ''
  }

  function menuCommand(cmd: MenuCommand) {
    if (dialog) return
    if (cmd === 'new') newMap()
    else if (cmd === 'open') openDialog()
    else if (cmd === 'save') save()
    else if (cmd === 'saveAs') saveAs()
    else if (cmd === 'export') exportOpen = true
    else if (cmd === 'grid') toggleGrid()
  }

  /** Grid on / off for this viewer (⌘' / Ctrl+', like Photoshop; ⌘G is Group). */
  function toggleGrid() {
    settings.setOverride('grid', !settings.get('grid'))
  }

  function undo() {
    editor?.session.undo()
  }

  function redo() {
    editor?.session.redo()
  }

  // --- Tools --------------------------------------------------------------------------


  // --- Branches ------------------------------------------------------------------------

  function askNewBranch(from: string, seq: number) {
    if (!editor) return
    const ed = editor
    dialog = { kind: 'name', title: 'New branch', initial: `Branch ${ed.session.branches.size}`, submitLabel: 'Create', submit: (n) => ed.newBranch(from, seq, n) }
  }

  function askRename(id: string) {
    if (!editor) return
    const ed = editor
    dialog = { kind: 'name', title: 'Rename branch', initial: ed.session.branches.get(id)!.name, submitLabel: 'Rename', submit: (n) => ed.session.renameBranch(id, n) }
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

  /** Picks up the prop for placing. */
  function choose(prop: PropDef) {
    if (!editor) return
    pickUp(editor, 'place', { prop: prop.id })
    noteRecent(prop.id)
  }

  // --- Modes ---------------------------------------------------------------------------
  // The rail picks a mode (the left panel's view); each mode owns the registry tools listed in
  // MODE_TOOLS. Opening a mode picks up its tool, except Props (nothing until a prop is chosen)
  // and Select. Putting a tool down (Esc, None, the tool's tile again) keeps the mode.

  const MODES: { mode: Mode; label: string; key: string; icon: string }[] = [
    { mode: 'select', label: 'Select', key: 'V', icon: 'pointer' },
    { mode: 'props', label: 'Props', key: 'P', icon: 'cube' },
    { mode: 'terrain', label: 'Terrain', key: 'T', icon: 'mountain' },
    { mode: 'water', label: 'Water', key: 'O', icon: 'droplet' },
    { mode: 'build', label: 'Build', key: 'B', icon: 'building' },
  ]

  function setMode(m: Mode) {
    ui.mode = m
    ui.leftHidden = ui.toolsHidden = false
    if (!editor) return
    const owned = MODE_TOOLS[m]
    const hand = inHand(editor)
    if (hand && owned.includes(hand)) return
    if (m === 'terrain') pickUp(editor, ui.terrainTool)
    else if (m === 'water') pickUp(editor, ui.waterTool)
    else if (m === 'build') pickUp(editor, 'build', toolParams.build.piece === 'erase' ? {} : { piece: ui.buildPiece })
    else putDown(editor)
  }

  /** Rail click: the active mode's icon collapses or reopens the catalogue (the tools container
   *  stays). */
  function railClick(m: Mode) {
    if (m === ui.mode) {
      ui.leftHidden = !ui.leftHidden
      ui.toolsHidden = false
    } else setMode(m)
  }

  /** Keeps the mode in step when a tool is picked up some other way (saved tools, keys,
   *  self-tests); remembers the terrain tool last in hand. */
  function toolChanged(id: ToolId) {
    if (id === 'select') return
    ui.mode = TOOLS[id].mode
    if (id === 'sculpt' || id === 'paint') ui.terrainTool = id
    if (id === 'water' || id === 'waterErase') ui.waterTool = id
  }

  /** Puts the current tool down; the panel stays. */
  function noTool() {
    if (editor) putDown(editor)
  }

  // --- Tool parameters and saved tools (number keys) ------------------------------------

  restoreParams(ui.toolParams)
  let paramRev = $state(0)
  paramsChanged.connect(() => {
    ui.toolParams = structuredClone(toolParams)
    if (toolParams.build.piece !== 'erase') ui.buildPiece = toolParams.build.piece
    paramRev++
  })
  /** The saved tool matching the one in hand (highlighted in panels and the hotbar). */
  const activeSaved = $derived.by(() => {
    paramRev
    activeTool
    return activeId(editor)
  })

  function useTool(id: string) {
    if (editor) useSaved(editor, id)
  }

  function saveInHand(slot: number | null = null) {
    if (!editor) return
    const saved = saveTool(editor, slot)
    const msg = saved ? (slot ? `Saved on ${slot}` : 'Saved') : 'Pick up a tool to save it'
    status = msg
    window.setTimeout(() => status === msg && (status = ''), 1500)
  }

  // A short size / strength readout by the cursor when the brush changes from the keyboard.
  let brushTip: { x: number; y: number; text: string } | null = $state(null)
  let tipTimer = 0
  function showBrushTip() {
    const hand = editor && inHand(editor)
    if (!editor || !hand) return
    // Brush tools: their size, and strength when they have one.
    const shown = TOOLS[hand].params.filter((p) => p.key === 'radius' || p.key === 'strength')
    if (!shown.length) return
    const text = shown.map((p) => p.format!(Number((toolParams[hand] as unknown as Record<string, unknown>)[p.key]))).join(' · ')
    brushTip = { x: editor.cursor.x, y: editor.cursor.y, text }
    clearTimeout(tipTimer)
    tipTimer = window.setTimeout(() => (brushTip = null), 900)
  }

  // Dragging a prop from the panel onto the map places it where it's dropped.
  const PROP_MIME = 'application/x-pixel-arena-prop'
  function onDragOver(e: DragEvent) {
    if (!editor || !e.dataTransfer?.types.includes(PROP_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    editor.tool.pointerMove?.(pointer(e))
  }
  function onDragEnter(e: DragEvent) {
    // The prop id is only readable on drop, so the ghost appears once the drop happens; still
    // accept the drag here.
    if (e.dataTransfer?.types.includes(PROP_MIME)) e.preventDefault()
  }
  function onDrop(e: DragEvent) {
    const id = e.dataTransfer?.getData(PROP_MIME)
    const prop = id ? library?.props.get(id) : undefined
    if (!editor || !prop) return
    e.preventDefault()
    if (inHand(editor) !== 'place' || toolParams.place.prop !== prop.id) choose(prop)
    const p = pointer(e)
    editor.tool.pointerMove?.(p)
    editor.tool.pointerDown?.(p)
    editor.tool.pointerUp?.(p)
  }

  function pointer(e: MouseEvent): Pointer {
    const r = canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top, shift: e.shiftKey, alt: e.altKey, cmd: e.metaKey || e.ctrlKey }
  }

  function onPointerDown(e: PointerEvent) {
    if (walking) {
      if (!pointerLocked) lockPointer()
      return
    }
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
    if (walking) {
      // Look around: freely while the pointer is locked, else by dragging.
      if (pointerLocked || e.buttons) walk.look(e.movementX, e.movementY)
      return
    }
    const p = pointer(e)
    if (editor) editor.cursor = p
    if (drag?.kind === 'pan' && editor) {
      rig.panScreen(editor.groundAt({ ...p, x: p.x + drag.x - e.clientX, y: p.y + drag.y - e.clientY }), editor.groundAt(p))
    } else if (drag?.kind === 'orbit') {
      rig.rotateBy(-(e.clientX - drag.x) * 0.008)
      rig.pitch = Math.max(TOP_PITCH, Math.min(-0.15, rig.pitch - (e.clientY - drag.y) * 0.006))
      rig.pitchTarget = null
      topDown = rig.pitch < TOP_PITCH + 0.02
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

  // Trackpad: two-finger move pans, pinch zooms at the fingers, rotate turns the view around
  // its centre. Mouse wheel zooms at the cursor. See editor/gestures.ts.
  const wheel = new WheelClassifier()
  function onWheel(e: WheelEvent) {
    e.preventDefault()
    if (!editor || walking) return
    const p = pointer(e)
    // Option/Alt + scroll (mouse wheel or two fingers) turns the view around its centre, like
    // Q / E and the rotate gesture: scrolling down or right turns it clockwise.
    if (e.altKey && !e.ctrlKey) {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      const px = e.deltaMode === 1 ? d * 16 : e.deltaMode === 2 ? d * 400 : d
      rotateGesture(-px * ROTATE_PER_PX)
      return
    }
    const kind = wheel.classify({ deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, ctrlKey: e.ctrlKey,
      wheelDeltaY: (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY, timeStamp: e.timeStamp })
    if (kind === 'pan') {
      const ahead = editor.groundAt({ ...p, x: p.x + e.deltaX, y: p.y + e.deltaY })
      rig.panScreen(ahead, editor.groundAt(p))
      return
    }
    zoomAt(p, kind === 'pinch' ? pinchFactor(e.deltaY) : wheelFactor(e.deltaY))
  }

  function zoomAt(p: Pointer, factor: number) {
    if (!editor) return
    const before = editor.groundAt(p)
    rig.zoom = Math.max(4, Math.min(400, rig.zoom * factor))
    rig.update(0)
    rig.panScreen(before, editor.groundAt(p))
  }

  /** Counter-clockwise finger rotation in degrees turns the map counter-clockwise on screen,
   *  pivoting on the ground at the centre of the view. */
  /** Degrees of view rotation per scrolled pixel with Option/Alt held (one mouse notch ≈ 15°). */
  const ROTATE_PER_PX = 0.15

  function rotateGesture(degrees: number) {
    if (!editor || walking) return
    const centre = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2, shift: false, alt: false, cmd: false }
    rig.rotateAround(editor.groundAt(centre) ?? rig.focus, (-degrees * Math.PI) / 180)
  }

  // Safari's own trackpad rotation (degrees, clockwise positive, cumulative per gesture).
  let safariRotation = 0
  function onGesture(e: Event & { rotation?: number; type: string }) {
    e.preventDefault()
    if (e.type === 'gesturestart') safariRotation = 0
    else if (e.rotation !== undefined) {
      rotateGesture(safariRotation - e.rotation)
      safariRotation = e.rotation
    }
  }

  function onKey(e: KeyboardEvent, down: boolean) {
    if ((e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'checkbox') return
    if (dialog || exportOpen || historyOpen) return
    const k = e.key.toLowerCase()
    if (down) keys.add(k)
    else keys.delete(k)
    if (walking) {
      // Only movement while walking; Esc (or G again) goes back to editing.
      if (down && (k === 'escape' || k === 'g')) exitWalk()
      if (k === ' ' || k === 'tab') e.preventDefault()
      return
    }
    if (!down) return
    const cmd = e.metaKey || e.ctrlKey
    // Groups and locks (Cmd/Ctrl+G, Cmd/Ctrl+Shift+G, Cmd/Ctrl+Shift+L).
    if (cmd && editor && (k === 'g' || (k === 'l' && e.shiftKey))) {
      if (k === 'l') toggleLockSelected(editor)
      else if (e.shiftKey) ungroupSelected(editor)
      else groupSelected(editor)
      e.preventDefault()
      return
    }
    // Grid: in the desktop app its View menu item owns the shortcut (a toggle must not run twice).
    if (cmd && e.key === "'" && !desktop) {
      toggleGrid()
      e.preventDefault()
      return
    }
    if (cmd && e.shiftKey && k === 'h') {
      historyOpen = !historyOpen
      e.preventDefault()
      return
    }
    if (cmd && ['z', 'y', 's', 'o', 'e'].includes(k)) {
      if (k === 'z') e.shiftKey ? redo() : undo()
      else if (k === 'y') redo()
      else if (k === 's') e.shiftKey ? saveAs() : save()
      else if (k === 'e') exportOpen = true
      else openDialog()
      e.preventDefault()
      return
    }
    // Number keys: 1-9 picks up the saved tool on that key; Cmd/Ctrl+1-9 (Alt+1-9 in a browser,
    // where Cmd/Ctrl+digit switches tabs) saves the tool in hand on it.
    if (/^[1-9]$/.test(e.key) || /^Digit[1-9]$/.test(e.code)) {
      const slot = Number(e.code.startsWith('Digit') ? e.code.slice(5) : e.key)
      const save = (desktop ? cmd : e.altKey || cmd) && !e.shiftKey
      if (save) {
        saveInHand(slot)
        e.preventDefault()
        return
      }
      const keyed = ui.tools.find((t) => t.slot === slot)
      if (!cmd && !e.altKey && keyed) {
        useTool(keyed.id)
        e.preventDefault()
        return
      }
    }
    if (editor?.tool.key?.(e)) {
      if (/^[[\]{}]$/.test(e.key)) showBrushTip()
      e.preventDefault()
      return
    }
    if (cmd) return
    if (k === 'tab') {
      const show = ui.leftHidden && ui.rightHidden && ui.toolsHidden
      ui.leftHidden = ui.rightHidden = ui.toolsHidden = !show
      e.preventDefault()
      return
    }
    const byKey = MODES.find((m) => m.key.toLowerCase() === k)
    if (byKey) setMode(byKey.mode)
    else if (k === 'g') enterWalk()
    else if (k === 'u') toggleTopDown()
    else if (k === 'q') rig.rotateBy(Math.PI / 4)
    else if (k === 'e') rig.rotateBy(-Math.PI / 4)
  }

  const groundHeight = (x: number, z: number) => (editor ? terrainEdit.heightAtWorld(editor.session.doc, x, z) : 0)

  function lockPointer() {
    // A promise in newer browsers; without the lock, dragging looks around instead.
    Promise.resolve(canvas.requestPointerLock()).catch(() => {})
  }

  /** Starts the walk preview at the ground point in the middle of the view, facing the same way. */
  function enterWalk() {
    if (!editor || walking) return
    const centre = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2, shift: false, alt: false, cmd: false }
    const at = editor.groundAt(centre) ?? rig.focus
    walk.start(at.x, at.z, rig.yaw, groundHeight)
    editor.tool.deactivate?.()
    drag = null
    toolPressed = false
    keys.clear()
    walking = true
    lockPointer()
  }

  /** Back to editing, looking at where the walk ended, the same way round. */
  function exitWalk() {
    if (!walking) return
    walking = false
    keys.clear()
    if (document.pointerLockElement === canvas) document.exitPointerLock()
    rig.focus.set(walk.position.x, rig.focus.y, walk.position.z)
    const turn = ((((walk.yaw - rig.yaw) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI
    rig.rotateBy(turn)
    editor?.tool.activate?.()
  }

  /** Eases the editor view between isometric and straight down. */
  function toggleTopDown() {
    topDown = !topDown
    rig.pitchTarget = topDown ? TOP_PITCH : ISO_PITCH
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
    walk = new WalkCamera(pixel)
    day = new DayCycle(scene)
    ground = new Ground()
    terrain = new TerrainView()
    terrain.onChunksChanged = (chunks) => ground.setHoles(chunks)
    settings.changed.connect(applySettings)
    scene.add(ground.mesh, terrain.root)
    const cam = params.get('camera')?.split(',').map(Number)
    if (cam?.length === 3) {
      rig.focus.set(cam[0], 0, cam[1])
      rig.zoom = cam[2]
    }
    applySettings()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    Library.load().then(async (lib) => {
      await loadTerrainMaterials(lib.terrain)
      world = new WorldView(lib)
      scene.add(world.root)
      world.setCutaway(cutaway)
      const thumbs = new Thumbnails(pixel.renderer)
      thumbs.onReady = (id, url) => (thumbUrls[id] = url)
      editor = new Editor(new MapSession(), lib, thumbs, world, rig, pixel, scene)
      const ed = editor
      ed.defaultTool = () => new SelectTool(ed)
      ed.toolChanged.connect((t) => {
        placing = t instanceof PlaceTool ? t.prop.id : null
        activeTool = idOf(t)
        toolChanged(idOf(t))
      })
      ed.selection.changed.connect(() => {
        selected = ed.selection.size
        selectionRev++
      })
      ed.box.connect((r) => (boxRect = r))
      library = lib
      thumbnails = thumbs
      exporter = new Exporter(pixel.renderer, scene, ground, day, lib)
      editorReady = true
      setSession(editor.session, 'Untitled')
      status = ''
      setMode(ui.mode)
      if (params.get('map')) await openUrl(params.get('map')!)
      if (params.get('scatter')) scatter(lib, editor.session, Number(params.get('scatter')))
      if (params.get('tool')) {
        // Older names still work in URLs: terrain = sculpt, building = build.
        const t = ({ terrain: 'sculpt', building: 'build' } as Record<string, string>)[params.get('tool')!] ?? params.get('tool')!
        if (t === 'select') putDown(editor)
        else if (t in TOOLS) pickUp(editor, t as never)
      }
      if (params.get('shot')) screenshotWhenReady(params.get('shot')!)
      if (params.get('selftest'))
        runSelfTest(params.get('selftest')!, editor, () => world.busy, {
          settings, exporter: exporter!, canvas,
          open: (bytes, name) => setSession(openProject(bytes), name),
          files: { save: async () => { await save() }, path: () => filePath, setPath: (p) => (filePath = p), openPath, dirty: () => dirty, name: () => mapName },
        })
    })
    ;(window as any).pixelArena = { get editor() { return editor }, rig, scene, pixel, walk, get walking() { return walking } }
    const offMenu = desktop?.onCommand(menuCommand)
    const offRotate = desktop?.onRotate?.(rotateGesture)
    const gestures = ['gesturestart', 'gesturechange'] as const
    gestures.forEach((t) => canvas.addEventListener(t, onGesture as EventListener))
    desktop?.steam.status().then((st) => (steam = st))

    let last = performance.now()
    let frames = 0
    let acc = 0
    let raf = 0
    const loop = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.1)
      last = t
      const dx = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0)
      const dz = (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0)
      if (walking && editor) {
        walk.update(dt, { forward: -dz, right: dx, run: keys.has('shift'), jump: keys.has(' ') }, groundHeight)
      } else if ((dx || dz) && !keys.has('meta') && !keys.has('control')) rig.panRelative(dx * 0.8 * dt, dz * 0.8 * dt)
      rig.update(dt)
      day.update(dt)
      if (day.mode === 'cycle') timeOfDay = day.timeOfDay
      const centre = walking ? walk.position : rig.focus
      day.follow(centre, walking ? 60 : rig.zoom * 1.2)
      ground.follow(centre)
      terrain.flush()
      world?.update(dt, walking ? walk.camera : rig.camera)
      if (!walking) editor?.tool.update?.(dt)
      // New buildings start on whole cells of the kit, so the grid shows them while building.
      gridUniforms.cellSize.value = !walking && activeTool === 'build' ? (editor?.library.kits.get(toolParams.build.kit)?.cellSize ?? 0) : 0
      editor?.thumbnails.tick()
      pixel.render(scene, walking ? walk : rig)
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
    const onLock = () => {
      const locked = document.pointerLockElement === canvas
      // Esc while locked only releases the pointer (the page never sees the key): leave too.
      if (pointerLocked && !locked && walking) exitWalk()
      pointerLocked = locked
    }
    document.addEventListener('pointerlockchange', onLock)
    return () => {
      document.removeEventListener('pointerlockchange', onLock)
      cancelAnimationFrame(raf)
      ro.disconnect()
      offMenu?.()
      offRotate?.()
      gestures.forEach((t) => canvas.removeEventListener(t, onGesture as EventListener))
    }
  })

  const clock = $derived(`${String(Math.floor(timeOfDay)).padStart(2, '0')}:${String(Math.floor((timeOfDay % 1) * 60)).padStart(2, '0')}`)
</script>

<svelte:window onkeydown={(e) => onKey(e, true)} onkeyup={(e) => onKey(e, false)} />

<div class="app" class:walking>
  <canvas bind:this={canvas} onpointerdown={onPointerDown} onpointermove={onPointerMove}
    onpointerup={onPointerUp} onwheel={onWheel} oncontextmenu={(e) => e.preventDefault()}
    ondragenter={onDragEnter} ondragover={onDragOver} ondrop={onDrop}></canvas>
  {#if walking}
    <div class="walk-hint">
      {#if !pointerLocked}<span>Click to look around</span>{/if}
      <span>WASD move</span><span>{key('Shift')} run</span><span>Space jump</span><span>{key('Esc')} back to editing</span>
    </div>
  {/if}
  {#if boxRect}
    <div class="boxsel" style:left="{boxRect.x}px" style:top="{boxRect.y}px" style:width="{boxRect.w}px" style:height="{boxRect.h}px"></div>
  {/if}

  <nav class="rail" aria-label="Modes" style:width="{RAIL}px">
    <span class="mark" aria-hidden="true"></span>
    {#each MODES as m (m.mode)}
      <button class:on={ui.mode === m.mode} class:collapsed={ui.mode === m.mode && ui.leftHidden}
        title={withKey(m.label, m.key)} aria-label={m.label} aria-pressed={ui.mode === m.mode} onclick={() => railClick(m.mode)}>
        <Icon name={m.icon} size={20} />
      </button>
    {/each}
  </nav>

  <!-- Left of the map: the tools container (current tool and this mode's saved tools) and, below
       it with the map showing between, the catalogue (the mode's title and contents). Clicking the
       active rail icon collapses only the catalogue; Tab hides both. -->
  {#if leftVisible}
    <div class="left-stack" class:short={ui.leftHidden} style:left="{GAP + RAIL + GAP}px" style:width="{ui.leftWidth}px">
      {#if showTools && editor}
        <div class="box tools-box">
          <ToolsBox {editor} mode={ui.mode} {thumbnails} active={activeSaved} onsave={() => saveInHand()} onclear={noTool} onuse={useTool} />
        </div>
      {/if}
      {#if !ui.leftHidden}
        <div class="box catalog">
          <div class="panelhead">{MODES.find((m) => m.mode === ui.mode)?.label}</div>
          {#if !library || !thumbnails || !editorReady || !editor}
            <p class="loading">Loading…</p>
          {:else if ui.mode === 'props'}
            <PropBrowser {library} {thumbnails} {usage} selected={placing} onchoose={choose} />
          {:else if ui.mode === 'terrain'}
            <TerrainPanel {editor} />
          {:else if ui.mode === 'water'}
            <WaterPanel {editor} />
          {:else if ui.mode === 'build'}
            <BuildPanel {editor} />
          {:else}
            <Outliner {editor} {selectTool} />
          {/if}
        </div>
      {/if}
      <Resizer side="left" bind:width={ui.leftWidth} min={220} max={560} initial={300} />
    </div>
  {/if}

  <header class="topbar" data-avoid bind:clientWidth={topbarWidth} style:left="{leftSpace || GAP}px" style:right="{rightSpace || GAP}px">
    {#if topbarWidth < COMPACT_TOPBAR}
      <button class:on={fileOpen} bind:this={fileButton} onclick={() => (fileOpen = !fileOpen)} aria-expanded={fileOpen}>File</button>
    {:else}
      <div class="group">
        <button onclick={newMap} title="New map">New</button>
        <button onclick={openDialog} title={withKey('Open map', 'Mod+O')}>Open…</button>
        <button onclick={save} title={withKey('Save map', 'Mod+S')}>Save</button>
        {#if desktop}<button onclick={saveAs} title={withKey('Save map as', 'Mod+Shift+S')}>Save as…</button>{/if}
        <button onclick={() => (exportOpen = true)} title={withKey('Export image', 'Mod+E')}>Export…</button>
      </div>
    {/if}
    <div class="group">
      <button class="icon" onclick={undo} disabled={!canUndo} title={withKey('Undo', 'Mod+Z')} aria-label="Undo"><Icon name="undo" /></button>
      <button class="icon" onclick={redo} disabled={!canRedo} title={withKey('Redo', 'Mod+Shift+Z')} aria-label="Redo"><Icon name="redo" /></button>
    </div>
    <span class="mapname" title={filePath ?? 'Not saved yet'}>{mapName.replace(/\.pxmap$/, '')}{#if dirty}<span class="dirty" title="Unsaved changes"></span>{/if}</span>
    <span class="spacer"></span>
    {#if steam}
      <button class="steam" class:off={!steam.ok} disabled={!steam.ok} onclick={() => desktop?.steam.overlay('friends')}
        title={steam.ok ? `Steam (app ${steam.appId}) · Shift+Tab opens the overlay` : `Steam not available: ${steam.error}`}>
        {steam.ok ? `Steam · ${steam.name}` : 'Steam offline'}
      </button>
    {/if}
    <button class="icon" class:on={historyOpen} onclick={() => (historyOpen = !historyOpen)} title={withKey('History: branches and edits', 'Mod+Shift+H')} aria-label="History"><Icon name="clock" /></button>
    <button class="icon" onclick={enterWalk} title={withKey('Walk: look around in first person', 'G')} aria-label="Walk"><Icon name="walk" /></button>
    <button class="icon" class:on={viewOpen} bind:this={viewButton} onclick={() => (viewOpen = !viewOpen)} title="View: filter, time of day, visible levels" aria-label="View settings" aria-expanded={viewOpen}><Icon name="eye" /></button>
    <input bind:this={fileInput} type="file" accept=".pxmap" hidden onchange={(e) => {
      const f = (e.currentTarget as HTMLInputElement).files?.[0]
      if (f) openFile(f)
      ;(e.currentTarget as HTMLInputElement).value = ''
    }} />
  </header>

  {#if fileOpen && topbarWidth < COMPACT_TOPBAR}
    {@const run = (fn: () => void) => () => { fileOpen = false; fn() }}
    <Popover anchor={fileButton} width={200} onclose={() => (fileOpen = false)}>
      <div class="menu-list" role="menu">
        <button role="menuitem" onclick={run(newMap)}>New</button>
        <button role="menuitem" onclick={run(openDialog)}>Open…<span class="shortcut">{key('Mod+O')}</span></button>
        <button role="menuitem" onclick={run(save)}>Save<span class="shortcut">{key('Mod+S')}</span></button>
        {#if desktop}<button role="menuitem" onclick={run(saveAs)}>Save as…<span class="shortcut">{key('Mod+Shift+S')}</span></button>{/if}
        <div class="sep"></div>
        <button role="menuitem" onclick={run(() => (exportOpen = true))}>Export…<span class="shortcut">{key('Mod+E')}</span></button>
      </div>
    </Popover>
  {/if}

  {#if viewOpen}
    <Popover anchor={viewButton} width={320} onclose={() => (viewOpen = false)}>
      <div class="pop-head"><span class="heading">View</span></div>
      <div class="pop">
        <ViewPanel {settings} bind:cutaway {clock} onmapdefaults={makeMapDefaults} {topDown} ontopdown={(on) => on !== topDown && toggleTopDown()} />
      </div>
    </Popover>
  {/if}

  <!-- Right of the map, under the top bar: Selection, only while something is selected. -->
  {#if !ui.rightHidden && editorReady && editor && selected}
    <div class="right-stack" style:top="{GAP + BAR_H + GAP}px" style:width="{ui.rightWidth}px">
      <div class="box selection-box">
        <Section title="Selection" bind:open={ui.sections.selection} badge={String(selected)}>
          <SelectionPanel {editor} {selectTool} />
        </Section>
      </div>
      <Resizer side="right" bind:width={ui.rightWidth} min={240} max={520} initial={280} />
    </div>
  {/if}

  {#if historyOpen && editor}
    <Modal title="History" width={760} oncancel={() => (historyOpen = false)}>
      <HistoryPanel {editor}
        onnew={(b, s) => { historyOpen = false; askNewBranch(b, s) }} onmerge={(id) => { historyOpen = false; askMerge(id) }}
        onrename={(id) => { historyOpen = false; askRename(id) }} ondiscard={(id) => { historyOpen = false; askDiscard(id) }} />
      {#snippet actions()}<button onclick={() => (historyOpen = false)}>Close</button>{/snippet}
    </Modal>
  {/if}

  <!-- The bar is centered on the whole window; the side spacers keep it clear of the panels,
       so it only shifts when it would otherwise run into one. The hotbar takes the space left of
       the bar without affecting its position (absolutely placed), scrolling when full; when that
       space is too narrow it moves to its own row above. -->
  <div class="bottom">
    <div class="keepout left" style:min-width="{leftSpace}px" bind:clientWidth={leftZone}>
      {#if !hotbarAbove}
        <div class="hotbar-slot" style:left="{leftSpace}px"><Hotbar active={activeSaved} {library} {thumbnails} onuse={useTool} /></div>
      {/if}
    </div>
    <div class="center" data-avoid bind:clientHeight={bottomRow} style:max-width="calc(100% - {leftSpace + rightSpace}px)">
      {#if ((selected && activeTool === 'select') || status) && editorReady && library}
        <footer class="bottombar">
          {#if selected && activeTool === 'select'}
            <span class="count">{selected} selected</span>
            <div class="actions">
              <button class="icon" title={withKey('Duplicate', 'Mod+D')} aria-label="Duplicate" onclick={() => selectTool().duplicateSelection()}><Icon name="copy" /></button>
              {#if grouping.ungroup}
                <button class="icon" title={withKey('Ungroup', 'Mod+Shift+G')} aria-label="Ungroup" onclick={() => ungroupSelected(editor!)}><Icon name="ungroup" /></button>
              {:else}
                <button class="icon" title={withKey('Group', 'Mod+G')} aria-label="Group" disabled={!grouping.group} onclick={() => groupSelected(editor!)}><Icon name="group" /></button>
              {/if}
              <button class="icon" title={withKey('Lock', 'Mod+Shift+L')} aria-label="Lock" onclick={() => toggleLockSelected(editor!)}><Icon name="lock" /></button>
              <button class="icon" title={`Rotate (${key('R')}, ${key('Shift+R')} back)`} aria-label="Rotate" onclick={() => selectTool().rotateSelection(1)}><Icon name="rotate" /></button>
              <button class="icon" title={withKey('Raise', 'PgUp')} aria-label="Raise" onclick={() => selectTool().raiseSelection(0.25)}><Icon name="up" /></button>
              <button class="icon" title={withKey('Lower', 'PgDn')} aria-label="Lower" onclick={() => selectTool().raiseSelection(-0.25)}><Icon name="down" /></button>
              <button class="icon" title={withKey('Focus', 'F')} aria-label="Focus" onclick={() => selectTool().focusSelection()}><Icon name="focus" /></button>
              <button class="icon danger-hover" title={withKey('Delete', 'Del')} aria-label="Delete" onclick={() => selectTool().deleteSelection()}><Icon name="trash" /></button>
            </div>
          {/if}
          {#if status}<span class="hint" title={status}>{status}</span>{/if}
        </footer>
      {/if}
    </div>
    <div class="keepout" style:min-width="{rightSpace}px"></div>
  </div>
  {#if hotbarAbove}
    <div class="hotbar-row" style:left="{leftSpace}px" style:right="{rightSpace || GAP}px" style:bottom="{bottomRow + GAP * 2}px">
      <Hotbar active={activeSaved} {library} {thumbnails} onuse={useTool} />
    </div>
  {/if}

  {#if brushTip}
    <div class="brushtip" style:left="{brushTip.x + 18}px" style:top="{brushTip.y + 14}px">{brushTip.text}</div>
  {/if}

  {#if ui.showStats}
    <div class="stats" style:right="{rightSpace || GAP}px">{fps} fps · {stats}</div>
  {/if}
</div>

<Dialogs bind:dialog />
{#if exportOpen && editor && library}
  <ExportDialog bounds={Exporter.bounds(editor.session.doc, library)} pixelSize={Math.round(Number(settings.get('pixel_size')))}
    onexport={runExport} onclose={() => (exportOpen = false)} />
{/if}
