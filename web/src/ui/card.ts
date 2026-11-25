// The seat card: opens on a seat click and updates in place (with a short crossfade) when another seat is picked.
import { TIER_COLORS, usd } from '../data/tiers';
import type { SectionData } from '../data/types';

export interface CardSeat {
  section: SectionData; tierName: string; row: string; seat: number;
  sold: boolean; inCart: boolean; cartFull: boolean;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const LEVEL: Record<string, string> = { '100': 'Lower', '300': 'Upper', FLOOR: 'Floor' };

export class SeatCard {
  private el = $('card');
  readonly thumb = $<HTMLCanvasElement>('cardThumb');
  private swapTimer = 0;
  open = false;

  constructor(handlers: { pov: () => void; add: () => void; close: () => void }) {
    $('btnPov').addEventListener('click', handlers.pov);
    $('btnAdd').addEventListener('click', handlers.add);
    $('cardClose').addEventListener('click', handlers.close);
  }

  show(s: CardSeat, inPov: boolean) {
    const fill = () => {
      const color = TIER_COLORS[s.section.tier];
      $('cardTier').innerHTML = `<i style="background:${color};color:${color}"></i>${s.tierName}`;
      $('cardSection').textContent = s.section.name;
      $('cardRow').textContent = s.row;
      $('cardSeat').textContent = String(s.seat);
      $('cardLevel').textContent = LEVEL[s.section.level] ?? s.section.level;
      $('cardPrice').textContent = usd.format(s.section.price);
      const badge = $('cardBadge');
      const [cls, text] = s.sold ? ['sold', 'Sold'] : s.inCart ? ['cart', 'In cart'] : s.section.status === 'side_view' ? ['side', 'Side view'] : ['available', 'Available'];
      badge.className = `badge badge--${cls}`; badge.textContent = text;
      $('cardNote').textContent = s.sold ? 'This seat is taken. Try a neighbouring seat.'
        : s.section.status === 'side_view' ? 'Partial side view of the stage.' : '';
      const add = $<HTMLButtonElement>('btnAdd');
      add.textContent = s.inCart ? 'Remove' : 'Add to cart';
      add.disabled = !s.inCart && s.cartFull;
      add.title = add.disabled ? 'Up to 8 seats per order' : '';
      $<HTMLButtonElement>('btnPov').textContent = inPov ? 'Back to arena' : 'View from seat';
      this.el.classList.toggle('is-sold', s.sold);
    };
    if (this.open) {
      // Already open: fade the content out, swap it, fade back in.
      clearTimeout(this.swapTimer);
      this.el.classList.add('is-swapping');
      this.swapTimer = window.setTimeout(() => { fill(); this.el.classList.remove('is-swapping'); }, 160);
    } else {
      fill();
      this.el.classList.add('is-open'); this.el.setAttribute('aria-hidden', 'false');
      this.open = true;
    }
  }
  setPovLabel(inPov: boolean) { $<HTMLButtonElement>('btnPov').textContent = inPov ? 'Back to arena' : 'View from seat'; }
  hide() {
    this.el.classList.remove('is-open'); this.el.setAttribute('aria-hidden', 'true'); this.open = false;
  }
  /** Copies RGBA pixels (bottom-up, from a render target) into the thumbnail canvas. */
  drawThumb(pixels: Uint8Array, w: number, h: number) {
    const ctx = this.thumb.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(pixels.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    ctx.putImageData(img, 0, 0);
  }
}
