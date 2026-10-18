<script lang="ts">
  // Drag handle on a side panel's inner edge. `side` is the panel's side of the window: dragging
  // toward the middle widens it. Double-click resets to `initial`.
  interface Props {
    side: 'left' | 'right'
    width: number
    min: number
    max: number
    initial: number
  }
  let { side, width = $bindable(), min, max, initial }: Props = $props()

  let start: { x: number; width: number } | null = null

  function down(e: PointerEvent) {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    start = { x: e.clientX, width }
  }
  function move(e: PointerEvent) {
    if (!start) return
    const dx = (e.clientX - start.x) * (side === 'left' ? 1 : -1)
    width = Math.round(Math.max(min, Math.min(max, start.width + dx)))
  }
</script>

<div class="resizer {side}" role="separator" aria-orientation="vertical" aria-label="Resize panel" title="Drag to resize · double-click to reset"
  onpointerdown={down} onpointermove={move} onpointerup={() => (start = null)} ondblclick={() => (width = initial)}></div>

<style>
  .resizer { position: absolute; top: 10px; bottom: 10px; width: 9px; cursor: ew-resize; z-index: 2; touch-action: none; }
  .resizer.left { right: -5px; }
  .resizer.right { left: -5px; }
  .resizer::after {
    content: ''; position: absolute; top: 0; bottom: 0; left: 4px; width: 1px; border-radius: 1px;
    background: transparent; transition: background 0.12s;
  }
  .resizer:hover::after, .resizer:active::after { background: var(--accent); }
</style>
