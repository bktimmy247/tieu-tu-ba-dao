/* TIÊU TỬ BÁ ĐẠO — Thôn Vân Sơn (Phaser 3, isometric 128x64)
 * Map sinh bằng noise có seed: nền (cỏ/đất/đường/cát/nước/cầu gỗ) + lớp trang trí (cỏ, hoa, sỏi)
 * + lớp vật thể (cây, đá, bụi, đèn đá) có bóng, sắp xếp theo độ sâu.
 * Nhân vật + quái + VFX + âm thanh lấy từ Lục Thần (assets/lt, đóng gói bằng tools/pack_lucthan.py).
 */
'use strict';
const TW = 128, TH = 64, N = 56;

/* Bắt lỗi hiện lên màn hình để người chơi chụp gửi lại (máy khác không xem được console) */
window.__errs = [];
function showErr(msg) {
  window.__errs.push(msg);
  const el = document.getElementById('err');
  if (!el) return;
  el.style.display = 'block';
  el.textContent = window.__errs.slice(-4).join('\n');
}
window.addEventListener('error', e => showErr('LỖI: ' + e.message + '  @' + (e.filename || '').split('/').pop() + ':' + e.lineno));
window.addEventListener('unhandledrejection', e => { const msg = String(e.reason && (e.reason.message || e.reason)); if (/audio|play\(\)|NotAllowed|interrupted/i.test(msg)) { e.preventDefault(); console.warn('audio:', msg); return; } showErr('PROMISE: ' + msg); });
const LT = 'assets/lt/';
const HDLT = 'assets/lt-hd/';
const G = { GRASS: [0, 1, 2], DIRT: 3, PATH: [4, 5], SAND: 6, ROCK: 7, WATER: [8, 9], ROCK2: 10, WOOD: 11 };
const isoX = (c, r) => (c - r) * TW / 2, isoY = (c, r) => (c + r) * TH / 2;
const toTile = (x, y) => { const a = x / (TW / 2), b = y / (TH / 2); return { c: (a + b) / 2, r: (b - a) / 2 }; };

function rng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; }
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y, s) => (vnoise(x, y, s) * 0.6 + vnoise(x * 2.1, y * 2.1, s + 7) * 0.3 + vnoise(x * 4.3, y * 4.3, s + 13) * 0.1);

/* ---------------- Sinh map ---------------- */
const VILLAGE = { c: 10, r: 10, name: 'Thôn Vân Sơn' };
// 9 bãi quái, mỗi bãi ~20 con (map 56x56). Lv tăng dần theo khoảng cách từ làng.
const SPOTS = [
  { c: 17, r: 27, char: 'tinh-mac',   name: 'Tịnh Mặc',   lv: 1,  n: 15, aggro: false, area: 'Bãi Tịnh Mặc',    tint: 0xffffff },
  { c: 28, r: 14, char: 'tinh-mac',   name: 'Tịnh Mặc',   lv: 3,  n: 15, aggro: false, area: 'Đồng Tịnh Mặc',   tint: 0xffffff },
  { c: 35, r: 19, char: 'lang-tieu',  name: 'Lăng Tiêu',  lv: 5,  n: 15, aggro: true,  area: 'Rừng Lăng Tiêu',  tint: 0xffffff },
  { c: 20, r: 40, char: 'lang-nguyet',name: 'Lăng Nguyệt',lv: 7,  n: 15, aggro: true,  area: 'Bờ Lăng Nguyệt',  tint: 0xffffff },
  { c: 43, r: 41, char: 'bach-dien',  name: 'Bạch Điện',  lv: 9,  n: 15, aggro: true,  area: 'Đồi Bạch Điện',   tint: 0xffffff },
  { c: 44, r: 24, char: 'lang-nguyet',name: 'Lăng Nguyệt',lv: 11, n: 15, aggro: true,  area: 'Rừng Nguyệt',     tint: 0xffffff },
  { c: 33, r: 33, char: 'tieu-linh',  name: 'Tiểu Linh',  lv: 13, n: 15, aggro: true,  area: 'Gốc Tiểu Linh',   tint: 0xffffff },
  { c: 12, r: 44, char: 'tieu-linh',  name: 'Tiểu Linh',  lv: 15, n: 15, aggro: true,  area: 'Rừng Sâu',        tint: 0xffffff },
  { c: 46, r: 9,  char: 'lang-tieu',  name: 'Lăng Tiêu',  lv: 17, n: 15, aggro: true,  area: 'Vực Lăng Tiêu',   tint: 0xffffff },
];
window.SPOTS = SPOTS;   // cho quests.js đọc bãi quái

const MAPS = {
  1: { seed: 20261108, bgm: 'bgm-field' },
  2: { seed: 20261211, bgm: 'bgm-forest', village: { c: 9, r: 44, name: 'Trại Rừng Thề' },
    spots: [
      { c: 22, r: 36, char: 'lang-nguyet', name: 'Lăng Nguyệt', lv: 11, n: 15, aggro: true, area: 'Rừng Tên Lạc', tint: 0xdfffd6 },
      { c: 35, r: 23, char: 'lang-nguyet', name: 'Lăng Nguyệt', lv: 14, n: 15, aggro: true, area: 'Rừng Thề Sâu', tint: 0xc6e8ff },
      { c: 44, r: 11, char: 'lang-nguyet', name: 'Lăng Nguyệt', lv: 16, n: 15, aggro: true, area: 'Gốc Cổ Thụ', tint: 0xffffff },
      { c: 14, r: 30, char: 'tieu-linh', name: 'Tiểu Linh', lv: 12, n: 15, aggro: true, area: 'Bụi Linh', tint: 0xffe6c6 },
      { c: 28, r: 42, char: 'tieu-linh', name: 'Tiểu Linh', lv: 15, n: 15, aggro: true, area: 'Linh Sâu', tint: 0xffe6c6 },
      { c: 40, r: 34, char: 'lang-nguyet', name: 'Lăng Nguyệt', lv: 17, n: 15, aggro: true, area: 'Nguyệt Cao', tint: 0xc6e8ff },
      { c: 18, r: 16, char: 'lang-tieu', name: 'Lăng Tiêu', lv: 13, n: 15, aggro: true, area: 'Tiêu Rậm', tint: 0xffffff },
      { c: 46, r: 28, char: 'lang-tieu', name: 'Lăng Tiêu', lv: 18, n: 15, aggro: true, area: 'Tiêu Vực', tint: 0xffffff },
      { c: 10, r: 20, char: 'tinh-mac', name: 'Tịnh Mặc', lv: 10, n: 15, aggro: true, area: 'Mặc Đồng', tint: 0xffffff },
    ] },
};
const MAP_ID = (() => { try { const d = JSON.parse(localStorage.getItem('ttbd-save-v1') || 'null'); return d && d.map === 2 ? 2 : 1; } catch (e) { return 1; } })();
const MAPCFG = MAPS[MAP_ID];
if (MAPCFG.village) Object.assign(VILLAGE, MAPCFG.village);
if (MAPCFG.spots) SPOTS.splice(0, SPOTS.length, ...MAPCFG.spots);


function genMap(seed) {
  const R = rng(seed);
  const t = [], obj = [], block = [], deco = [];
  for (let r = 0; r < N; r++) { t.push(new Array(N)); obj.push(new Array(N).fill(null)); block.push(new Array(N).fill(false)); }
  const near = (c, r, p, d) => Math.hypot(c - p.c, r - p.r) < d;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const h = fbm(c / 10, r / 10, seed), d = fbm(c / 6, r / 6, seed + 99);
    let k = G.GRASS[Math.floor(R() * 3)];
    if (h < 0.30) k = G.WATER[(c + r) & 1];
    else if (h < 0.335) k = G.SAND;
    else if (d > 0.66) k = G.DIRT;
    t[r][c] = k;
  }
  // làng + bãi quái: nền thoáng
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (near(c, r, VILLAGE, 4.5)) t[r][c] = Math.hypot(c - VILLAGE.c, r - VILLAGE.r) < 2.6 ? G.SAND : G.GRASS[(c * 7 + r) % 3];
    for (const s of SPOTS) if (near(c, r, s, 3.6)) t[r][c] = (hash(c, r, 5) < 0.45) ? G.DIRT : G.GRASS[(c + r) % 3];
  }
  // đường uốn lượn nối làng -> các bãi; qua nước thành cầu gỗ
  const way = [VILLAGE, SPOTS[0], SPOTS[1], SPOTS[2]];
  for (let i = 0; i < way.length - 1; i++) {
    const a = way[i], b = way[i + 1], steps = Math.ceil(Math.hypot(b.c - a.c, b.r - a.r) * 3);
    for (let s = 0; s <= steps; s++) {
      const f = s / steps, wob = Math.sin(f * Math.PI * 2 + i) * 2.2 * Math.sin(f * Math.PI);
      const c = a.c + (b.c - a.c) * f + wob * 0.7, r = a.r + (b.r - a.r) * f - wob * 0.7;
      for (const [dc, dr] of [[0, 0], [1, 0], [0, 1]]) {
        const cc = Math.round(c) + dc, rr = Math.round(r) + dr;
        if (cc < 1 || rr < 1 || cc >= N - 1 || rr >= N - 1) continue;
        t[rr][cc] = G.WATER.includes(t[rr][cc]) || t[rr][cc] === G.WOOD ? G.WOOD : G.PATH[0];
      }
    }
  }
  const isWater = k => G.WATER.includes(k);
  // viền: đá + rừng dày
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const e = Math.min(c, r, N - 1 - c, N - 1 - r);
    if (e === 0) { t[r][c] = G.ROCK2; }   // chỉ là hình, đi lại đã bị chặn ở biên bởi solid()
    if (isWater(t[r][c])) block[r][c] = true;
  }
  const free = (c, r) => !block[r][c] && !obj[r][c] && !isWater(t[r][c]) && t[r][c] !== G.WOOD && !G.PATH.includes(t[r][c])
    && !near(c, r, VILLAGE, 4) && !SPOTS.some(s => near(c, r, s, 3.4))
    // vành đai trống dọc đường: không trồng cây sát lối đi
    && ![[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([a, b]) => {
      const cc = c + a, rr = r + b;
      if (cc < 0 || rr < 0 || cc >= N || rr >= N) return false;
      return G.PATH.includes(t[rr][cc]) || t[rr][cc] === G.WOOD;
    });
  for (let r = 1; r < N - 1; r++) for (let c = 1; c < N - 1; c++) {
    if (!free(c, r)) continue;
    const e = Math.min(c, r, N - 1 - c, N - 1 - r), forest = fbm(c / 7, r / 7, seed + 31);
    const waterSide = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => isWater(t[r + b][c + a]));
    let p = null, x = R();
    if (e <= 3 && x < 0.60) p = R() < 0.6 ? 'pine' : 'oak';
    else if (forest > 0.6 && x < 0.24) p = R() < 0.5 ? 'pine' : (R() < 0.75 ? 'oak' : 'sakura');
    else if (waterSide && x < 0.30) p = R() < 0.55 ? 'bamboo-clump' : 'bamboo-hedge';
    else if (waterSide && x < 0.34) p = 'rock';
    else if (x < 0.025) p = 'rock';
    else if (x < 0.09) p = 'bush';
    else if (x < 0.13) p = R() < 0.6 ? 'paddy' : 'grass';
    else if (x < 0.075) p = R() < 0.5 ? 'oak' : 'sakura';
    if (p) { obj[r][c] = p; if (p !== 'bush') block[r][c] = true; }
  }
  // làng: nhà quanh quảng trường (nhà AI tách nền) + đèn đá + sakura
  const HOUSES = ['house-a', 'house-b', 'house-c', 'house-d', 'house-e', 'house-f'];
  let hi = 0;
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + 0.3, rad = (i % 2) ? 3.2 : 2.4;
    const c = Math.round(VILLAGE.c + Math.cos(a) * rad), r = Math.round(VILLAGE.r + Math.sin(a) * rad);
    if (c < 2 || r < 2 || c >= N - 2 || r >= N - 2) continue;
    if (G.WATER.includes(t[r][c]) || obj[r][c]) continue;
    obj[r][c] = HOUSES[hi++ % HOUSES.length];
    block[r][c] = true;
    t[r][c] = G.SAND;              // sân lát trước nhà
  }
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + 0.8;
    const c = Math.round(VILLAGE.c + Math.cos(a) * 1.6), r = Math.round(VILLAGE.r + Math.sin(a) * 1.6);
    if (c > 0 && r > 0 && c < N && r < N && !obj[r][c]) { obj[r][c] = i % 2 ? 'lantern' : 'sakura'; block[r][c] = true; }
  }
  // trang trí: cỏ, hoa, sỏi (không chặn đường)
  for (let r = 1; r < N - 1; r++) for (let c = 1; c < N - 1; c++) {
    const k = t[r][c];
    const cnt = G.GRASS.includes(k) ? 3 : k === G.DIRT ? 1 : 0;
    for (let i = 0; i < cnt; i++) {
      const x = R();
      const kind = G.GRASS.includes(k) ? (x < 0.62 ? 'tuft' : x < 0.86 ? 'flower' + Math.floor(R() * 3) : 'tuft2') : 'pebble';
      if (R() < (G.GRASS.includes(k) ? 0.55 : 0.35)) deco.push({ c: c + R() - 0.5, r: r + R() - 0.5, kind });
    }
  }
  // LUẬT: vật cản phải cách nhau >= 2.2 ô (trừ vành ngoài map) -> bãi farm thoáng
  const blocking = [];
  for (let r = 1; r < N - 1; r++) for (let c = 1; c < N - 1; c++) if (obj[r][c] && obj[r][c] !== 'bush') blocking.push([c, r]);
  for (let i = 0; i < blocking.length; i++) {
    const [c, r] = blocking[i];
    if (Math.min(c, r, N - 1 - c, N - 1 - r) <= 4) continue;      // vành ngoài: cho phép dày
    if (SPOTS.some(sp => Math.hypot(c - sp.c, r - sp.r) < 5.5)) { obj[r][c] = null; block[r][c] = false; continue; } // trong bãi: dọn sạch
    let tooClose = false;
    for (let j = 0; j < i; j++) { const [c2, r2] = blocking[j]; if (!obj[r2][c2]) continue; if (Math.hypot(c - c2, r - r2) < 2.2) { tooClose = true; break; } }
    if (tooClose) { obj[r][c] = null; block[r][c] = false; }
  }
  return { t, obj, block, deco };
}

/* ---------------- A* trên lưới ô ---------------- */
function astar(block, sc, sr, gc, gr) {
  if (gc < 0 || gr < 0 || gc >= N || gr >= N) return null;
  if (block[gr][gc]) { // tìm ô trống gần đích nhất
    let best = null, bd = 1e9;
    for (let r = gr - 2; r <= gr + 2; r++) for (let c = gc - 2; c <= gc + 2; c++)
      if (r > 0 && c > 0 && r < N && c < N && !block[r][c]) { const d = Math.hypot(c - gc, r - gr); if (d < bd) { bd = d; best = [c, r]; } }
    if (!best) return null; [gc, gr] = best;
  }
  const key = (c, r) => r * N + c, open = [[sc, sr]], g = new Map([[key(sc, sr), 0]]), came = new Map(), f = new Map([[key(sc, sr), 0]]);
  const closed = new Set();
  let iter = 0;
  while (open.length && iter++ < 6000) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (f.get(key(...open[i])) < f.get(key(...open[bi]))) bi = i;
    const [c, r] = open.splice(bi, 1)[0], k = key(c, r);
    if (c === gc && r === gr) { const path = [[c, r]]; let cur = k; while (came.has(cur)) { cur = came.get(cur); path.unshift([cur % N, Math.floor(cur / N)]); } return path; }
    closed.add(k);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= N || nr >= N || block[nr][nc]) continue;
      if (dc && dr && (block[r][nc] || block[nr][c])) continue;
      const nk = key(nc, nr); if (closed.has(nk)) continue;
      const ng = g.get(k) + (dc && dr ? 1.414 : 1);
      if (ng < (g.has(nk) ? g.get(nk) : 1e9)) { g.set(nk, ng); came.set(nk, k); f.set(nk, ng + Math.hypot(gc - nc, gr - nr)); if (!open.some(o => o[0] === nc && o[1] === nr)) open.push([nc, nr]); }
    }
  }
  return null;
}

/* ---------------- HUD (DOM) ---------------- */
const $ = id => document.getElementById(id);
const HUD = {
  bar(id, v, m) { const e = $(id); e.querySelector('i').style.width = Math.max(0, v / m * 100) + '%'; e.querySelector('span').textContent = Math.max(0, Math.ceil(v)) + ' / ' + m; },
  log(s) { const d = document.createElement('div'); d.textContent = s; $('log').appendChild(d); while ($('log').children.length > 5) $('log').firstChild.remove(); },
  toast(s) { const e = $('toast'); e.textContent = s; e.style.opacity = 1; clearTimeout(this._t); this._t = setTimeout(() => e.style.opacity = 0, 1400); },
};

/* ---------------- Scene ---------------- */
class Boot extends Phaser.Scene {
  constructor() { super('boot'); }
  preload() {
    this.load.on('loaderror', f => { f.__retry = (f.__retry || 0) + 1; if (f.__retry <= 2) { const t = f.type, k = f.key, u = f.url, c = f.config; this.time ? 0 : 0; setTimeout(() => { if (t === 'spritesheet') this.load.spritesheet(k, u, c); else if (t === 'image') this.load.image(k, u); else if (t === 'audio') this.load.audio(k, u); this.load.start(); }, 400); return; } window.__loadFails = (window.__loadFails || []).concat(f.key); HUD.log('Lỗi tải: ' + f.key); });
 this.load.json('man', LT + 'manifest.json?v=' + (window.__KT_VER || 13)); }
  create() { this.scene.start('main'); }
}


/* ---- công thức sát thương kiểu TIÊU TỬ BÁ ĐẠO ----
   Cấu trúc lấy từ dữ liệu server gốc:
   - kỹ năng có bảng hệ số theo cấp (MAGIC_VALUE_NUM), nội suy tuyến tính (Calc:Link)
   - phòng thủ giảm thương theo đường bão hoà: def/(def+K)
   - chí mạng nhân 1.8 (tách riêng khỏi hệ số kỹ năng)
*/
const DMG_K = 80;                       // hằng số bão hoà phòng thủ (def=80 -> giảm 50%)
const CRIT_RATE = 0.15, CRIT_MULT = 1.8;
// hệ số kỹ năng theo bậc 5 cấp: cấp 1,5,10,15,20,25,30,35+
const SKILL_COEF = [1.00, 1.18, 1.36, 1.58, 1.82, 2.06, 2.30, 2.54];
function skillCoef(lv) {
  const t = Math.max(0, (lv - 1) / 5), i = Math.min(SKILL_COEF.length - 2, Math.floor(t)), f = Math.min(1, t - i);
  return SKILL_COEF[i] + (SKILL_COEF[i + 1] - SKILL_COEF[i]) * f;
}
function dmgCalc(atk, def, coef) {
  const raw = atk * coef;
  const red = def * (def / (def + DMG_K));          // giảm thương bão hoà
  const v = 0.92 + Math.random() * 0.16;            // ±8%
  return Math.max(1, Math.round((raw - red) * v));
}

class Main extends Phaser.Scene {
  constructor() { super('main'); }
  preload() {
    const M = this.M = this.cache.json.get('man');
    this.load.spritesheet('tiles', 'assets/tiles/terrain-base.png', { frameWidth: 128, frameHeight: 64 });
    for (const p of ['pine', 'oak', 'sakura', 'rock', 'bush', 'lantern', 'grass', 'bamboo', 'willow', 'bamboo-hedge', 'bamboo-clump', 'bamboo-strip', 'bamboo-far', 'bridge', 'shrine', 'paddy', 'hut', 'cart',
      'house-a', 'house-b', 'house-c', 'house-d', 'house-e', 'house-f', 'gate', 'flag', 'drum', 'well']) this.load.image(p, (p.startsWith('house-') ? 'assets/props2/' : 'assets/props3/') + p + '.webp?v=' + (window.__KT_VER || 26));
    for (const [cid, ch] of Object.entries(M.chars)) { this.load.image('map-hd:' + cid, 'assets/map-hd-png/' + cid + '.png'); for (const [cl, c] of Object.entries(ch.clips)) { this.load.spritesheet(cid + ':' + cl, LT + c.file, { frameWidth: c.w, frameHeight: c.h }); this.load.spritesheet('hdx:' + cid + ':' + cl, HDLT + c.file, { frameWidth: c.w * 2, frameHeight: c.h * 2 }); } }
    for (const k of ['npc-pho', 'npc-mo']) this.load.image(k, LT + k + '.webp');
    for (const k of ['grass', 'dirt', 'brick', 'stone']) this.load.image('tex-' + k, 'assets/tex/' + k + '.jpg');
    this.load.image('tex-ground-paint', 'assets/tex/ground-paint.webp');
    for (const k of ['grass', 'dirt', 'stone']) this.load.image('g-' + k, 'assets/tex/ground-' + k + '.webp?v=' + (window.__KT_VER || 29));
    this.load.json('propdefs', 'assets/props.json');
    this.load.json('walkmask', 'assets/data/walkmask.json');
    this.load.image('arena', 'assets/arena.jpg');
    if (this.textures.exists('vfx-boss') || true) this.load.image('vfx-boss', 'assets/lt/vfx-boss.webp');
    for (const [k, v] of Object.entries(M.vfx)) this.load.spritesheet('vfx:' + k, LT + v.file, { frameWidth: v.w, frameHeight: v.h });
    for (const [k, f] of Object.entries(M.bgm)) this.load.audio(k, LT + f);
    for (const [k, f] of Object.entries(M.sfx)) this.load.audio('sfx-' + k, LT + f);
    const t = this.add.text(innerWidth / 2, innerHeight / 2, 'Đang tải 0%', { font: '16px Segoe UI', color: '#f0d79a' }).setOrigin(0.5).setScrollFactor(0);
    this.load.on('progress', p => t.setText('Đang tải ' + Math.round(p * 100) + '%'));
    this.load.on('complete', () => t.destroy());
  }

  makeTextures() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x000000, 0.32); g.fillEllipse(50, 20, 100, 40); g.generateTexture('shadow', 100, 40); g.clear();
    // búi cỏ
    const blades = (cols, key) => { for (let i = 0; i < 7; i++) { const x = 4 + i * 2.6; g.lineStyle(1.6, cols[i % cols.length], 1); g.beginPath(); g.moveTo(x, 16); g.lineTo(x + (i - 3) * 1.2, 5 + (i % 3) * 2); g.strokePath(); } g.generateTexture(key, 24, 17); g.clear(); };
    blades([0x2f6a1c, 0x4a8a2a, 0x6aa83a], 'tuft'); blades([0x557a20, 0x7a9a30, 0x3d6a1a], 'tuft2');
    [[0xffffff, 0xffe27a], [0xff9ac0, 0xffd0e0], [0xffd23a, 0xfff1a0]].forEach((c, i) => {
      g.lineStyle(1.2, 0x3d7a22, 1); g.beginPath(); g.moveTo(6, 13); g.lineTo(6, 6); g.moveTo(11, 13); g.lineTo(12, 8); g.strokePath();
      g.fillStyle(c[0], 1); g.fillCircle(6, 5, 2.4); g.fillCircle(12, 7, 2.1); g.fillStyle(c[1], 1); g.fillCircle(6, 5, 0.9); g.fillCircle(12, 7, 0.8);
      g.generateTexture('flower' + i, 18, 14); g.clear();
    });
    g.fillStyle(0x8a8378, 1); g.fillEllipse(5, 6, 7, 4); g.fillStyle(0x6e675e, 1); g.fillEllipse(12, 8, 5, 3); g.generateTexture('pebble', 18, 12); g.clear();
    g.lineStyle(2, 0xff5040, 0.9); g.strokeEllipse(40, 16, 76, 28); g.generateTexture('ringRed', 80, 32); g.clear();
    g.lineStyle(2, 0xffe08a, 0.9); g.strokeEllipse(20, 8, 36, 14); g.generateTexture('ringGold', 40, 16); g.destroy();
  }

  makeAnims() {
    for (const [cid, ch] of Object.entries(this.M.chars)) for (const [cl, c] of Object.entries(ch.clips))
      { const hk = 'hdx:' + cid + ':' + cl; const src = (this.textures.exists(hk) && this.textures.get(hk).frameTotal > 1) ? hk : ((this.textures.exists(cid + ':' + cl) && this.textures.get(cid + ':' + cl).frameTotal > 1) ? cid + ':' + cl : null); if (src) this.anims.create({ key: cid + ':' + cl, frames: this.anims.generateFrameNumbers(src, { start: 0, end: c.frames - 1 }), frameRate: (cl === 'run' ? 0.75 : 1) * 1000 / c.ms, repeat: (cl === 'idle' || cl === 'run') ? -1 : 0 }); }
    for (const [k, v] of Object.entries(this.M.vfx))
      if (this.textures.exists('vfx:' + k) && this.textures.get('vfx:' + k).frameTotal > 1) this.anims.create({ key: 'vfx:' + k, frames: this.anims.generateFrameNumbers('vfx:' + k, { start: 0, end: v.frames - 1 }), frameRate: 1000 / v.ms, repeat: 0 });
  }

  create() {
    this.makeTextures(); this.makeAnims();
    try { window.KT_PROPS = this.cache.json.get('propdefs') || null; } catch (e) { window.KT_PROPS = null; }
    // thư viện vật thể dùng chung (data-driven): id -> file, anchor, bóng, bán kính chặn
    // (gộp thư viện props sau khi OH/SH được khai báo — xem bên dưới)
    const MINPROP = 1.6;   // khoảng cách tối thiểu giữa 2 vật thể (ô)
    const map = this.map = genMap(MAPCFG.seed);
    { const keep = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const p = map.obj[r][c]; if (!p) continue;
        let ok = true; for (const k of keep) if (Math.hypot(k[0] - c, k[1] - r) < MINPROP) { ok = false; break; }
        if (ok) keep.push([c, r]); else { map.obj[r][c] = null; map.block[r][c] = false; } } }
    { // CỤM: 60% vật thể giữ trong 12 cụm, ngoài cụm chỉ giữ 40% -> mọc thành đám như map thật
      const R2 = rng(MAPCFG.seed + 77), CL = [];
      for (let i = 0; i < 12; i++) CL.push([6 + R2() * (N - 12), 6 + R2() * (N - 12)]);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const p = map.obj[r][c]; if (!p || /^(gate|flag|drum|well|shrine|cart|hut|bridge|house-)/.test(p)) continue;
        const inC = CL.some(q => Math.hypot(q[0] - c, q[1] - r) < 4.5);
        if (!inC && R2() > 0.4) { map.obj[r][c] = null; map.block[r][c] = false; } } }
    // công trình thôn quanh quảng trường (đặt tay, không ngẫu nhiên)
    const STRUCTS = [['gate', 10, 14], ['flag', 9, 8], ['drum', 12, 9], ['well', 8, 12], ['shrine', 7, 7], ['cart', 13, 12], ['hut', 6, 13], ['bridge', 11, 6]];
    for (const [k, c, r] of STRUCTS) if (c > 0 && r > 0 && c < N && r < N) { map.obj[r][c] = k; map.block[r][c] = true; }
    // tranh làng đã có nhà/cây sẵn: xoá vật thể trùng trong bán kính 8 ô (giữ vài món điểm nhấn)
    { const KEEP = /^(well|drum|gate|flag|lantern|shrine)$/;
      for (let r2 = 0; r2 < N; r2++) for (let c2 = 0; c2 < N; c2++) { const q = map.obj[r2][c2]; if (!q || KEEP.test(q)) continue;
        if (Math.hypot(c2 - VILLAGE.c, r2 - VILLAGE.r) < 8) { map.obj[r2][c2] = null; map.block[r2][c2] = false; } } }
    // VIỀN CẢNH: vành đá chạy quanh biên để mép map không bị cắt cụt
    for (let i = 1; i < N - 1; i++) for (const [r, c] of [[1, i], [N - 2, i], [i, 1], [i, N - 2]]) {
      if (!map.obj[r][c] && (i % 3 !== 0)) { map.obj[r][c] = 'rock'; map.block[r][c] = true; } }
    // lớp 1: nền vẽ LIỀN — một texture cho cả map, không lặp ô 128×64
    map.N = N;
    const tG0 = performance.now();
    const texPix = k => { if (!this.textures.exists(k)) return null; const im = this.textures.get(k).getSourceImage(); const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const x = cv.getContext('2d'); x.drawImage(im, 0, 0); return { d: x.getImageData(0, 0, im.width, im.height).data, w: im.width, h: im.height }; };
    const tex = { grass: texPix('tex-grass'), dirt: texPix('tex-dirt'), brick: texPix('tex-brick'), stone: texPix('tex-stone'), paint: texPix('tex-ground-paint') };
    const gt = KTGround.makeGroundTexture(this, map, G, { isoX, isoY, TW, TH, div: 2, tex, plaza: { c: VILLAGE.c, r: VILLAGE.r, rad: 2.9 } });
    this.add.image(gt.midX, gt.midY, gt.key).setDisplaySize(gt.W, gt.H).setDepth(-1e6);
    // TOÀN MAP = 1 ảnh liền đã keystone (nghiêng vào trong), phủ đúng 7168x3584 world px
    // NỀN MỚI: 3 texture liền mép trộn theo địa hình, vẽ đúng độ phân giải gốc (js/terrain.js)
    if (window.KTTerrain && this.textures.exists('g-grass')) { this.terrain = KTTerrain.init(this, { N, TW, TH, village: VILLAGE, spots: SPOTS, seed: (MAPCFG.seed || 7) }); }
    if (false)
    if (this.textures.exists('sec0')) { const COLS = 3, ROWS = 3;
      const W0 = (N * TW) / COLS, H0 = (N * TH) / ROWS, X0 = -N * TW / 2;
      this.plates = [];
      for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
        const key = 'sec' + ((i + j * COLS) % 4);
        const im = this.add.image(X0 + W0 * (i + 0.5), H0 * (j + 0.5), key).setDisplaySize(W0 * 1.02, H0 * 1.02).setDepth(-9.9e5);
        if ((i * 7 + j * 3) % 2) im.setFlipX(true);
        this.plates.push(im); } }
    const groundMs = Math.round(performance.now() - tG0);
    // ---- DỌN PROP TRÊN NỀN ĐÃ CHẶN ----
    // walkmask sinh từ dữ liệu thật TIÊU TỬ BÁ ĐẠO: ô = 1 là chỗ tranh nền đã có nhà/đá/nước.
    // Đặt thêm cây/đá lên đó là thừa và làm map bí -> bỏ hết, rồi giữ luật cách nhau >= 3.4 ô.
    this.propTrim = { cutMask: 0, cutNear: 0, cutRock: 0 };
    { const wmP = this.cache.json.get('walkmask');
      if (wmP && wmP.w) {
        const KEEP = /^(gate|flag|drum|well|lantern|shrine|cart|hut|bridge|house-)/;   // công trình đặt tay: giữ
        const kept = [];
        for (let r = 1; r < N - 1; r++) for (let c = 1; c < N - 1; c++) {
          const p = map.obj[r][c]; if (!p) continue;
          if (KEEP.test(p)) { kept.push([c, r]); continue; }
          if (wmP.w[r] && wmP.w[r][c]) { map.obj[r][c] = null; map.block[r][c] = false; this.propTrim.cutMask++; continue; }
          // đá vụn: tranh nền đã có đá/sỏi vẽ sẵn -> bỏ để bớt chặn mà không mất chi tiết
          if (p === 'rock') { map.obj[r][c] = null; map.block[r][c] = false; this.propTrim.cutRock++; }
        }
        for (let r = 1; r < N - 1; r++) for (let c = 1; c < N - 1; c++) {
          const p = map.obj[r][c]; if (!p || KEEP.test(p)) continue;
          if (kept.some(([kc, kr]) => Math.hypot(kc - c, kr - r) < 3.4)) { map.obj[r][c] = null; map.block[r][c] = false; this.propTrim.cutNear++; continue; }
          kept.push([c, r]);
        }
      } }
    // CHI TIẾT NỀN: rải hoa, bụi cỏ, sỏi, lá rụng (không chặn đường)
    { const RD = rng(MAPCFG.seed + 4242); const names = Object.keys(window.KT_PROPS || {}).filter(k => k.startsWith('deco-'));
      if (names.length) { let nd = 0;
        for (let r = 1; r < N - 1; r++) for (let c = 1; c < N - 1; c++) {
          if (map.obj[r][c]) continue;
          const k = map.t[r][c];
          if (G.PATH.includes(k) || k === G.WOOD || G.WATER.includes(k)) continue;
          if (RD() > 0.16) continue;
          map.obj[r][c] = names[(RD() * names.length) | 0];
          map.block[r][c] = false; nd++;
        }
        this.decoCount = nd; } }
    // vật cản theo chân vật thể (hình tròn) + nước
    // VIỀN RỪNG: vành cây/đá ở 2-3 ô sát biên (đặt SAU khi dọn prop) cho rìa map có khung,
    // chừa đường nối, làng và bãi quái; vành trong (ô thứ 3) thưa để không phá lối đi.
    { const RB = rng(MAPCFG.seed + 909); let nb = 0;
      for (let r = 1; r < N - 1; r++) for (let c = 1; c < N - 1; c++) {
        const e = Math.min(c, r, N - 1 - c, N - 1 - r);
        if (e > 3 || map.obj[r][c]) continue;
        const k = map.t[r][c];
        if (G.PATH.includes(k) || k === G.WOOD || G.WATER.includes(k)) continue;
        if (Math.hypot(c - VILLAGE.c, r - VILLAGE.r) < 9) continue;
        if (SPOTS.some(s => Math.hypot(c - s.c, r - s.r) < 6)) continue;
        const x = RB();
        if (e === 3 && x > 0.55) continue;
        const p = e <= 1 ? (x < 0.72 ? 'pine' : 'rock')
          : e === 2 ? (x < 0.46 ? 'pine' : x < 0.72 ? 'oak' : x < 0.9 ? 'rock' : 'bamboo-clump')
            : (x < 0.34 ? 'pine' : x < 0.62 ? 'rock' : 'bamboo-clump');
        map.obj[r][c] = p; map.block[r][c] = true; nb++;
      }
      this.borderProps = nb; }
    this.obs = KTGround.buildObstacles(map, G);
    // ---- lớp chặn sinh từ TRANH NỀN (nhà/đá/nước vẽ trong ảnh) ----
    { const wm = this.cache.json.get('walkmask');
      if (wm && wm.w) {
        const SUB = this.obs.SUB, FN = this.obs.FN, fine = this.obs.fine;
        let painted = 0;
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          if (!wm.w[r] || !wm.w[r][c]) continue;
          for (let dr = 0; dr < SUB; dr++) for (let dc = 0; dc < SUB; dc++) {
            const rr = r * SUB + dr, cc = c * SUB + dc;
            if (rr >= 0 && cc >= 0 && rr < FN && cc < FN && !fine[rr * FN + cc]) { fine[rr * FN + cc] = 1; painted++; }
          }
        }
        let fb = 0; for (let i = 0; i < fine.length; i++) fb += fine[i];
        this.obs.fineBlocked = fb; this.obs.finePct = fb / fine.length * 100;
        this.walkmaskCells = painted;
      } }
    // ---- NƯỚC "MA": nền sinh bằng noise nên có ô nước nằm đúng chỗ tranh nền là đất liền.
    // Giữ chặn nước chỉ ở ô mà walkmask cũng chặn (nước thật của map gốc), còn lại bỏ -> hết tường vô hình.
    { const wm = this.cache.json.get('walkmask');
      this.propTrim.waterFree = 0;
      if (wm && wm.w && this.obs.water) {
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          const i = r * N + c;
          if (this.obs.water[i] && !(wm.w[r] && wm.w[r][c])) { this.obs.water[i] = 0; this.propTrim.waterFree++; }
        }
      } }
    for (let r = 1; r < N - 1; r++) for (let c = 1; c < N - 1; c++) map.block[r][c] = this.obs.solid(c, r);
    // viền ngoài chỉ là hình: đi lại đã bị solid() chặn ở biên
    let nGround = 1;
    // lớp 2: chi tiết nhỏ (cỏ, hoa, sỏi) — đã nướng vào texture nền để không tốn 3.500 sprite
    this.props = [];
    // lớp 3: vật thể + bóng
    const OH = { pine: 0.97, oak: 0.95, sakura: 0.95, rock: 0.85, bush: 0.88, lantern: 0.95,
      'house-a': 0.93, 'house-b': 0.93, 'house-c': 0.93, 'house-d': 0.93, 'house-e': 0.93, 'house-f': 0.93, gate: 0.97, flag: 0.99, drum: 0.93, well: 0.94, grass: 0.94, bamboo: 0.98, willow: 0.98, 'bamboo-hedge': 0.98, 'bamboo-clump': 0.98, 'bamboo-strip': 0.98, 'bamboo-far': 0.98, bridge: 0.96, shrine: 0.96, paddy: 0.94, hut: 0.95, cart: 0.93 };
    const SH = { pine: 0.9, oak: 1.3, sakura: 1.2, rock: 1.1, bush: 0.8, lantern: 0.5,
      'house-a': 1.5, 'house-b': 1.5, 'house-c': 1.5, 'house-d': 1.5, 'house-e': 1.5, 'house-f': 1.5, gate: 1.5, flag: 0.7, drum: 1.0, well: 1.0, grass: 0.5, bamboo: 0.9, willow: 1.2, 'bamboo-hedge': 0.92, 'bamboo-clump': 0.92, 'bamboo-strip': 0.78, 'bamboo-far': 0.7, bridge: 0.6, shrine: 0.9, paddy: 0.7, hut: 1.4, cart: 0.9 };
    if (window.KT_PROPS) { for (const k in window.KT_PROPS) { const d = window.KT_PROPS[k];
      if (d.anchor != null) OH[k] = d.anchor;
      if (d.shadow != null) SH[k] = d.shadow;
      if (d.rad != null) { window.KTGround.RAD_OVERRIDE = window.KTGround.RAD_OVERRIDE || {}; window.KTGround.RAD_OVERRIDE[k] = d.rad; } } }
    let nObj = 0;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const p = map.obj[r][c]; if (!p) continue;
      const x = isoX(c, r) + (hash(c, r, 9) - 0.5) * 18, y = isoY(c, r) + (hash(c, r, 11) - 0.5) * 8;
      const s = this.add.image(x, y + 6, p).setOrigin(0.5, OH[p]).setDepth(y + 6);
      s.setScale(0.72 + hash(c, r, 13) * 0.2); if (hash(c, r, 17) < 0.5) s.setFlipX(true);
      this.props.push({ s, sh: this.add.image(x + 10, y + 2, 'shadow').setScale(SH[p], SH[p] * 0.9).setDepth(-8e5), c, r });
      nObj++;
    }
    this.stats = { nGround, nDeco: map.deco.length, nObj, groundMs, groundTex: gt.w + '×' + gt.h, obstacles: this.obs.list.length };

    // nhân vật
    { const _t = this.add.text.bind(this.add); this.add.text = (x, y, t, st) => _t(x, y, t, Object.assign({ resolution: DPR }, st || {})); }
    this.sfx = k => { try { this.sound.play('sfx-' + k, { volume: k === 'voice' ? 0.6 : 0.45 }); } catch (e) { } };
    this.hero = this.makeUnit('lang-van', VILLAGE.c, VILLAGE.r + 0.5, { hero: true, scale: 1.18 });
    Object.assign(this.hero, { name: 'Lăng Vân', lv: 1, exp: 0, hp: 200, maxHp: 200, mp: 80, maxMp: 80, atk: 22, def: 4, path: null, target: null, auto: false, cdSkill: 0, cdPot: 0, nextAtk: 0 });
    this.heroRing = this.add.image(0, 0, 'ringGold').setDepth(-7e5);
    this.mobs = [];
    SPOTS.forEach((s, si) => { for (let i = 0; i < s.n; i++) this.spawnMob(s, si); });
    this.targetRing = this.add.image(0, 0, 'ringRed').setDepth(-7e5).setVisible(false);

    // camera
    const cam = this.cameras.main;
    cam.setBounds(isoX(0, N - 1) - 200, -200, N * TW + 400, N * TH + 400);
    cam.startFollow(this.hero.spr, true, 0.12, 0.12);
    // Zoom xa hơn để thấy toàn cảnh map; landscape phone ~0.78 thay vì ~0.96
    // Khung ngang thấy rộng hơn; nhân vật nhỏ vừa đủ để không che map
    cam.setZoom(camZoomFor(innerWidth, innerHeight));
    cam.setBackgroundColor('#0d1408');
    // LỚP KHÔNG KHÍ: vignette tối bốn mép + sương mờ phía xa
    { const g = this.make.graphics({ x: 0, y: 0, add: false });
      const R0 = Math.max(innerWidth, innerHeight);
      for (let i = 0; i < 26; i++) { const t = i / 26; g.fillStyle(0x0a1208, t * 0.055); g.fillCircle(R0 * 0.62, R0 * 0.62, R0 * (0.74 - t * 0.46)); }
      g.generateTexture('vig', Math.round(R0 * 1.3), Math.round(R0 * 1.3)); g.destroy();
      const vig = this.add.image(innerWidth / 2, innerHeight / 2, 'vig').setScrollFactor(0).setDepth(9e5).setAlpha(0.55);
      // sương mù phía xa: gradient mềm (bỏ rectangle phẳng -> hết hình chữ nhật mờ có cạnh cứng)
      const cvF = document.createElement('canvas'); cvF.width = 8; cvF.height = 256;
      const cf = cvF.getContext('2d'); const grF = cf.createLinearGradient(0, 0, 0, 256);
      grF.addColorStop(0, 'rgba(207,216,192,0)'); grF.addColorStop(0.42, 'rgba(207,216,192,0.13)'); grF.addColorStop(1, 'rgba(207,216,192,0)');
      cf.fillStyle = grF; cf.fillRect(0, 0, 8, 256);
      if (this.textures.exists('haze')) this.textures.remove('haze');
      this.textures.addCanvas('haze', cvF);
      const fog = this.add.image(innerWidth / 2, innerHeight * 0.06, 'haze').setScrollFactor(0).setDepth(9e4).setDisplaySize(innerWidth, innerHeight * 0.5);
      this.scale.on('resize', sz => { vig.setPosition(sz.width / 2, sz.height / 2).setDisplaySize(sz.width * 1.15, sz.height * 1.15); fog.setPosition(sz.width / 2, sz.height * 0.06).setDisplaySize(sz.width, sz.height * 0.5); });
      this.atmo = { vig, fog }; }

    // input
    this.input.on('pointerdown', p => this.onClick(p.worldX, p.worldY));
    const kb = this.input.keyboard;
    kb.on('keydown-A', () => this.toggleAuto()); kb.on('keydown-M', () => this.toggleOverview()); kb.on('keydown-ONE', () => this.castSkill()); kb.on('keydown-TWO', () => this.usePot());
if ($('ovBtn')) $('ovBtn').onclick = () => this.toggleOverview(); $('skAuto').onclick = () => { this.sfx('ui'); this.toggleAuto(); }; $('sk1').onclick = () => { this.sfx('ui'); this.castSkill(); }; $('skPot').onclick = () => { this.sfx('ui'); this.usePot(); };

    this.drawMinimap();
    this.musicOn = true;
    try { this.music = this.sound.add(MAPCFG.bgm, { loop: true, volume: 0.35 }); } catch (e) { this.music = null; HUD.log('Không nạp được nhạc nền'); }
    this.tryMusic();
    // Trình duyệt chặn tự phát nhạc: mở khoá ở lần chạm/phím đầu tiên
    this.input.on('pointerdown', () => this.tryMusic());
    const musBtn = document.getElementById('mus');
    if (musBtn) musBtn.onclick = () => this.toggleMusic();
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.regen() });
    this.time.addEvent({ delay: 200, loop: true, callback: () => this.updateHud() });
    HUD.log('Đến ' + VILLAGE.name + '. Đi theo đường đất để tới bãi quái.');
    if (window.KTStory) { try { KTStory.install(this); } catch (e) { showErr('story: ' + e.message); } }
    if (window.KTLoot) { try { KTLoot.install(this); } catch (e) { showErr('loot: ' + e.message); } }
    if (window.KTQuests) { try { KTQuests.install(this); } catch (e) { showErr('quest: ' + e.message); } }
    window.__kt = this; this.children.list.forEach(o => { if (o.texture && o.texture.key === '__MISSING') o.setVisible(false); });
  }

  tryMusic() {
    try {
      const ctx = this.sound.context;
      if (ctx && ctx.state === 'suspended') ctx.resume();
      if (this.musicOn && this.music && !this.music.isPlaying) this.music.play();
    } catch (e) { }
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (this.music) { try { this.musicOn ? this.music.play() : this.music.stop(); } catch (e) { } }
    const el = document.getElementById('mus');
    if (el) { el.classList.toggle('off', !this.musicOn); el.querySelector('b').textContent = this.musicOn ? '♪' : '✕'; }
    HUD.log(this.musicOn ? 'Bật nhạc' : 'Tắt nhạc');
  }

  makeUnit(cid, c, r, o = {}) {
    const idleC = this.M.chars[cid].clips.idle; const targetH = o.hero ? 120 : 92; const scl = targetH / (idleC.h * 2); const spr = this.add.sprite(0, 0, cid + ':idle').setScale(scl);
    if (o.tint) spr.setTint(o.tint);
    const u = { cid, c, r, spr, clip: null, face: 1, dead: false, hdStatic: false, scale: scl, targetH };
    const sh = this.add.image(0, 0, 'shadow').setScale(0.55 * u.scale, 0.5 * u.scale).setDepth(-7.5e5);
    u.shadow = sh;
    if (!o.hero) {
      u.bar = this.add.graphics().setDepth(1e6);
      u.label = this.add.text(0, 0, '', { font: '11px Segoe UI', color: '#ffdca0', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(1e6);
    }
    this.play(u, 'idle');
    this.place(u);
    return u;
  }

  play(u, clip, force) {
    if (u.clip === clip && !force) return;
    if (u.hdStatic) { u.clip = clip; return; }
    const c = this.M.chars[u.cid].clips[clip];
    u.clip = clip;
    u.spr.setTexture(u.cid + ':' + clip).setOrigin(c.pivotX / c.w, c.footY / c.h);
    // giữ chiều cao nhân vật không đổi giữa các động tác (mỗi clip bị cắt khung khác nhau)
    u.spr.setScale((u.targetH || 120) / (c.h * 2));
    { const ak = u.cid + ':' + clip, a = this.anims.get(ak); if (a && a.frames.length) u.spr.play(ak); }
  }

  place(u) {
    const x = isoX(u.c, u.r), y = isoY(u.c, u.r);
    u.spr.setPosition(x, y).setDepth(y + 1).setFlipX(u.face < 0);
    u.shadow.setPosition(x + 4, y + 2);
    if (u.bar) {
      const top = y - 100 * u.scale;
      // vẽ thanh máu ở toạ độ cục bộ, chỉ vẽ lại khi máu đổi (trước đây vẽ lại mỗi khung hình = tụt fps)
      const sig = Math.round(u.hp * 10) + ':' + (u.dead ? 1 : 0);
      if (u._barSig !== sig) {
        u._barSig = sig;
        u.bar.clear();
        if (!u.dead) {
          u.bar.fillStyle(0x000000, 0.75).fillRect(-26, 0, 52, 6);
          u.bar.fillStyle(0xe04030, 1).fillRect(-25, 1, 50 * Math.max(0, u.hp / u.maxHp), 4);
        }
      }
      u.bar.setPosition(x, top);
      const ltxt = u.dead ? '' : u.name + ' Lv' + u.lv;
      if (u._ltxt !== ltxt) { u._ltxt = ltxt; u.label.setText(ltxt); }
      u.label.setPosition(x, top - 2);
    }
  }

  spawnElite(s, si) {
    const R = Math.random;
    let c, r, tries = 0;
    do { c = s.c + (R() - 0.5) * 5; r = s.r + (R() - 0.5) * 5; } while (this.map.block[Math.round(r)][Math.round(c)] && tries++ < 20);
    const u = this.makeUnit(s.char, c, r, { scale: 1.45, tint: 0xc07bff });
    Object.assign(u, { spot: s, si, elite: true, name: 'Tinh Anh · ' + s.name, lv: s.lv + 2,
      maxHp: Math.round((70 + s.lv * 45) * 6), atk: Math.round((5 + s.lv * 4) * 1.8), def: s.lv + 4,
      home: { c, r }, state: 'idle', wait: 1, nextAtk: 0 });
    u.hp = u.maxHp;
    if (u.label) u.label.setColor('#d59bff');
    this.mobs.push(u);
    HUD.toast('Tinh Anh xuất hiện!'); this.vfx('skill', u); this.sfx('win');
    return u;
  }

  spawnMob(s, si) {
    const R = Math.random;
    let c, r, tries = 0;
    do { c = s.c + (R() - 0.5) * 5; r = s.r + (R() - 0.5) * 5; } while (this.map.block[Math.round(r)][Math.round(c)] && tries++ < 20);
    const u = this.makeUnit(s.char, c, r, { scale: si === 2 ? 1.35 : 1.15, tint: s.tint });
    Object.assign(u, { spot: s, si, name: s.name, lv: s.lv, maxHp: 70 + s.lv * 45, atk: 5 + s.lv * 4, def: s.lv, home: { c, r }, state: 'idle', wait: 1 + R() * 3, nextAtk: 0 });
    u.hp = u.maxHp; u.face = R() < 0.5 ? 1 : -1;
    this.mobs.push(u);
    return u;
  }

  onClick(wx, wy) {
    if (this.hero.dead) return;
    // bấm trúng quái?
    let best = null, bd = 60;
    for (const m of this.mobs) {
      if (m.dead) continue;
      const d = Math.hypot(m.spr.x - wx, m.spr.y - 45 * m.scale - wy);
      if (d < bd) { bd = d; best = m; }
    }
    if (best) { this.hero.target = best; this.hero.path = null; return; }
    const t = toTile(wx, wy);
    this.hero.target = null;
    this.moveTo(t.c, t.r);
  }

  moveTo(c, r) {
    const h = this.hero;
    const p = astar(this.map.block, Math.round(h.c), Math.round(h.r), Math.round(c), Math.round(r));
    h.path = p ? p.slice(1).map(([a, b]) => ({ c: a, r: b })) : null;
    return !!p;
  }

  toggleOverview(force) {
    const on = force === undefined ? !this.overview : !!force;
    this.overview = on;
    if (window.KTTerrain) KTTerrain.setOverview(on);
    const cam = this.cameras.main;
    if (on) {
      // zoom vua khit ca hinh thoi (truoc day fix 0.11 -> map chi chiem nua trai man hinh)
      const zf = Math.min(this.scale.width / (N * TW + 160), this.scale.height / (N * TH + 120));
      cam.stopFollow(); cam.setZoom(zf); cam.centerOn(0, N * TH / 2);
    } else {
      cam.setZoom(camZoomFor(innerWidth, innerHeight));
      cam.startFollow(this.hero.spr, true, 0.12, 0.12);
    }
    HUD.toast(on ? 'Toàn map · bấm M để quay lại' : 'Quay lại');
    for (const m of this.mobs) if (!m.dead) { m.spr.setVisible(true); if (m.shadow) m.shadow.setVisible(true); }
  }

  toggleAuto() { this.hero.auto = !this.hero.auto; $('skAuto').classList.toggle('on', this.hero.auto); HUD.log(this.hero.auto ? 'Bật tự đánh' : 'Tắt tự đánh'); }

  castSkill() {
    const h = this.hero; if (h.dead || h.cdSkill > 0) return;
    if (h.mp < 25) { HUD.log('Không đủ nội lực'); return; }
    h.mp -= 25; h.cdSkill = 6;
    this.play(h, this.anims.get('lang-van:ultimate') ? 'ultimate' : 'basic', true); this.sfx('skill'); this.time.delayedCall(180, () => this.sfx('skill-vortex'));
    let n = 0;
    for (const m of this.mobs) if (!m.dead && Math.hypot(m.c - h.c, m.r - h.r) < 3.2) {
      this.vfx('skill', m); this.time.delayedCall(560, () => { if (!m.dead) { this.sfx('skill-vfx'); this.damage(m, dmgCalc(h.atk, m.def, skillCoef(h.lv) * 1.9), true); } });
      n++;
    }
    if (!n) this.vfx('skill', h);
    this.time.delayedCall(600, () => this.sfx('skill-hit'));
  }

  usePot() {
    const h = this.hero; if (h.dead || h.cdPot > 0) return;
    h.cdPot = 10; const v = Math.round(h.maxHp * 0.4); h.hp = Math.min(h.maxHp, h.hp + v);
    this.floatText(h, '+' + v, '#6aff7a');
  }

  vfx(k, u) {
    if (this.lowQ) return;
    const v = this.M.vfx[k];
    const s = this.add.sprite(u.spr.x, u.spr.y - 46 * u.scale, 'vfx:' + k).setDepth(u.spr.depth + 2).setScale(k === 'skill' ? 2.3 : 1.7);
    if (v.blend === 'screen') s.setBlendMode(Phaser.BlendModes.SCREEN);
    { const a = this.anims.get('vfx:' + k); if (a && a.frames.length) { s.play('vfx:' + k); s.on('animationcomplete', () => s.destroy()); } else { s.destroy(); return; } }
  }

  floatText(u, txt, color, big) {
    const t = this.add.text(u.spr.x + (Math.random() - 0.5) * 20, u.spr.y - 100 * u.scale, txt, { font: (big ? 'bold 22px' : 'bold 16px') + ' Segoe UI', color, stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(1e6 + 1);
    this.tweens.add({ targets: t, y: t.y - 40, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  damage(u, dmg, crit) {
    if (u.dead) return;
    u.hp -= dmg;
    if (u === this.hero) { this.floatText(u, '-' + dmg, '#ff6a5a'); this.sfx('hit'); }
    else { this.floatText(u, (crit ? 'Bạo kích ' : '') + dmg, crit ? '#ffd23a' : '#ffffff', crit); this.sfx('mob-hit'); u.provoked = true; if (u.state !== 'chase') { u.state = 'chase'; u.prey = this.hero; } }
    if (u.hp <= 0) return this.kill(u);
    if (u.clip !== 'basic') this.play(u, 'hit', true);
    u.spr.setTintFill(0xffffff); this.time.delayedCall(60, () => { u.spr.clearTint(); if (u.spot && u.spot.tint !== 0xffffff) u.spr.setTint(u.spot.tint); });
  }

  kill(u) {
    if (u !== this.hero) this.sfx('mob-die');
    u.dead = true; u.hp = 0; this.play(u, 'fall-die', true);
    if (u === this.hero) {
      HUD.toast('Trọng thương! Về thôn sau 3 giây'); this.hero.path = null; this.hero.target = null;
      this.time.delayedCall(3000, () => { const h = this.hero; h.dead = false; h.hp = h.maxHp; h.mp = h.maxMp; h.c = VILLAGE.c; h.r = VILLAGE.r + 0.5; this.play(h, 'idle', true); });
      return;
    }
    const h = this.hero;
    if (window.KTQuests) { try { KTQuests.onKill(u); } catch (e) { } }
    // buff lửa trại: +50% kinh nghiệm
    const buff = this.expBuff && performance.now() < this.expBuff;
    const exp = Math.round((12 + u.lv * 10) * (u.elite ? 8 : 1) * (buff ? 1.5 : 1));
    if (u.elite) { this.time.delayedCall(120, () => { for (let i = 0; i < 2; i++) this.lootDebug && this.lootDebug.dropAt(u.c + (Math.random() - 0.5) * 0.9, u.r + (Math.random() - 0.5) * 0.9, this.lootDebug.makeItem(Math.max(1, u.lv - 3), false)); }); this.expBuff = performance.now() + 60000; HUD.toast('Lửa trại: +50% kinh nghiệm 60 giây'); }
    if (!u.elite && !u.isBoss) { this.killStreak = (this.killStreak || 0) + 1;
      if (this.killStreak % 100 === 0) this.spawnElite(u.spot, u.si); }
    h.exp += exp; HUD.log('Hạ ' + u.name + ' Lv' + u.lv + ' · +' + exp + ' kinh nghiệm');
    if (h.target === u) h.target = null;
    while (h.exp >= this.expNeed(h.lv)) { h.exp -= this.expNeed(h.lv); this.levelUp(); }
    this.time.delayedCall(900, () => { this.tweens.add({ targets: [u.spr, u.shadow], alpha: 0, duration: 500, onComplete: () => { u.spr.destroy(); u.shadow.destroy(); u.bar.destroy(); u.label.destroy(); } }); });
    this.time.delayedCall(8000, () => { const i = this.mobs.indexOf(u); if (i >= 0) this.mobs.splice(i, 1); if (!u.elite && !u.isBoss) this.spawnMob(u.spot, u.si); });
  }

  expNeed(lv) { return Math.round(40 * Math.pow(lv, 1.5)); }
  levelUp() {
    const h = this.hero; h.lv++; h.maxHp += 30; h.maxMp += 8; h.atk += 6; h.def += 1; h.hp = h.maxHp; h.mp = h.maxMp;
    HUD.toast('Thăng cấp ' + h.lv + '!'); this.vfx('skill', h); this.sfx('voice');
  }

  regen() {
    const h = this.hero; if (h.dead) return;
    const fighting = this.mobs.some(m => !m.dead && m.state === 'chase');
    h.hp = Math.min(h.maxHp, h.hp + (fighting ? 1 : 6)); h.mp = Math.min(h.maxMp, h.mp + (fighting ? 2 : 5));
  }

  stepToward(u, tc, tr, speed, dt) {
    const dc = tc - u.c, dr = tr - u.r, d = Math.hypot(dc, dr);
    if (d < 0.02) return true;
    const s = Math.min(d, speed * dt);
    const nc = u.c + dc / d * s, nr = u.r + dr / d * s;
    const obs = this.obs;
    let moved = false;
    const stuckNow = obs.solid(u.c, u.r);   // đang chồng vật cản (lúc spawn / bị đẩy) → cho phép bước ra
    if (!obs.solid(nc, nr) || stuckNow) { u.c = nc; u.r = nr; moved = true; }
    else { // trượt dọc vật cản theo từng trục, giống cảm giác đi sát mép nhà bên TIÊU TỬ BÁ ĐẠO
      if (!obs.solid(nc, u.r)) { u.c = nc; moved = true; }
      if (!obs.solid(u.c, nr)) { u.r = nr; moved = true; }
      if (!moved) {
        // vẫn kẹt: bước ngang (vuông góc hướng đi) để lách qua, KHÔNG bỏ waypoint
        const ux = -dr / d, uy = dc / d;
        const sx2 = u.c + ux * s, sy2 = u.r + uy * s;
        const tx2 = u.c - ux * s, ty2 = u.r - uy * s;
        if (!obs.solid(sx2, sy2)) { u.c = sx2; u.r = sy2; moved = true; }
        else if (!obs.solid(tx2, ty2)) { u.c = tx2; u.r = ty2; moved = true; }
        if (!moved) return false;   // kẹt thật thì giữ waypoint, thử lại nhịp sau
      }
    }
    const sx = (dc - dr); if (Math.abs(sx) > 0.05) u.face = sx > 0 ? 1 : -1;
    return Math.hypot(tc - u.c, tr - u.r) < 0.08;
  }

  faceTo(u, t) { const sx = (t.c - t.r) - (u.c - u.r); if (Math.abs(sx) > 0.02) u.face = sx > 0 ? 1 : -1; }

  cull(time) {
    if (time - (this._cullT || 0) < 250) return;
    this._cullT = time;
    const cam = this.cameras.main;
    const pad = 240;
    const l = cam.worldView.x - pad, r = cam.worldView.right + pad;
    const t = cam.worldView.y - pad, b = cam.worldView.bottom + pad;
    let vis = 0;
    for (let i = 0; i < this.props.length; i++) {
      const o = this.props[i];
      const on = o.s.x > l && o.s.x < r && o.s.y > t && o.s.y < b;
      if (o.s.visible !== on) { o.s.setVisible(on); o.sh.setVisible(on); }
      if (on) vis++;
    }
    this._visible = vis;
    // tự hạ chất lượng nếu máy yếu (fps thấp kéo dài) — để không "đơ" ở bãi quái
    const fpsNow = this.game.loop.actualFps;
    if (fpsNow > 0 && fpsNow < 22) this._lowN = (this._lowN || 0) + 1; else this._lowN = 0;
    if (this._lowN >= 8 && !this.lowQ) {
      this.lowQ = true;
      for (const o of this.props) { o.sh.setVisible(false); }
      HUD.log('Máy yếu: đã tắt bóng đổ và hiệu ứng để chạy mượt hơn');
    }
    const el = document.getElementById('area');
    if (el) el.textContent = VILLAGE.name + ' · ' + Math.round(this.game.loop.actualFps) + ' fps';
    const el2 = document.getElementById('fps');
    if (el2) el2.textContent = Math.round(this.game.loop.actualFps) + ' fps · ' + vis + '/' + this.props.length;
  }

  update(time, deltaMs) {
    if (window.KTTerrain && this.terrain) KTTerrain.update(this, this.overview);
    if (window.KTQuests) { try { KTQuests.tick(this, 0.033); } catch (e) { } }
    if (this.afkLock) return;
    this.cull(time);
    // dt theo GIỜ THỰC, không phụ thuộc nhịp khung hình của trình duyệt
    const nowMs = performance.now();
    let dt = (nowMs - (this._tLast || nowMs)) / 1000;
    this._tLast = nowMs;
    if (!(dt > 0) || dt > 0.5) dt = 0.016;   // khung hình đầu / tab vừa quay lại
    dt = Math.min(dt, 0.25);
    const h = this.hero;
    h.cdSkill = Math.max(0, h.cdSkill - dt); h.cdPot = Math.max(0, h.cdPot - dt);
    if (!h.dead) {
      // tự đánh: tìm quái gần nhất
      if (h.auto && !h.target && !h.path) {
        let best = null, bd = 9;
        for (const m of this.mobs) if (!m.dead) { const d = Math.hypot(m.c - h.c, m.r - h.r); if (d < bd) { bd = d; best = m; } }
        h.target = best;
      }
      const busy = h.clip === 'basic' && (h.spr.anims && h.spr.anims.isPlaying) || h.clip === 'hit' && (h.spr.anims && h.spr.anims.isPlaying);
      if (h.target && !h.target.dead) {
        const d = Math.hypot(h.target.c - h.c, h.target.r - h.r);
        if (d > 1.25) {
          if (!busy) { this.play(h, 'run'); this.stepToward(h, h.target.c, h.target.r, 2.1, dt); }
        } else {
          this.faceTo(h, h.target);
          if (time >= h.nextAtk && !busy) {
            h.nextAtk = time + 850; this.play(h, 'basic', true); this.sfx(Math.random() < 0.5 ? 'atk' : 'atk2'); h.combo = (h.combo || 0) + 1; if (h.combo % 4 === 0) { this.time.delayedCall(320, () => { this.sfx('passive'); if (h.target && !h.target.dead) { this.vfx('hit', h.target); this.damage(h.target, Math.round(h.atk * 0.8), true); } }); HUD.log('Nội tại: Vân Ảnh'); }
            const m = h.target;
            this.time.delayedCall(330, () => {
              if (m.dead || h.dead) return;
              const _miss = Math.min(0.3, Math.max(0.02, (m.dodge || 0) * 0.004 - (h.acc || 0) * 0.002));
              if (Math.random() < _miss) { this.floatText(m, 'Né', '#9fd7ff'); return; }
              const crit = Math.random() < CRIT_RATE; let dmg = dmgCalc(h.atk, m.def, skillCoef(h.lv)); if (crit) dmg = Math.round(dmg * CRIT_MULT);
              this.vfx('hit', m); this.damage(m, dmg, crit);
            });
          } else if (!busy) this.play(h, 'idle');
        }
      } else if (h.path && h.path.length) {
        if (!busy) { this.play(h, 'run'); if (this.stepToward(h, h.path[0].c, h.path[0].r, 2.3, dt)) h.path.shift(); }
      } else {
        h.target = null; h.path = null;
        if (!busy) this.play(h, 'idle');
      }
      if (h.clip !== 'idle' && h.clip !== 'run' && !(h.spr.anims && h.spr.anims.isPlaying) && !h.dead) this.play(h, 'idle');
    }
    this.place(h);
    this.heroRing.setPosition(h.spr.x, h.spr.y);
    if (h.target && !h.target.dead) this.targetRing.setVisible(true).setPosition(h.target.spr.x, h.target.spr.y).setScale(h.target.scale);
    else this.targetRing.setVisible(false);

    // quái
    for (const m of this.mobs) {
      if (m.dead) { this.place(m); continue; }
      const dh = Math.hypot(h.c - m.c, h.r - m.r), dHome = Math.hypot(m.c - m.home.c, m.r - m.home.r);
      // CULL: xa hơn 24 ô thì tắt hiển thị + không chạy AI (map có ~180 con)
      if (!this.overview && dh > 24) { m.spr.setVisible(false); if (m.shadow) m.shadow.setVisible(false); if (m.bar) m.bar.setVisible(false); if (m.label) m.label.setVisible(false); continue; }
      else { m.spr.setVisible(true); if (m.shadow) m.shadow.setVisible(true); }
      const busy = (m.clip === 'basic' || m.clip === 'hit') && (m.spr.anims && m.spr.anims.isPlaying);
      // Quái ôn hoà: chỉ truy đuổi khi bị hero đánh trúng (provoked, set trong damage()).
      // Boss cốt truyện giữ nguyên aggro theo khoảng cách; quái đang leash về bãi thì không bị kéo lại.
      if (m.state !== 'chase' && m.state !== 'return' && !h.dead && dh < 3.5 && m.isBoss) { m.state = 'chase'; }
      if (m.state === 'chase') {
        if (h.dead || dHome > 9) { m.state = 'return'; }
        else if (dh > 1.15) { if (!busy) { this.play(m, 'run'); this.stepToward(m, h.c, h.r, 1.6, dt); } }
        else {
          this.faceTo(m, h);
          if (time >= m.nextAtk && !busy) {
            m.nextAtk = time + 1400; this.play(m, 'basic', true);
            this.time.delayedCall(380, () => { if (m.dead || h.dead) return; if (Math.hypot(h.c - m.c, h.r - m.r) < 1.6) {
                const _dg = Math.min(0.4, Math.max(0, (h.dodge || 0) * 0.003 - (m.acc || 0) * 0.002));
                if (Math.random() < _dg) { this.floatText(h, 'Né', '#9fd7ff'); return; }
                this.damage(h, dmgCalc(m.atk, h.def, 1.0)); } });
          } else if (!busy) this.play(m, 'idle');
        }
      } else if (m.state === 'return') {
        this.play(m, 'run'); m.hp = Math.min(m.maxHp, m.hp + m.maxHp * dt * 0.5);
        if (this.stepToward(m, m.home.c, m.home.r, 2.0, dt)) { m.state = 'idle'; m.hp = m.maxHp; m.provoked = false; }
      } else if (m.state === 'idle') {
        if (!busy) this.play(m, 'idle');
        if (m.wait === undefined) m.wait = Math.random() * 10;   // lệch pha: không cả bãi cùng bước
        m.wait -= dt;
        if (m.wait <= 0) { // ~10 giây mới nhích 2-3 bước (0,5-0,8 ô), không rời chỗ quá 2,5 ô
          const a = Math.random() * Math.PI * 2, d = 1.0 + Math.random() * 0.5;
          let gc = m.c + Math.cos(a) * d, gr = m.r + Math.sin(a) * d;
          if (Math.hypot(gc - m.home.c, gr - m.home.r) > 3.2) { const k = d / Math.max(0.01, Math.hypot(m.home.c - m.c, m.home.r - m.r)); gc = m.c + (m.home.c - m.c) * k; gr = m.r + (m.home.r - m.r) * k; }
          m.state = 'wander'; m.goal = { c: gc, r: gr }; m.wanderT = 0; }
      } else if (m.state === 'wander') {
        this.play(m, 'run');
        m.wanderT = (m.wanderT || 0) + dt;
        if (this.stepToward(m, m.goal.c, m.goal.r, 0.45, dt) || m.wanderT > 3) { m.state = 'idle'; m.wait = 7.6 + Math.random() * 0.8; }
      }
      if (m.clip !== 'idle' && m.clip !== 'run' && !(m.spr.anims && m.spr.anims.isPlaying)) this.play(m, 'idle');
      this.place(m);
    }
  }

  drawMinimap() {
    const cv = $('mm'), x = cv.getContext('2d'), col = k => G.GRASS.includes(k) ? '#4f7a2c' : G.WATER.includes(k) ? '#3a7aa8' : G.PATH.includes(k) ? '#b08a50' : k === G.WOOD ? '#8a5a2a' : k === G.SAND ? '#d8c088' : k === G.DIRT ? '#8a6a3c' : '#666';
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { x.fillStyle = this.map.obj[r][c] && this.map.obj[r][c] !== 'bush' ? '#2a4a18' : col(this.map.t[r][c]); x.fillRect(c, r, 1, 1); }
  }

  updateHud() {
    const h = this.hero;
    HUD.bar('hp', h.hp, h.maxHp); HUD.bar('mp', h.mp, h.maxMp);
    $('lv').textContent = 'Cấp ' + h.lv + ' · Công ' + h.atk;
    $('exp').firstChild.style.width = (h.exp / this.expNeed(h.lv) * 100) + '%';
    $('sk1').querySelector('.cd').style.height = (h.cdSkill / 6 * 100) + '%';
    $('skPot').querySelector('.cd').style.height = (h.cdPot / 10 * 100) + '%';
    let area = VILLAGE.name, bd = Math.hypot(h.c - VILLAGE.c, h.r - VILLAGE.r) < 6 ? 0 : 1e9;
    for (const s of SPOTS) { const d = Math.hypot(h.c - s.c, h.r - s.r); if (d < 7 && d < bd) { bd = d; area = s.area; } }
    if (bd === 1e9) area = 'Ngoại ô Vân Sơn';
    $('area').textContent = area;
    $('pos').textContent = 'Toạ độ ' + Math.round(h.c) + ' · ' + Math.round(h.r);
    const d = $('mmd').getContext('2d'); d.clearRect(0, 0, N, N);
    d.fillStyle = '#ff4030'; for (const m of this.mobs) if (!m.dead) d.fillRect(Math.round(m.c), Math.round(m.r), 1, 1);
    d.fillStyle = '#ffe08a'; d.fillRect(Math.round(h.c) - 1, Math.round(h.r) - 1, 3, 3);
  }
}

const DPR = Math.max(1, Math.min(window.devicePixelRatio || 1, 2)); window.__DPR = DPR;
function camZoomFor(w, h) { return (w >= h ? Math.min(0.72, Math.max(0.56, h / 650)) : Math.min(0.9, Math.max(0.64, w / 620))) * DPR; }
addEventListener('resize', () => { const s = window.__kt; if (!s || !s.game) return; s.game.scale.resize(Math.round(innerWidth * DPR), Math.round(innerHeight * DPR)); s.game.scale.setZoom(1 / DPR); s.cameras.main.setZoom(camZoomFor(innerWidth, innerHeight)); });
function startGame() {
  $('start').remove();
  new Phaser.Game({
    type: Phaser.AUTO, parent: 'game', backgroundColor: '#0d1408',
    scale: { mode: Phaser.Scale.NONE, width: Math.round(innerWidth * DPR), height: Math.round(innerHeight * DPR), zoom: 1 / DPR },
    render: { antialias: true, powerPreference: 'high-performance' },
    audio: { disableWebAudio: /iPhone|iPad|iPod/i.test(navigator.userAgent) },
    scene: [Boot, Main],
  });
}
$('go').onclick = startGame;
if (location.search.includes('auto')) startGame();


/* ---- điều khiển cảm ứng: joystick, nút ĐÁNH, vòng hồi chiêu ---- */
(function () {
  const inp = { dx: 0, dy: 0, active: false, last: 0 };
  function install(s) {
    const box = document.getElementById('touch');
    if (!box) return;
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || innerWidth < 820;
    box.style.display = isTouch ? 'block' : 'none';
    if (!isTouch) return;
    const joy = document.getElementById('joy'), knob = joy.querySelector('i');
    const R = 52;
    const setKnob = (x, y) => { knob.style.transform = 'translate(' + x + 'px,' + y + 'px)'; };
    const read = e => { const p = e.touches ? e.touches[0] : e; const r = joy.getBoundingClientRect(); return { x: p.clientX - (r.left + r.width / 2), y: p.clientY - (r.top + r.height / 2) }; };
    const start = e => { inp.active = true; move(e); e.preventDefault(); };
    const move = e => {
      if (!inp.active) return;
      let { x, y } = read(e); const d = Math.hypot(x, y);
      if (d > R) { x = x / d * R; y = y / d * R; }
      setKnob(x, y);
      inp.dx = x / R; inp.dy = y / R;
      e.preventDefault();
    };
    const end = e => { inp.active = false; inp.dx = inp.dy = 0; setKnob(0, 0); if (e) e.preventDefault(); };
    joy.addEventListener('pointerdown', start); joy.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
    // joystick -> đặt đích cách 2,6 ô theo hướng đang giữ (dùng lại A* sẵn có)
    setInterval(() => {
      if (!inp.active || s.hero.dead) return;
      const now = performance.now(); if (now - inp.last < 180) return; inp.last = now;
      const L = Math.hypot(inp.dx, inp.dy); if (L < 0.25) return;
      // màn hình: phải = +c, xuống = +r (đúng phép chiếu iso)
      const dc = (inp.dx + inp.dy) * 2.6, dr = (inp.dy - inp.dx) * 2.6;
      s.moveTo(Math.round(s.hero.c + dc), Math.round(s.hero.r + dr));
    }, 60);
    // nút ĐÁNH: khoá mục tiêu gần nhất trong 5 ô
    const atk = document.getElementById('atk');
    atk.addEventListener('pointerdown', e => {
      e.preventDefault();
      let best = null, bd = 5;
      for (const m of s.mobs) if (!m.dead) { const d = Math.hypot(m.c - s.hero.c, m.r - s.hero.r); if (d < bd) { bd = d; best = m; } }
      if (best) { s.hero.target = best; s.hero.path = null; if (!s.hero.auto) s.toggleAuto(); }
      else { s.sfx('ui'); HUD.log('Không có quái trong 5 ô'); }
    });
    // vòng hồi chiêu
    const c1 = document.getElementById('c1'), c2 = document.getElementById('c2');
    setInterval(() => {
      const h = s.hero;
      c1.querySelector('s').style.height = Math.min(100, Math.max(0, (h.cdSkill || 0) / 10 * 100)) + '%';
      c1.querySelector('em').textContent = (h.cdSkill || 0) > 0.2 ? Math.ceil(h.cdSkill) + 's' : 'Tuyệt';
      c2.querySelector('s').style.height = Math.min(100, Math.max(0, (h.cdPot || 0) / 15 * 100)) + '%';
      c2.querySelector('em').textContent = (h.cdPot || 0) > 0.2 ? Math.ceil(h.cdPot) + 's' : 'Hồi';
    }, 200);
    box.addEventListener('pointerdown', () => { if (s.tryUnlockAudio) s.tryUnlockAudio(); });
  }
  const t = setInterval(() => { if (window.__kt && window.__kt.moveTo) { clearInterval(t); install(window.__kt); } }, 400);
})();

