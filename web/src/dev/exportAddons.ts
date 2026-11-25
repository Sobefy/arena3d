// Development helper (only loaded with ?export): writes out everything the web app adds on top of the Blender model
// (court, baskets, courtside, boards, suite seating and decor, and the moulded chair) as one GLB, so Blender can render the same venue.
import {
  BufferAttribute, BufferGeometry, Color, InstancedMesh, Matrix3, Matrix4, Mesh, MeshStandardMaterial, Object3D, Scene, Vector3,
  type Material, type Texture,
} from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { createChairHD } from '../scene/chairHD';

const SKIP = /^(Suite_ChairShadows|Suite_BarShadows|Suite_FloorGlow|Suite_BarGlow)$/; // painted-on shade and glow: the renderer makes its own

/** Bakes instances (or a single mesh) into plain geometry in world space, keeping colour. Optionally keeps only shell or frame vertices of a chair. */
function flatten(src: Mesh, part: 'all' | 'shell' | 'frame' = 'all'): BufferGeometry {
  const g = src.geometry, pos = g.getAttribute('position'), nor = g.getAttribute('normal'), uv = g.getAttribute('uv'), col = g.getAttribute('color');
  const idx = g.index ? Array.from(g.index.array) : Array.from({ length: pos.count }, (_, i) => i);
  const tris: number[] = [];
  for (let i = 0; i < idx.length; i += 3) {
    const frame = col ? col.getX(idx[i]) < 0.5 : false;
    if (part === 'all' || (part === 'frame') === frame) tris.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  const im = (src as InstancedMesh).isInstancedMesh ? (src as InstancedMesh) : null, n = im ? im.count : 1;
  const P = new Float32Array(n * pos.count * 3), N = new Float32Array(n * pos.count * 3), U = new Float32Array(n * pos.count * 2), C = new Float32Array(n * pos.count * 3);
  const I = new Uint32Array(n * tris.length), m = new Matrix4(), nm = new Matrix3(), v = new Vector3(), c = new Color(1, 1, 1);
  for (let k = 0; k < n; k++) {
    if (im) { im.getMatrixAt(k, m); m.premultiply(src.matrixWorld); if (im.instanceColor) im.getColorAt(k, c); } else m.copy(src.matrixWorld);
    nm.getNormalMatrix(m);
    for (let i = 0; i < pos.count; i++) {
      const o = (k * pos.count + i) * 3;
      v.fromBufferAttribute(pos, i).applyMatrix4(m); P[o] = v.x; P[o + 1] = v.y; P[o + 2] = v.z;
      v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); N[o] = v.x; N[o + 1] = v.y; N[o + 2] = v.z;
      if (uv) { U[(k * pos.count + i) * 2] = uv.getX(i); U[(k * pos.count + i) * 2 + 1] = uv.getY(i); }
      const shell = col && part !== 'frame' ? Math.max(col.getX(i), 0.5) : 1; // shell shade only; frames get their own material
      C[o] = c.r * shell; C[o + 1] = c.g * shell; C[o + 2] = c.b * shell;
    }
    const mirrored = m.determinant() < 0; // a mirrored copy needs its triangles wound the other way, or renderers see it inside-out
    for (let i = 0; i < tris.length; i += 3) { const o = k * tris.length + i, b = k * pos.count; I[o] = tris[i] + b; I[o + 1] = tris[i + (mirrored ? 2 : 1)] + b; I[o + 2] = tris[i + (mirrored ? 1 : 2)] + b; }
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(P, 3)); out.setAttribute('normal', new BufferAttribute(N, 3));
  if (uv) out.setAttribute('uv', new BufferAttribute(U, 2));
  out.setAttribute('color', new BufferAttribute(C, 3)); out.setIndex(new BufferAttribute(I, 1));
  return out;
}

export async function exportAddons(scene: Scene): Promise<string> {
  const out = new Scene();
  const steel = new MeshStandardMaterial({ name: 'Game_Steel', color: 0xd0d4dc, metalness: 1, roughness: 0.25 });
  const add = (name: string, geo: BufferGeometry, mat: Material) => { const me = new Mesh(geo, mat); me.name = name; out.add(me); };
  const chairParts = (name: string, src: Mesh) => {
    const m = (src.material as MeshStandardMaterial).clone(); m.name = name + '_Shell'; m.vertexColors = true;
    add(name + '_Shell', flatten(src, 'shell'), m); add(name + '_Frame', flatten(src, 'frame'), steel);
  };
  scene.updateMatrixWorld(true);
  let n = 0;
  const visit = (o: Object3D, prefix: string) => {
    const me = o as Mesh;
    if (SKIP.test(o.name)) return;
    if (me.isMesh) {
      const label = `${prefix}_${o.name || 'Part'}_${n++}`;
      const isChair = (me as InstancedMesh).isInstancedMesh && me.geometry.getAttribute('color') && me.geometry.getAttribute('position').count > 200 && /Chair|Courtside/.test(prefix + o.name);
      if (isChair) { chairParts(label, me); return; }
      let mat = (Array.isArray(me.material) ? me.material[0] : me.material) as Material;
      if (o.name === 'Court') { // the mirror shader becomes an ordinary lacquered-wood material
        const tex = (mat as unknown as { uniforms: { tCourt: { value: Texture } } }).uniforms.tCourt.value;
        mat = new MeshStandardMaterial({ name: 'Game_Court', map: tex, roughness: 0.22, metalness: 0 });
      } else { mat = mat.clone(); mat.name = mat.name || label; if ((me as InstancedMesh).isInstancedMesh) (mat as MeshStandardMaterial).vertexColors = true; }
      add(label, flatten(me), mat);
      return;
    }
    o.children.forEach((c) => visit(c, prefix));
  };
  for (const name of ['Court', 'Courtside', 'Court_Boards', 'Suite_Chairs', 'Suite_Decor']) { const o = scene.getObjectByName(name); if (o) visit(o, name); }
  scene.traverse((o) => { if (o.name === 'Basket') visit(o, 'Basket'); });
  // the moulded chair on its own, at the origin, for the seat instances
  const chair = new Mesh(createChairHD(2), new MeshStandardMaterial({ name: 'Game_Plastic', color: 0xffffff }));
  chair.updateMatrixWorld();
  add('ChairHD_Shell', flatten(chair, 'shell'), chair.material as Material); add('ChairHD_Frame', flatten(chair, 'frame'), steel);

  const buf = (await new GLTFExporter().parseAsync(out, { binary: true })) as ArrayBuffer;
  const bytes = new Uint8Array(buf); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
