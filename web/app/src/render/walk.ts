// Walk preview: a first-person, perspective camera at eye height on the terrain (mouse to look,
// WASD to move, Shift to run, Space to jump). It frames the whole low-res target like CameraRig,
// so the pixel pass renders it the same way; there is no sub-texel snapping (the view moves
// freely). Props and buildings don't block the way: this is a look around, not the game.
import * as THREE from 'three'
import type { PixelRenderer } from './pixel'

export interface WalkInput {
  forward: number
  right: number
  run: boolean
  jump: boolean
}

const EYE = 1.6
const WALK_SPEED = 4.5
const RUN_SPEED = 9
const JUMP_SPEED = 5.5
const GRAVITY = 18
/** Vertical field of view of the visible screen (the margins add a little more). */
const FOV = 70
const LOOK_PER_PX = 0.0025

export class WalkCamera {
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 500)
  /** Never offset: the pixel pass shows the frame as rendered. */
  readonly subpixel = new THREE.Vector2()
  /** Feet. */
  readonly position = new THREE.Vector3()
  yaw = 0
  pitch = 0
  private vy = 0
  private grounded = true

  constructor(private pixel: PixelRenderer) {}

  /** Starts on the ground at (x, z), looking along `yaw` (the editor view's heading). */
  start(x: number, z: number, yaw: number, ground: (x: number, z: number) => number) {
    this.position.set(x, ground(x, z), z)
    this.yaw = yaw
    this.pitch = -0.1
    this.vy = 0
    this.grounded = true
  }

  /** Mouse movement in CSS px. */
  look(dx: number, dy: number) {
    this.yaw -= dx * LOOK_PER_PX
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - dy * LOOK_PER_PX))
  }

  update(dt: number, input: WalkInput, ground: (x: number, z: number) => number) {
    const speed = input.run ? RUN_SPEED : WALK_SPEED
    const len = Math.hypot(input.forward, input.right) || 1
    const f = (input.forward / len) * speed * dt
    const r = (input.right / len) * speed * dt
    const sin = Math.sin(this.yaw)
    const cos = Math.cos(this.yaw)
    this.position.x += -sin * f + cos * r
    this.position.z += -cos * f - sin * r

    const floor = ground(this.position.x, this.position.z)
    if (this.grounded && input.jump) {
      this.vy = JUMP_SPEED
      this.grounded = false
    }
    if (this.grounded) this.position.y = floor
    else {
      this.vy -= GRAVITY * dt
      this.position.y += this.vy * dt
      if (this.position.y <= floor) {
        this.position.y = floor
        this.vy = 0
        this.grounded = true
      }
    }

    // Frame the whole low-res target, margins included, with FOV across the visible part.
    const visible = this.pixel.out.y / this.pixel.devicePixelSize
    const cam = this.camera
    cam.fov = (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * (this.pixel.low.y / visible)) * 180) / Math.PI
    cam.aspect = this.pixel.low.x / this.pixel.low.y
    cam.position.set(this.position.x, this.position.y + EYE, this.position.z)
    cam.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'))
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld()
  }
}
