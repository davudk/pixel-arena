// Trackpad vs mouse wheel. Browsers deliver both as `wheel` events:
//   - pinch            -> ctrlKey + deltaY (Chromium and Firefox synthesize this)  => zoom at the cursor
//   - two-finger move  -> precise pixel deltas, often with deltaX                  => pan
//   - mouse wheel      -> line deltas, or wheelDeltaY in steps of 120 (one notch)    => zoom at the cursor
// Two-finger rotation isn't a web event: the desktop shell forwards macOS rotate gestures
// (see platform.ts), and Safari has its own gesturechange.

export type WheelKind = 'pinch' | 'pan' | 'zoom'

export interface WheelLike {
  deltaX: number
  deltaY: number
  deltaMode: number
  ctrlKey: boolean
  /** Legacy, non-standard (Chromium / WebKit); undefined or 0 when unknown. */
  wheelDeltaY?: number
  timeStamp: number
}

const STREAM_GAP_MS = 250 // a pause this long starts a new gesture

/** Classifies wheel events, keeping one decision for each continuous stream (so a trackpad
 *  pan never turns into a zoom halfway through, and momentum events stay pans). */
export class WheelClassifier {
  private kind: WheelKind | null = null
  private last = -Infinity

  classify(e: WheelLike): WheelKind {
    const fresh = e.timeStamp - this.last > STREAM_GAP_MS
    this.last = e.timeStamp
    // Pinch can start in the middle of a two-finger move; it always wins.
    if (e.ctrlKey) return (this.kind = 'pinch')
    if (fresh || this.kind === 'pinch' || this.kind === null) this.kind = guess(e)
    return this.kind
  }
}

function guess(e: WheelLike): WheelKind {
  if (e.deltaMode !== 0) return 'zoom' // lines or pages: a mouse wheel
  const legacy = e.wheelDeltaY ?? 0
  if (legacy !== 0 && legacy === -3 * e.deltaY) return 'pan' // WebKit/Chromium trackpad signature
  if (e.deltaX !== 0) return 'pan'
  if (legacy !== 0 && legacy % 120 === 0) return 'zoom' // whole mouse notches
  return 'pan'
}

/** Zoom factor for a pinch step (deltaY < 0 = fingers apart = zoom in). */
export const pinchFactor = (deltaY: number) => Math.exp(deltaY * 0.01)
/** Zoom factor for a mouse wheel step. */
export const wheelFactor = (deltaY: number) => Math.pow(1.0015, deltaY)
