<script lang="ts">
  // Export: snapshot of the current view, the whole map top-down, or angle views. Uses the
  // current filter. Shows the resulting image size before exporting.
  import Modal from './Modal.svelte'
  import { MAX_SIZE, type Bounds } from '../render/exporter'

  export interface ExportRequest {
    mode: 'snapshot' | 'top-down' | 'angles'
    scale: number
    ppm: number
    size: number
    grid: boolean
  }

  interface Props {
    bounds: Bounds | null
    pixelSize: number
    onexport: (r: ExportRequest) => Promise<string>
    onclose: () => void
  }
  let { bounds, pixelSize, onexport, onclose }: Props = $props()

  let mode: ExportRequest['mode'] = $state('snapshot')
  let scale = $state(2)
  let ppm = $state(16)
  let size = $state(2048)
  let grid = $state(false)
  let busy = $state(false)
  let result = $state('')

  const topDownSize = $derived.by(() => {
    if (!bounds) return null
    const texel = pixelSize / ppm
    const w = Math.ceil((bounds.max.x - bounds.min.x) / texel) * pixelSize
    const h = Math.ceil((bounds.max.z - bounds.min.z) / texel) * pixelSize
    return { w, h, capped: w > MAX_SIZE || h > MAX_SIZE }
  })

  async function run() {
    busy = true
    result = ''
    // Let the "Exporting…" state paint before the (synchronous) renders.
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)))
    try {
      result = await onexport({ mode, scale, ppm, size, grid })
    } catch (e) {
      result = `Export failed: ${(e as Error).message}`
    } finally {
      busy = false
    }
  }
</script>

<Modal title="Export image" width={460} oncancel={onclose}>
  <div class="modes">
    <label><input type="radio" bind:group={mode} value="snapshot" /> Current view</label>
    <label><input type="radio" bind:group={mode} value="top-down" /> Whole map, top-down</label>
    <label><input type="radio" bind:group={mode} value="angles" /> Whole map, 5 angles (zip)</label>
  </div>
  {#if mode === 'snapshot'}
    <label class="row">Scale
      <select bind:value={scale}>{#each [1, 2, 4] as k (k)}<option value={k}>{k}×</option>{/each}</select>
    </label>
  {:else if mode === 'top-down'}
    <label class="row">Pixels per meter
      <select bind:value={ppm}>{#each [4, 8, 16, 32] as k (k)}<option value={k}>{k}</option>{/each}</select>
    </label>
    {#if topDownSize}
      <p class="muted">{topDownSize.w} × {topDownSize.h} px{topDownSize.capped ? ` (capped at ${MAX_SIZE} px per side)` : ''}</p>
    {:else}
      <p class="muted">The map is empty.</p>
    {/if}
  {:else}
    <label class="row">Long side
      <select bind:value={size}>{#each [1024, 2048, 4096] as k (k)}<option value={k}>{k} px</option>{/each}</select>
    </label>
  {/if}
  {#if mode !== 'snapshot'}
    <label class="row"><span>Include grid</span><input type="checkbox" bind:checked={grid} /></label>
  {/if}
  {#if result}<p class="result">{result}</p>{/if}
  {#snippet actions()}
    <button onclick={onclose}>Close</button>
    <button class="primary" disabled={busy || (mode !== 'snapshot' && !bounds)} onclick={run}>{busy ? 'Exporting…' : 'Export'}</button>
  {/snippet}
</Modal>

<style>
  .modes { display: flex; flex-direction: column; gap: 6px; }
  .modes label { display: flex; gap: 8px; align-items: center; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .muted { margin: 0; color: var(--muted); }
  .result { margin: 0; color: var(--accent); }
  input[type='radio'], input[type='checkbox'] { accent-color: var(--accent); }
</style>
