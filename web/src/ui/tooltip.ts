// The small hover label that follows the pointer.
const el = () => document.getElementById('tooltip')!;

export function showTooltip(html: string, x: number, y: number) {
  const t = el();
  t.innerHTML = html; t.hidden = false;
  const w = t.offsetWidth, h = t.offsetHeight;
  const left = Math.min(x, innerWidth - w - 24), top = Math.min(y, innerHeight - h - 24);
  t.style.transform = `translate(${left + 14}px, ${top + 14}px)`;
}
/** Follows the pointer without rebuilding the label. */
export function moveTooltip(x: number, y: number) {
  const t = el();
  if (t.hidden) return;
  const left = Math.min(x, innerWidth - t.offsetWidth - 24), top = Math.min(y, innerHeight - t.offsetHeight - 24);
  t.style.transform = `translate(${left + 14}px, ${top + 14}px)`;
}
export function hideTooltip() { el().hidden = true; }
