// Sun, moon, sky and ambient light driven by a time of day in hours (0-24); port of DayCycle.
// The sun's shadow box follows the camera focus and is snapped to shadow texels so shadow edges
// don't swim while panning.

import * as THREE from 'three'

const SUNRISE = new THREE.Color('#ff9e61')
const NOON = new THREE.Color('#fff7e6')
const DAY_SKY = new THREE.Color('#5287d9')
const DAY_HORIZON = new THREE.Color('#b8d1eb')
const DUSK_HORIZON = new THREE.Color('#f29966')
const NIGHT_SKY = new THREE.Color('#050814')
const NIGHT_HORIZON = new THREE.Color('#0f1429')
/** Tilt of the sun's path away from straight overhead, so noon shadows still have direction. */
const PATH_TILT = THREE.MathUtils.degToRad(35)
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

export class DayCycle {
  readonly sun = new THREE.DirectionalLight('#ffffff', 3)
  readonly moon = new THREE.DirectionalLight('#8ca6ff', 0)
  readonly sky = new THREE.HemisphereLight('#cfe3ff', '#5a6b46', 1.4)
  mode: 'fixed' | 'cycle' = 'fixed'
  timeOfDay = 10
  /** Real seconds per in-game day in cycle mode. */
  dayLength = 600
  private sunDir = new THREE.Vector3(0, 1, 0)

  constructor(private scene: THREE.Scene) {
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(4096, 4096)
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.04
    scene.add(this.sun, this.sun.target, this.moon, this.moon.target, this.sky)
    this.apply()
  }

  update(dt: number) {
    if (this.mode === 'cycle' && this.dayLength > 0) {
      this.timeOfDay = (this.timeOfDay + (dt * 24) / this.dayLength) % 24
      this.apply()
    }
  }

  apply() {
    // 6:00 sunrise in the east (+X), 12:00 highest, 18:00 sunset in the west.
    const angle = (this.timeOfDay / 24 - 0.25) * Math.PI * 2
    const height = Math.sin(angle)
    this.sunDir.set(Math.cos(angle), height * Math.cos(PATH_TILT), height * Math.sin(PATH_TILT)).normalize()
    const day = smoothstep(-0.12, 0.2, height)
    const lowSun = 1 - smoothstep(0, 0.45, Math.abs(height))
    this.sun.intensity = day * 3.0
    this.sun.color.copy(NOON).lerp(SUNRISE, lowSun)
    this.sun.visible = day > 0.001
    this.moon.intensity = (1 - day) * 0.6
    const horizon = DAY_HORIZON.clone().lerp(DUSK_HORIZON, lowSun * day)
    this.sky.color.copy(NIGHT_HORIZON).lerp(horizon, day)
    this.sky.groundColor.set('#3a4a32').lerp(new THREE.Color('#0a0c14'), 1 - day)
    this.sky.intensity = 0.55 + day * 1.05
    const bg = NIGHT_SKY.clone().lerp(DAY_SKY, day).lerp(horizon, 0.35)
    this.scene.background = bg
  }

  /** Keeps the shadow box on the view: `extent` is half its width in meters. */
  follow(focus: THREE.Vector3, extent: number) {
    const texel = (extent * 2) / this.sun.shadow.mapSize.x
    const f = new THREE.Vector3(Math.round(focus.x / texel) * texel, 0, Math.round(focus.z / texel) * texel)
    for (const [light, dir] of [[this.sun, this.sunDir], [this.moon, this.sunDir.clone().negate()]] as const) {
      light.position.copy(f).addScaledVector(dir, 300)
      light.target.position.copy(f)
    }
    const cam = this.sun.shadow.camera
    cam.left = -extent
    cam.right = extent
    cam.top = extent
    cam.bottom = -extent
    cam.near = 1
    cam.far = 800
    cam.updateProjectionMatrix()
  }
}
