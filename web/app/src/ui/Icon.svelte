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
    check: 'M5 12.5l4.5 4.5L19 7.5',
    polygon: 'M5 8l6-4.5l8 3.5l-1.5 9.5L8 20z M5 8h.01 M11 3.5h.01 M19 7h.01',
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
    cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z M12 12l8-4.5 M12 12v9 M12 12L4 7.5',
    raise: 'M3 19h18 M6 19c2-7 4-11 6-11s4 4 6 11 M12 3v4 M10 5l2-2l2 2',
    lower: 'M3 9h18 M6 9c2 7 4 11 6 11s4-4 6-11 M12 3v4 M10 5l2 2l2-2',
    smooth: 'M3 15c3-4 6-4 9 0s6 4 9 0 M3 9c3-2 6-2 9 0s6 2 9 0',
    flatten: 'M3 16h18 M5 12h14 M9 8h6',
    brush: 'M14 4l6 6l-8 8l-6-6z M6 12l-2 6l6-2',
    foundation: 'M3 14l9-5l9 5l-9 5z M3 14v2l9 5l9-5v-2',
    wall: 'M4 6h16v12H4z M4 10h16 M4 14h16 M9 6v4 M15 6v4 M12 10v4 M7 14v4 M17 14v4',
    door: 'M6 21V4h12v17 M3 21h18 M14 13h.01',
    window: 'M5 5h14v14H5z M12 5v14 M5 12h14',
    eraser: 'M8 20l-4-4l10-10l6 6l-8 8z M14 20h6 M9 11l6 6',
    roof: 'M3 12l9-7l9 7 M6 10v9h12v-9',
    layers: 'M12 4l9 5l-9 5l-9-5z M3 13l9 5l9-5',
    walk: 'M12 3.5a1.75 1.75 0 1 0 0 3.5a1.75 1.75 0 0 0 0-3.5z M9 21l2.2-6.5L14 17v4 M11.2 14.5L12 9l-3.5 1.5L7 13.5 M12 9l2.5 3l3 1',
    minus: 'M6 12h12',
    menu: 'M4 7h16 M4 12h16 M4 17h16',
    clock: 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16z M12 8v4.5l3 2',
    merge: 'M7 4v4a5 5 0 0 0 5 5h0a5 5 0 0 1 5 5v2 M17 4v4a5 5 0 0 1-5 5 M4 7l3-3l3 3',
    more: 'M6 12h.01 M12 12h.01 M18 12h.01',
    branch: 'M7 4v16 M7 9a5 5 0 0 0 5 5h5 M17 11.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5z',
    reset: 'M5 12a7 7 0 1 0 2.1-5 M5 4v4h4',
        eye: 'M3 12c2.5-4.5 5.5-7 9-7s6.5 2.5 9 7c-2.5 4.5-5.5 7-9 7s-6.5-2.5-9-7z M12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5z',
    shuffle: 'M3 7h4l10 10h4 M3 17h4l3-3 M14 10l3-3h4 M18 4l3 3l-3 3 M18 14l3 3l-3 3',
    magnet: 'M6 4v8a6 6 0 0 0 12 0V4 M6 8h4 M14 8h4 M10 4v8a2 2 0 0 0 4 0V4',
    plus: 'M12 5v14 M5 12h14',
    lock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
    unlock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 6.8-1.2',
    group: 'M4 7V4h3 M17 4h3v3 M20 17v3h-3 M7 20H4v-3 M8 8h5v5H8z M11 11h5v5h-5z',
    ungroup: 'M4 4h6v6H4z M14 14h6v6h-6z',
    sliders: 'M4 7h10 M18 7h2 M4 17h4 M12 17h8 M14 5v4 M8 15v4',
    shovel: 'M14 4l6 6 M17 7l-6.5 6.5 M10.5 13.5l-2-2L4 16l4 4l4.5-4.5z',
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
