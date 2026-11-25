// Loads the venue, the chair models and seats.json, reporting combined progress (weighted by file size).
import { BufferGeometry, Mesh, type Object3D } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { ChairName, SeatsFile } from '../data/types';

export interface Assets { venue: GLTF; chairs: Record<ChairName, BufferGeometry>; seats: SeatsFile }

const WEIGHTS = { venue: 9.0, chairs: 1.0, seats: 0.8 }; // approximate MB, for the progress bar

export async function loadAssets(onProgress: (fraction: number) => void): Promise<Assets> {
  const done = { venue: 0, chairs: 0, seats: 0 };
  const total = WEIGHTS.venue + WEIGHTS.chairs + WEIGHTS.seats;
  const report = (k: keyof typeof done, f: number) => {
    done[k] = Math.min(1, f);
    onProgress((done.venue * WEIGHTS.venue + done.chairs * WEIGHTS.chairs + done.seats * WEIGHTS.seats) / total);
  };

  const gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const load = (url: string, k: keyof typeof done) => new Promise<GLTF>((res, rej) =>
    gltf.load(url, (g) => { report(k, 1); res(g); }, (e) => { if (e.total) report(k, e.loaded / e.total); }, rej));

  const [venue, chairGltf, seats] = await Promise.all([
    load(`${import.meta.env.BASE_URL}arena_venue.opt.glb`, 'venue'),
    load(`${import.meta.env.BASE_URL}chairs.glb`, 'chairs'),
    fetchJson<SeatsFile>(`${import.meta.env.BASE_URL}seats.json`, (f) => report('seats', f)),
  ]);

  const chairs = {} as Record<ChairName, BufferGeometry>;
  for (const name of ['Chair_Lower', 'Chair_Upper', 'Chair_Floor'] as ChairName[]) {
    const obj = chairGltf.scene.getObjectByName(name);
    const mesh = obj && findMesh(obj);
    if (!mesh) throw new Error(`chairs.glb has no mesh ${name}`);
    chairs[name] = mesh.geometry;
  }
  return { venue, chairs, seats };
}

function findMesh(o: Object3D): Mesh | null {
  if ((o as Mesh).isMesh) return o as Mesh;
  for (const c of o.children) { const m = findMesh(c); if (m) return m; }
  return null;
}

async function fetchJson<T>(url: string, onProgress: (f: number) => void): Promise<T> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url}: ${res.status}`);
  const size = Number(res.headers.get('content-length')) || 800_000;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length; onProgress(got / size);
  }
  onProgress(1);
  return JSON.parse(new TextDecoder().decode(concat(chunks, got))) as T;
}
const concat = (chunks: Uint8Array[], len: number) => {
  const out = new Uint8Array(len); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
};
