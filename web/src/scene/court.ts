// The basketball court: painted hardwood drawn to a canvas, on a polished floor that mirrors the stands,
// plus the two baskets. The long axis runs along X, centre court at the origin.
import {
  Box3, BoxGeometry, type BufferGeometry, CanvasTexture, CapsuleGeometry, CatmullRomCurve3, Color, CylinderGeometry, DoubleSide, ExtrudeGeometry, Group, InstancedMesh, Matrix4,
  MeshBasicMaterial, PlaneGeometry, Quaternion, RepeatWrapping, TubeGeometry, LinearMipmapLinearFilter, Mesh, MeshStandardMaterial, Shape, ShapeGeometry,
  SRGBColorSpace, Vector3, type ShaderMaterial, TorusGeometry, type Scene, type WebGLRenderer,
} from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createChairHD } from './chairHD';

const L = 28.65, W = 15.24;       // playing court, metres
const FLOOR_L = 68, FLOOR_W = 44; // the whole event floor is hardwood
const K = 2;                      // the bowl was built around a floor about twice a real court, so the court is drawn at twice size to fill it
const PX = 40;                    // texture pixels per metre

function drawCourt(): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = Math.round(FLOOR_L * PX); c.height = Math.round(FLOOR_W * PX);
  const g = c.getContext('2d')!;
  // court metres (origin at centre court) to canvas pixels
  const X = (m: number) => (m * K + FLOOR_L / 2) * PX, Y = (m: number) => (m * K + FLOOR_W / 2) * PX, S = (m: number) => m * K * PX;
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // Maple boards: strips along the court, each its own tone, cut into random lengths, with a little streaking inside each board.
  const strip = Math.round(S(0.1));
  for (let y = 0; y < c.height; y += strip) {
    let x = -rnd() * S(2);
    while (x < c.width) {
      const len = S(0.9 + rnd() * 1.6), t = rnd(), warm = rnd();
      g.fillStyle = `rgb(${188 + t * 44 | 0},${150 + t * 42 - warm * 8 | 0},${108 + t * 40 - warm * 16 | 0})`;
      g.fillRect(x, y, len, strip);
      for (let k = 0; k < 3; k++) { g.fillStyle = `rgba(${rnd() > 0.5 ? '255,240,215' : '120,80,45'},${0.05 + rnd() * 0.06})`; g.fillRect(x, y + rnd() * strip, len, 1); }
      g.fillStyle = 'rgba(60,35,15,0.35)'; g.fillRect(x + len - 1, y, 1, strip);
      x += len;
    }
    g.fillStyle = 'rgba(60,35,15,0.2)'; g.fillRect(0, y, c.width, 1);
  }
  // Painted areas keep a little of the grain showing through.
  const paint = (hex: string, a = 0.9) => { g.globalAlpha = a; g.fillStyle = hex; };
  paint('#0c1238', 0.94); // apron, dark blue
  g.fillRect(0, 0, c.width, Y(-W / 2)); g.fillRect(0, Y(W / 2), c.width, c.height);
  g.fillRect(0, 0, X(-L / 2), c.height); g.fillRect(X(L / 2), 0, c.width, c.height);
  const KEY_W = 4.88, KEY_L = 5.79, HOOP = 1.575, R3 = 7.24, CORNER = W / 2 - 0.91;
  for (const s of [-1, 1]) {
    paint('#C9349B', 0.88);
    const x0 = s * L / 2, x1 = s * (L / 2 - KEY_L);
    g.fillRect(Math.min(X(x0), X(x1)), Y(-KEY_W / 2), S(KEY_L), S(KEY_W));
  }
  paint('#3B146B', 0.92); g.beginPath(); g.arc(X(0), Y(0), S(1.83), 0, Math.PI * 2); g.fill();
  // a violet band just outside the lines, as a border to the playing court
  g.globalAlpha = 0.95; g.strokeStyle = '#3B146B'; g.lineWidth = S(0.9); g.strokeRect(X(-L / 2 - 0.45), Y(-W / 2 - 0.45), S(L + 0.9), S(W + 0.9));
  g.globalAlpha = 1;

  g.strokeStyle = '#f6f2ea'; g.lineWidth = S(0.05); g.lineCap = 'butt';
  g.strokeRect(X(-L / 2), Y(-W / 2), S(L), S(W));
  g.beginPath(); g.moveTo(X(0), Y(-W / 2)); g.lineTo(X(0), Y(W / 2)); g.stroke();
  g.beginPath(); g.arc(X(0), Y(0), S(1.83), 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(X(0), Y(0), S(0.61), 0, Math.PI * 2); g.stroke();
  for (const s of [-1, 1]) {
    const base = s * L / 2, ft = s * (L / 2 - KEY_L), hoop = s * (L / 2 - HOOP);
    g.strokeRect(Math.min(X(base), X(ft)), Y(-KEY_W / 2), S(KEY_L), S(KEY_W));
    g.beginPath(); g.arc(X(ft), Y(0), S(1.83), 0, Math.PI * 2); g.stroke();
    // three-point line: straight in the corners, then the arc around the basket
    const a = Math.asin(CORNER / R3), xArc = hoop - s * Math.cos(a) * R3;
    g.beginPath();
    g.moveTo(X(base), Y(-CORNER)); g.lineTo(X(xArc), Y(-CORNER));
    if (s < 0) g.arc(X(hoop), Y(0), S(R3), -a, a); else g.arc(X(hoop), Y(0), S(R3), Math.PI + a, Math.PI - a, true);
    g.lineTo(X(base), Y(CORNER)); g.stroke();
    g.beginPath(); // restricted area
    if (s < 0) g.arc(X(hoop), Y(0), S(1.22), -Math.PI / 2, Math.PI / 2); else g.arc(X(hoop), Y(0), S(1.22), Math.PI / 2, -Math.PI / 2);
    g.stroke();
  }
  // Lane blocks along each key, hash marks on the sidelines, and the team bench areas.
  g.lineWidth = S(0.05);
  for (const s of [-1, 1]) {
    for (const d of [2.13, 3.0, 3.9, 4.8]) for (const z of [-1, 1]) {
      const x = s * (L / 2 - d); g.beginPath(); g.moveTo(X(x), Y(z * KEY_W / 2)); g.lineTo(X(x), Y(z * (KEY_W / 2 + 0.2))); g.stroke();
    }
    for (const z of [-1, 1]) { const x = s * (L / 2 - 8.53); g.beginPath(); g.moveTo(X(x), Y(z * W / 2)); g.lineTo(X(x), Y(z * (W / 2 - 0.9))); g.stroke(); }
    g.setLineDash([S(0.35), S(0.35)]);
    g.beginPath(); g.arc(X(s * (L / 2 - KEY_L)), Y(0), S(1.83), s < 0 ? Math.PI / 2 : -Math.PI / 2, s < 0 ? Math.PI * 1.5 : Math.PI / 2); g.stroke();
    g.setLineDash([]);
  }
  // A soft sheen down the middle of the boards, where the floodlights land.
  const sheen = g.createRadialGradient(X(0), Y(0), S(1), X(0), Y(0), S(15));
  sheen.addColorStop(0, 'rgba(255,236,200,0.16)'); sheen.addColorStop(1, 'rgba(255,236,200,0)');
  g.fillStyle = sheen; g.fillRect(X(-L / 2), Y(-W / 2), S(L), S(W));

  // Wordmarks: centre court and along both sidelines of the apron.
  g.fillStyle = '#FFB458'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${S(0.62)}px "Space Grotesk", system-ui, sans-serif`;
  g.fillText('BAYFRONT', X(0), Y(0));
  g.font = `600 ${S(0.75)}px "Space Grotesk", system-ui, sans-serif`;
  g.fillStyle = '#F36A78'; g.globalAlpha = 0.9;
  g.fillText('B A Y F R O N T   A R E N A', X(0), Y(W / 2 + 1.5));
  g.save(); g.translate(X(0), Y(-W / 2 - 1.5)); g.rotate(Math.PI); g.fillText('B A Y F R O N T   A R E N A', 0, 0); g.restore();
  g.globalAlpha = 1;
  return c;
}

// The floor shows the painted court with the mirrored arena laid over it, stronger at grazing angles like a lacquered board.
const CourtShader = {
  name: 'CourtShader',
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, tCourt: { value: null }, uGloss: { value: 0.22 } },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix; varying vec4 vProj; varying vec2 vUv; varying vec3 vWorld;
    void main() {
      vUv = uv; vProj = textureMatrix * vec4(position, 1.0);
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform sampler2D tCourt; uniform float uGloss;
    varying vec4 vProj; varying vec2 vUv; varying vec3 vWorld;
    void main() {
      vec3 court = texture2D(tCourt, vUv).rgb;
      vec2 p = vProj.xy / vProj.w;
      // a small blur, wider up-and-down, so the mirror image reads as polish, not glass
      vec3 r = vec3(0.0);
      r += texture2D(tDiffuse, p).rgb * 0.28;
      r += texture2D(tDiffuse, p + vec2(0.0, 0.006)).rgb * 0.16 + texture2D(tDiffuse, p - vec2(0.0, 0.006)).rgb * 0.16;
      r += texture2D(tDiffuse, p + vec2(0.0, 0.013)).rgb * 0.1 + texture2D(tDiffuse, p - vec2(0.0, 0.013)).rgb * 0.1;
      r += texture2D(tDiffuse, p + vec2(0.004, 0.0)).rgb * 0.1 + texture2D(tDiffuse, p - vec2(0.004, 0.0)).rgb * 0.1;
      vec3 v = normalize(cameraPosition - vWorld);
      float fres = pow(1.0 - clamp(v.y, 0.0, 1.0), 3.0);
      // the floodlights glint off the lacquer: tight hot spots that slide across the boards as you move
      vec3 rv = reflect(-v, vec3(0.0, 1.0, 0.0));
      float spec = 0.0;
      spec += pow(max(dot(rv, normalize(vec3(-26.0, 28.0, 0.0) - vWorld)), 0.0), 260.0);
      spec += pow(max(dot(rv, normalize(vec3(26.0, 28.0, 0.0) - vWorld)), 0.0), 260.0);
      spec += pow(max(dot(rv, normalize(vec3(0.0, 28.0, -24.0) - vWorld)), 0.0), 260.0);
      spec += pow(max(dot(rv, normalize(vec3(0.0, 28.0, 24.0) - vWorld)), 0.0), 260.0);
      float board = 0.55 + 0.9 * dot(court, vec3(0.33));   // paler boards catch more
      gl_FragColor = vec4(court * 0.92 + r * (uGloss + 0.5 * fres) + vec3(1.0, 0.95, 0.86) * spec * board * 1.6, 1.0);
    }`,
};

/** The net as a picture: a diamond lattice with clear gaps, wrapped round a tapered tube. */
function netTexture(): CanvasTexture {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d')!; g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.lineCap = 'round';
  for (let i = -4; i < 16; i++) { g.beginPath(); g.moveTo(i * 21.33, 0); g.lineTo(i * 21.33 + 64, 128); g.stroke(); g.beginPath(); g.moveTo(i * 21.33 + 64, 0); g.lineTo(i * 21.33, 128); g.stroke(); }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
}
function clockTexture(): CanvasTexture {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d')!; g.fillStyle = '#05060f'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#FF9B55'; g.font = '700 92px "JetBrains Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('24', 128, 70);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
}

/** One basket unit, modelled on an arena stanchion: a padded body that sweeps up and forward in one curve to carry the board. */
function basket(side: number): Group {
  const g = new Group(); g.name = 'Basket';
  const pad = new MeshStandardMaterial({ color: 0x7b208f, roughness: 0.55 });
  const padDark = new MeshStandardMaterial({ color: 0x3b146b, roughness: 0.6 });
  const steel = new MeshStandardMaterial({ color: 0x1a1c26, roughness: 0.35, metalness: 0.85 });
  const glass = new MeshStandardMaterial({ color: 0xe6f3f8, roughness: 0.04, transparent: true, opacity: 0.22, envMapIntensity: 2.5, depthWrite: false });
  const white = new MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.5 });
  const orange = new MeshStandardMaterial({ color: 0xff7a2e, roughness: 0.35, metalness: 0.4 });
  const put = <T extends Mesh>(o: T, x: number, y: number, z = 0) => { o.position.set(x, y, z); g.add(o); return o; };
  // x is measured from the baseline, positive towards centre court.

  // Base: a padded wedge housing, rounded on every edge.
  const wedge = new Shape();
  wedge.moveTo(-3.4, 0.06); wedge.lineTo(-0.95, 0.06); wedge.quadraticCurveTo(-0.8, 0.08, -0.84, 0.3);
  wedge.bezierCurveTo(-1.0, 1.0, -1.25, 1.45, -1.7, 1.5); wedge.lineTo(-2.25, 1.5);
  wedge.bezierCurveTo(-2.7, 1.45, -3.3, 0.95, -3.48, 0.3); wedge.quadraticCurveTo(-3.52, 0.08, -3.4, 0.06);
  const wedgeGeo = new ExtrudeGeometry(wedge, { depth: 0.82, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 5, curveSegments: 18 });
  wedgeGeo.translate(0, 0, -0.41);
  put(new Mesh(wedgeGeo, pad), 0, 0);
  const frontPad = new Shape();
  frontPad.moveTo(-0.86, 0.12); frontPad.bezierCurveTo(-0.95, 0.9, -1.15, 1.35, -1.55, 1.52); frontPad.lineTo(-1.4, 1.64);
  frontPad.bezierCurveTo(-0.95, 1.45, -0.74, 0.95, -0.66, 0.12); frontPad.lineTo(-0.86, 0.12);
  const frontGeo = new ExtrudeGeometry(frontPad, { depth: 0.9, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 4, curveSegments: 14 });
  frontGeo.translate(0, 0, -0.45);
  put(new Mesh(frontGeo, padDark), 0, 0);

  // Arm: an open truss of steel tube, two side frames tied together, rising from the base to the back of the board.
  const tubes: BufferGeometry[] = [];
  const UP = new Vector3(0, 1, 0), q = new Quaternion();
  const tube = (a: Vector3, b: Vector3, r = 0.032) => {
    const d = b.clone().sub(a), len = d.length(), geo = new CylinderGeometry(r, r, len, 8, 1, false);
    geo.applyQuaternion(q.setFromUnitVectors(UP, d.normalize())); geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    tubes.push(geo);
  };
  const N = 7, hw = 0.3;
  const topAt = (t: number) => new Vector3(-2.2 + 3.32 * t, 1.55 + 2.25 * Math.sin(t * Math.PI / 2) ** 0.9, 0);   // upper chord, arching over
  const botAt = (t: number) => new Vector3(-1.45 + 2.57 * t, 1.35 + 1.72 * t ** 1.25, 0);                           // lower chord
  for (const z of [-hw, hw]) for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N, a = topAt(t0).setZ(z), b = topAt(t1).setZ(z), c2 = botAt(t0).setZ(z), d = botAt(t1).setZ(z);
    tube(a, b, 0.04); tube(c2, d, 0.04); tube(b, d, 0.026); tube(i % 2 ? a : c2, i % 2 ? d : b, 0.024);
  }
  for (let i = 0; i <= N; i++) { const t = i / N; tube(topAt(t).setZ(-hw), topAt(t).setZ(hw), 0.026); tube(botAt(t).setZ(-hw), botAt(t).setZ(hw), 0.026); if (i < N) tube(topAt(t).setZ(-hw), topAt((i + 1) / N).setZ(hw), 0.02); }
  for (const z of [-hw, hw]) { tube(new Vector3(-2.2, 1.5, z), topAt(0).setZ(z), 0.05); tube(new Vector3(-1.45, 1.5, z), botAt(0).setZ(z), 0.05); }
  g.add(new Mesh(mergeGeometries(tubes), steel));
  put(new Mesh(new RoundedBoxGeometry(0.12, 0.72, 0.74, 3, 0.03), steel), 1.14, 3.46); // mounting plate behind the glass

  // Board: glass with rounded corners in a slim frame, padded along the bottom, target square painted on.
  const BX = 1.22, BY = 3.5, BW = 1.83, BH = 1.07;
  put(new Mesh(new RoundedBoxGeometry(0.03, BH, BW, 3, 0.012), glass), BX, BY);
  const rr = (w: number, h: number, r: number) => { const s = new Shape(); s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.absarc(w / 2 - r, -h / 2 + r, r, -Math.PI / 2, 0, false); s.lineTo(w / 2, h / 2 - r); s.absarc(w / 2 - r, h / 2 - r, r, 0, Math.PI / 2, false); s.lineTo(-w / 2 + r, h / 2); s.absarc(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI, false); s.lineTo(-w / 2, -h / 2 + r); s.absarc(-w / 2 + r, -h / 2 + r, r, Math.PI, Math.PI * 1.5, false); return s; };
  const ring = (w: number, h: number, t: number, r: number, depth: number) => { const o = rr(w, h, r); o.holes.push(rr(w - t * 2, h - t * 2, Math.max(0.005, r - t))); const geo = new ExtrudeGeometry(o, { depth, bevelEnabled: false, curveSegments: 10 }); geo.rotateY(Math.PI / 2); geo.translate(-depth / 2, 0, 0); return geo; };
  put(new Mesh(ring(BW + 0.06, BH + 0.06, 0.05, 0.07, 0.07), white), BX, BY);       // frame
  put(new Mesh(ring(0.61, 0.47, 0.05, 0.01, 0.034), white), BX, BY - BH / 2 + 0.39); // target square
  const lip = put(new Mesh(new CapsuleGeometry(0.055, BW - 0.2, 6, 16), pad), BX + 0.02, BY - BH / 2 - 0.02); lip.rotation.x = Math.PI / 2;
  for (const z of [-1, 1]) { const c = put(new Mesh(new CapsuleGeometry(0.055, 0.28, 6, 12), pad), BX + 0.02, BY - BH / 2 + 0.14, z * (BW / 2 + 0.005)); void c; }
  for (const z of [-1, 1]) {
    const curve = new CatmullRomCurve3([new Vector3(0.3, 3.6, z * 0.3), new Vector3(0.8, 3.85, z * 0.6), new Vector3(1.17, 3.95, z * 0.82)]);
    g.add(new Mesh(new TubeGeometry(curve, 12, 0.022, 8), steel));
  }
  // Rim on its bracket, and the net.
  put(new Mesh(new RoundedBoxGeometry(0.16, 0.12, 0.2, 3, 0.02), orange), BX + 0.09, 3.0);
  const rim = put(new Mesh(new TorusGeometry(0.229, 0.011, 10, 48), orange), BX + 0.38, 3.05); rim.rotation.x = Math.PI / 2;
  const netTex = netTexture();
  put(new Mesh(new CylinderGeometry(0.226, 0.13, 0.42, 28, 6, true),
    new MeshStandardMaterial({ color: 0xffffff, map: netTex, alphaMap: netTex, transparent: true, alphaTest: 0.35, side: DoubleSide, roughness: 0.9 })), BX + 0.38, 2.835);
  // Shot clock above the board.
  put(new Mesh(new RoundedBoxGeometry(0.34, 0.36, 0.62, 4, 0.05), steel), BX - 0.1, BY + BH / 2 + 0.3);
  const face = put(new Mesh(new PlaneGeometry(0.52, 0.26), new MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: clockTexture(), emissiveIntensity: 1.1 })), BX + 0.075, BY + BH / 2 + 0.3);
  face.rotation.y = Math.PI / 2;

  g.position.set(side * L * K / 2, 0, 0);
  g.scale.set(-side * 1.7, 1.7, 1.7); // mirrored so the board faces centre court, and sized up with the court
  return g;
}

/** The boards round the floor: lit panels carrying the venue name and the starting price of each level. */
function boards(labels: string[], hx: number, hz: number): Group {
  const g = new Group(); g.name = 'Court_Boards';
  const panels = ['BAYFRONT ARENA', ...labels];
  const fills = ['#0C1238', '#C9349B', '#3B146B', '#FF9B55', '#7B208F'], inks = ['#FFB458', '#FFFFFF', '#F36A78', '#0C1238', '#FFFFFF'];
  const PW = 640, H = 128, c = document.createElement('canvas'); c.width = PW * panels.length; c.height = H;
  const x = c.getContext('2d')!;
  panels.forEach((text, i) => {
    const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, fills[i % 5]); gr.addColorStop(1, '#05081A');
    x.fillStyle = fills[i % 5]; x.fillRect(i * PW, 0, PW, H); x.globalAlpha = 0.35; x.fillStyle = gr; x.fillRect(i * PW, 0, PW, H); x.globalAlpha = 1;
    x.fillStyle = 'rgba(255,255,255,0.14)'; x.fillRect(i * PW, 0, 3, H); x.fillRect(i * PW, 0, PW, 4);
    x.fillStyle = inks[i % 5]; x.textAlign = 'center'; x.textBaseline = 'middle';
    let size = 66; x.font = `italic 700 ${size}px "Space Grotesk", system-ui, sans-serif`;
    while (x.measureText(text).width > PW - 60 && size > 20) { size -= 3; x.font = `italic 700 ${size}px "Space Grotesk", system-ui, sans-serif`; }
    x.fillText(text, i * PW + PW / 2, H / 2 + 3);
  });
  const run = (len: number, px: number, pz: number, yaw: number, shift: number) => {
    const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.wrapS = RepeatWrapping; t.anisotropy = 8;
    t.repeat.x = len / (5 * panels.length); t.offset.x = shift; // each panel 5 m wide
    const m = new Mesh(new PlaneGeometry(len, 1.0), new MeshBasicMaterial({ map: t, toneMapped: false }));
    (m.material as MeshBasicMaterial).color.setScalar(0.8);
    m.position.set(px, 0.62, pz); m.rotation.order = 'YXZ'; m.rotation.y = yaw; m.rotation.x = -0.14;
    const back = new Mesh(new BoxGeometry(len, 1.1, 0.12), new MeshStandardMaterial({ color: 0x0c1238, roughness: 0.6 }));
    back.position.set(px - Math.sin(yaw) * 0.1, 0.6, pz - Math.cos(yaw) * 0.1); back.rotation.y = yaw;
    g.add(back, m);
  };
  const lx = (hx - 9) * 2, lz = (hz - 9) * 2;
  run(lx, 0, hz - 0.7, Math.PI, 0); run(lx, 0, -hz + 0.7, 0, 0.4);
  run(lz, hx - 0.7, 0, -Math.PI / 2, 0.2); run(lz, -hx + 0.7, 0, Math.PI / 2, 0.6);
  return g;
}

/** Courtside: two rows of chairs down each sideline and behind each basket, and the scorer's table. Dressing only, not on sale. */
function courtside(): Group {
  const g = new Group(); g.name = 'Courtside';
  const at: [number, number, number][] = []; // x, z, yaw
  const hx = L * K / 2, hz = W * K / 2;
  for (const side of [-1, 1]) for (let row = 0; row < 2; row++) {
    const z = side * (hz + 4.55 + row * 0.9);
    for (let x = -hx + 3; x <= hx - 3; x += 0.62) if (!(side > 0 && row === 0 && Math.abs(x) < 7)) at.push([x, z, side > 0 ? Math.PI / 2 : -Math.PI / 2]);
    const xb = side * (hx + 3.4 + row * 0.95);
    for (let z2 = -hz + 2; z2 <= hz - 2; z2 += 0.62) if (Math.abs(z2) > 3.2) at.push([xb, z2, side > 0 ? Math.PI : 0]);
  }
  const chairs = new InstancedMesh(createChairHD(1), new MeshStandardMaterial({ color: 0xf3e7d3, roughness: 0.45, vertexColors: true, envMapIntensity: 1.6 }), at.length); // cream, to stand off the purple floor
  const m = new Matrix4(), q = new Quaternion(), up = new Vector3(0, 1, 0), one = new Vector3(1, 1, 1), c = new Color();
  at.forEach(([x, z, yaw], i) => { chairs.setMatrixAt(i, m.compose(new Vector3(x, 0.04, z), q.setFromAxisAngle(up, yaw), one)); chairs.setColorAt(i, c.setScalar(0.85 + 0.3 * ((i * 0.618) % 1))); });
  chairs.computeBoundingSphere(); chairs.castShadow = true; chairs.receiveShadow = true;
  // Scorer's table: a dark desk with a lit front panel facing the court.
  const desk = new Mesh(new RoundedBoxGeometry(13.4, 0.78, 0.7, 4, 0.08), new MeshStandardMaterial({ color: 0x0c1238, roughness: 0.45, metalness: 0.3 }));
  desk.position.set(0, 0.42, hz + 4.45);
  const pc = document.createElement('canvas'); pc.width = 2048; pc.height = 80;
  const px = pc.getContext('2d')!, pg = px.createLinearGradient(0, 0, 2048, 0);
  pg.addColorStop(0, '#7B208F'); pg.addColorStop(0.5, '#C9349B'); pg.addColorStop(1, '#F36A78');
  px.fillStyle = pg; px.fillRect(0, 0, 2048, 80); px.fillStyle = '#fff'; px.textAlign = 'center'; px.textBaseline = 'middle';
  px.font = 'italic 700 46px "Space Grotesk", system-ui, sans-serif';
  ['BAYFRONT ARENA', 'OFFICIAL SCORER', 'PALMOJO  ·  real fruit, really', 'BAYFRONT ARENA'].forEach((t, i) => px.fillText(t, 256 + i * 512, 43));
  const ptex = new CanvasTexture(pc); ptex.colorSpace = SRGBColorSpace;
  const panel = new Mesh(new PlaneGeometry(13.2, 0.5), new MeshBasicMaterial({ map: ptex, toneMapped: false }));
  panel.rotation.y = Math.PI; (panel.material as MeshBasicMaterial).color.setScalar(0.85);
  panel.position.set(0, 0.42, hz + 4.45 - 0.37);
  g.add(chairs, desk, panel);
  return g;
}

export function createCourt(scene: Scene, renderer: WebGLRenderer, reflectLayer: number | null, eventFloor: Mesh | null, labels: string[]) {
  const tex = new CanvasTexture(drawCourt());
  tex.colorSpace = SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.minFilter = LinearMipmapLinearFilter; tex.generateMipmaps = true;

  // The hardwood takes the outline of the event floor it replaces: a rectangle with rounded corners.
  let hx = FLOOR_L / 2, hz = FLOOR_W / 2, r = 8, y = 0.03;
  if (eventFloor) {
    const box = new Box3().setFromObject(eventFloor); hx = box.max.x; hz = box.max.z; y = box.max.y + 0.02;
    const p = eventFloor.geometry.getAttribute('position'), v = new Vector3();
    let straight = 0; // how far the long edge runs before the corner starts
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(eventFloor.matrixWorld); if (v.z > hz - 0.05) straight = Math.max(straight, Math.abs(v.x)); }
    r = Math.min(hz, Math.max(0.5, hx - straight));
    eventFloor.visible = false;
  }
  const shape = new Shape();
  shape.moveTo(-hx + r, -hz); shape.lineTo(hx - r, -hz); shape.absarc(hx - r, -hz + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(hx, hz - r); shape.absarc(hx - r, hz - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-hx + r, hz); shape.absarc(-hx + r, hz - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-hx, -hz + r); shape.absarc(-hx + r, -hz + r, r, Math.PI, Math.PI * 1.5, false);
  const geo = new ShapeGeometry(shape, 12), uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / FLOOR_L + 0.5, uv.getY(i) / FLOOR_W + 0.5);

  const floor = new Reflector(geo, { textureWidth: 1024, textureHeight: 640, clipBias: 0.003, shader: CourtShader, multisample: 0 });
  (floor.material as ShaderMaterial).uniforms.tCourt.value = tex;
  floor.rotation.x = -Math.PI / 2; floor.position.y = y; floor.name = 'Court';
  // The mirror pass is only for the picture itself: skip it when the scene is being drawn for depth, normals or shadows.
  const mirror = floor.onBeforeRender;
  floor.onBeforeRender = function (r, s, c, ...rest) { if (!(s as Scene).overrideMaterial) mirror.call(this, r, s, c, ...rest); };
  if (reflectLayer != null) floor.camera.layers.enable(reflectLayer);
  scene.add(floor, basket(-1), basket(1), courtside(), boards(labels, hx, hz));
  return floor;
}
