// Cart: up to 8 seats, saved in localStorage. Checkout logs the payload.
import { usd } from '../data/tiers';
import type { CartSeat } from '../data/types';

export const MAX_SEATS = 8;
const KEY = 'bayfront-cart-v1';
const FEE = 0.12;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class Cart {
  items: CartSeat[] = [];
  private drawer = $('drawer');

  constructor(private colorOf: (section: string) => string, private nameOf: (section: string) => string, private onChange: (items: CartSeat[]) => void, private onRemove: (s: CartSeat) => void) {
    try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); if (Array.isArray(v)) this.items = v.slice(0, MAX_SEATS); } catch { /* storage unavailable */ }
    $('cartBtn').addEventListener('click', () => this.toggle());
    $('drawerClose').addEventListener('click', () => this.toggle(false));
    $('checkout').addEventListener('click', () => this.checkout());
    this.render();
  }

  has(s: Pick<CartSeat, 'section' | 'row' | 'seat'>) { return this.items.some((i) => same(i, s)); }
  get full() { return this.items.length >= MAX_SEATS; }

  add(s: CartSeat): boolean {
    if (this.has(s) || this.full) return false;
    this.items.push(s); this.commit(true); return true;
  }
  remove(s: Pick<CartSeat, 'section' | 'row' | 'seat'>) {
    const item = this.items.find((i) => same(i, s));
    if (!item) return;
    this.items = this.items.filter((i) => i !== item); this.commit(false);
    this.onRemove(item);
  }
  toggle(open = !this.drawer.classList.contains('is-open')) {
    this.drawer.classList.toggle('is-open', open); this.drawer.setAttribute('aria-hidden', String(!open));
  }

  private commit(bump: boolean) {
    try { localStorage.setItem(KEY, JSON.stringify(this.items)); } catch { /* ignore */ }
    this.render();
    if (bump) { const b = $('cartBtn'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
    this.onChange(this.items);
  }
  private render() {
    $('cartCount').textContent = String(this.items.length);
    const list = $('cartList');
    list.innerHTML = '';
    if (!this.items.length) list.innerHTML = '<li class="drawer__empty">No seats yet. Click a seat in the arena to add it.</li>';
    for (const it of this.items) {
      const li = document.createElement('li');
      li.innerHTML = `<i style="background:${this.colorOf(it.section)}"></i><div>${this.nameOf(it.section)}<small>Row ${it.row} · Seat ${it.seat}</small></div><b>${usd.format(it.price)}</b><button type="button" aria-label="Remove seat">×</button>`;
      li.querySelector('button')!.addEventListener('click', () => this.remove(it));
      list.append(li);
    }
    const sub = this.items.reduce((n, i) => n + i.price, 0), fees = Math.round(sub * FEE * 100) / 100;
    $('sumSub').textContent = usd.format(sub); $('sumFees').textContent = usd.format(fees); $('sumTotal').textContent = usd.format(sub + fees);
    $<HTMLButtonElement>('checkout').disabled = !this.items.length;
    $('cartNote').textContent = this.full ? 'That is the maximum of 8 seats per order.' : 'Up to 8 seats per order.';
  }
  private checkout() {
    const payload = this.items.map(({ section, row, seat, price }) => ({ section, row, seat, price }));
    console.log('[checkout]', payload);
    toast(`Checkout payload logged: ${payload.length} seat${payload.length === 1 ? '' : 's'}`);
  }
}
const same = (a: Pick<CartSeat, 'section' | 'row' | 'seat'>, b: Pick<CartSeat, 'section' | 'row' | 'seat'>) => a.section === b.section && a.row === b.row && a.seat === b.seat;

let toastTimer = 0;
export function toast(text: string) {
  const t = $('toast'); t.textContent = text; t.classList.add('is-on');
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => t.classList.remove('is-on'), 2400);
}
