// Bayfront Arena ticketing prototype: pick a section, pick a seat, see the view, add it to the cart.
import './styles.css';
import {
  ACESFilmicToneMapping, DataUtils, type DirectionalLight, NoToneMapping, type Mesh, BasicShadowMap, PCFShadowMap, PCFSoftShadowMap, PerspectiveCamera, type Vector4, SRGBColorSpace, Scene, TextureLoader, Vector3, WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { loadAssets } from './scene/loader';
import { createSky } from './scene/sky';
import { createWater } from './scene/water';
import { createComposer, createThumbComposer } from './scene/post';
import { SEAT_LAYER, SeatLayer } from './scene/seats';
import { SUN_DIR, setupVenue } from './scene/venue';
import { dressSuites } from './scene/suites';
import { createCourt } from './scene/court';
import { SeatPanoramas, applyLightmaps } from './scene/baked';
import { CameraRig, HOME_POSE, ROOF_LINE } from './controls/camera';
import { Picker, type Pick } from './controls/picking';
import { SeatCard } from './ui/card';
import { Cart, toast } from './ui/cart';
import { Legend } from './ui/legend';
import { setCrumbs } from './ui/breadcrumb';
import { hideTooltip, moveTooltip, showTooltip } from './ui/tooltip';
import { MockAvailability, type AvailabilityApi } from './data/availability';
import { TIER_COLORS, usd } from './data/tiers';
import type { CameraPose, CartSeat, SeatRef } from './data/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stageEl = $('stage');

// ---------- renderer, scene, camera ----------
const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
const touchDevice = matchMedia('(pointer: coarse)').matches; // phones and tablets: a lighter picture budget
renderer.setPixelRatio(Math.min(devicePixelRatio, touchDevice ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.info.autoReset = false; // count every pass of a frame, reset once per frame
const shadowMode = new URLSearchParams(location.search).get('shadow') ?? 'soft';
renderer.shadowMap.enabled = shadowMode !== 'off'; renderer.shadowMap.type = shadowMode === 'basic' ? BasicShadowMap : shadowMode === 'pcf' ? PCFShadowMap : PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // drawn once, after everything has loaded
stageEl.append(renderer.domElement);

const scene = new Scene();
const camera = new PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 4000);
camera.layers.enable(SEAT_LAYER);

let dirty = true;
let lastMove = 0, aoAmount = 0;
const tmpV = new Vector3();
const requestRender = () => { dirty = true; };

// ---------- load ----------
const bar = $('loadingBar'), barText = $('loadingText');
const assets = await loadAssets((f) => {
  bar.style.width = `${Math.round(f * 100)}%`;
  barText.textContent = `Loading the venue… ${Math.round(f * 100)}%`;
}).catch((err) => { barText.textContent = `Could not load the venue: ${err.message}`; throw err; });
const data = assets.seats;
const params = new URLSearchParams(location.search);
// The floor is a basketball court. `?concert` brings back the stage and the floor seats.
const concert = params.has('concert');
if (!concert) {
  data.sections = data.sections.filter((s) => s.level !== 'FLOOR');
  for (const t of ['P1', 'P1B'] as const) delete (data.tiers as Partial<typeof data.tiers>)[t];
}

// The venue stands alone on a dark page. `?exterior` brings back the plaza, city, bay and sunset sky around it.
const exterior = params.has('exterior');
const venue = setupVenue(scene, assets.venue.scene, data, renderer, exterior, concert);
if (!concert) createCourt(scene, renderer, params.has('noseatmirror') ? null : SEAT_LAYER, assets.venue.scene.getObjectByName('EventFloor') as Mesh | null,
  ([['100', 'LOWER BOWL'], ['300', 'UPPER BOWL']] as const).map(([lv, name]) => `${name}  FROM $${Math.min(...data.sections.filter((x) => String(x.level) === lv && x.status !== 'closed').map((x) => x.price))}`));
dressSuites(assets.venue.scene, scene);
// Path-traced light baked in Blender, and path-traced seat views. Both are optional files: without them the live picture is used.
const bakedMeshes = params.has('nolm') ? 0 : await applyLightmaps(assets.venue.scene, Number(params.get('lm') ?? 1));
const panos = new SeatPanoramas();
if (!params.has('nopano')) await panos.load();
if (exterior) scene.add(createSky());
const water = exterior ? createWater(scene, await new TextureLoader().loadAsync(`${import.meta.env.BASE_URL}water_normal.png`), SUN_DIR) : null;

const texLoader = new TextureLoader();
const seats = new SeatLayer(data, assets.chairs, await texLoader.loadAsync(`${import.meta.env.BASE_URL}seat_plastic_normal.jpg`), await texLoader.loadAsync(`${import.meta.env.BASE_URL}seat_plastic_rough.jpg`));
scene.add(...seats.group);

const availability: AvailabilityApi = new MockAvailability();
await Promise.all(data.sections.map(async (sec, i) => {
  const sold = await availability.getAvailability(sec.id, sec.rows.map((r) => ({ label: r.label, seats: r.seats.map((s) => s[0]) })));
  seats.setSold(i, sold);
}));

const { composer, grade, resize: resizePost, ao } = createComposer(renderer, scene, camera, !params.has('noao') && !touchDevice);
const povCam = new PerspectiveCamera(70, 16 / 9, 0.1, 4000);
povCam.layers.enable(SEAT_LAYER);
const thumbComposer = createThumbComposer(renderer, scene, povCam, 320, 180);

const rig = new CameraRig(camera, renderer.domElement, requestRender);
/** The opening view. On a tall, narrow screen it pulls back until the bowl's full width fits. */
function homePose(): CameraPose {
  if (camera.aspect >= 0.85) return HOME_POSE;
  const halfH = Math.atan(Math.tan((50 * Math.PI) / 360) * camera.aspect), d = Math.min(300, 66 / Math.tan(halfH));
  return { pos: [-d * 0.2, d * 0.98, 0], target: [4, 0, 0] };
}
rig.setPose(homePose());
if (exterior) { rig.free = true; rig.controls.maxDistance = 600; }

// ---------- state ----------
const sectionIndex = new Map(data.sections.map((s, i) => [s.id, i]));
const nameOf = (id: string) => data.sections[sectionIndex.get(id) ?? 0].name;
let focused = -1;                 // section the camera is zoomed into
let current: SeatRef | null = null; // seat shown in the card
const look = concert ? new Vector3(...data.stage.look_target) : new Vector3(0, 1.2, 0); // what a seat faces: the stage, or centre court

const refToCart = (r: SeatRef): CartSeat => {
  const sec = data.sections[r.section];
  return { section: sec.id, row: sec.rows[r.row].label, seat: sec.rows[r.row].seats[r.seat][0], price: sec.price };
};
const cartToRef = (c: CartSeat): SeatRef | null => {
  const s = sectionIndex.get(c.section); if (s == null) return null;
  const row = data.sections[s].rows.findIndex((r) => r.label === c.row); if (row < 0) return null;
  const seat = data.sections[s].rows[row].seats.findIndex((t) => t[0] === c.seat);
  return seat < 0 ? null : { section: s, row, seat };
};

const cart = new Cart(
  (id) => TIER_COLORS[data.sections[sectionIndex.get(id) ?? 0].tier],
  (id) => data.sections[sectionIndex.get(id) ?? 0].name,
  (items) => { seats.setCart(items.map(cartToRef).filter((r): r is SeatRef => !!r)); if (current) refreshCard(); requestRender(); },
  (removed) => { void availability.releaseSeat(removed); },
);
seats.setCart(cart.items.map(cartToRef).filter((r): r is SeatRef => !!r));
for (const it of cart.items) void availability.holdSeat(it);

const card = new SeatCard({
  pov: () => (rig.inPov || povPending ? leavePov() : enterPov()),
  add: () => {
    if (!current) return;
    const item = refToCart(current);
    if (cart.has(item)) { cart.remove(item); toast(`Removed ${data.sections[current.section].name}, Row ${item.row}, Seat ${item.seat}`); return; }
    if (cart.full) { toast('Up to 8 seats per order'); return; }
    void availability.holdSeat(item).then((ok) => {
      if (!ok) { toast('Someone just took that seat'); return; }
      cart.add(item); toast(`Added ${nameOf(item.section)}, Row ${item.row}, Seat ${item.seat}`);
    });
  },
  close: () => { if (rig.inPov) leavePov(); selectSeat(null); },
});

new Legend(data, (visible, active) => {
  const dim = new Set<number>();
  if (active) data.sections.forEach((s, i) => { if (s.status !== 'closed' && !visible(s.tier, s.price)) dim.add(i); });
  seats.setDimmed(dim); requestRender();
});

// ---------- navigation ----------
function updateCrumbs() {
  const crumbs: { label: string; go?: () => void }[] = [{ label: 'Arena', go: toOverview }];
  const s = current ? current.section : focused;
  if (s >= 0) crumbs.push({ label: data.sections[s].name, go: () => focusSection(s) });
  if (current) {
    const row = data.sections[current.section].rows[current.row];
    const r = current;
    crumbs.push({ label: `Row ${row.label}`, go: () => focusRow(r.section, r.row) });
    crumbs.push({ label: `Seat ${row.seats[current.seat][0]}` });
  }
  setCrumbs(crumbs);
  const chip = $('sectionChip');
  if (s >= 0) {
    const sec = data.sections[s];
    chip.hidden = false;
    chip.innerHTML = `<i style="background:${TIER_COLORS[sec.tier]};box-shadow:0 0 10px ${TIER_COLORS[sec.tier]}"></i><b>${sec.name}</b><span>${data.tiers[sec.tier][0]}</span><b>${usd.format(sec.price)}</b>${sec.status === 'side_view' ? '<span>· side view</span>' : ''}`;
  } else chip.hidden = true;
}

function toOverview() {
  if (rig.inPov || povPending) leaveSeatViewState();
  focused = -1; selectSeat(null); seats.setFocusRow(null);
  rig.tweenToPose(homePose(), 1.3);
  updateCrumbs();
}
function focusSection(s: number) {
  if (rig.inPov || povPending) leaveSeatViewState();
  focused = s; seats.setFocusRow(null);
  if (current && current.section !== s) selectSeat(null);
  rig.tweenToPose(sectionPose(s), 1.1);
  panos.preload(data.sections[s].id); // have its seat view ready
  updateCrumbs(); requestRender();
}
/** Head-on to the section from the floor side, a little above it, with the whole block in frame. */
function sectionPose(s: number): CameraPose {
  const sec = data.sections[s];
  if (sec.level === 'FLOOR') return sec.zoom_camera;
  const zc = sec.zoom_camera;
  const out = new Vector3(zc.target[0] - zc.pos[0], 0, zc.target[2] - zc.pos[2]).normalize(); // away from the floor
  const side = new Vector3(-out.z, 0, out.x);
  const c = seats.sections[s].box.getCenter(new Vector3());
  let w = 0, d = 0;
  for (const row of sec.rows) for (const [, x, , z] of row.seats) {
    const p = new Vector3(x - c.x, 0, z - c.z);
    w = Math.max(w, Math.abs(p.dot(side))); d = Math.max(d, Math.abs(p.dot(out)));
  }
  const halfH = Math.atan(Math.tan((50 * Math.PI) / 360) * camera.aspect);
  const dist = Math.min(34, Math.max((w + 1.5) / Math.tan(halfH), 9) + d * 0.6);
  const pos = c.clone().addScaledVector(out, -dist); pos.y = Math.min(c.y + dist * 0.42, 28.5);
  return { pos: [pos.x, pos.y, pos.z], target: [c.x, c.y - 0.5, c.z] };
}
/** On a phone the seat sheet covers the bottom of the screen. Its height, as a share of the screen (0 on a desktop layout). */
const phone = () => innerWidth <= 760;
function measureSheet(): number {
  if (!phone()) return 0;
  const h = $('card').offsetHeight;
  document.documentElement.style.setProperty('--sheet', `${h}px`);
  return h / innerHeight;
}
/** Close on one seat, from in front and a little above. On a phone the seat is framed in the part of the screen the sheet leaves free. */
function seatClose(ref: SeatRef) {
  const [, x, y, z, yaw] = seats.seatTuple(ref);
  const seat = new Vector3(x, y + 0.55, z), eye = new Vector3(x + Math.cos(yaw) * 4.4, y + 2.9, z - Math.sin(yaw) * 4.4);
  const covered = measureSheet();
  if (covered > 0) {
    if (camera.aspect < 1) eye.sub(seat).multiplyScalar(1.25).add(seat);                       // a narrow screen needs a little more distance
    seat.y -= covered * Math.tan((50 * Math.PI) / 360) * eye.distanceTo(seat) * 0.95;          // aim lower, so the seat rises above the sheet
  }
  rig.tweenTo(eye, seat, 0.9);
}
function focusRow(s: number, r: number) {
  if (rig.inPov || povPending) leaveSeatViewState();
  focused = s;
  const row = data.sections[s].rows[r].seats;
  const mid = row[Math.floor(row.length / 2)];
  const target = new Vector3(mid[1], mid[2], mid[3]);
  const zc = data.sections[s].zoom_camera;
  const offset = new Vector3(...zc.pos).sub(new Vector3(...zc.target)).multiplyScalar(0.7);
  rig.tweenTo(target.clone().add(offset), target, 1.0);
  seats.setFocusRow({ section: s, row: r });
  updateCrumbs(); requestRender();
}

function selectSeat(ref: SeatRef | null) {
  current = ref;
  seats.setCurrent(ref);
  if (ref) {
    if (focused !== ref.section) focused = ref.section;
    seats.setFocusRow({ section: ref.section, row: ref.row }); // its row stays lit, the rest of the block falls back
    refreshCard();
    renderThumb(ref);
  } else { seats.setFocusRow(null); card.hide(); }
  document.body.classList.toggle('has-card', !!ref);
  updatePovButtons();
  updateCrumbs(); requestRender();
}
function refreshCard() {
  if (!current) return;
  const sec = data.sections[current.section], row = sec.rows[current.row];
  const item = refToCart(current);
  card.show({
    section: sec, tierName: data.tiers[sec.tier][0], row: row.label, seat: row.seats[current.seat][0],
    sold: seats.isSold(current), inCart: cart.has(item), cartFull: cart.full,
  }, rig.inPov || povPending);
}

// ---------- seat point of view ----------
let povPending = false;
// Just behind and above the seat, so its backrest sits at the bottom of the view.
const POV_BACK = 0.95, POV_UP = 1.6;
const eyeOf = (r: SeatRef) => {
  const [, x, y, z, yaw] = seats.seatTuple(r);
  return new Vector3(x - Math.cos(yaw) * POV_BACK, y + POV_UP, z + Math.sin(yaw) * POV_BACK);
};
function enterPov(dur = 1.2) {
  if (!current) return;
  povPending = true;
  rig.enterPov(eyeOf(current), look, dur);
  // If this section has a pre-rendered view, it fades in over the live one and the camera only turns within it.
  const view = panos.show(data.sections[current.section].id, requestRender, camera.aspect, eyeOf(current));
  rig.povLimit = view;
  $('povbar').classList.toggle('is-pano', !!view);
  $('povHint').textContent = view ? `Rendered from Row ${view.row}, Seat ${view.seat} · drag to look around` : 'Drag to look around';
  $('povbar').hidden = false; stageEl.classList.add('is-pov'); document.body.classList.add('in-pov'); measureSheet();
  card.setPovLabel(true); updatePovButtons(); hideTooltip(); seats.setHover(null); seats.setHoverSection(-1); hoverKey = '';
}
function leaveSeatViewState() {
  panos.hide(); rig.povLimit = null;
  povPending = false; $('povbar').hidden = true; stageEl.classList.remove('is-pov'); document.body.classList.remove('in-pov'); card.setPovLabel(false); measureSheet();
}
function leavePov() { leaveSeatViewState(); rig.exitPov(1.0); requestRender(); }
function stepSeat(dSeat: number, dRow: number) {
  if (!current || panos.active) return; // a rendered view belongs to one seat
  const sec = data.sections[current.section];
  let next: SeatRef | null = null;
  if (dSeat) {
    const s = current.seat + dSeat;
    if (s >= 0 && s < sec.rows[current.row].seats.length) next = { ...current, seat: s };
  } else {
    const r = current.row + dRow;
    if (r >= 0 && r < sec.rows.length) {
      // the seat in that row nearest to this one
      const [, x, , z] = seats.seatTuple(current);
      let best = 0, bd = Infinity;
      sec.rows[r].seats.forEach(([, sx, , sz], i) => { const d = (sx - x) ** 2 + (sz - z) ** 2; if (d < bd) { bd = d; best = i; } });
      next = { section: current.section, row: r, seat: best };
    }
  }
  if (!next) return;
  selectSeat(next);
  rig.enterPov(eyeOf(next), look, 0.6);
}
function updatePovButtons() {
  if (!current) return;
  const sec = data.sections[current.section];
  $<HTMLButtonElement>('povSeatPrev').disabled = current.seat <= 0;
  $<HTMLButtonElement>('povSeatNext').disabled = current.seat >= sec.rows[current.row].seats.length - 1;
  $<HTMLButtonElement>('povRowUp').disabled = current.row <= 0;
  $<HTMLButtonElement>('povRowDown').disabled = current.row >= sec.rows.length - 1;
}
$('povBack').addEventListener('click', leavePov);
$('povSeatPrev').addEventListener('click', () => stepSeat(-1, 0));
$('povSeatNext').addEventListener('click', () => stepSeat(1, 0));
$('povRowUp').addEventListener('click', () => stepSeat(0, -1));
$('povRowDown').addEventListener('click', () => stepSeat(0, 1));
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (rig.inPov || povPending) leavePov(); else if ($('drawer').classList.contains('is-open')) cart.toggle(false); else if (current) selectSeat(null); }
  if (!(rig.inPov || povPending)) return;
  if (e.key === 'ArrowLeft') stepSeat(-1, 0);
  if (e.key === 'ArrowRight') stepSeat(1, 0);
  if (e.key === 'ArrowUp') stepSeat(0, -1);
  if (e.key === 'ArrowDown') stepSeat(0, 1);
});

/** Renders the view from a seat into the card thumbnail. */
const thumbPixels = new Uint16Array(320 * 180 * 4), thumbBytes = new Uint8Array(320 * 180 * 4);
function renderThumb(ref: SeatRef) {
  povCam.position.copy(eyeOf(ref)); povCam.lookAt(look);
  thumbComposer.render();
  const rt = thumbComposer.readBuffer as WebGLRenderTarget;
  renderer.readRenderTargetPixels(rt, 0, 0, 320, 180, thumbPixels);
  for (let i = 0; i < thumbPixels.length; i++) thumbBytes[i] = Math.max(0, Math.min(255, DataUtils.fromHalfFloat(thumbPixels[i]) * 255));
  card.drawThumb(thumbBytes, 320, 180);
  renderer.setRenderTarget(null);
}

// ---------- picking ----------
let hoverKey = '';
const picker = new Picker(renderer.domElement, camera, seats, venue.sectionMeshes, venue.sectionOf, {
  hover: (p: Pick) => {
    if ((rig.inPov && p?.kind !== 'seat') || panos.active) p = null;
    // The picture is redrawn only when the thing under the pointer changes, never just because the mouse moved.
    const key = (!p ? '' : p.kind === 'seat' ? `s${p.ref.section}:${p.ref.row}:${p.ref.seat}` : `S${p.section}`) + `|${focused}|${rig.inPov}`;
    const same = key === hoverKey; hoverKey = key;
    if (same) { if (p) moveTooltip(picker.pointer.x, picker.pointer.y); return; }
    seats.setHover(p?.kind === 'seat' ? p.ref : null);
    seats.setHoverSection(p?.kind === 'section' && focused < 0 ? p.section : -1); // inside a section, a neighbour under the pointer is not lit up: crossing an aisle made whole blocks of seats flash
    stageEl.classList.toggle('is-pointer', !!p);
    if (!p) hideTooltip();
    else if (p.kind === 'seat') {
      const sec = data.sections[p.ref.section], row = sec.rows[p.ref.row], sold = seats.isSold(p.ref);
      showTooltip(`<b>${sec.name}</b> · Row ${row.label} · Seat ${row.seats[p.ref.seat][0]}<br>${sold ? '<span class="tt-sold">Sold</span>' : `<span class="tt-price">${usd.format(sec.price)}</span> · ${data.tiers[sec.tier][0]}`}`, picker.pointer.x, picker.pointer.y);
    } else {
      const sec = data.sections[p.section];
      showTooltip(`<b>${sec.name}</b> · ${data.tiers[sec.tier][0]}<br><span class="tt-price">${usd.format(sec.price)}</span> · click to zoom in`, picker.pointer.x, picker.pointer.y);
    }
    requestRender();
  },
  click: (p: Pick) => {
    if (!p || panos.active) return;
    if (p.kind === 'seat') { selectSeat(p.ref); if (rig.inPov || povPending) enterPov(0.6); else seatClose(p.ref); return; }
    if (rig.inPov || povPending) return;
    if (p.section !== focused) focusSection(p.section);
  },
});

// ---------- loop: draws only when something changed ----------
const stats = params.has('stats') ? $('stats') : null;
if (stats) stats.hidden = false;
let frames = 0, statT = performance.now(), last = performance.now(), fps = 0, lastCalls = 0, lastTris = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const moved = rig.update(now);
  if (venue.setRoof(camera.position.y < ROOF_LINE)) dirty = true;
  if (seats.setDetail(camera.position)) dirty = true;
  if (panos.update(dt)) dirty = true;
  // Contact shading is the costly effect, so it is left out while the camera is moving and eased back in once the view settles.
  if (moved || rig.moving) lastMove = now;
  if (ao) {
    if (now - lastMove < 160) { ao.enabled = false; aoAmount = 0; }
    else if (aoAmount < 1) { ao.enabled = true; aoAmount = Math.min(1, aoAmount + dt * 5); ao.blendIntensity = aoAmount; dirty = true; }
  }
  // Light follows what you are doing: the overview sits in half-light until you point at a section, the bowl comes up as you fly in,
  // and choosing a seat pulls the edges of the picture down around it.
  const overview = !touchDevice && focused < 0 && !current && !rig.inPov && !povPending; // the half-light relies on hover, which touch screens lack
  if (seats.updateLight(dt, overview)) dirty = true;
  // Spotlight on the section under the pointer: an oval around where it sits on screen, the rest of the picture darker.
  const fs = seats.focusSection();
  const fu = grade.uniforms as unknown as { uFocus: { value: Vector4 }; uFocusAmt: { value: number } };
  if (fs >= 0 && !rig.moving) {
    const box = seats.sections[fs].box; let x0 = 2, y0 = 2, x1 = -2, y1 = -2;
    for (let i = 0; i < 8; i++) {
      tmpV.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
      x0 = Math.min(x0, tmpV.x); x1 = Math.max(x1, tmpV.x); y0 = Math.min(y0, tmpV.y); y1 = Math.max(y1, tmpV.y);
    }
    fu.uFocus.value.set((x0 + x1) / 4 + 0.5, (y0 + y1) / 4 + 0.5, Math.max(0.07, (x1 - x0) / 4 * 1.15), Math.max(0.09, (y1 - y0) / 4 * 1.15));
  }
  const focusGoal = 0; // the travelling spotlight is off: it re-shaded the whole picture every time the pointer changed section
  const fa = fu.uFocusAmt.value + (focusGoal - fu.uFocusAmt.value) * Math.min(1, dt * 7);
  if (Math.abs(fa - fu.uFocusAmt.value) > 0.002) { fu.uFocusAmt.value = fa; dirty = true; } else fu.uFocusAmt.value = focusGoal;
  const u = grade.uniforms as Record<string, { value: number }>;
  const goal = { uGain: overview ? 0.94 : 1, uVig: current && !rig.inPov && !povPending ? 0.42 : overview ? 0.3 : 0.22, uBlur: rig.speed * 0.16 };
  for (const k of ['uGain', 'uVig', 'uBlur'] as const) {
    const next = k === 'uBlur' ? goal[k] : u[k].value + (goal[k] - u[k].value) * Math.min(1, dt * 4);
    if (Math.abs(next - u[k].value) > 0.0005) { u[k].value = next; dirty = true; } else if (u[k].value !== goal[k] && k !== 'uBlur') u[k].value = goal[k];
  }
  picker.flush();
  if (moved && !rig.moving) picker.refresh();
  if (moved || dirty) {
    if (water) (water.material.uniforms.time as { value: number }).value += dt * 0.6;
    renderer.info.reset();
    if (panos.alpha < 1) composer.render();
    if (panos.alpha > 0) { // the rendered seat view, drawn straight to the screen: it is already a finished photograph
      const tm = renderer.toneMapping; renderer.toneMapping = NoToneMapping; renderer.autoClear = false;
      renderer.setRenderTarget(null); panos.render(renderer, camera);
      renderer.autoClear = true; renderer.toneMapping = tm;
    }
    dirty = false; frames++;
    lastCalls = renderer.info.render.calls; lastTris = renderer.info.render.triangles;
  }
  if (now - statT > 1000) {
    fps = frames * 1000 / (now - statT); frames = 0; statT = now;
    if (stats) stats.textContent = `${fps.toFixed(0)} fps rendered · ${lastCalls} draw calls · ${(lastTris / 1e6).toFixed(2)}M tris`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  measureSheet();
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); resizePost(innerWidth, innerHeight);
  requestRender();
});

// Film grain: one small tile of noise, laid over the whole page at very low strength. It never animates, so it costs nothing per frame.
{
  const n = document.createElement('canvas'); n.width = n.height = 160;
  const g = n.getContext('2d')!, img = g.createImageData(160, 160);
  // each speck is black or white with its own strength, so the grain neither darkens nor lightens the page overall
  for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() < 0.5 ? 0 : 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = Math.random() * 255; }
  g.putImageData(img, 0, 0);
  const grain = document.createElement('div'); grain.className = 'grain'; grain.setAttribute('aria-hidden', 'true');
  grain.style.backgroundImage = `url(${n.toDataURL('image/png')})`;
  document.body.append(grain);
}

if (touchDevice) scene.traverse((o) => { const l = o as DirectionalLight; if (l.isDirectionalLight && l.castShadow) l.shadow.mapSize.set(2048, 2048); });
renderer.shadowMap.needsUpdate = true;
updateCrumbs();
$('loading').classList.add('is-done');

if (params.has('export')) Object.assign(window, { __exportAddons: async () => (await import('./dev/exportAddons')).exportAddons(scene) });

// For automated checks and the fps measurement.
Object.assign(window, { __arena: { bakedMeshes, panos, renderer, camera, rig, seats, data, picker, selectSeat, focusSection, enterPov, leavePov, cart, requestRender, get fps() { return fps; }, get calls() { return lastCalls; }, get tris() { return lastTris; } } });
