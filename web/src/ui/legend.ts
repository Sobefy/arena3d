// Tier legend and price range. Picking a tier, or narrowing the price range, dims every other section.
import { TIER_COLORS, usd } from '../data/tiers';
import type { SeatsFile, TierId } from '../data/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class Legend {
  private tier: TierId | null = null;
  private min: number; private max: number;
  private lo: number; private hi: number;

  constructor(file: SeatsFile, private onFilter: (visible: (tier: TierId, price: number) => boolean, active: boolean) => void) {
    const tiers = (Object.entries(file.tiers) as [TierId, [string, number]][]).filter(([id]) => id !== 'X').sort((a, b) => b[1][1] - a[1][1]);
    const prices = tiers.map(([, [, p]]) => p);
    this.min = this.lo = Math.min(...prices); this.max = this.hi = Math.max(...prices);

    const list = $('tierList');
    for (const [id, [name, price]] of tiers) {
      const li = document.createElement('li');
      li.innerHTML = `<button type="button" aria-pressed="false"><i style="background:${TIER_COLORS[id]};color:${TIER_COLORS[id]}"></i><span>${name}</span><b>${usd.format(price).replace('.00', '')}</b></button>`;
      li.querySelector('button')!.addEventListener('click', () => { this.tier = this.tier === id ? null : id; this.apply(); });
      li.dataset.tier = id;
      list.append(li);
    }
    const lo = $<HTMLInputElement>('priceMin'), hi = $<HTMLInputElement>('priceMax');
    for (const r of [lo, hi]) { r.min = String(this.min); r.max = String(this.max); r.step = '5'; }
    lo.value = String(this.min); hi.value = String(this.max);
    const onRange = () => {
      let a = Number(lo.value), b = Number(hi.value);
      if (a > b) [a, b] = [b, a];
      this.lo = a; this.hi = b; this.apply();
    };
    lo.addEventListener('input', onRange); hi.addEventListener('input', onRange);
    $('legendReset').addEventListener('click', () => { this.tier = null; this.lo = this.min; this.hi = this.max; lo.value = String(this.min); hi.value = String(this.max); this.apply(); });
    $('legendToggle').addEventListener('click', () => {
      const el = $('legend'), collapsed = el.classList.toggle('is-collapsed');
      $('legendToggle').setAttribute('aria-expanded', String(!collapsed));
    });
    if (matchMedia('(max-width: 760px)').matches) { $('legend').classList.add('is-collapsed'); $('legendToggle').setAttribute('aria-expanded', 'false'); }
    this.apply();
  }

  private apply() {
    const active = this.tier !== null || this.lo > this.min || this.hi < this.max;
    $('rangeOut').textContent = `${usd.format(this.lo).replace('.00', '')} – ${usd.format(this.hi).replace('.00', '')}`;
    const list = $('tierList');
    list.classList.toggle('is-filtered', this.tier !== null);
    list.querySelectorAll<HTMLLIElement>('li').forEach((li) => li.querySelector('button')!.setAttribute('aria-pressed', String(li.dataset.tier === this.tier)));
    $('legendReset').hidden = !active;
    const { tier, lo, hi } = this;
    this.onFilter((t, p) => (tier === null || t === tier) && p >= lo && p <= hi, active);
  }
}
