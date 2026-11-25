// Camera: free orbit with damping, tweens between poses, and the seat point-of-view mode (look around in place).
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CameraPose } from '../data/types';

const FLOOR_Y = 0.6;      // the camera never goes below this
// The camera stays over the bowl: inside the outer wall up to the roof line, then a widening cone above it for the overview.
const INSIDE = { rx: 66, rz: 54, top: 320 }; // high enough for a tall phone screen to take in the whole bowl
export const ROOF_LINE = 30.5; // above this the roof is taken away
const TARGET = { rx: 70, rz: 58, top: 30 };  // what it orbits around stays within the stands
/** The starting view: high over the end opposite the stage, looking down into the whole bowl. */
export const HOME_POSE: CameraPose = { pos: [-88, 104, 0], target: [-3, 0, 0] };
function clampEllipse(v: Vector3, e: { rx: number; rz: number; top: number }, minY: number): boolean {
  const grow = Math.max(0, v.y - 29.5) * 0.95; // room to pull back once above the roof
  const k = Math.hypot(v.x / (e.rx + grow), v.z / (e.rz + grow));
  const y = MathUtils.clamp(v.y, minY, e.top);
  if (k <= 1 && y === v.y) return false;
  if (k > 1) { v.x /= k; v.z /= k; }
  v.y = y;
  return true;
}
const ORBIT_FOV = 50;
const POV_FOV = 70;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

interface Tween { from: { pos: Vector3; target: Vector3; fov: number }; to: { pos: Vector3; target: Vector3; fov: number }; t0: number; dur: number; done?: () => void }

export class CameraRig {
  readonly controls: OrbitControls;
  private tween: Tween | null = null;
  private saved: { pos: Vector3; target: Vector3; fov: number } | null = null;
  /** In POV mode: where the eye is, and the look direction as yaw and pitch (radians). */
  pov: { eye: Vector3; yaw: number; pitch: number } | null = null;
  private drag: { x: number; y: number; yaw: number; pitch: number } | null = null;
  /** 0 at rest, up to 1 mid-flight between two views. Drives the motion blur. */
  speed = 0;
  /** Lets the camera leave the bowl (used with the outside of the venue switched on). */
  free = false;
  /** While a pre-rendered panorama is showing: how far the view may turn from its centre line, and tilt. */
  povLimit: { heading: number; yawRange: number; pitch: [number, number] } | null = null;

  constructor(readonly camera: PerspectiveCamera, dom: HTMLElement, private onChange: () => void) {
    const c = new OrbitControls(camera, dom);
    c.enableDamping = true; c.dampingFactor = 0.08;
    c.minDistance = 2; c.maxDistance = 340;
    c.maxPolarAngle = Math.PI * 0.495;
    c.zoomToCursor = true;
    c.screenSpacePanning = true;
    c.addEventListener('change', onChange);
    this.controls = c;

    // POV look-around: rotation only, pitch clamped.
    dom.addEventListener('pointerdown', (e) => { if (this.pov && !this.tween) this.drag = { x: e.clientX, y: e.clientY, yaw: this.pov.yaw, pitch: this.pov.pitch }; });
    addEventListener('pointermove', (e) => {
      if (!this.drag || !this.pov) return;
      const k = 0.0042 * (POV_FOV / 70);
      this.pov.yaw = this.drag.yaw - (e.clientX - this.drag.x) * k;
      this.pov.pitch = MathUtils.clamp(this.drag.pitch + (e.clientY - this.drag.y) * k, -0.75, 0.55);
      this.applyPov(); onChange();
    });
    addEventListener('pointerup', () => { this.drag = null; });
  }

  get moving() { return !!this.tween || !!this.drag; }
  get inPov() { return !!this.pov; }

  setPose(p: CameraPose) {
    this.camera.position.set(...p.pos); this.controls.target.set(...p.target); this.controls.update();
  }

  /** Glides to a pose. Orbit stays available afterwards (and during, the tween simply wins). */
  tweenTo(pos: Vector3, target: Vector3, dur = 1.1, fov = ORBIT_FOV, done?: () => void) {
    this.tween = {
      from: { pos: this.camera.position.clone(), target: this.currentTarget(), fov: this.camera.fov },
      to: { pos: pos.clone(), target: target.clone(), fov }, t0: performance.now(), dur: dur * 1000, done,
    };
    this.onChange();
  }
  tweenToPose(p: CameraPose, dur?: number, done?: () => void) {
    this.exitPovState();
    this.tweenTo(new Vector3(...p.pos), new Vector3(...p.target), dur, ORBIT_FOV, done);
  }

  /** Into a seat's point of view, remembering the orbit camera to come back to. */
  enterPov(eye: Vector3, lookAt: Vector3, dur = 1.2) {
    if (!this.pov) this.saved = { pos: this.camera.position.clone(), target: this.controls.target.clone(), fov: this.camera.fov };
    const d = lookAt.clone().sub(eye).normalize();
    const yaw = Math.atan2(d.x, d.z), pitch = Math.asin(MathUtils.clamp(d.y, -1, 1));
    this.controls.enabled = false;
    this.tweenTo(eye, lookAt, dur, POV_FOV, () => { this.pov = { eye: eye.clone(), yaw, pitch }; this.applyPov(); });
    this.pov = null;
  }
  exitPov(dur = 1.0) {
    const back = this.saved;
    this.exitPovState();
    if (back) this.tweenTo(back.pos, back.target, dur, back.fov);
  }
  private exitPovState() {
    this.pov = null; this.drag = null; this.controls.enabled = true;
  }

  applyPov() {
    if (!this.pov) return;
    if (this.povLimit) { // stay inside what was rendered
      const L = this.povLimit, d = Math.atan2(Math.sin(this.pov.yaw - L.heading), Math.cos(this.pov.yaw - L.heading));
      this.pov.yaw = L.heading + MathUtils.clamp(d, -L.yawRange, L.yawRange);
      this.pov.pitch = MathUtils.clamp(this.pov.pitch, L.pitch[0], L.pitch[1]);
    }
    const { eye, yaw, pitch } = this.pov;
    const dir = new Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    this.camera.position.copy(eye);
    this.camera.lookAt(eye.clone().add(dir));
  }
  private currentTarget() {
    if (this.pov || !this.controls.enabled) {
      const dir = this.camera.getWorldDirection(new Vector3());
      return this.camera.position.clone().add(dir.multiplyScalar(this.camera.position.distanceTo(this.controls.target) || 10));
    }
    return this.controls.target.clone();
  }

  /** Call every frame. Returns true when the camera moved (so the frame needs drawing). */
  update(now: number): boolean {
    if (this.tween) {
      const { from, to, t0, dur, done } = this.tween;
      const t = Math.min(1, (now - t0) / dur), e = easeInOut(t);
      const far = Math.min(1, from.pos.distanceTo(to.pos) / 25); // short hops barely blur
      this.speed = t >= 1 ? 0 : Math.sin(Math.PI * t) ** 2 * far;
      this.camera.position.lerpVectors(from.pos, to.pos, e);
      const target = from.target.clone().lerp(to.target, e);
      this.camera.fov = MathUtils.lerp(from.fov, to.fov, e); this.camera.updateProjectionMatrix();
      this.camera.lookAt(target);
      if (this.controls.enabled) this.controls.target.copy(target);
      if (t >= 1) { this.tween = null; if (this.controls.enabled) this.controls.update(); done?.(); }
      return true;
    }
    if (this.pov) return false;
    const moved = this.controls.update();
    if (this.free) return moved;
    const a = clampEllipse(this.controls.target, TARGET, 0), b = clampEllipse(this.camera.position, INSIDE, FLOOR_Y);
    if (a || b) this.camera.lookAt(this.controls.target);
    return moved;
  }
}
