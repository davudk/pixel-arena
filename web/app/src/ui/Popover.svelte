<script lang="ts">
  // Floating panel anchored to an element: `right` opens beside it (top-aligned, or beside a
  // custom left edge via `rightOf`), `below` opens under it (right-aligned), `above` opens over
  // it (horizontally centred on it). Closes on Escape or a click outside both the popover and its
  // anchor. Kept inside the window.
  import { onMount, type Snippet } from 'svelte'

  interface Props {
    anchor: HTMLElement
    placement?: 'right' | 'below' | 'above'
    /** For `right`: open to the right of this element instead of the anchor (e.g. the panel). */
    rightOf?: HTMLElement | null
    width?: number
    onclose: () => void
    children: Snippet
  }
  let { anchor, placement = 'below', rightOf = null, width = 260, onclose, children }: Props = $props()

  let el: HTMLDivElement
  let pos = $state({ left: 0, top: 0 as number | null, bottom: null as number | null, maxHeight: 400 })

  function place() {
    const a = anchor.getBoundingClientRect()
    const gap = 8
    if (placement === 'right') {
      const left = (rightOf ?? anchor).getBoundingClientRect().right + gap
      // Below anything marked data-avoid above it (the top bar), above anything below it (the
      // bottom bar), when they overlap horizontally.
      let top = a.top
      let bottom = innerHeight - 12
      for (const el of document.querySelectorAll('[data-avoid]')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.right <= left || r.left >= left + width) continue
        if (r.top < a.top) top = Math.max(top, r.bottom + gap)
        else bottom = Math.min(bottom, r.top - gap)
      }
      pos = { left, top, bottom: null, maxHeight: bottom - top }
    } else if (placement === 'above') {
      const left = Math.max(8, Math.min((a.left + a.right) / 2 - width / 2, innerWidth - width - 8))
      pos = { left, top: null, bottom: innerHeight - a.top + gap, maxHeight: a.top - gap - 12 }
    } else {
      const left = Math.max(8, Math.min(a.right - width, innerWidth - width - 8))
      pos = { left, top: a.bottom + 6, bottom: null, maxHeight: innerHeight - a.bottom - 18 }
    }
  }

  onMount(() => {
    // Live under <body>: panels use backdrop-filter, which would make them the containing
    // block for position: fixed.
    document.body.appendChild(el)
    place()
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (!el.contains(t) && !anchor.contains(t)) onclose()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onclose()
      }
    }
    addEventListener('pointerdown', down, true)
    addEventListener('keydown', key, true)
    addEventListener('resize', place)
    return () => {
      removeEventListener('pointerdown', down, true)
      removeEventListener('keydown', key, true)
      removeEventListener('resize', place)
      el.remove()
    }
  })
</script>

<div class="popover" bind:this={el} role="dialog" style:left="{pos.left}px" style:top={pos.top === null ? null : `${pos.top}px`}
  style:bottom={pos.bottom === null ? null : `${pos.bottom}px`}
  style:width="{width}px" style:max-height="{pos.maxHeight}px">
  {@render children()}
</div>

<style>
  .popover {
    position: fixed; z-index: 20; display: flex; flex-direction: column; min-height: 0; overflow: hidden;
    border-radius: 12px; background: #1d2028; border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.5);
  }
</style>
