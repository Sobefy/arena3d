// Pointer picking: hover (once per frame at most) and click, where a press that moved more than 5 px is a drag.
import { Raycaster, Vector2, type Camera, type Mesh } from 'three';
import type { SeatRef } from '../data/types';
import type { SeatLayer } from '../scene/seats';

export type Pick =
  | { kind: 'seat'; ref: SeatRef; distance: number }
  | { kind: 'section'; section: number; distance: number }
  | null;

/** Seats are only pickable within this distance; further out a click means "this section". */
export const SEAT_PICK_DISTANCE = 42;

export class Picker {
  private raycaster = new Raycaster();
  private ndc = new Vector2();
  private down: { x: number; y: number; id: number } | null = null;
  private pending: PointerEvent | null = null;
  pointer = { x: 0, y: 0, inside: false };

  constructor(
    private dom: HTMLElement,
    private camera: Camera,
    private seats: SeatLayer,
    private sectionMeshes: Mesh[],
    private sectionOf: Map<Mesh, number>,
    private handlers: { hover: (p: Pick) => void; click: (p: Pick) => void },
  ) {
    dom.addEventListener('pointerdown', (e) => { if (e.isPrimary) this.down = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
    dom.addEventListener('pointermove', (e) => {
      this.pointer = { x: e.clientX, y: e.clientY, inside: true };
      if (e.pointerType === 'mouse' && !(e.buttons & 1)) this.pending = e; // no hover while dragging or on touch
    });
    dom.addEventListener('pointerleave', () => { this.pointer.inside = false; this.pending = null; handlers.hover(null); });
    dom.addEventListener('pointerup', (e) => {
      const d = this.down; this.down = null;
      if (!d || d.id !== e.pointerId || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
      handlers.click(this.pick(e.clientX, e.clientY));
    });
    dom.addEventListener('pointercancel', () => { this.down = null; });
  }

  /** Runs the latest queued hover pick. Call once per animation frame. */
  flush() {
    if (!this.pending) return;
    const e = this.pending; this.pending = null;
    this.handlers.hover(this.pick(e.clientX, e.clientY));
  }
  /** Re-test what is under a still pointer (after the camera moved). */
  refresh() {
    if (this.pointer.inside && !this.down) this.handlers.hover(this.pick(this.pointer.x, this.pointer.y));
  }

  pick(x: number, y: number): Pick {
    const r = this.dom.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const seat = this.seats.pick(this.raycaster.ray, SEAT_PICK_DISTANCE);
    if (seat) return { kind: 'seat', ...seat };
    const hit = this.raycaster.intersectObjects(this.sectionMeshes, false)[0];
    if (hit) {
      const section = this.sectionOf.get(hit.object as Mesh);
      if (section != null && this.seats.isSelectable(section)) return { kind: 'section', section, distance: hit.distance };
    }
    return null;
  }
}
