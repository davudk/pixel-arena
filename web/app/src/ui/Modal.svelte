<script lang="ts">
  // Centered dialog with a backdrop. Esc / backdrop click cancel; children render the body,
  // `actions` the button row.
  import type { Snippet } from 'svelte'

  interface Props {
    title: string
    width?: number
    oncancel: () => void
    children: Snippet
    actions: Snippet
  }
  let { title, width = 420, oncancel, children, actions }: Props = $props()
</script>

<svelte:window onkeydown={(e) => {
  if (e.key === 'Escape') {
    e.stopPropagation()
    oncancel()
  }
}} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={(e) => e.target === e.currentTarget && oncancel()}>
  <div class="card" role="dialog" aria-modal="true" aria-label={title} style:width="{width}px">
    <h2>{title}</h2>
    <div class="body">{@render children()}</div>
    <div class="actions">{@render actions()}</div>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(5, 7, 12, 0.55); display: grid; place-items: center; z-index: 50; }
  .card {
    max-width: calc(100vw - 32px); max-height: calc(100vh - 64px); display: flex; flex-direction: column; gap: 12px;
    padding: 16px 18px; border-radius: 14px; background: #1d2028; border: 1px solid var(--line);
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
  }
  h2 { margin: 0; font-size: 15px; }
  .body { min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 10px; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
