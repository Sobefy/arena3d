// Arena > Section 115 > Row E > Seat 7. Every level but the last is a button that zooms back out to it.
const $ = (id: string) => document.getElementById(id)!;

export interface Crumb { label: string; go?: () => void }

export function setCrumbs(crumbs: Crumb[]) {
  const nav = $('crumbs');
  nav.innerHTML = '';
  crumbs.forEach((c, i) => {
    if (i) { const sep = document.createElement('i'); sep.textContent = '›'; sep.setAttribute('aria-hidden', 'true'); nav.append(sep); }
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = c.label;
    if (i === crumbs.length - 1) b.setAttribute('aria-current', 'page');
    else if (c.go) b.addEventListener('click', c.go);
    nav.append(b);
  });
}
