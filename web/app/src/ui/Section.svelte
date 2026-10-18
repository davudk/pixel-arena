<script lang="ts">
  // A collapsible section of a right-hand container (Selection, History); `open` is remembered per player (ui-state).
  import type { Snippet } from 'svelte'
  import Icon from './Icon.svelte'

  interface Props {
    title: string
    open: boolean
    /** Grow to fill leftover height (lists). */
    grow?: boolean
    badge?: string
    children: Snippet
  }
  let { title, open = $bindable(), grow = false, badge = '', children }: Props = $props()
</script>

<section class="panel-section" class:open class:grow>
  <button class="head" onclick={() => (open = !open)} aria-expanded={open}>
    <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} />
    <span>{title}</span>
    {#if badge}<span class="badge">{badge}</span>{/if}
  </button>
  {#if open}
    <div class="body">{@render children()}</div>
  {/if}
</section>

<style>
  /* Sections keep their content height (no squeezing into each other); a "grow" section (history)
     takes the room that's left but never less than a usable minimum, and the inspector column
     scrolls if even that doesn't fit. */
  .panel-section { flex: none; display: flex; flex-direction: column; border-top: 1px solid var(--line); }
  .panel-section:first-child { border-top: 0; }
  .panel-section.open.grow { flex: 1 1 auto; min-height: 240px; }
  .head {
    display: flex; align-items: center; gap: 6px; padding: 9px 12px; border: 0; border-radius: 0; background: transparent;
    color: var(--muted); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; text-align: left;
  }
  .head:hover:not(:disabled) { background: var(--card); color: var(--text); }
  .badge { margin-left: auto; color: var(--accent); text-transform: none; letter-spacing: 0; font-weight: 500; }
  .body { display: flex; flex-direction: column; padding: 0 12px 12px; }
  .panel-section.grow .body { flex: 1; min-height: 0; }
</style>
