// A moulded stadium chair for close views: curved backrest and seat shells, armrests and a steel stanchion.
// Same footprint and orientation as the simple chairs (faces +X, floor at y 0). Vertex colour marks shell (1) against frame (dark).
import { BufferGeometry, Float32BufferAttribute } from 'three';

const FRAME = 0.11;
type P = [number, number, number];

class Builder {
  pos: number[] = []; col: number[] = []; uv: number[] = []; idx: number[] = [];
  private v(p: P, c: number, u: number, w: number) { this.pos.push(...p); this.col.push(c, c, c); this.uv.push(u, w); return this.pos.length / 3 - 1; }

  /** A curved slab: `f(u, v)` gives the face, `t` the offset to the other face. Smooth across each face, with a closed rim. */
  shell(f: (u: number, v: number) => P, t: P, nu: number, nv: number, c = 1, closed = true) {
    const grid = (off: number, flip: boolean) => {
      const base = this.pos.length / 3;
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
        const p = f((i / nu) * 2 - 1, j / nv);
        this.v([p[0] + t[0] * off, p[1] + t[1] * off, p[2] + t[2] * off], c, p[2] * 2.4 + 0.5, (p[1] + p[0]) * 2.4);
      }
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        const a = base + j * (nu + 1) + i, b = a + 1, d = a + nu + 1, e = d + 1;
        if (flip) this.idx.push(a, d, b, b, d, e); else this.idx.push(a, b, d, b, e, d);
      }
      return base;
    };
    const A = grid(0, false);
    if (!closed) return; // a single sheet, for chairs seen from far away
    const B = grid(1, true);
    // rim: walk the border, joining the two faces
    const at = (i: number, j: number) => j * (nu + 1) + i;
    const border: number[] = [];
    for (let i = 0; i < nu; i++) border.push(at(i, 0));
    for (let j = 0; j < nv; j++) border.push(at(nu, j));
    for (let i = nu; i > 0; i--) border.push(at(i, nv));
    for (let j = nv; j > 0; j--) border.push(at(0, j));
    for (let k = 0; k < border.length; k++) {
      const a = border[k], b = border[(k + 1) % border.length];
      this.idx.push(A + a, B + a, A + b, A + b, B + a, B + b);
    }
  }

  /** A flat-shaded box from min to max. */
  box(min: P, max: P, c = FRAME) {
    const [x0, y0, z0] = min, [x1, y1, z1] = max;
    const faces: P[][] = [
      [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]],
      [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
    ];
    for (const q of faces) {
      const i = q.map((p) => this.v(p, c, (p[0] + p[2]) * 2.4, p[1] * 2.4));
      this.idx.push(i[0], i[1], i[2], i[0], i[2], i[3]);
    }
  }

  build() {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * The same chair at three levels of detail, so it stays curved at any distance:
 * 2 = close-up (fine curves), 1 = mid-distance, 0 = far (single-sheet shells and a bare frame, about as cheap as a box chair).
 */
export function createChairHD(detail: 0 | 1 | 2 = 1): BufferGeometry {
  const b = new Builder();
  const [nu, nv] = ([[4, 3], [6, 5], [10, 8]] as const)[detail], closed = detail > 0;
  // Backrest: reclined, wrapped a little around the sitter, with rounded top corners and a slight lumbar curve.
  b.shell((u, v) => {
    const top = ss(0.72, 1, v);
    return [
      -0.3 - 0.075 * v + 0.05 * u * u + 0.014 * Math.sin(Math.PI * v),
      0.37 + 0.61 * v - 0.075 * top * u * u * u * u,
      u * 0.232 * (1 - 0.1 * top * top),
    ];
  }, [-0.03, 0, 0], nu, nv, 1, closed);
  // Seat: dished side to side, rolling off at the front edge.
  b.shell((u, v) => {
    const front = ss(0.6, 1, v);
    return [-0.3 + 0.5 * v - 0.012 * front, 0.44 + 0.022 * u * u - 0.05 * front * front, -u * 0.228 * (1 - 0.06 * front)];
  }, [0, -0.045, 0], nu, nv, 1, closed);
  for (const s of [-1, 1]) {
    const z0 = s * 0.27, z1 = s * 0.235, lo = Math.min(z0, z1), hi = Math.max(z0, z1);
    if (detail > 0) b.box([-0.33, 0.6, lo], [0.1, 0.635, hi], 0.62); // armrest: plastic, a shade darker than the shell
    b.box([-0.31, 0.03, lo + 0.004], [-0.2, 0.6, hi - 0.004]);  // stanchion
    if (detail === 0) continue;
    b.box([-0.36, 0, lo - 0.0], [0.06, 0.03, hi]);            // foot
    b.box([-0.2, 0.34, lo + 0.004], [0.08, 0.385, hi - 0.004]); // seat bracket
  }
  if (detail > 0) b.box([-0.15, 0.34, -0.236], [-0.07, 0.392, 0.236]); // beam under the seat
  return b.build();
}
