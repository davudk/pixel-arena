<script lang="ts">
  // A collapsible section of the right-hand panel; `open` is remembered per player (ui-state).
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

<section class="section" class:open class:grow>
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
  .section { display: flex; flex-direction: column; min-height: 0; border-top: 1px solid var(--line); }
  .section:first-child { border-top: 0; }
  .section.open.grow { flex: 1; }
  .head {
    display: flex; align-items: center; gap: 6px; padding: 9px 12px; border: 0; border-radius: 0; background: transparent;
    color: var(--muted); font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; text-align: left;
  }
  .head:hover:not(:disabled) { background: rgba(255, 255, 255, 0.03); color: var(--text); }
  .badge { margin-left: auto; color: var(--accent); text-transform: none; letter-spacing: 0; font-weight: 500; }
  .body { display: flex; flex-direction: column; min-height: 0; padding: 0 12px 12px; }
  .section.grow .body { flex: 1; }
</style>
