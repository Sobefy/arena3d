// Dresses the suite level between the two bowls: the placeholder blocks become lounge chairs facing the floor,
// the walls turn to warm timber with a soft glow, and the glass fronts clear up so the rooms read from the stands.
import {
  AdditiveBlending, CanvasTexture, Color, CylinderGeometry, Euler, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  Object3D, PlaneGeometry, Quaternion, SRGBColorSpace, SphereGeometry, Vector3, type BufferGeometry, type Material,
} from 'three';
import { createChairHD } from './chairHD';

const LEATHER = 0xe9dcc6; // cream leather, warm against the timber

/** A soft round gradient as a texture: black for contact shadows, warm for pools of light. */
function blob(rgb: string, strength: number): CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!, gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, `rgba(${rgb},${strength})`); gr.addColorStop(0.55, `rgba(${rgb},${strength * 0.45})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
}
function rugTexture(): CanvasTexture {
  const c = document.createElement('canvas'); c.width = 512; c.height = 320;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3B146B'; g.fillRect(0, 0, 512, 320);
  g.strokeStyle = '#FFB458'; g.lineWidth = 6; g.strokeRect(16, 16, 480, 288); g.strokeStyle = '#C9349B'; g.lineWidth = 3; g.strokeRect(30, 30, 452, 260);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 9; x++) {
    const cx = 60 + x * 49, cy = 66 + y * 47; g.fillStyle = (x + y) % 2 ? '#7B208F' : '#F36A78';
    g.beginPath(); g.moveTo(cx, cy - 16); g.lineTo(cx + 18, cy); g.lineTo(cx, cy + 16); g.lineTo(cx - 18, cy); g.fill();
  }
  for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},0.05)`; g.fillRect(Math.random() * 512, Math.random() * 320, 2, 1); } // pile
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 8; return t;
}

export function dressSuites(root: Object3D, scene: Object3D) {
  const seatsAt: { p: Vector3; yaw: number }[] = [];
  const bars: { p: Vector3; top: number; yaw: number }[] = [];
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as MeshStandardMaterial;
    if (mat.name === 'SuiteGlass') { mat.opacity = 0.1; mat.roughness = 0.05; mat.envMapIntensity = 2; }
    if (mesh.name === 'Suite_Floor') { const m = mat.clone(); m.name = 'SuiteCarpet'; m.color.set(0x2b2f63); m.roughness = 0.95; mesh.material = m; } // deep blue carpet
    if (mesh.name !== 'Suite_Wood_Furniture' || !mesh.geometry.index) return;

    // The furniture is one mesh of loose boxes. Group its vertices into boxes, then swap each stool-sized one for a chair.
    const g = mesh.geometry, pos = g.getAttribute('position'), n = pos.count, idx = g.index!.array;
    const parent = new Int32Array(n).map((_, i) => i);
    const find = (i: number) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
    const first = new Map<string, number>(), weld = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
      if (!first.has(k)) first.set(k, i);
      weld[i] = first.get(k)!;
    }
    for (let i = 0; i < idx.length; i += 3) { const a = find(weld[idx[i]]); parent[find(weld[idx[i + 1]])] = a; parent[find(weld[idx[i + 2]])] = a; }
    const boxes = new Map<number, { min: Vector3; max: Vector3 }>(), v = new Vector3();
    for (let i = 0; i < n; i++) {
      const r = find(weld[i]);
      let b = boxes.get(r);
      if (!b) boxes.set(r, b = { min: new Vector3(Infinity, Infinity, Infinity), max: new Vector3(-Infinity, -Infinity, -Infinity) });
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); b.min.min(v); b.max.max(v);
    }
    const stools = new Set<number>();
    for (const [r, b] of boxes) {
      if (b.max.x - b.min.x > 1 || b.max.z - b.min.z > 1 || b.max.y - b.min.y > 1) {
        const c = new Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2);
        if (Math.abs(c.x) < 70) bars.push({ p: c, top: b.max.y, yaw: Math.atan2(c.z / (41 * 41), -c.x / (53 * 53)) });
        continue;
      }
      stools.add(r);
      const p = new Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2);
      seatsAt.push({ p, yaw: Math.atan2(p.z / (41 * 41), -p.x / (53 * 53)) }); // facing in, square to the bowl's curve
    }
    const kept: number[] = [];
    for (let i = 0; i < idx.length; i += 3) if (!stools.has(find(weld[idx[i]]))) kept.push(idx[i], idx[i + 1], idx[i + 2]);
    g.setIndex(kept);
    mat.color.set(0x6a4a36); mat.roughness = 0.55; // the counters that remain: darker timber
  });
  if (!seatsAt.length) return;

  const chairs = new InstancedMesh(createChairHD(1), new MeshStandardMaterial({ color: LEATHER, roughness: 0.5, vertexColors: true, envMapIntensity: 1.4 }), seatsAt.length);
  chairs.name = 'Suite_Chairs';
  const m = new Matrix4(), q = new Quaternion(), up = new Vector3(0, 1, 0), s = new Vector3(1.12, 1.05, 1.12), c = new Color();
  seatsAt.forEach(({ p, yaw }, i) => {
    chairs.setMatrixAt(i, m.compose(p, q.setFromAxisAngle(up, yaw), s));
    chairs.setColorAt(i, c.setScalar(0.92 + 0.16 * ((i * 0.618) % 1))); // slight variation chair to chair
  });
  chairs.computeBoundingSphere(); chairs.castShadow = true; chairs.receiveShadow = true;
  scene.add(chairs);

  // ---- what makes the rooms feel lived in: shade under things, pools of light, a rug, lamps over the bar, bottles and a plant ----
  const group = new Object3D(); group.name = 'Suite_Decor'; scene.add(group);
  const e = new Euler(), pos = new Vector3(), scl = new Vector3();
  const inst = (geo: BufferGeometry, material: Material, items: { p: Vector3; q?: Quaternion; s?: Vector3; c?: Color }[], name: string) => {
    const im = new InstancedMesh(geo, material, items.length); im.name = name;
    items.forEach((it, k) => { im.setMatrixAt(k, m.compose(it.p, it.q ?? q.identity(), it.s ?? scl.set(1, 1, 1))); if (it.c) im.setColorAt(k, it.c); });
    im.computeBoundingSphere(); group.add(im); return im;
  };
  const lying = (yaw: number) => new Quaternion().setFromEuler(e.set(-Math.PI / 2, yaw, 0, 'YXZ'));
  const shadowMat = new MeshBasicMaterial({ map: blob('0,0,0', 0.62), transparent: true, depthWrite: false, toneMapped: false });
  const glowMat = new MeshBasicMaterial({ map: blob('255,196,130', 0.5), transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
  const plane = new PlaneGeometry(1, 1);
  // contact shadows: under every chair, and a longer one hugging each bar
  inst(plane, shadowMat, seatsAt.map(({ p, yaw }) => ({ p: pos.set(p.x, p.y + 0.015, p.z).clone(), q: lying(yaw), s: new Vector3(1.25, 1.15, 1) })), 'Suite_ChairShadows');
  inst(plane, shadowMat, bars.map(({ p, yaw }) => ({ p: new Vector3(p.x, p.y + 0.02, p.z), q: lying(yaw + Math.PI / 2), s: new Vector3(4.6, 2.0, 1) })), 'Suite_BarShadows');
  // towards the bowl from each bar: a rug with a pool of lamp light on it
  const inward = (yaw: number, d: number) => new Vector3(Math.cos(yaw) * d, 0, -Math.sin(yaw) * d);
  inst(plane, new MeshStandardMaterial({ map: rugTexture(), roughness: 1 }), bars.map(({ p, yaw }) => ({ p: new Vector3(p.x, p.y + 0.03, p.z).add(inward(yaw, 3.1)), q: lying(yaw + Math.PI / 2), s: new Vector3(4.2, 2.6, 1) })), 'Suite_Rugs');
  inst(plane, glowMat, bars.map(({ p, yaw }) => ({ p: new Vector3(p.x, p.y + 0.045, p.z).add(inward(yaw, 2.6)), q: lying(yaw), s: new Vector3(5.2, 5.2, 1) })), 'Suite_FloorGlow');
  inst(plane, glowMat, bars.map(({ p, top, yaw }) => ({ p: new Vector3(p.x, top + 0.012, p.z), q: lying(yaw + Math.PI / 2), s: new Vector3(3.4, 1.0, 1) })), 'Suite_BarGlow');
  // three pendant lamps over each bar
  const along = (yaw: number, d: number) => new Vector3(Math.sin(yaw) * d, 0, Math.cos(yaw) * d);
  const lamps = bars.flatMap(({ p, top, yaw }) => [-1, 0, 1].map((k) => new Vector3(p.x, top + 1.05, p.z).add(along(yaw, k * 0.95))));
  inst(new SphereGeometry(0.13, 16, 12), new MeshStandardMaterial({ color: 0xffe2b8, emissive: 0xffc98a, emissiveIntensity: 1.6, roughness: 0.3 }), lamps.map((p) => ({ p })), 'Suite_Lamps');
  inst(new CylinderGeometry(0.19, 0.24, 0.13, 20, 1, true), new MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.4, metalness: 0.6, side: 2 }), lamps.map((p) => ({ p: p.clone().setY(p.y + 0.09) })), 'Suite_LampShades');
  inst(new CylinderGeometry(0.008, 0.008, 1, 5), new MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }), lamps.map((p) => ({ p: p.clone().setY(p.y + 0.75), s: new Vector3(1, 1.25, 1) })), 'Suite_LampCords');
  // bottles and glasses on the bar
  const tints = [0x2f6b3a, 0x7a3b12, 0xc9349b, 0xffb458, 0x1f5fe0, 0xe9e4da];
  const bottles = bars.flatMap(({ p, top, yaw }, b) => [-1.3, -1.05, -0.8, 0.5, 0.75, 1.1, 1.3].map((d, k) => ({
    p: new Vector3(p.x, top + (k < 3 ? 0.15 : 0.07), p.z).add(along(yaw, d)).add(inward(yaw, k % 2 ? 0.08 : -0.08)),
    s: new Vector3(1, k < 3 ? 1 : 0.45, 1), c: new Color(tints[(b + k) % tints.length]),
  })));
  inst(new CylinderGeometry(0.028, 0.04, 0.3, 10), new MeshStandardMaterial({ roughness: 0.12, metalness: 0.1, envMapIntensity: 2.5 }), bottles, 'Suite_Bottles');
  // a potted plant at one end of each bar
  const plants = bars.map(({ p, yaw }) => new Vector3(p.x, p.y, p.z).add(along(yaw, 2.2)));
  inst(new CylinderGeometry(0.24, 0.17, 0.5, 14), new MeshStandardMaterial({ color: 0xd9cfc0, roughness: 0.6 }), plants.map((v) => ({ p: v.clone().setY(v.y + 0.25) })), 'Suite_Pots');
  const leaves = plants.flatMap((v, k) => [[0, 0.95, 0, 0.42], [0.2, 0.75, 0.1, 0.3], [-0.18, 0.8, -0.12, 0.32], [0.05, 1.25, -0.08, 0.3], [-0.1, 1.1, 0.16, 0.26]].map(([dx, dy, dz, r], j) => ({
    p: new Vector3(v.x + dx, v.y + dy, v.z + dz), s: new Vector3(r, r * 1.25, r), c: new Color().setHSL(0.36 + ((k + j) % 3) * 0.015, 0.5, 0.2 + (j % 3) * 0.035),
  })));
  inst(new IcosahedronGeometry(1, 1), new MeshStandardMaterial({ roughness: 0.8, flatShading: true }), leaves, 'Suite_Plants');
}
