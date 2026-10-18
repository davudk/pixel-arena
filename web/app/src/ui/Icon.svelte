<script lang="ts" module>
  // Small stroke icons (24-unit grid, drawn at 16 px by default).
  const PATHS: Record<string, string> = {
    search: 'M10 4a6 6 0 1 0 0 12a6 6 0 0 0 0-12z M20 20l-5.6-5.6',
    filter: 'M4 5h16l-6 7.5V19l-4 1.5v-8z',
    grid: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
    list: 'M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01',
    star: 'M12 3.5l2.6 5.3l5.9.9l-4.3 4.1l1 5.8L12 16.9l-5.2 2.7l1-5.8l-4.3-4.1l5.9-.9z',
    chevronRight: 'M9 6l6 6l-6 6',
    chevronDown: 'M6 9l6 6l6-6',
    x: 'M6 6l12 12 M18 6L6 18',
    panelLeft: 'M4 5h16v14H4z M9.5 5v14',
    panelRight: 'M4 5h16v14H4z M14.5 5v14',
    pointer: 'M6 3l12 9l-5.5 1.2L15 19l-2.5 1.2l-2.6-5.6L6 18z',
    mountain: 'M3 19l6.5-11l4 6.5l2.5-3.5L21 19z',
    droplet: 'M12 3.5c3 4 6 7.3 6 10.5a6 6 0 0 1-12 0c0-3.2 3-6.5 6-10.5z',
    building: 'M4 20V9l8-5l8 5v11z M9.5 20v-6h5v6',
    copy: 'M8 8h11v11H8z M5 15V5h10',
    trash: 'M5 7h14 M10 7V4.5h4V7 M7 7l1 13h8l1-13',
    rotate: 'M19 12a7 7 0 1 1-2.1-5 M19 4v4h-4',
    up: 'M12 19V5 M6 11l6-6l6 6',
    down: 'M12 5v14 M6 13l6 6l6-6',
    focus: 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5 M12 10.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3z',
    palette: 'M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 1.9-1 1.4-2.1c-.6-1.3.2-2.4 1.6-2.4H17a3.5 3.5 0 0 0 3.5-3.5c0-5-3.8-9-8.5-9z M7.5 11h.01 M10 7.5h.01 M14.5 7.5h.01',
    undo: 'M9 14L4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
    redo: 'M15 14l5-5l-5-5 M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  }
</script>

<script lang="ts">
  interface Props {
    name: keyof typeof PATHS | string
    size?: number
    filled?: boolean
  }
  let { name, size = 16, filled = false }: Props = $props()
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor"
  stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d={PATHS[name] ?? ''} />
</svg>

<style>
  svg { flex: none; display: block; }
</style>
