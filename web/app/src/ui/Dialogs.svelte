<script lang="ts" module>
  import type { Review } from './merge-review'

  /** What dialog is open (null = none). */
  export type DialogState =
    | { kind: 'name'; title: string; initial: string; submit: (name: string) => void }
    | { kind: 'confirm'; title: string; message: string; confirmLabel: string; confirm: () => void }
    | { kind: 'merge'; review: Review; merge: (take: boolean[]) => void }
    | null
</script>

<script lang="ts">
  // The app's dialogs: a name prompt (new / rename branch), a confirmation (discard), and the
  // merge review (one row per conflict with Keep / Take, terrain grouped per layer).
  import Modal from './Modal.svelte'

  let { dialog = $bindable() }: { dialog: DialogState } = $props()

  let name = $state('')
  let take: boolean[] = $state([])
  let input: HTMLInputElement | undefined = $state()

  $effect(() => {
    if (dialog?.kind === 'name') {
      name = dialog.initial
      queueMicrotask(() => input?.select())
    }
    if (dialog?.kind === 'merge') take = dialog.review.rows.map(() => true)
  })

  const close = () => (dialog = null)
  function submitName() {
    if (dialog?.kind !== 'name' || !name.trim()) return
    const d = dialog
    close()
    d.submit(name.trim())
  }
</script>

{#if dialog?.kind === 'name'}
  <Modal title={dialog.title} oncancel={close}>
    <input bind:this={input} class="field" bind:value={name} onkeydown={(e) => e.key === 'Enter' && submitName()} />
    {#snippet actions()}
      <button onclick={close}>Cancel</button>
      <button class="primary" disabled={!name.trim()} onclick={submitName}>OK</button>
    {/snippet}
  </Modal>
{:else if dialog?.kind === 'confirm'}
  {@const c = dialog}
  <Modal title={c.title} oncancel={close}>
    <p>{c.message}</p>
    {#snippet actions()}
      <button onclick={close}>Cancel</button>
      <button class="danger" onclick={() => {
        close()
        c.confirm()
      }}>{c.confirmLabel}</button>
    {/snippet}
  </Modal>
{:else if dialog?.kind === 'merge'}
  {@const r = dialog.review}
  <Modal title="Merge branch" width={680} oncancel={close}>
    <p>
      Merge “{r.source}” into “{r.target}”: {r.changes} change{r.changes === 1 ? '' : 's'} apply cleanly,
      {r.conflicts} conflict{r.conflicts === 1 ? '' : 's'}.
      {#if r.rows.length === 0}<br /><span class="muted">The branch is removed after merging; undo reverts the whole merge.</span>{/if}
    </p>
    {#if r.rows.length > 0}
      <table>
        <thead><tr><th>Conflict</th><th>In “{r.target}”</th><th>In “{r.source}”</th><th>Result</th></tr></thead>
        <tbody>
          {#each r.rows as row, i (i)}
            <tr>
              <td>{row.what}</td><td>{row.mine}</td><td>{row.theirs}</td>
              <td>
                <div class="seg">
                  <button class:on={!take[i]} onclick={() => (take[i] = false)}>Keep</button>
                  <button class:on={take[i]} onclick={() => (take[i] = true)}>Take</button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
    {#snippet actions()}
      {#if r.rows.length > 0}
        <button onclick={() => (take = take.map(() => false))}>Keep all</button>
        <button onclick={() => (take = take.map(() => true))}>Take all</button>
        <span class="spacer"></span>
      {/if}
      <button onclick={close}>Cancel</button>
      <button class="primary" onclick={() => {
        const d = dialog as Extract<DialogState, { kind: 'merge' }>
        const choice = [...take]
        close()
        d.merge(choice)
      }}>Merge</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .field {
    width: 100%; padding: 9px 12px; border-radius: 10px; border: 1px solid var(--line);
    background: #0f1115; color: var(--text); font: inherit; outline: none;
  }
  .field:focus { border-color: var(--accent); }
  p { margin: 0; line-height: 1.5; }
  .muted { color: var(--muted); }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th { text-align: left; color: var(--muted); font-weight: 500; padding: 6px 8px; border-bottom: 1px solid var(--line); }
  td { padding: 6px 8px; border-bottom: 1px solid var(--line); }
  .seg { display: inline-flex; padding: 2px; gap: 2px; border-radius: 8px; background: #15171c; }
  .seg button { border: 0; background: transparent; padding: 3px 10px; }
  .seg button.on { background: #30353f; color: var(--accent); }
  .spacer { flex: 1; }
  :global(button.primary) { background: var(--accent); color: #1a1408; border-color: transparent; font-weight: 600; }
  :global(button.primary:hover:not(:disabled)) { background: #f5cd6a; }
  :global(button.danger) { background: #c2453a; border-color: transparent; color: white; }
</style>
