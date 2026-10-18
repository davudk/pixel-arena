// Pixel renderer + camera rig (ports of PixelView and CameraRig from the Godot version).
// The scene renders into a low-resolution target (canvas size / pixelSize plus a margin); a
// full-screen pass upscales it with nearest sampling, draws depth-based outlines and applies
// tone mapping. The camera is snapped to whole texels and the leftover sub-texel offset shifts
// the upscaled image instead, so panning is smooth without pixel crawl.

import * as THREE from 'three'

const MARGIN = 2

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

const POST_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 sourceSize;   // low-res target size (texels)
uniform vec2 outputSize;   // canvas size (device pixels)
uniform float pixelSize;
uniform vec2 offset;       // sub-texel camera remainder, in texels
uniform float outline;
uniform vec3 outlineColor;
uniform float near;
uniform float far;
varying vec2 vUv;

float viewDepth(ivec2 p) {
  float d = texelFetch(tDepth, p, 0).r;
  return near + d * (far - near); // orthographic: depth is linear
}

void main() {
  vec2 frag = vUv * outputSize;
  vec2 src = frag / pixelSize + vec2(${MARGIN}.0) + vec2(-offset.x, offset.y);
  ivec2 p = ivec2(floor(src));
  vec3 c = texelFetch(tColor, p, 0).rgb;
  if (outline > 0.0) {
    float d = viewDepth(p);
    float lap = viewDepth(p + ivec2(1, 0)) + viewDepth(p - ivec2(1, 0)) + viewDepth(p + ivec2(0, 1)) + viewDepth(p - ivec2(0, 1)) - 4.0 * d;
    float edge = step(0.06 + d * 0.012, lap);
    c = mix(c, outlineColor, edge * outline);
  }
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

export class PixelRenderer {
  readonly renderer: THREE.WebGLRenderer
  /** Size of one rendered pixel in CSS pixels (points), like the Godot version. */
  pixelSize = 3
  outline = 0.55
  private target: THREE.WebGLRenderTarget
  private post: THREE.ShaderMaterial
  private postScene = new THREE.Scene()
  private postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  /** Low-res size including margins (texels). */
  readonly low = new THREE.Vector2(1, 1)
  /** Canvas size in device pixels. */
  readonly out = new THREE.Vector2(1, 1)
  /** Draw calls / triangles of the last scene pass (excluding the upscale pass). */
  readonly sceneInfo = { calls: 0, triangles: 0 }

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true })
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter,
      depthTexture: new THREE.DepthTexture(1, 1, THREE.FloatType),
      type: THREE.HalfFloatType,
    })
    this.post = new THREE.ShaderMaterial({
      vertexShader: POST_VERT, fragmentShader: POST_FRAG, toneMapped: true,
      uniforms: {
        tColor: { value: this.target.texture }, tDepth: { value: this.target.depthTexture },
        sourceSize: { value: this.low }, outputSize: { value: this.out }, pixelSize: { value: 3 },
        offset: { value: new THREE.Vector2() }, outline: { value: 0.5 },
        outlineColor: { value: new THREE.Color('#1a1626') }, near: { value: 0.5 }, far: { value: 1000 },
      },
    })
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post))
  }

  /** Rendered pixel size in device pixels. */
  get devicePixelSize(): number {
    return this.pixelSize * window.devicePixelRatio
  }

  resize(cssWidth: number, cssHeight: number) {
    const dpr = window.devicePixelRatio
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(cssWidth, cssHeight, false)
    this.out.set(Math.round(cssWidth * dpr), Math.round(cssHeight * dpr))
    const px = this.devicePixelSize
    this.low.set(Math.ceil(this.out.x / px) + MARGIN * 2, Math.ceil(this.out.y / px) + MARGIN * 2)
    this.target.setSize(this.low.x, this.low.y)
  }

  render(scene: THREE.Scene, rig: CameraRig) {
    const u = this.post.uniforms
    u.pixelSize.value = this.devicePixelSize
    u.outline.value = this.outline
    u.offset.value.copy(rig.subpixel)
    u.near.value = rig.camera.near
    u.far.value = rig.camera.far
    this.renderer.setRenderTarget(this.target)
    this.renderer.render(scene, rig.camera)
    this.sceneInfo.calls = this.renderer.info.render.calls
    this.sceneInfo.triangles = this.renderer.info.render.triangles
    this.renderer.setRenderTarget(null)
    this.renderer.render(this.postScene, this.postCamera)
  }

  /** Screen (CSS px) -> normalized device coords of the low-res camera (for raycasts). */
  toNdc(cssX: number, cssY: number, rig: CameraRig): THREE.Vector2 {
    // Same mapping as the post pass (texel coordinates from the bottom-left).
    const dpr = window.devicePixelRatio
    const px = this.devicePixelSize
    const sx = (cssX * dpr) / px + MARGIN - rig.subpixel.x
    const sy = (this.out.y - cssY * dpr) / px + MARGIN + rig.subpixel.y
    return new THREE.Vector2((sx / this.low.x) * 2 - 1, (sy / this.low.y) * 2 - 1)
  }
}

export class CameraRig {
  readonly camera = new THREE.OrthographicCamera()
  focus = new THREE.Vector3()
  yaw = Math.PI / 4
  pitch = -Math.atan(1 / Math.SQRT2) // true isometric
  zoom = 40 // visible world height (m)
  readonly subpixel = new THREE.Vector2()
  private yawTarget = this.yaw

  constructor(private pixel: PixelRenderer) {}

  rotateBy(angle: number) {
    this.yawTarget += angle
  }

  update(dt: number) {
    this.yaw += (this.yawTarget - this.yaw) * (1 - Math.exp(-dt * 14))
    const basis = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'))
    const back = new THREE.Vector3(0, 0, 1).applyMatrix4(basis)
    const dist = this.zoom * 2 + 50
    let pos = this.focus.clone().addScaledVector(back, dist)

    // Frustum covers the whole low-res target (margin included); texel = world size of one texel.
    const visibleTexels = this.pixel.out.y / this.pixel.devicePixelSize
    const texel = this.zoom / visibleTexels
    const halfW = (this.pixel.low.x * texel) / 2
    const halfH = (this.pixel.low.y * texel) / 2
    const cam = this.camera
    cam.left = -halfW; cam.right = halfW; cam.top = halfH; cam.bottom = -halfH
    cam.near = 0.5
    cam.far = dist * 2 + this.zoom * 4

    this.subpixel.set(0, 0)
    if (this.pixel.pixelSize > 1) {
      // Snap the camera's screen-plane position to whole texels; keep the remainder as offset.
      const inv = basis.clone().transpose()
      const local = pos.clone().applyMatrix4(inv)
      const sx = Math.round(local.x / texel) * texel
      const sy = Math.round(local.y / texel) * texel
      this.subpixel.set(-(local.x - sx) / texel, (local.y - sy) / texel)
      pos = new THREE.Vector3(sx, sy, local.z).applyMatrix4(basis)
    }
    cam.position.copy(pos)
    cam.quaternion.setFromRotationMatrix(basis)
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld()
  }

  /** Pans so the ground point under `from` ends up under `to`. */
  panScreen(from: THREE.Vector3 | null, to: THREE.Vector3 | null) {
    if (from && to) this.focus.add(from.sub(to))
  }

  /** Pans in screen directions scaled by zoom (keyboard). */
  panRelative(dx: number, dy: number) {
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    this.focus.addScaledVector(right, dx * this.zoom).addScaledVector(forward, -dy * this.zoom)
  }
}
