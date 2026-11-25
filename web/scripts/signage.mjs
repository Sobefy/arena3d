// Draws every signage / artwork texture for the arena with the browser's canvas and saves them as PNG files.
// All brand names are invented for this project. Usage: node signage.mjs <outdir> <seats.json>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const [OUT, SEATS] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const sections = JSON.parse(fs.readFileSync(SEATS, 'utf8')).sections.filter((s) => s.level !== 'FLOOR').map((s) => ({ id: s.id, level: s.level }));

const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const p = await b.newPage();
await p.setContent('<html><body></body></html>');

const files = await p.evaluate((sections) => {
  const C = { violet: '#3B146B', purple: '#7B208F', magenta: '#C9349B', coralPink: '#F36A78', coral: '#F87572', orange: '#FF9B55', yellow: '#FFB458', navy: '#0C1238', ink: '#05081A', white: '#FFF8EE', blue: '#1F5FE0' };
  const HEAVY = '"Arial Black", "Helvetica Neue", Impact, sans-serif', COND = 'Impact, "Arial Narrow Bold", "Helvetica Neue", sans-serif', SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  const out = {};
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const grad = (g, x, y, w, h, stops, horiz = false) => { const gr = horiz ? g.createLinearGradient(x, 0, x + w, 0) : g.createLinearGradient(0, y, 0, y + h); stops.forEach((s, i) => gr.addColorStop(i / (stops.length - 1), s)); g.fillStyle = gr; g.fillRect(x, y, w, h); };
  const fit = (g, text, maxW, size, font, weight = '900', italic = false) => { do { g.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`; size -= 2; } while (g.measureText(text).width > maxW && size > 8); };
  const text = (g, t, x, y, maxW, size, font, color, opts = {}) => { fit(g, t, maxW, size, font, opts.weight, opts.italic); g.fillStyle = color; g.textAlign = opts.align || 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y); };
  const sun = (g, x, y, r) => { const gr = g.createLinearGradient(0, y - r, 0, y + r); gr.addColorStop(0, C.yellow); gr.addColorStop(0.55, C.coralPink); gr.addColorStop(1, C.magenta); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(12,18,56,0.85)'; for (let i = 0; i < 5; i++) g.fillRect(x - r, y + r * (0.15 + i * 0.18), r * 2, r * (0.035 + i * 0.012)); };
  const palm = (g, x, y, s, col) => { g.strokeStyle = col; g.lineWidth = s * 0.06; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + s * 0.12, y - s * 0.5, x + s * 0.05, y - s); g.stroke(); for (let i = 0; i < 7; i++) { const a = -Math.PI * (0.05 + i * 0.15); g.beginPath(); g.moveTo(x + s * 0.05, y - s); g.quadraticCurveTo(x + s * 0.05 + Math.cos(a) * s * 0.3, y - s - Math.sin(-a) * s * 0.35, x + s * 0.05 + Math.cos(a) * s * 0.5, y - s + s * 0.12 - Math.sin(-a) * s * 0.18); g.stroke(); } };
  const frame = (g, x, y, w, h, col, lw = 4) => { g.strokeStyle = col; g.lineWidth = lw; g.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw); };

  // Invented sponsors: name, tagline, colours.
  const BRANDS = [
    ['PALMOJO', 'real fruit, really', C.orange, C.navy], ['FIZZBERG', 'the cold one', C.blue, C.white], ['NIMBLO', 'mobile, minus the fuss', C.magenta, C.white],
    ['OTTERLINE', 'airways', C.navy, C.yellow], ['GRIDWAVE', 'home energy', C.violet, C.coralPink], ['SUNDIAL TRUST', 'banking since sunrise', C.yellow, C.navy],
    ['KOALA KRUNCH', 'snack loudly', C.coralPink, C.navy], ['VOLTARA', 'electric drives', C.ink, C.orange], ['DOCKSIDE DRIP', 'coffee roasters', C.purple, C.yellow],
    ['TACO TIDE', 'fresh off the plancha', C.coral, C.white],
  ];
  const ad = (g, x, y, w, h, i) => {
    const [name, tag, bg, fg] = BRANDS[i % BRANDS.length];
    g.fillStyle = bg; g.fillRect(x, y, w, h); grad(g, x, y, w, h, ['rgba(255,255,255,0.12)', 'rgba(0,0,0,0.28)']);
    g.fillStyle = fg; g.globalAlpha = 0.16; g.beginPath(); g.arc(x + w * 0.86, y + h * 0.2, h * 0.7, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    text(g, name, x + w / 2, y + h * 0.42, w * 0.86, h * 0.5, i % 2 ? COND : HEAVY, fg, { italic: i % 3 === 0 });
    text(g, tag, x + w / 2, y + h * 0.78, w * 0.8, h * 0.17, SANS, fg, { weight: '500' });
    frame(g, x, y, w, h, 'rgba(255,255,255,0.18)', Math.max(2, h * 0.02));
  };

  // 1. Section signs: one tile per section, 8 x 8 grid.
  { const [c, g] = mk(2048, 1024), TW = 256, TH = 128;
    for (let i = 0; i < 64; i++) { const x = (i % 8) * TW, y = Math.floor(i / 8) * TH, s = sections[i];
      const lower = !s || s.level === '100'; g.fillStyle = C.navy; g.fillRect(x, y, TW, TH); grad(g, x, y, TW, TH, [lower ? 'rgba(201,52,155,0.55)' : 'rgba(255,155,85,0.5)', 'rgba(12,18,56,0)'], true);
      g.fillStyle = lower ? C.magenta : C.orange; g.fillRect(x, y, 14, TH);
      text(g, 'SECTION', x + 30, y + 30, 150, 26, SANS, C.white, { align: 'left', weight: '700' });
      text(g, s ? s.id : 'INFO', x + 28, y + 82, 150, 74, HEAVY, C.white, { align: 'left' });
      text(g, lower ? 'LOWER' : 'UPPER', x + TW - 14, y + 30, 70, 18, SANS, C.yellow, { align: 'right', weight: '700' });
      g.fillStyle = C.yellow; g.beginPath(); g.moveTo(x + TW - 60, y + 96); g.lineTo(x + TW - 22, y + 96); g.lineTo(x + TW - 41, y + 64); g.fill(); // arrow up
      frame(g, x, y, TW, TH, 'rgba(255,255,255,0.25)', 3); }
    out['sig_sections.png'] = c.toDataURL(); }

  // 2. Exit sign.
  { const [c, g] = mk(256, 128); g.fillStyle = '#0b5a2a'; g.fillRect(0, 0, 256, 128); frame(g, 0, 0, 256, 128, '#d8ffe6', 6);
    text(g, 'EXIT', 104, 68, 150, 88, HEAVY, '#eafff1'); g.fillStyle = '#eafff1'; g.beginPath(); g.moveTo(190, 40); g.lineTo(236, 64); g.lineTo(190, 88); g.fill(); g.fillRect(170, 56, 26, 16);
    out['sig_exit.png'] = c.toDataURL(); }

  // 3. Menu boards: 4 x 2 tiles of 512 x 256.
  { const [c, g] = mk(2048, 512);
    const stands = [['TACO TIDE', ['Baja fish taco  9', 'Carnitas bowl  12', 'Street corn  6', 'Agua fresca  5'], C.coral], ['SLICE HARBOR', ['Cheese slice  6', 'Pepperoni slice  7', 'Garlic knots  5', 'Whole pie  28'], C.orange],
      ['FROZEN PELICAN', ['Soft serve  6', 'Mango swirl  7', 'Sundae boat  9', 'Float  7'], C.coralPink], ['DOCKSIDE DRIP', ['Cold brew  5', 'Cortado  4', 'Cubano  5', 'Pastelito  4'], C.purple],
      ['BAYFRONT GRILL', ['Smash burger  13', 'Hot dog  8', 'Fries  6', 'Chicken tenders  12'], C.magenta], ['FIZZBERG BAR', ['Fizzberg cola  5', 'Palmojo juice  6', 'Draft pint  11', 'Water  4'], C.blue],
      ['KOALA KRUNCH', ['Popcorn tub  8', 'Pretzel  7', 'Nachos  9', 'Candy  5'], C.yellow], ['TEAM STORE', ['Jerseys', 'Caps', 'Scarves', 'Level 1, Gate B'], C.violet]];
    stands.forEach(([name, items, col], i) => { const x = (i % 4) * 512, y = Math.floor(i / 4) * 256;
      g.fillStyle = C.ink; g.fillRect(x, y, 512, 256); grad(g, x, y, 512, 256, ['rgba(255,255,255,0.07)', 'rgba(0,0,0,0)']);
      g.fillStyle = col; g.fillRect(x, y, 512, 58); text(g, name, x + 256, y + 31, 470, 40, HEAVY, col === C.yellow ? C.navy : C.white);
      items.forEach((it, k) => { const m = it.match(/^(.*?)\s{2,}(\d+)$/); const yy = y + 92 + k * 40;
        text(g, m ? m[1] : it, x + 30, yy, 330, 27, SANS, C.white, { align: 'left', weight: '600' });
        if (m) text(g, '$' + m[2], x + 482, yy, 90, 27, SANS, C.yellow, { align: 'right', weight: '700' });
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 30, yy + 19, 452, 1); });
      frame(g, x, y, 512, 256, 'rgba(255,255,255,0.2)', 4); });
    out['sig_menus.png'] = c.toDataURL(); }

  // 4. Rafter banners: 8 portrait tiles of 256 x 512.
  { const [c, g] = mk(2048, 512);
    const b8 = [['HOME', 'COURT', C.magenta], ['BAYFRONT', 'ARENA', C.navy], ['SEASON', 'OPENER', C.orange], ['NO. 7', 'RETIRED', C.violet], ['SOLD', 'OUT', C.coralPink], ['BAY', 'NIGHTS', C.purple], ['NO. 23', 'RETIRED', C.navy], ['EST.', 'BAYFRONT', C.white]];
    b8.forEach(([a, bb, col], i) => { const x = i * 256, fg = col === C.white ? C.navy : C.white;
      g.fillStyle = col; g.fillRect(x, 0, 256, 512); grad(g, x, 0, 256, 512, ['rgba(255,255,255,0.14)', 'rgba(0,0,0,0.3)']);
      g.fillStyle = C.yellow; g.fillRect(x + 18, 18, 220, 8); g.fillRect(x + 18, 486, 220, 8);
      sun(g, x + 128, 150, 70); text(g, a, x + 128, 300, 210, 80, COND, fg); text(g, bb, x + 128, 380, 210, 80, COND, col === C.white ? C.magenta : C.yellow);
      text(g, 'BAYFRONT ARENA', x + 128, 452, 200, 18, SANS, fg, { weight: '700' }); });
    out['sig_rafter.png'] = c.toDataURL(); }

  // 5. Facade banners: 10 tall tiles (about 1:5), lettering stacked.
  { const [c, g] = mk(2040, 1024), TW = 204;
    for (let i = 0; i < 10; i++) { const x = i * TW; const [name, , bg, fg] = BRANDS[i]; const event = i % 2 === 0;
      g.fillStyle = event ? [C.magenta, C.violet, C.navy, C.purple, C.coralPink][i / 2] : bg; g.fillRect(x, 0, TW, 1024); grad(g, x, 0, TW, 1024, ['rgba(255,255,255,0.12)', 'rgba(0,0,0,0.35)']);
      const col = event ? C.white : fg, word = event ? ['BAYFRONT', 'GAME NIGHT', 'LIVE HERE', 'BAY NIGHTS', 'TIP-OFF'][i / 2] : name;
      if (event) sun(g, x + TW / 2, 150, 66); else { g.fillStyle = fg; g.globalAlpha = 0.2; g.beginPath(); g.arc(x + TW / 2, 150, 70, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
      g.save(); g.translate(x + TW / 2, 600); g.rotate(-Math.PI / 2); text(g, word, 0, 6, 640, 130, HEAVY, col); g.restore();
      text(g, event ? 'BAYFRONT ARENA' : 'OFFICIAL PARTNER', x + TW / 2, 985, TW - 24, 18, SANS, col, { weight: '700' });
      frame(g, x, 0, TW, 1024, 'rgba(255,255,255,0.2)', 5); }
    out['sig_facade.png'] = c.toDataURL(); }

  // 6. Speaker grille (tileable 512): perforated steel with a maker's badge.
  { const [c, g] = mk(512, 512); g.fillStyle = '#0d0e12'; g.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 12) for (let x = (y / 12) % 2 ? 6 : 0; x < 512; x += 12) { g.fillStyle = '#23262e'; g.beginPath(); g.arc(x + 3, y + 3, 3.4, 0, Math.PI * 2); g.fill(); g.fillStyle = '#050608'; g.beginPath(); g.arc(x + 3.6, y + 3.6, 2.2, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = '#2f333d'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 502);
    g.fillStyle = '#1a1c22'; g.fillRect(166, 430, 180, 46); frame(g, 166, 430, 180, 46, '#555b68', 3); text(g, 'ORCA AUDIO', 256, 454, 160, 26, HEAVY, '#c9ced8');
    out['sig_grille.png'] = c.toDataURL(); }

  // 7. Rigging panel (tileable 1024 x 512): dark sheet metal, seams, rivets, stencilled wording.
  { const [c, g] = mk(1024, 512); g.fillStyle = '#14161c'; g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.035})`; g.fillRect(rnd() * 1024, rnd() * 512, 40 + rnd() * 90, 1); }
    g.strokeStyle = '#06070a'; g.lineWidth = 4; for (const x of [0, 512]) g.strokeRect(x + 2, 2, 508, 508);
    for (const x of [0, 512]) for (const [dx, dy] of [[20, 20], [492, 20], [20, 492], [492, 492], [256, 20], [256, 492]]) { g.fillStyle = '#3a3e49'; g.beginPath(); g.arc(x + dx, dy, 6, 0, Math.PI * 2); g.fill(); }
    text(g, 'BAYFRONT ARENA', 256, 230, 440, 54, COND, 'rgba(255,180,88,0.8)'); text(g, 'RIGGING  ·  LOAD 500 KG', 256, 292, 420, 26, SANS, 'rgba(255,255,255,0.5)', { weight: '700' });
    for (let k = 0; k < 9; k++) { g.fillStyle = k % 2 ? '#14161c' : '#FFB458'; g.beginPath(); g.moveTo(560 + k * 46, 440); g.lineTo(606 + k * 46, 440); g.lineTo(580 + k * 46, 480); g.lineTo(534 + k * 46, 480); g.fill(); }
    text(g, 'CAMERA DECK', 768, 220, 420, 60, COND, 'rgba(255,255,255,0.75)'); text(g, 'BROADCAST CREW ONLY', 768, 286, 400, 26, SANS, 'rgba(243,106,120,0.9)', { weight: '700' });
    out['sig_rigpanel.png'] = c.toDataURL(); }

  // 8. Flight case (tileable 512): ribbed black laminate, alloy edges, stencil.
  { const [c, g] = mk(512, 512); g.fillStyle = '#101114'; g.fillRect(0, 0, 512, 512);
    for (let x = 0; x < 512; x += 16) { g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(x, 0, 6, 512); }
    g.strokeStyle = '#8b909c'; g.lineWidth = 14; g.strokeRect(7, 7, 498, 498); for (const [x, y] of [[26, 26], [486, 26], [26, 486], [486, 486]]) { g.fillStyle = '#c3c7d0'; g.beginPath(); g.arc(x, y, 18, 0, Math.PI * 2); g.fill(); }
    text(g, 'FRONT OF HOUSE', 256, 210, 420, 60, COND, 'rgba(255,255,255,0.85)'); text(g, 'CASE 04 / 12  ·  THIS WAY UP', 256, 280, 400, 26, SANS, C.yellow, { weight: '700' });
    g.fillStyle = C.yellow; g.beginPath(); g.moveTo(256, 330); g.lineTo(296, 390); g.lineTo(216, 390); g.fill();
    out['sig_case.png'] = c.toDataURL(); }

  // 9. Stage drape (tileable 1024 x 512): black pleats with a step-and-repeat of the tour name.
  { const [c, g] = mk(1024, 512); for (let x = 0; x < 1024; x += 32) grad(g, x, 0, 32, 512, ['#050507', '#1b1c24', '#050507'], true);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 2; k++) { const x = 256 + k * 512 + (r % 2 ? 256 : 0), y = 64 + r * 128;
      text(g, r % 2 ? 'BAY NIGHTS LIVE' : 'NEON NIGHTS TOUR', x % 1024, y, 440, 44, COND, r % 2 ? 'rgba(255,180,88,0.8)' : 'rgba(243,106,120,0.85)'); if (x > 1024 - 230) text(g, r % 2 ? 'BAY NIGHTS LIVE' : 'NEON NIGHTS TOUR', (x % 1024) - 1024, y, 440, 44, COND, 'rgba(255,180,88,0.8)'); }
    out['sig_drape.png'] = c.toDataURL(); }

  // 10. Tunnel portal: a lit passage with an overhead sign.
  { const [c, g] = mk(512, 256); const gr = g.createRadialGradient(256, 150, 10, 256, 150, 300); gr.addColorStop(0, '#5a4636'); gr.addColorStop(0.4, '#1d1a22'); gr.addColorStop(1, '#050508'); g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
    g.fillStyle = 'rgba(255,220,170,0.5)'; g.beginPath(); g.moveTo(206, 256); g.lineTo(306, 256); g.lineTo(276, 120); g.lineTo(236, 120); g.fill();
    g.fillStyle = C.navy; g.fillRect(96, 22, 320, 62); frame(g, 96, 22, 320, 62, C.yellow, 4); text(g, 'CONCOURSE', 256, 46, 290, 30, HEAVY, C.white); text(g, 'FOOD  ·  RESTROOMS  ·  EXITS', 256, 70, 290, 16, SANS, C.yellow, { weight: '700' });
    for (let k = 0; k < 12; k++) { g.fillStyle = k % 2 ? '#111' : C.yellow; g.fillRect(k * 43, 244, 43, 12); }
    out['sig_tunnel.png'] = c.toDataURL(); }

  // 11. Wayfinding band (repeats along the wall).
  { const [c, g] = mk(2048, 128); grad(g, 0, 0, 2048, 128, [C.magenta, C.purple]); g.fillStyle = C.yellow; g.fillRect(0, 0, 2048, 8); g.fillRect(0, 120, 2048, 8);
    ['SECTIONS 101 – 126', 'FOOD HALL', 'RESTROOMS', 'TEAM STORE'].forEach((t, i) => { const x = i * 512; g.fillStyle = C.white; g.beginPath(); g.moveTo(x + 40, 44); g.lineTo(x + 84, 64); g.lineTo(x + 40, 84); g.fill(); text(g, t, x + 104, 66, 380, 50, COND, C.white, { align: 'left' }); });
    out['sig_wayfinding.png'] = c.toDataURL(); }

  // 12. LED ticker band: sponsors and house messages on a dark dot matrix.
  { const [c, g] = mk(2048, 128); g.fillStyle = '#07060f'; g.fillRect(0, 0, 2048, 128);
    ['PALMOJO', 'WELCOME TO BAYFRONT ARENA', 'FIZZBERG', 'NEXT HOME GAME  ·  SAT DEC 19', 'NIMBLO', 'OTTERLINE AIRWAYS'].forEach((t, i) => text(g, t, 170 + i * 341, 66, 320, 54, COND, [C.orange, C.white, C.coralPink, C.yellow, C.magenta, C.white][i]));
    g.fillStyle = 'rgba(0,0,0,0.35)'; for (let y = 0; y < 128; y += 4) g.fillRect(0, y, 2048, 1); for (let x = 0; x < 2048; x += 4) g.fillRect(x, 0, 1, 128);
    out['sig_ticker.png'] = c.toDataURL(); }

  // 13. Lobby mural: sunset over the bay with a welcome line.
  { const [c, g] = mk(2048, 512); grad(g, 0, 0, 2048, 512, [C.violet, C.purple, C.magenta, C.coralPink, C.orange, C.yellow]); sun(g, 1024, 330, 190);
    g.fillStyle = C.navy; g.beginPath(); g.moveTo(0, 512); for (let x = 0; x <= 2048; x += 32) { const hgt = 60 + (Math.sin(x * 0.013) + 1) * 26 + ((x * 7919) % 97); g.lineTo(x, 512 - (x > 760 && x < 1290 ? 40 : hgt)); g.lineTo(x + 32, 512 - (x > 760 && x < 1290 ? 40 : hgt)); } g.lineTo(2048, 512); g.fill();
    for (const [x, s] of [[150, 300], [330, 240], [1700, 310], [1890, 250], [560, 200], [1490, 210]]) palm(g, x, 512, s, C.navy);
    text(g, 'WELCOME TO BAYFRONT ARENA', 1024, 92, 1700, 110, HEAVY, C.white); text(g, 'GATES A – D   ·   BOX OFFICE   ·   TEAM STORE', 1024, 172, 1300, 40, SANS, C.navy, { weight: '700' });
    out['sig_mural.png'] = c.toDataURL(); }

  // 14. Canopy soffit (tileable): timber slats with recessed strip lights.
  { const [c, g] = mk(512, 512); for (let x = 0; x < 512; x += 32) { grad(g, x, 0, 28, 512, ['#8a5a3c', '#a9714b', '#7a4d32'], true); g.fillStyle = '#1a0f0a'; g.fillRect(x + 28, 0, 4, 512); }
    for (const y of [120, 376]) { const gr = g.createLinearGradient(0, y - 40, 0, y + 40); gr.addColorStop(0, 'rgba(255,214,160,0)'); gr.addColorStop(0.5, 'rgba(255,226,180,0.95)'); gr.addColorStop(1, 'rgba(255,214,160,0)'); g.fillStyle = gr; g.fillRect(0, y - 40, 512, 80); }
    out['sig_soffit.png'] = c.toDataURL(); }

  // 15. Hazard ramp (tileable) and barricade panel.
  { const [c, g] = mk(512, 256); g.fillStyle = '#17181c'; g.fillRect(0, 0, 512, 256); for (let k = -4; k < 14; k++) { g.fillStyle = C.yellow; g.beginPath(); g.moveTo(k * 64, 0); g.lineTo(k * 64 + 32, 0); g.lineTo(k * 64 + 96, 64); g.lineTo(k * 64 + 64, 64); g.fill(); g.beginPath(); g.moveTo(k * 64 + 64, 192); g.lineTo(k * 64 + 96, 192); g.lineTo(k * 64 + 32, 256); g.lineTo(k * 64, 256); g.fill(); }
    text(g, 'CABLE CROSSING  ·  STEP OVER', 256, 130, 470, 44, COND, C.white); out['sig_hazard.png'] = c.toDataURL(); }
  { const [c, g] = mk(1024, 128); grad(g, 0, 0, 1024, 128, ['#b9bec8', '#8d929d', '#b3b8c2']); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.12})`; g.fillRect(rnd() * 1024, rnd() * 128, 60 + rnd() * 120, 1); }
    g.fillStyle = C.navy; g.fillRect(40, 26, 944, 76); text(g, 'BAYFRONT ARENA  ·  EVENT STAFF ONLY', 512, 66, 880, 46, COND, C.yellow); for (const x of [14, 1010]) for (const y of [14, 114]) { g.fillStyle = '#5c616c'; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill(); }
    out['sig_barricade.png'] = c.toDataURL(); }

  // 16. Suite partition art: 4 x 2 tiles of 512 x 256. Timber panelling, a wash of light from above, shade at the floor, a framed print and the suite number.
  { const [c, g] = mk(2048, 512);
    for (let i = 0; i < 8; i++) { const x = (i % 4) * 512, y = Math.floor(i / 4) * 256;
      for (let k = 0; k < 8; k++) { grad(g, x + k * 64, y, 62, 256, ['#7c4a2f', '#96603f', '#6d4129'], true); g.fillStyle = '#2a170e'; g.fillRect(x + k * 64 + 62, y, 2, 256); }
      for (let k = 0; k < 140; k++) { g.fillStyle = `rgba(40,20,8,${0.05 + rnd() * 0.08})`; g.fillRect(x + rnd() * 512, y + rnd() * 256, 1, 20 + rnd() * 60); }
      const w = g.createRadialGradient(x + 256, y - 20, 10, x + 256, y - 20, 300); w.addColorStop(0, 'rgba(255,214,160,0.85)'); w.addColorStop(0.5, 'rgba(255,190,130,0.25)'); w.addColorStop(1, 'rgba(255,190,130,0)'); g.fillStyle = w; g.fillRect(x, y, 512, 256);
      grad(g, x, y + 150, 512, 106, ['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)']); grad(g, x, y, 60, 256, ['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)'], true); grad(g, x + 452, y, 60, 256, ['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)'], true);
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x + 186, y + 66, 150, 104); g.fillStyle = '#e9dcc8'; g.fillRect(x + 180, y + 58, 150, 104);
      const pg = g.createLinearGradient(0, y + 66, 0, y + 154); [[C.violet, C.magenta, C.orange], [C.navy, C.blue, C.coralPink], [C.purple, C.coralPink, C.yellow], [C.navy, C.purple, C.magenta]][i % 4].forEach((s, k) => pg.addColorStop(k / 2, s)); g.fillStyle = pg; g.fillRect(x + 188, y + 66, 134, 88);
      if (i % 2) palm(g, x + 232, y + 154, 66, C.navy); else sun(g, x + 255, y + 122, 26);
      text(g, 'SUITE ' + String(i + 1).padStart(2, '0'), x + 430, y + 44, 130, 30, HEAVY, 'rgba(255,236,205,0.9)'); }
    out['sig_suite.png'] = c.toDataURL(); }

  // 17. Suite back wall (repeats every 4.6 m along the ring): slatted timber, a wall-wash cone from a ceiling light, shade into the corners and down to the floor.
  { const [c, g] = mk(1024, 512);
    for (let k = 0; k < 32; k++) { grad(g, k * 32, 0, 29, 512, ['#8b5636', '#a66c46', '#7d4c30'], true); g.fillStyle = '#24130b'; g.fillRect(k * 32 + 29, 0, 3, 512); }
    for (let k = 0; k < 500; k++) { g.fillStyle = `rgba(45,22,8,${0.04 + rnd() * 0.08})`; g.fillRect(rnd() * 1024, rnd() * 512, 1, 30 + rnd() * 90); }
    for (const cx of [256, 768]) { const w = g.createRadialGradient(cx, -60, 20, cx, -60, 520); w.addColorStop(0, 'rgba(255,224,176,0.95)'); w.addColorStop(0.35, 'rgba(255,196,136,0.42)'); w.addColorStop(1, 'rgba(255,190,130,0)'); g.fillStyle = w; g.beginPath(); g.moveTo(cx - 40, 0); g.lineTo(cx + 40, 0); g.lineTo(cx + 250, 512); g.lineTo(cx - 250, 512); g.fill(); }
    grad(g, 0, 300, 1024, 212, ['rgba(0,0,0,0)', 'rgba(0,0,0,0.68)']); grad(g, 0, 0, 1024, 26, ['rgba(0,0,0,0.6)', 'rgba(0,0,0,0)']);
    for (const cx of [0, 512, 1024]) { const s = g.createLinearGradient(cx - 110, 0, cx + 110, 0); s.addColorStop(0, 'rgba(0,0,0,0)'); s.addColorStop(0.5, 'rgba(0,0,0,0.5)'); s.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = s; g.fillRect(cx - 110, 0, 220, 512); }
    g.fillStyle = '#3a2215'; g.fillRect(0, 470, 1024, 42); g.fillStyle = 'rgba(255,220,180,0.25)'; g.fillRect(0, 468, 1024, 2);
    out['sig_suitewall.png'] = c.toDataURL(); }

  // 18. Suite ceiling (tileable): dark acoustic tiles with recessed downlights.
  { const [c, g] = mk(512, 512); g.fillStyle = '#17131a'; g.fillRect(0, 0, 512, 512); for (let k = 0; k < 4; k++) { g.fillStyle = '#0a080c'; g.fillRect(k * 128, 0, 3, 512); g.fillRect(0, k * 128, 512, 3); }
    for (const [x, y] of [[128, 128], [384, 128], [128, 384], [384, 384]]) { const d = g.createRadialGradient(x, y, 2, x, y, 60); d.addColorStop(0, 'rgba(255,236,205,1)'); d.addColorStop(0.25, 'rgba(255,214,160,0.55)'); d.addColorStop(1, 'rgba(255,200,140,0)'); g.fillStyle = d; g.fillRect(x - 60, y - 60, 120, 120); }
    out['sig_suiteceiling.png'] = c.toDataURL(); }

  // 19. Sponsor boards (4 x 2 tiles of 512 x 128), for long plain fascias.
  { const [c, g] = mk(2048, 256); for (let i = 0; i < 8; i++) ad(g, (i % 4) * 512, Math.floor(i / 4) * 128, 512, 128, i);
    out['sig_ads.png'] = c.toDataURL(); }
  return out;
}, sections);

for (const [name, url] of Object.entries(files)) fs.writeFileSync(`${OUT}/${name}`, Buffer.from(url.split(',')[1], 'base64'));
console.log(Object.keys(files).length, 'textures written to', OUT);
await b.close();
