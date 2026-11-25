// Offline-rendered light for the live view, and offline-rendered seat views.
//  - Lightmaps: path-traced direct and bounce light (with every shadow) for the bowl and concourses, baked in Blender.
//    Those surfaces stop reacting to the live lights and simply show their texture times the baked light.
//  - Panoramas: the view from the middle of each section, path-traced, shown in place of the live picture in "view from seat".
import {
  BackSide, Camera, Color, Mesh, MeshBasicMaterial, Scene, ShaderMaterial, SphereGeometry, SRGBColorSpace, TextureLoader, Vector2, Vector3,
  type Material, type MeshStandardMaterial, type Object3D, type Texture,
} from 'three';

const loader = new TextureLoader();
const getJson = async <T>(url: string): Promise<T | null> => { try { const r = await fetch(url); return r.ok ? ((await r.json()) as T) : null; } catch { return null; } };

const SOFT = /Concrete|Concourse|Slab|Ceiling|Floor/i; // surfaces whose photo texture is shown blurred
interface LightmapFile { range: number; meshes: Record<string, string> }

/** Swaps baked surfaces onto unlit materials carrying their lightmap. Returns how many meshes were switched. */
export async function applyLightmaps(root: Object3D, gain = 1): Promise<number> {
  const info = await getJson<LightmapFile>(`${import.meta.env.BASE_URL}lightmaps/lightmaps.json`);
  if (!info) return 0;
  const keys = [...new Set(Object.values(info.meshes))];
  const maps = new Map<string, Texture>();
  await Promise.all(keys.map(async (k) => {
    const t = await loader.loadAsync(`${import.meta.env.BASE_URL}lightmaps/lm_${k}.jpg`);
    t.colorSpace = SRGBColorSpace; t.flipY = false; t.channel = 1; t.anisotropy = 4; // second UV set, glTF orientation
    maps.set(k, t);
  }));
  const cache = new Map<string, Material>();
  let n = 0;
  root.traverse((o) => {
    const mesh = o as Mesh, key = info.meshes[o.name] ?? info.meshes[o.parent?.name ?? ''];
    if (!mesh.isMesh || !key || !mesh.geometry.getAttribute('uv1')) return;
    const src = mesh.material as MeshStandardMaterial, id = src.uuid + key;
    let m = cache.get(id);
    if (!m) {
      // unlit material: colour = texture x tint x baked light. The stored light is value / range, and the shader divides by pi.
      m = new MeshBasicMaterial({ name: src.name + '_Baked', map: src.map, color: new Color(0.78, 0.82, 1.0), lightMap: maps.get(key)!, lightMapIntensity: Math.PI * info.range * gain * 1.7, side: src.side });
      // The renderer that made the bake shows shadows more gently than this page's tone curve does, so the baked light is
      // compressed (shadows lifted, highlights eased) and given a small ambient floor: deep shade, not pure black.
      const soft = SOFT.test(src.name);
      m.customProgramCacheKey = () => (soft ? 'bakedSoft' : 'baked');
      m.onBeforeCompile = (sh) => { if (SOFT.test(src.name)) sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#ifdef USE_MAP\n  diffuseColor *= texture2D( map, vMapUv, 4.0 ); // a softer copy of the texture: concrete read as speckle\n#endif');
        sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'vec3 bakedL = outgoingLight / max(diffuseColor.rgb, vec3(1e-4)); outgoingLight = diffuseColor.rgb * (0.07 + pow(bakedL, vec3(0.62)) * 0.62);\n#include <opaque_fragment>'); };
      cache.set(id, m);
    }
    mesh.material = m; mesh.receiveShadow = false;
    n++;
  });
  return n;
}

interface PanoShot { file: string; eye: [number, number, number]; heading: [number, number]; row: string; seat: number; views?: PanoShot[] }
interface PanoFile { lon: [number, number]; lat: [number, number]; sections: Record<string, PanoShot> }
/** A rendered view stands in for seats this close to where it was rendered from (metres); further away the live picture is used. */
const REACH = 4.5;
export interface PanoView { heading: number; yawRange: number; pitch: [number, number]; row: string; seat: number }

/** Shows a section's pre-rendered panorama over the live picture, looking wherever the camera looks. */
export class SeatPanoramas {
  private info: PanoFile | null = null;
  private textures = new Map<string, Promise<Texture>>();
  private scene = new Scene();
  private material: ShaderMaterial;
  private current: string | null = null;
  /** 0 = live picture, 1 = panorama. Eased by `update`. */
  alpha = 0;
  private goal = 0;

  constructor() {
    const rad = Math.PI / 180;
    this.material = new ShaderMaterial({
      side: BackSide, depthTest: false, depthWrite: false, transparent: true, toneMapped: false,
      uniforms: { tPano: { value: null }, uFwd: { value: new Vector3(1, 0, 0) }, uLon: { value: new Vector2(-110 * rad, 110 * rad) }, uLat: { value: new Vector2(-75 * rad, 45 * rad) }, uAlpha: { value: 0 } },
      vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tPano; uniform vec3 uFwd; uniform vec2 uLon; uniform vec2 uLat; uniform float uAlpha; varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          vec3 right = normalize(cross(uFwd, vec3(0.0, 1.0, 0.0)));
          float lon = atan(dot(d, right), dot(d, uFwd)), lat = asin(clamp(d.y, -1.0, 1.0));
          vec2 uv = vec2((lon - uLon.x) / (uLon.y - uLon.x), (lat - uLat.x) / (uLat.y - uLat.x));
          vec3 c = texture2D(tPano, clamp(uv, 0.001, 0.999)).rgb;
          // a light grade so the rendered view sits with the live picture: deeper, a little richer
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, 1.22);
          c = pow(max(c, 0.0), vec3(1.16)) * 0.86;
          // fade to black just before the edge of what was rendered
          vec2 e = smoothstep(vec2(0.0), vec2(0.03), uv) * smoothstep(vec2(0.0), vec2(0.03), 1.0 - uv);
          gl_FragColor = vec4(c * e.x * e.y, uAlpha);
          #include <colorspace_fragment>
        }`,
    });
    const dome = new Mesh(new SphereGeometry(10, 48, 32), this.material);
    dome.frustumCulled = false;
    this.scene.add(dome);
  }

  async load() {
    this.info = await getJson<PanoFile>(`${import.meta.env.BASE_URL}panos/panos.json`);
    if (this.info) {
      const rad = Math.PI / 180;
      (this.material.uniforms.uLon.value as Vector2).set(this.info.lon[0] * rad, this.info.lon[1] * rad);
      (this.material.uniforms.uLat.value as Vector2).set(this.info.lat[0] * rad, this.info.lat[1] * rad);
    }
  }
  has(sectionId: string) { return !!this.info?.sections[sectionId]; }

  /** The rendered view nearest to an eye point in a section (its middle one when no eye is given), and how far away it is. */
  private pick(sectionId: string, eye?: Vector3): { shot: PanoShot; dist: number } | null {
    const s = this.info?.sections[sectionId];
    if (!s) return null;
    if (!eye) return { shot: s, dist: 0 };
    let shot = s, dist = Infinity;
    for (const v of [s, ...(s.views ?? [])]) { const d = Math.hypot(v.eye[0] - eye.x, v.eye[1] - eye.y, v.eye[2] - eye.z); if (d < dist) { dist = d; shot = v; } }
    return { shot, dist };
  }

  /** Starts fetching a section's panorama (call when the section is opened, so it is ready by the time it is wanted). */
  preload(sectionId: string, eye?: Vector3) {
    const s = this.pick(sectionId, eye)?.shot;
    if (!s) return null;
    sectionId = s.file;
    let p = this.textures.get(sectionId);
    if (!p) {
      p = loader.loadAsync(`${import.meta.env.BASE_URL}panos/${s.file}`).then((t) => { t.colorSpace = SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = false; t.minFilter = 1006 /* LinearFilter */; return t; });
      this.textures.set(sectionId, p);
    }
    return p;
  }

  /** Shows the panorama for a section once it has loaded. Returns how far the view may turn, or null if there is none. */
  show(sectionId: string, onReady: () => void, aspect = 1.6, eye?: Vector3): PanoView | null {
    const hit = this.pick(sectionId, eye), p = this.preload(sectionId, eye);
    if (!hit || !p || !this.info || hit.dist > REACH) return null; // too far from any rendered seat: the live view is the honest one
    const s = hit.shot;
    sectionId = s.file;
    this.current = sectionId;
    void p.then((t) => {
      if (this.current !== sectionId) return;
      this.material.uniforms.tPano.value = t;
      (this.material.uniforms.uFwd.value as Vector3).set(s.heading[0], 0, s.heading[1]);
      this.goal = 1; onReady();
    });
    const rad = Math.PI / 180, halfV = 35 * rad, halfH = Math.atan(Math.tan(halfV) * aspect); // a tall phone screen sees less width, so it may turn further
    return {
      heading: Math.atan2(s.heading[0], s.heading[1]), yawRange: Math.max(0.1, this.info.lon[1] * rad - halfH),
      pitch: [this.info.lat[0] * rad + halfV, this.info.lat[1] * rad - halfV], row: s.row, seat: s.seat,
    };
  }
  hide() { this.current = null; this.goal = 0; }
  get active() { return this.goal === 1 || this.alpha > 0; }

  /** Eases the cross-fade. Returns true while it is changing. */
  update(dt: number): boolean {
    if (this.alpha === this.goal) return false;
    const step = dt * 2.6;
    this.alpha = this.goal > this.alpha ? Math.min(1, this.alpha + step) : Math.max(0, this.alpha - step);
    this.material.uniforms.uAlpha.value = this.alpha * this.alpha * (3 - 2 * this.alpha);
    return true;
  }
  get panoScene() { return this.scene; }
  render(renderer: { render(s: Scene, c: Camera): void }, camera: Camera) { renderer.render(this.scene, camera); }
}
