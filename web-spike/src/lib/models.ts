// Loads prop models with GLTFLoader and splits them into instanceable parts: one
// (geometry, material, local matrix) per mesh, so every placed copy of a prop becomes one
// instance per part instead of a cloned scene graph.

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh'
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
  parts: Part[]
  scene: THREE.Object3D // for ghosts / thumbnails (scaled)
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

async function load(prop: PropDef): Promise<Model> {
  const gltf = await loader.loadAsync(prop.modelUrl)
  const scene = gltf.scene
  scene.scale.setScalar(prop.scale)
  scene.updateMatrixWorld(true)
  const parts: Part[] = []
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of mats) {
      const std = mat as THREE.MeshStandardMaterial
      // Same idea as the Godot pack override: Kenney Nature glTFs default to metallic 1.
      if ('metallic' in prop.materialOverrides && 'metalness' in std) std.metalness = Number(prop.materialOverrides.metallic)
      if (std.map) std.map.magFilter = THREE.NearestFilter
    }
    mesh.geometry.computeBoundsTree()
    parts.push({ geometry: mesh.geometry, material: mats[0], matrix: mesh.matrixWorld.clone() })
  })
  return { parts, scene, box: new THREE.Box3().setFromObject(scene) }
}
