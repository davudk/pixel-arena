<script lang="ts">
  // The one search field: icon, input, and a clear button once there's text.
  import Icon from './Icon.svelte'

  interface Props {
    value: string
    placeholder: string
  }
  let { value = $bindable(), placeholder }: Props = $props()
</script>

<label class="search">
  <Icon name="search" size={14} />
  <input {placeholder} bind:value aria-label={placeholder} />
  {#if value}<button class="bare" aria-label="Clear search" onclick={() => (value = '')}><Icon name="x" size={12} /></button>{/if}
</label>

<style>
  .search {
    flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; padding: 0 8px; border-radius: var(--radius);
    border: 1px solid var(--line); background: var(--input); color: var(--muted);
  }
  .search:focus-within { border-color: var(--accent); }
  input { flex: 1; min-width: 0; padding: 7px 0; border: 0; outline: none; background: transparent; color: var(--text); font: inherit; }
</style>
