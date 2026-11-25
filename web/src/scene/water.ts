// Replaces the Bay_Water mesh with three.js Water, keeping the bay's own outline.
import { BufferGeometry, Float32BufferAttribute, Mesh, RepeatWrapping, Texture, Vector3, type Scene } from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';

export function createWater(scene: Scene, normals: Texture, sun: Vector3): Water | null {
  const bay = scene.getObjectByName('Bay_Water') as Mesh | undefined;
  if (!bay?.isMesh) return null;
  bay.updateWorldMatrix(true, false);

  // The optimized GLB stores positions quantized; rebuild them as floats in world space.
  const src = bay.geometry.attributes.position;
  const p = new Vector3(), arr = new Float32Array(src.count * 3);
  for (let i = 0; i < src.count; i++) { p.fromBufferAttribute(src, i).applyMatrix4(bay.matrixWorld); arr.set([p.x, p.y, p.z], i * 3); }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(arr, 3));
  if (bay.geometry.index) geo.setIndex(bay.geometry.index.clone());
  // Water mirrors around its local +Z; lay the geometry in XY and rotate the mesh back down.
  geo.rotateX(Math.PI / 2);

  normals.wrapS = normals.wrapT = RepeatWrapping;
  const water = new Water(geo, {
    textureWidth: 512, textureHeight: 512, waterNormals: normals,
    sunDirection: sun.clone().normalize(), sunColor: 0xffa070, waterColor: 0x0b0a2e,
    distortionScale: 2.2, fog: false, alpha: 1,
  });
  water.rotation.x = -Math.PI / 2;
  water.name = 'Bay_Water_Live';
  (water.material.uniforms.size as { value: number }).value = 3.5;
  bay.visible = false;
  scene.add(water);
  return water;
}
