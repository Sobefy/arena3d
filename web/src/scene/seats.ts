// Every seat as GPU instances: one InstancedMesh per section (each section uses a single chair model).
// Instances are laid out row by row, so instanceId = rowStart[row] + seatIndex. Colours carry the seat state.
import {
  Box3, BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial,
  Quaternion, Ray, Raycaster, RepeatWrapping, Vector2, Vector3, type Intersection, type Object3D, type Texture,
} from 'three';
import type { ChairName, SeatRef, SeatsFile, SectionData } from '../data/types';
import { TIER_COLORS } from '../data/tiers';
import { createChairHD } from './chairHD';

export const SEAT_LAYER = 1; // seats are left out of the water's reflection pass

const SOLD = new Color('#10173a'); // sold seats keep a hint of their tier, mixed into this slate
const CLOSED = new Color(TIER_COLORS.X);
const CURRENT = new Color().setRGB(1.3, 1.2, 0.95);  // cream, as in the reference // the seat in the card: pale cream against its neighbours
const IN_CART = new Color().setRGB(1.25, 0.6, 0.12);  // orange, the opposite of the blue seats
const DIM = 0.16;
const NEAR = 15, MID = 46; // metres: finest chair, mid chair, then the far chair

interface SectionSeats {
  data: SectionData;
  mesh: InstancedMesh;
  low: BufferGeometry;
  rowStart: number[];
  rowOf: Uint16Array;
  seatOf: Uint16Array;
  sold: Uint8Array;
  box: Box3;
  tier: Color;
  lit: number; // 1 fully lit, 0 dimmed to grey (the overview, until the section is pointed at)
}

/** Moulded plastic: fine grain from the texture set, a soft sheen from the room light. Vertex colour darkens the frame parts. */
function seatMaterial(normal: Texture, rough: Texture) {
  for (const t of [normal, rough]) { t.wrapS = t.wrapT = RepeatWrapping; t.repeat.set(2, 2); }
  const m = new MeshStandardMaterial({
    color: 0xffffff, roughness: 0.46, metalness: 0, normalMap: normal, normalScale: new Vector2(0.22, 0.22), roughnessMap: rough,
    vertexColors: true, envMapIntensity: 2.4,
  });
  m.onBeforeCompile = (shader) => {
    // vSeatY: height within the chair (0 at the floor). vJit: a stable random per seat.
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vSeatY;\nvarying float vJit;\nvarying float vFrame;')
      // The chair's own vertex colour marks its frame parts (dark) against the shell (white).
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeatY = position.y;\nvJit = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453);\nvFrame = 1.0 - step(0.5, color.r);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSeatY;\nvarying float vJit;\nvarying float vFrame;')
      // Legs, stanchions and brackets are brushed steel: metal, fairly sharp reflections, its own colour whatever the seat's state.
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, vFrame);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.78, vFrame);')
      // Below the cushion the chair is a dark frame; the upholstery varies a little seat to seat and lightens up the backrest.
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= (0.92 + 0.16 * vJit) * (0.88 + 0.2 * smoothstep(0.4, 0.98, vSeatY));
        diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(0.38, 0.6, vSeatY)); // shade gathers low down, where seat meets back and frame
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.88, 0.92), vFrame);`)
      // Instance colours arrive in the fragment shader as vColor under USE_COLOR.
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n totalEmissiveRadiance += vColor.rgb * 0.04 * (1.0 - vFrame);\n#endif');
  };
  return m;
}

export class SeatLayer {
  readonly group: Object3D[] = [];
  readonly sections: SectionSeats[] = [];
  private material: MeshStandardMaterial;
  private hover: SeatRef | null = null;
  private hoverSection = -1;
  private current: SeatRef | null = null;
  private cart = new Set<string>();     // `${section}:${row}:${seat}` indexes
  private dimmed = new Set<number>();   // sections faded by the tier or price filter
  private focusRow: { section: number; row: number } | null = null;
  private tmp = new Color();

  private lod = [createChairHD(0), createChairHD(1), createChairHD(2)];
  private farMaterial!: MeshStandardMaterial; // same plastic, drawn two-sided: the far chair's shells are single sheets

  constructor(file: SeatsFile, chairs: Record<ChairName, BufferGeometry>, normal: Texture, rough: Texture) {
    this.material = seatMaterial(normal, rough);
    this.farMaterial = seatMaterial(normal, rough); this.farMaterial.side = DoubleSide;
    // The simple chairs: everything below the cushion is frame.
    for (const g of Object.values(chairs)) {
      const p = g.getAttribute('position'), c = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) c.fill(p.getY(i) < 0.37 ? 0.12 : 1, i * 3, i * 3 + 3);
      g.setAttribute('color', new BufferAttribute(c, 3));
    }
    const m = new Matrix4(), q = new Quaternion(), up = new Vector3(0, 1, 0), pos = new Vector3(), one = new Vector3(1, 1, 1);
    file.sections.forEach((sec) => {
      const count = sec.rows.reduce((n, r) => n + r.seats.length, 0);
      const mesh = new InstancedMesh(this.lod[0], this.farMaterial, count);
      mesh.name = `SEATS_${sec.id}`;
      mesh.layers.set(SEAT_LAYER);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(count * 3), 3);
      mesh.instanceColor.setUsage(DynamicDrawUsage);
      const rowOf = new Uint16Array(count), seatOf = new Uint16Array(count), rowStart: number[] = [];
      const box = new Box3();
      let i = 0;
      sec.rows.forEach((row, r) => {
        rowStart.push(i);
        row.seats.forEach(([, x, y, z, yaw], s) => {
          pos.set(x, y, z);
          m.compose(pos, q.setFromAxisAngle(up, yaw), one);
          mesh.setMatrixAt(i, m);
          rowOf[i] = r; seatOf[i] = s;
          box.expandByPoint(pos);
          i++;
        });
      });
      box.min.y -= 0.1; box.max.y += 1.1; box.expandByScalar(0.45); // room for the chair itself
      mesh.computeBoundingSphere(); // per-section frustum culling
      this.group.push(mesh);
      const entry: SectionSeats = { data: sec, mesh, low: chairs[sec.chair], rowStart, rowOf, seatOf, sold: new Uint8Array(count), box, tier: new Color(TIER_COLORS[sec.tier]), lit: 1 };
      this.sections.push(entry);
    });
  }

  /** The section the pointer is on: the hovered section, or the section of the hovered seat. -1 for none. */
  focusSection() { return this.hoverSection >= 0 ? this.hoverSection : this.hover ? this.hover.section : -1; }

  /** Eases every section towards its light level: in the overview all are dimmed but the one under the pointer. Returns true while changing. */
  updateLight(dt: number, overview: boolean): boolean {
    let changing = false;
    this.sections.forEach((sec, s) => {
      const target = !overview || s === this.hoverSection ? 1 : 0;
      if (sec.lit === target) return;
      const next = sec.lit + (target - sec.lit) * Math.min(1, dt * (target > sec.lit ? 9 : 5));
      sec.lit = Math.abs(target - next) < 0.01 ? target : next;
      this.paintSection(s);
      changing = true;
    });
    return changing;
  }

  /** Swaps in the moulded chair for the sections near the camera. Returns true when any section changed. */
  setDetail(eye: Vector3): boolean {
    let changed = false;
    for (const sec of this.sections) {
      const d = sec.box.distanceToPoint(eye), g = this.lod[d < NEAR ? 2 : d < MID ? 1 : 0];
      if (sec.mesh.geometry !== g) { sec.mesh.geometry = g; sec.mesh.material = g === this.lod[0] ? this.farMaterial : this.material; changed = true; }
    }
    return changed;
  }

  /** Marks the seats in `soldKeys` (`${row}:${seat}`) as sold for section index `s`. */
  setSold(s: number, soldKeys: Set<string>) {
    const sec = this.sections[s];
    sec.sold.fill(0);
    for (let i = 0; i < sec.sold.length; i++) {
      const row = sec.data.rows[sec.rowOf[i]];
      if (soldKeys.has(`${row.label}:${row.seats[sec.seatOf[i]][0]}`)) sec.sold[i] = 1;
    }
    this.paintSection(s);
  }

  index(ref: SeatRef) { return this.sections[ref.section].rowStart[ref.row] + ref.seat; }
  refAt(section: number, instanceId: number): SeatRef {
    const sec = this.sections[section];
    return { section, row: sec.rowOf[instanceId], seat: sec.seatOf[instanceId] };
  }
  isSold(ref: SeatRef) { return this.sections[ref.section].sold[this.index(ref)] === 1; }
  isSelectable(section: number) { return this.sections[section].data.status !== 'closed'; }
  seatTuple(ref: SeatRef) { return this.sections[ref.section].data.rows[ref.row].seats[ref.seat]; }

  // ---- state setters (each repaints only what changed) ----
  setHover(ref: SeatRef | null) {
    const prev = this.hover; this.hover = ref;
    // only the seat under the pointer changes: nothing else on screen reacts to the mouse
    if (prev) this.paintSeat(prev);
    if (ref) this.paintSeat(ref);
  }
  setHoverSection(s: number) {
    if (s === this.hoverSection) return;
    const prev = this.hoverSection; this.hoverSection = s;
    if (prev >= 0) this.paintSection(prev);
    if (s >= 0) this.paintSection(s);
  }
  setCurrent(ref: SeatRef | null) {
    const prev = this.current; this.current = ref;
    if (prev) this.paintSeat(prev);
    if (ref) this.paintSeat(ref);
  }
  setCart(refs: SeatRef[]) {
    const old = [...this.cart];
    this.cart = new Set(refs.map((r) => `${r.section}:${r.row}:${r.seat}`));
    const touched = new Set([...old, ...this.cart]);
    for (const k of touched) { const [section, row, seat] = k.split(':').map(Number); this.paintSeat({ section, row, seat }); }
  }
  setDimmed(sections: Set<number>) {
    const changed = new Set([...this.dimmed, ...sections].filter((s) => this.dimmed.has(s) !== sections.has(s)));
    this.dimmed = sections;
    changed.forEach((s) => this.paintSection(s));
  }
  setFocusRow(fr: { section: number; row: number } | null) {
    const prev = this.focusRow; this.focusRow = fr;
    if (prev) this.paintSection(prev.section);
    if (fr && fr.section !== prev?.section) this.paintSection(fr.section);
  }

  private colorOf(s: number, i: number, out: Color): Color {
    this.stateColor(s, i, out);
    const lit = this.sections[s].lit;
    if (lit < 1) { // half-light: towards a cool grey of the same brightness, and darker
      const g = (out.r * 0.3 + out.g * 0.55 + out.b * 0.15) * 0.8, k = (1 - lit) * 0.72; // keeps a hint of its own colour
      out.r += (g * 0.92 - out.r) * k; out.g += (g * 0.96 - out.g) * k; out.b += (g * 1.2 - out.b) * k;
    }
    return out;
  }
  private stateColor(s: number, i: number, out: Color): Color {
    const sec = this.sections[s];
    if (sec.data.status === 'closed') return out.copy(CLOSED);
    const r = sec.rowOf[i], seat = sec.seatOf[i];
    const key = `${s}:${r}:${seat}`;
    if (this.current && this.current.section === s && this.current.row === r && this.current.seat === seat) return out.copy(CURRENT);
    if (this.cart.has(key)) return out.copy(IN_CART);
    if (sec.sold[i]) out.copy(sec.tier).lerp(SOLD, 0.82).multiplyScalar(0.6);
    else out.copy(sec.tier);
    if (this.dimmed.has(s)) return out.multiplyScalar(DIM);
    const hovered = this.hover && this.hover.section === s && this.hover.row === r && this.hover.seat === seat;
    if (hovered) return sec.sold[i] ? out.multiplyScalar(1.6) : out.multiplyScalar(1.9);
    if (this.hoverSection === s && !sec.sold[i]) out.multiplyScalar(1.35);
    if (this.focusRow && this.focusRow.section === s) out.multiplyScalar(this.focusRow.row === r ? 1.25 : 0.78);
    return out;
  }
  private paintSeat(ref: SeatRef) {
    const sec = this.sections[ref.section], i = this.index(ref);
    sec.mesh.setColorAt(i, this.colorOf(ref.section, i, this.tmp));
    sec.mesh.instanceColor!.needsUpdate = true;
  }
  private paintSection(s: number) {
    const sec = this.sections[s];
    for (let i = 0; i < sec.sold.length; i++) sec.mesh.setColorAt(i, this.colorOf(s, i, this.tmp));
    sec.mesh.instanceColor!.needsUpdate = true;
  }

  // ---- picking ----
  private raycaster = new Raycaster();
  private hits: Intersection[] = [];
  private boxHit = new Vector3();

  /** Nearest seat under the ray. Tests section bounds first and only raycasts instances in sections the ray enters. */
  pick(ray: Ray, maxDistance = Infinity): { ref: SeatRef; distance: number } | null {
    const candidates: { s: number; d: number }[] = [];
    this.sections.forEach((sec, s) => {
      if (sec.data.status === 'closed') return;
      const p = ray.intersectBox(sec.box, this.boxHit);
      if (p) { const d = p.distanceTo(ray.origin); if (d < maxDistance) candidates.push({ s, d }); }
    });
    candidates.sort((a, b) => a.d - b.d);
    this.raycaster.ray.copy(ray);
    this.raycaster.layers.set(SEAT_LAYER);
    let best: { ref: SeatRef; distance: number } | null = null;
    for (const c of candidates) {
      if (best && c.d > best.distance) break; // later boxes start beyond the best hit
      this.hits.length = 0;
      this.sections[c.s].mesh.raycast(this.raycaster, this.hits);
      for (const h of this.hits) {
        if (h.instanceId != null && (!best || h.distance < best.distance)) best = { ref: this.refAt(c.s, h.instanceId), distance: h.distance };
      }
    }
    return best;
  }
}
