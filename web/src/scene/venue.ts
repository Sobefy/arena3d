// Prepares the loaded venue: lights (none come from the GLB), beam cones, the sky as an environment map,
// and a lookup from each SEC_<id> mesh to its section.
import {
  AdditiveBlending, Box3, CanvasTexture, CircleGeometry, Color, DirectionalLight, DoubleSide, HemisphereLight, PointLight, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Object3D, PMREMGenerator, SRGBColorSpace, Scene, SpotLight, Vector3, type Material, type WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { SeatsFile, SectionUserData } from '../data/types';

export const SUN_DIR = new Vector3(-0.85, 0.16, 0.5).normalize(); // a warm, low sun over the bay

export interface Venue {
  sectionMeshes: Mesh[]; sectionOf: Map<Mesh, number>;
  /** Shows or hides the roof and everything hung from it, for the look-down overview. Returns true when it changed. */
  setRoof(visible: boolean): boolean;
}

export const PAGE = 0x05081a; // the dark page the venue sits on
// Everything above the stands: taken away when the camera rises over the bowl.
const ROOF = /^(Roof_|Accent_Ring|Catwalks|House_Speakers|Rafter_Banners|Scoreboard_|Upper_BackWall|Facade_Band_Top)/;

// Everything that belongs to the concert set-up, left out when the floor is a basketball court.
const CONCERT = /^(Stage_|LED_Upstage|LED_IMAG|LED_DeckFront|Backline|Barricade|FOH_|Cable_Ramps|Beam_Cone|Drape_BehindStage)/;

export function setupVenue(scene: Scene, root: Object3D, seats: SeatsFile, renderer: WebGLRenderer, exterior: boolean, concert: boolean): Venue {
  scene.add(root);

  // Even, neutral studio light: a white room as image-based light, so every surface is softly lit from all sides.
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.22;
  pmrem.dispose();
  scene.background = new Color(PAGE);

  // White house lights: sky-and-bounce fill, one soft key from above for form, and floodlights under the roof.
  scene.add(new HemisphereLight(0xffeedd, 0x343a70, 0.42));
  // The key light casts the shadows: high over the bowl and a little off to one side, so seats shade the steps behind them
  // and the stands shade the walkways. Its shadow map is drawn once at start-up, so it costs nothing per frame.
  const key = new DirectionalLight(0xfff1e0, 1.25);
  key.position.set(-34, 150, 52);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  Object.assign(key.shadow.camera, { left: -92, right: 92, top: 86, bottom: -86, near: 20, far: 240 });
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.06; key.shadow.radius = 3;
  scene.add(key, key.target);
  for (const [x, z, i] of [[-26, 0, 1300], [26, 0, 1300], [0, -24, 1050], [0, 24, 1050]] as const) {
    const fill = new PointLight(0xffe6cc, i, 112, 2); fill.position.set(x, 28, z); // pooled over the court and lower bowl, falling off up the stands scene.add(fill);
  }

  // A pale pool of light on the page under the building, fading to black.
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!, grad = g.createRadialGradient(128, 128, 60, 128, 128, 128);
  grad.addColorStop(0, 'rgba(123,32,143,0.3)'); grad.addColorStop(0.6, 'rgba(59,20,107,0.12)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  const tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace;
  const pool = new Mesh(new CircleGeometry(1, 64), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  pool.rotation.x = -Math.PI / 2; pool.scale.set(210, 180, 1); pool.position.y = -0.4; pool.name = 'Page_Glow';
  if (!exterior) scene.add(pool);

  // Coloured spots on the stage, from the front-of-house truss.
  const look = new Vector3(...seats.stage.look_target), front = new Vector3(...seats.stage.front_center);
  const spots: [string, Vector3, Vector3][] = [
    ['#FF148C', new Vector3(-6, 22, -14), new Vector3(front.x + 4, 1.8, -5)],
    ['#00D9FF', new Vector3(-6, 22, 14), new Vector3(front.x + 4, 1.8, 5)],
    ['#731AE6', new Vector3(4, 26, 0), look.clone().setY(2)],
    ['#FF6B1A', new Vector3(12, 18, 0), new Vector3(front.x + 8, 1.8, 0)],
  ];
  for (const [hex, from, to] of concert ? spots : []) {
    const s = new SpotLight(new Color(hex), 120, 80, 0.38, 0.6, 2);
    s.position.copy(from); s.target.position.copy(to);
    scene.add(s, s.target);
  }

  const sectionMeshes: Mesh[] = [];
  const sectionOf = new Map<Mesh, number>();
  const index = new Map(seats.sections.map((s, i) => [s.id, i]));
  const roof: Object3D[] = [];
  const box = new Box3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    // The building stands alone on the page: the plaza, city and bay around it are left out.
    if (!exterior) {
      box.setFromObject(mesh);
      if (Math.max(Math.abs(box.min.x), Math.abs(box.max.x)) > 84 || Math.max(Math.abs(box.min.z), Math.abs(box.max.z)) > 72) { mesh.visible = false; return; }
    }
    if (!concert && (CONCERT.test(mesh.name) || CONCERT.test(mesh.parent?.name ?? ''))) { mesh.visible = false; return; }
    const isRoof = ROOF.test(mesh.name) || ROOF.test(mesh.parent?.name ?? '');
    if (isRoof) roof.push(mesh);
    // Everything solid below the roof takes part in the shadows; the roof itself must not block the light that stands in for the house rig.
    const m0 = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as MeshStandardMaterial;
    const solid = !m0.transparent && !/^(Beam|Bay|Water)/.test(m0.name);
    mesh.receiveShadow = solid; mesh.castShadow = solid && !isRoof && !/^(Conc_Ceiling|Suite_Ceiling|Concourse_Upper|Concourse_Main|Slab_Edges|Facade_|Neon_|Conc_Lights)/.test(mesh.name);
    // Beam cones: light shafts, so add them up instead of hiding what is behind them.
    if (/^Beam_Cone_/.test(nameUp(mesh))) for (const m of mats(mesh)) {
      // Keep the asset's own faint opacity (0.035); additive blending makes overlapping cones glow instead of grey out.
      Object.assign(m, { transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, opacity: Math.min(m.opacity, 0.018) });
      // Fade towards the silhouette (where the surface turns edge-on), so a cone reads as a soft shaft, not a tube.
      m.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
          'diffuseColor.a *= pow(abs(dot(normal, normalize(vViewPosition))), 2.5);\n#include <opaque_fragment>');
      };
      m.needsUpdate = true;
    }
    for (const m of mats(mesh)) enrich(m as MeshStandardMaterial);
    // Sections: the extras live on the node, which may be the mesh or its parent group (multi-material).
    const ud = sectionData(mesh);
    if (ud) {
      const i = index.get(ud.section_id);
      if (i != null) { sectionMeshes.push(mesh); sectionOf.set(mesh, i); } else mesh.visible = false; // a section not on sale in this set-up
      if (ud.status === 'closed') for (const m of mats(mesh)) if ((m as MeshStandardMaterial).color) {
        const c = (m as MeshStandardMaterial).clone(); c.color.multiplyScalar(0.35); mesh.material = c;
      }
    }
  });
  let roofOn = true;
  const setRoof = (visible: boolean) => {
    if (visible === roofOn) return false;
    roofOn = visible;
    for (const o of roof) o.visible = visible;
    return true;
  };
  return { sectionMeshes, sectionOf, setRoof };
}

const METALS = /^(TrussAlu|RailSteel|MechMetal|Barricade)$/;
const done = new WeakSet<Material>();
/** Untextured, unlit-looking surfaces get world-space grain (colour and roughness variation); metals get real reflections. */
function enrich(m: MeshStandardMaterial) {
  if (done.has(m) || !m.isMeshStandardMaterial) return;
  done.add(m);
  if (METALS.test(m.name)) { m.metalness = 0.9; m.roughness = 0.38; m.envMapIntensity = 2.2; }
  // Neon tubes, signs and lamps keep their colour but stop glaring: strengths of 5–25 come down to about 1.2–2.6.
  if (m.emissiveIntensity > 2) m.emissiveIntensity = 0.9 + m.emissiveIntensity * 0.07;
  if (m.name === 'LED_Screen') m.emissiveIntensity = 0.9; // keep the screen art readable
  if (m.name === 'AisleConcrete' || m.name === 'ConcourseFloor') m.color.multiply(new Color(0.3, 0.34, 0.6)); // dark blue steps and walkways, so the warm seats stand out
  // Accent lights move onto the palette: cyan and teal become orange and warm yellow, pinks become magenta and coral.
  const accent = ({ AccentTeal: 0xff9b55, NeonCyan: 0xff9b55, SectionSign: 0xffb458, AccentMagenta: 0xc9349b, NeonPink: 0xc9349b, ConcourseGlow: 0xf36a78, RoofHalo: 0x7b208f } as Record<string, number>)[m.name];
  if (accent != null) { m.color.set(accent); m.emissive.set(accent); }
  if (m.name === 'EventFloor') { m.color.set(0x21103f); m.roughness = 0.9; m.metalness = 0; m.envMapIntensity = 0.25; } // the main floor: a deep, matt purple
  const glows = m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) * m.emissiveIntensity > 0.01;
  if (m.map || glows || m.transparent || /^(Beam|Bay|Water|Mirror)/.test(m.name)) return;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrainPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrainPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGrainPos;
        float gHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float gNoise(vec3 p) {
          vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(gHash(i), gHash(i + vec3(1, 0, 0)), f.x), mix(gHash(i + vec3(0, 1, 0)), gHash(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(gHash(i + vec3(0, 0, 1)), gHash(i + vec3(1, 0, 1)), f.x), mix(gHash(i + vec3(0, 1, 1)), gHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float grain = gNoise(vGrainPos * 0.9) * 0.7 + gNoise(vGrainPos * 3.5) * 0.3; // broad, soft variation only: fine speckle read as noise
        diffuseColor.rgb *= 0.9 + 0.2 * grain;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (grain - 0.5) * 0.2, 0.06, 1.0);');
  };
  m.customProgramCacheKey = () => 'grain2';
  m.needsUpdate = true;
}

function sectionData(o: Object3D): SectionUserData | null {
  for (let p: Object3D | null = o; p; p = p.parent) if ((p.userData as Partial<SectionUserData>).kind === 'section') return p.userData as SectionUserData;
  return null;
}
const nameUp = (o: Object3D) => (o.name.startsWith('Beam_Cone_') ? o.name : o.parent?.name ?? '');
const mats = (m: Mesh): Material[] => (Array.isArray(m.material) ? m.material : [m.material]);
