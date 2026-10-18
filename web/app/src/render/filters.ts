// Look presets (port of the Godot build's Filters). A preset is a bundle of filter option values;
// the viewer picks a preset and may override single options (layering: see view-settings.ts).
// The post shader (pixel.ts) turns the resolved values into uniforms.

/** Every filter option with its value when neither a preset nor an override sets it. */
export const OPTIONS = {
  pixel_size: 3, // CSS pixels per rendered pixel (1 = full resolution)
  outline: 0, // edge outline strength 0-1
  outline_color: '#1a1626',
  palette: 'none', // none | levels | pico8 | gameboy | vivid16
  color_levels: 6, // levels per channel when palette = levels
  dither: 0, // ordered dither strength 0-1 (with a palette)
  brightness: 0,
  contrast: 1,
  saturation: 1,
  tint: '#ffffff',
  tint_amount: 0,
  oil: 0, // oil-paint (Kuwahara) radius in rendered pixels, 0 = off
  vignette: 0,
  grain: 0,
  scanlines: 0,
}
export type FilterOptions = typeof OPTIONS
export type OptionKey = keyof FilterOptions

export const PRESETS: Record<string, Partial<FilterOptions>> = {
  pixel: { pixel_size: 3, outline: 0.55, saturation: 1.05 },
  clean: { pixel_size: 1 },
  retro: { pixel_size: 4, palette: 'pico8', dither: 0.45, outline: 0.8 },
  gameboy: { pixel_size: 4, palette: 'gameboy', dither: 0.6, outline: 0.4, contrast: 1.1 },
  'oil painting': { pixel_size: 1, oil: 4, saturation: 1.2, contrast: 1.05, vignette: 0.35 },
  gothic: {
    pixel_size: 2, saturation: 0.35, contrast: 1.35, brightness: -0.06, tint: '#5a6a9a',
    tint_amount: 0.3, vignette: 0.65, grain: 0.12, outline: 0.9, outline_color: '#05040a',
  },
  sepia: { pixel_size: 2, saturation: 0, tint: '#b08a5a', tint_amount: 0.55, vignette: 0.45, grain: 0.1 },
  crt: { pixel_size: 3, scanlines: 0.45, vignette: 0.35, saturation: 1.15, contrast: 1.1 },
}
export const PRESET_ORDER = ['pixel', 'clean', 'retro', 'gameboy', 'oil painting', 'gothic', 'sepia', 'crt']

export const PALETTES: Record<string, string[]> = {
  pico8: ['000000', '1d2b53', '7e2553', '008751', 'ab5236', '5f574f', 'c2c3c7', 'fff1e8',
    'ff004d', 'ffa300', 'ffec27', '00e436', '29adff', '83769c', 'ff77a8', 'ffccaa'],
  gameboy: ['0f380f', '306230', '8bac0f', '9bbc0f'],
  vivid16: ['1a1c2c', '5d275d', 'b13e53', 'ef7d57', 'ffcd75', 'a7f070', '38b764', '257179',
    '29366f', '3b5dc9', '41a6f6', '73eff7', 'f4f4f4', '94b0c2', '566c86', '333c57'],
}
export const PALETTE_NAMES = ['none', 'levels', ...Object.keys(PALETTES)]

export function isOption(key: string): key is OptionKey {
  return key in OPTIONS
}

/** Value of an option under a preset (falling back to the option default). */
export function presetValue<K extends OptionKey>(preset: string, key: K): FilterOptions[K] {
  return (PRESETS[preset]?.[key] ?? OPTIONS[key]) as FilterOptions[K]
}
