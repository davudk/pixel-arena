// Loads prop models with GLTFLoader. Static models are split into instanceable parts (geometry,
// material, part matrix) so every placed copy is one instance per part. Skinned models (the
// animated characters) can't be instanced, so each placed copy is a skeleton-aware clone with
// its own AnimationMixer.

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'
import type { PropDef } from './library'

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
THREE.Mesh.prototype.raycast = acceleratedRaycast

export interface Part {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  matrix: THREE.Matrix4 // part -> prop space, prop scale included
}

export interface Model {
  prop: PropDef
  /** Instanceable parts; empty for skinned models. */
  parts: Part[]
  /** Scaled scene (template for clones, ghosts and thumbnails). */
  scene: THREE.Object3D
  animations: THREE.AnimationClip[]
  skinned: boolean
  box: THREE.Box3
}

const loader = new GLTFLoader()
const cache = new Map<string, Promise<Model>>()

export function loadModel(prop: PropDef): Promise<Model> {
  let m = cache.get(prop.id)
  if (!m) {
    m = load(prop)
    cache.set(prop.id, m)
  }
  return m
}

/** A placeable copy of a skinned model, playing its autoplay clip from `phase` (0-1). */
export function cloneAnimated(model: Model, phase: number): { root: THREE.Object3D; mixer: THREE.AnimationMixer } {
  const root = SkeletonUtils.clone(model.scene)
  const mixer = new THREE.AnimationMixer(root)
  const clip = model.animations.find((a) => a.name === model.prop.autoplay)
  if (clip) {
    const action = mixer.clipAction(clip)
    action.play()
    action.time = (((phase % 1) + 1) % 1) * clip.duration
  }
  return { root, mixer }
}

async function load(prop: PropDef): Promise<Model> {
  const gltf = await loader.loadAsync(prop.modelUrl)
  const scene = gltf.scene
  scene.scale.setScalar(prop.scale)
  scene.updateMatrixWorld(true)
  const parts: Part[] = []
  let skinned = false
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) skinned = true
    mesh.castShadow = true
    mesh.receiveShadow = true
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of mats) {
      const std = mat as THREE.MeshStandardMaterial
      // Same as the Godot pack override: Kenney Nature glTFs default to metallic 1.
      if ('metallic' in prop.materialOverrides && 'metalness' in std) std.metalness = Number(prop.materialOverrides.metallic)
      if (std.map) {
        std.map.magFilter = THREE.NearestFilter
        std.map.minFilter = THREE.NearestFilter
      }
    }
    mesh.geometry.computeBoundsTree()
    parts.push({ geometry: mesh.geometry, material: mats[0], matrix: mesh.matrixWorld.clone() })
  })
  return {
    prop, parts: skinned ? [] : parts, scene, animations: gltf.animations, skinned,
    box: new THREE.Box3().setFromObject(scene),
  }
}

/** Plain colored box for props whose pack or model is missing (keeps their data visible). */
export function placeholderParts(propId: string): Part[] {
  let hash = 0
  for (const ch of propId) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  const color = new THREE.Color().setHSL((Math.abs(hash) % 12) / 12, 0.55, 0.6)
  const geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9).translate(0, 0.45, 0)
  geometry.computeBoundsTree()
  return [{ geometry, material: new THREE.MeshLambertMaterial({ color }), matrix: new THREE.Matrix4() }]
}
