<script lang="ts">
  // A direction on the map as a compass bearing (degrees clockwise from north, absolute), set
  // on a small dial that is turned like the view: its red N matches the corner compass, so the
  // handle points the way the direction runs on screen. Click or drag anywhere on the dial to
  // point it (15° steps; Shift for any angle); arrow keys nudge it; the number beside it can be
  // typed. Dragging previews and commits once on release (one undo step).
  interface Props {
    /** Bearing in degrees (0 = north, 90 = east). */
    value: number
    /** The view's yaw (radians); north shows turned clockwise by it. */
    viewYaw: number
    label: string
    onchange: (bearing: number) => void
  }
  let { value, viewYaw, label, onchange }: Props = $props()

  const STEP = 15
  const norm = (d: number) => ((d % 360) + 360) % 360
  let draft: number | null = $state(null)
  const shown = $derived(norm(draft ?? value))
  const yawDeg = $derived((viewYaw * 180) / Math.PI)

  let svg: SVGSVGElement
  function bearingAt(e: PointerEvent): number {
    const r = svg.getBoundingClientRect()
    const screen = (Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180) / Math.PI
    const b = norm(screen - yawDeg)
    return e.shiftKey ? Math.round(b) : norm(Math.round(b / STEP) * STEP)
  }
  function down(e: PointerEvent) {
    try {
      svg.setPointerCapture(e.pointerId)
    } catch {
      // Not a live pointer (synthetic events): fine without capture.
    }
    draft = bearingAt(e)
  }
  function move(e: PointerEvent) {
    if (draft !== null) draft = bearingAt(e)
  }
  function up() {
    if (draft === null) return
    const b = draft
    draft = null
    if (norm(b) !== norm(value)) onchange(b)
  }
  function key(e: KeyboardEvent) {
    const step = e.shiftKey ? 1 : STEP
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onchange(norm(value + step))
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onchange(norm(value - step))
    else return
    e.preventDefault()
  }
  function typed(e: Event) {
    const el = e.currentTarget as HTMLInputElement
    const v = Number(el.value)
    if (Number.isFinite(v) && norm(v) !== norm(value)) onchange(norm(v))
    el.value = String(Math.round(norm(value)))
  }
</script>

<div class="dial">
  <svg bind:this={svg} viewBox="-30 -30 60 60" role="slider" tabindex="0" aria-label={label} aria-valuemin={0} aria-valuemax={359}
    aria-valuenow={Math.round(shown)} aria-valuetext="{Math.round(shown)}°" onpointerdown={down} onpointermove={move} onpointerup={up} onkeydown={key}>
    <circle r="27" class="face" />
    <g transform="rotate({yawDeg})">
      {#each [0, 45, 90, 135, 180, 225, 270, 315] as a (a)}
        <line y1="-27" y2={a % 90 === 0 ? -22 : -24.5} transform="rotate({a})" class="tick" class:n={a === 0} />
      {/each}
      <text y="-16" class="north">N</text>
      <g transform="rotate({shown})">
        <line y1="6" y2="-21" class="hand" />
        <path d="M0 -26 L5 -18 L-5 -18 Z" class="tip" />
      </g>
    </g>
    <circle r="2.5" class="pin" />
  </svg>
  <span class="deg">
    <input class="input" inputmode="numeric" value={Math.round(shown)} aria-label="{label} in degrees"
      onchange={typed} onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} />°
  </span>
</div>

<style>
  .dial { display: flex; align-items: center; gap: 10px; }
  svg { flex: none; width: 56px; height: 56px; cursor: pointer; touch-action: none; outline: none; border-radius: 50%; }
  svg:focus-visible { box-shadow: 0 0 0 2px var(--accent-border); }
  .face { fill: var(--input); stroke: var(--line); stroke-width: 1.5; }
  svg:hover .face { stroke: var(--muted); }
  .tick { stroke: var(--muted); stroke-width: 1.5; stroke-linecap: round; }
  .tick.n { stroke: #e5484d; stroke-width: 2.5; }
  .north { fill: #e5484d; font-size: 8px; font-weight: 700; text-anchor: middle; dominant-baseline: middle; }
  .hand { stroke: var(--accent); stroke-width: 2.5; stroke-linecap: round; }
  .tip { fill: var(--accent); }
  .pin { fill: var(--text); }
  .deg { display: flex; align-items: center; gap: 3px; color: var(--muted); font-size: 12px; }
  .deg input { width: 52px; padding: 3px 6px; text-align: right; font-variant-numeric: tabular-nums; }
</style>
