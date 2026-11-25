/* TIÊU TỬ BÁ ĐẠO — Thôn Vân Sơn (Phaser 3, isometric 128x64)
 * Map sinh bằng noise có seed: nền (cỏ/đất/đường/cát/nước/cầu gỗ) + lớp trang trí (cỏ, hoa, sỏi)
 * + lớp vật thể (cây, đá, bụi, đèn đá) có bóng, sắp xếp theo độ sâu.
 * Nhân vật + quái + VFX + âm thanh lấy từ Lục Thần (assets/lt, đóng gói bằng tools/pack_lucthan.py).
 */
'use strict';
// ---- MỖI MAP MỘT FILE (kiểu TIÊU TỬ BÁ ĐẠO): maps/<id>/map.json. Game chỉ biết ID map đang đứng (lưu trong save).
const START_MAP = 'thon-van-son';
const LEGACY_MAP = { 0: 'thon-van-son', 1: 'dong-van-son', 2: 'rung-the' };
function loadMapSync(id) {
  const x = new XMLHttpRequest(); x.open('GET', 'maps/' + id + '/map.json?v=' + (window.__KT_VER || 1), false); x.send(null);
  if (x.status !== 200 && x.status !== 0) throw new Error('Không tải được map ' + id + ' (' + x.status + ')');
  return JSON.parse(x.responseText);
}
const MAP_ID = (() => { try {
  const d = JSON.parse(localStorage.getItem('ttbd-save-v1') || 'null');
  if (!d) return START_MAP;                                        // game mới: bắt đầu trong thôn
  if (typeof d.map === 'string') return d.map;
  if (!d.mv && d.map !== 2) return START_MAP;                      // save cũ (thôn nằm chung map 1) -> về thôn
  return LEGACY_MAP[d.map] || START_MAP; } catch (e) { return START_MAP; } })();
let MAPDEF; try { MAPDEF = loadMapSync(MAP_ID); } catch (e) { MAPDEF = loadMapSync(START_MAP); }
const TW = 128, TH = 64, N = MAPDEF.size || 56;
window.MAPDEF = MAPDEF; window.N = N;

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
const VILLAGE = Object.assign({ name: MAPDEF.name }, MAPDEF.center);   // tâm map: điểm xuất hiện / quảng trường
const SPOTS = (MAPDEF.spots || []).map(sp => Object.assign({ tint: 0xffffff }, sp));
window.SPOTS = SPOTS;   // cho quests.js đọc bãi quái
window.VILLAGE = VILLAGE;   // cho feel.js biet moc vung lang
// công trình làng: ảnh lưu 1.5x, bán kính chặn (ô) theo móng nhà
const VILLAGE_ART = ['v-chief', 'v-chief-hero', 'v-tavern', 'v-forge', 'v-medicine', 'v-store', 'v-houseA', 'v-houseB', 'v-well'];
const VILLAGE_RAD = { 'v-chief': 1.5, 'v-chief-hero': 3.4, 'v-tavern': 1.6, 'v-forge': 1.3, 'v-medicine': 1.25, 'v-store': 1.25, 'v-houseA': 1.1, 'v-houseB': 1.1, 'v-well': 0.55, 'v-bridge': 0, 'v-fish': 0 };

const TOWN = MAPDEF.type === 'town';
const TOWN_R = MAPDEF.walkRadius || Math.floor(N / 2) - 4;   // thôn: nửa cạnh vùng đi được, ngoài là vành rừng
const MAPCFG = { seed: MAPDEF.seed || 7, bgm: MAPDEF.bgm || 'bgm-field' };
window.MAP_ID = MAP_ID; window.TOWN = TOWN; window.TOWN_R = TOWN_R;
const inTown = (c, r, pad = 0) => Math.max(Math.abs(c - VILLAGE.c), Math.abs(r - VILLAGE.r)) <= TOWN_R + pad;


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
  // Thôn: nền sạch trước, sau đó vẽ suối lấy đường cong từ file map (nước + bờ cát)
  if (TOWN) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (!inTown(c, r, 3)) continue;
    if (G.WATER.includes(t[r][c]) || t[r][c] === G.SAND && !near(c, r, VILLAGE, 2.6)) t[r][c] = G.GRASS[(c * 7 + r) % 3];
  }
  if (TOWN && MAPDEF.river && MAPDEF.river.points.length > 1) {
    const pts = MAPDEF.river.points, width = MAPDEF.river.width || 1.2, bank = MAPDEF.river.bank || 1.5;
    for (let r = 1; r < N - 1; r++) for (let c = 1; c < N - 1; c++) {
      let md = 1e9;
      for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], vx = b.c - a.c, vy = b.r - a.r, d2 = vx * vx + vy * vy || 1;
        const u = Math.max(0, Math.min(1, ((c - a.c) * vx + (r - a.r) * vy) / d2)); md = Math.min(md, Math.hypot(c - (a.c + vx * u), r - (a.r + vy * u))); }
      if (md <= width) { t[r][c] = G.WATER[(c + r) & 1]; block[r][c] = true; }
      else if (md <= width + bank && !G.PATH.includes(t[r][c])) { t[r][c] = G.SAND; block[r][c] = false; }
    }
  }
  // Streets are map data. If a street crosses the stream, convert those water cells into walkable wood bridge deck.
  const way = TOWN ? null : [VILLAGE, SPOTS[0], SPOTS[1], SPOTS[2]].filter(Boolean);
  if (TOWN) for (const end of (MAPDEF.streets || [{ c: VILLAGE.c, r: VILLAGE.r + TOWN_R - 2 }, { c: VILLAGE.c + TOWN_R - 2, r: VILLAGE.r }])) {
    const steps = Math.ceil(Math.hypot(end.c - VILLAGE.c, end.r - VILLAGE.r) * 2);
    for (let i = 0; i <= steps; i++) { const f = i / steps, c = Math.round(VILLAGE.c + (end.c - VILLAGE.c) * f), r = Math.round(VILLAGE.r + (end.r - VILLAGE.r) * f);
      for (const [dc, dr] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (c + dc > 0 && r + dr > 0 && c + dc < N - 1 && r + dr < N - 1) { const rr = r + dr, cc = c + dc, k = t[rr][cc]; t[rr][cc] = (G.WATER.includes(k) || k === G.WOOD) ? G.WOOD : G.PATH[0]; } }
  }
  for (let i = 0; way && i < way.length - 1; i++) {
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
 this.load.json('man', LT + 'manifest.json?v=' + (window.__KT_VER || 13)); this.load.json('propdefs', 'assets/props.json?v=' + (window.__KT_VER || 13)); }
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

/* ---------------- Bảng kỹ năng (một chỗ duy nhất) ----------------
   Thêm kỹ năng mới = thêm 1 dòng ở đây + 1 nhánh trong cast() + 1 ô <div class="sk">
   trong index.html. Không rải logic ra nhiều nơi. */
const SKILLS = {
  ultimate: { name: 'Tuyệt kỹ',  key: '1', cd: 6,  mp: 25, lv: 1 },
  pot:      { name: 'Hồi máu',   key: '2', cd: 10, mp: 0,  lv: 1 },
  chop:     { name: 'Trảm',      key: '3', cd: 4,  mp: 8,  lv: 1 },
  dash:     { name: 'Tốc biến',  key: '4', cd: 8,  mp: 10, lv: 2 },
  guard:    { name: 'Hộ thân',   key: '5', cd: 20, mp: 15, lv: 3 },
  bind:     { name: 'Định thân', key: '6', cd: 15, mp: 20, lv: 4 },
  combo:    { name: 'Liên hoàn', key: '7', cd: 12, mp: 18, lv: 5 },
  auto:     { name: 'Tự đánh',   key: '8', cd: 0,  mp: 0,  lv: 1, toggle: true },
};

class Main extends Phaser.Scene {
  constructor() { super('main'); }
  preload() {
    const M = this.M = this.cache.json.get('man');
    this.load.spritesheet('tiles', 'assets/tiles/terrain-base.png', { frameWidth: 128, frameHeight: 64 });
    for (const p of ['pine', 'oak', 'sakura', 'rock', 'bush', 'lantern', 'grass', 'bamboo', 'willow', 'bamboo-hedge', 'bamboo-clump', 'bamboo-strip', 'bamboo-far', 'bridge', 'shrine', 'paddy', 'hut', 'cart',
      'house-a', 'house-b', 'house-c', 'house-d', 'house-e', 'house-f', 'gate', 'flag', 'drum', 'well']) this.load.image(p, (p.startsWith('house-') ? 'assets/props2/' : 'assets/props3/') + p + '.webp?v=' + (window.__KT_VER || 26));
    /* HD (2x) chỉ nạp cho các clip nhìn lâu: idle/run/basic. Clip combat ngắn dùng SD —
       tiết kiệm ~35 MB VRAM, quan trọng với iPhone/Safari (giới hạn bộ nhớ tab). */
    const HD_CLIPS = { idle: 1, run: 1, basic: 1 };
    // Clip nào đã có bản HD (2x) thì KHÔNG nạp bản SD nữa — trước đây nạp cả hai,
    // riêng idle/run/basic của 6 nhân vật là ~1,4 MB tải thừa. Danh sách HD lấy từ
    // assets/lt-hd/index.json (tools/gen_hd_index.py sinh lúc build).
    let hdSet = null;
    try {
      const x = new XMLHttpRequest(); x.open('GET', HDLT + 'index.json?v=' + (window.__KT_VER || 1), false); x.send(null);
      if (x.status === 200 || x.status === 0) { const j = JSON.parse(x.responseText); if (j && Array.isArray(j.files)) hdSet = new Set(j.files); }
    } catch (e) { hdSet = null; }
    window.__KT_HD = hdSet ? hdSet.size : 0;
    for (const [cid, ch] of Object.entries(M.chars)) {
      for (const [cl, c] of Object.entries(ch.clips)) {
        const useHD = !!HD_CLIPS[cl] && (!hdSet || hdSet.has(c.file));
        if (useHD) this.load.spritesheet('hdx:' + cid + ':' + cl, HDLT + c.file, { frameWidth: c.w * 2, frameHeight: c.h * 2 });
        else this.load.spritesheet(cid + ':' + cl, LT + c.file, { frameWidth: c.w, frameHeight: c.h });
      }
    }
    // HD thiếu/lỗi thì nạp bù bản SD rồi dựng lại animation — không để nhân vật mất hình
    this.load.on('loaderror', (file) => {
      const k = String((file && file.key) || '');
      if (!k.startsWith('hdx:')) return;
      const rest = k.slice(4), i = rest.lastIndexOf(':');
      const cid = rest.slice(0, i), cl = rest.slice(i + 1);
      const ch = M.chars[cid], c = ch && ch.clips && ch.clips[cl];
      if (!c || this.textures.exists(cid + ':' + cl)) return;
      console.warn('HD lỗi, dùng SD:', k);
      this.load.spritesheet(cid + ':' + cl, LT + c.file, { frameWidth: c.w, frameHeight: c.h });
      this.load.once('complete', () => this.makeAnims());
      this.load.start();
    });
    for (const k of ['npc-pho', 'npc-mo']) this.load.image(k, LT + k + '.webp');
    for (const k of ['grass', 'dirt', 'brick', 'stone']) this.load.image('tex-' + k, 'assets/tex/' + k + '.jpg');
    this.load.image('tex-ground-paint', 'assets/tex/ground-paint.webp');
    for (const k of ['grass', 'dirt', 'stone']) this.load.image('g-' + k, 'assets/tex/ground-' + k + '.webp?v=' + (window.__KT_VER || 29));
    // vật thể khai báo trong props.json có 'file' riêng (deco-*) trước đây KHÔNG được nạp -> 418 ô __MISSING đen
    { const PD = this.cache.json.get('propdefs') || {};
      for (const [k, d] of Object.entries(PD)) if (d && d.file && !this.textures.exists(k)) this.load.image(k, d.file + '?v=' + (window.__KT_VER || 13)); }
    for (const k of VILLAGE_ART) this.load.image(k, 'assets/village/' + k + '.webp?v=' + (window.__KT_VER || 26));
    for (const k of ['npc2-thuoc', 'npc2-ren', 'npc2-truong', 'npc2-taphoa', 'npc2-tuu']) this.load.image(k, LT + k + '.webp');
    for (let i = 0; i < 3; i++) this.load.image('reed-art' + i, 'assets/reeds/reed' + i + '.webp?v=59');
    this.load.json('walkmask', 'assets/data/walkmask.json');
    // tile lát chi tiết (128×64, đúng lưới iso) — dùng cho lớp đường/sân
    for (const k of ['tile-stone-a', 'tile-stone-b', 'tile-dirt-a', 'tile-dirt-b'])
      this.load.image(k, 'assets/tex/' + k + '.webp?v=' + (window.__KT_VER || 1));
    // nền vẽ liền cho map đặc biệt (sân đấu): map.json -> plate
    if (MAPDEF.plate) this.load.image('map-plate', MAPDEF.plate + '?v=' + (window.__KT_VER || 1));
    this.load.image('arena', 'assets/arena.jpg');
    if (this.textures.exists('vfx-boss') || true) this.load.image('vfx-boss', 'assets/lt/vfx-boss.webp');
    for (const [k, v] of Object.entries(M.vfx)) this.load.spritesheet('vfx:' + k, LT + v.file, { frameWidth: v.w, frameHeight: v.h });
    for (const [k, f] of Object.entries(M.bgm)) this.load.audio(k, LT + f);
    for (const [k, f] of Object.entries(M.sfx)) this.load.audio('sfx-' + k, LT + f);
    const t = this.add.text(innerWidth / 2, innerHeight / 2, 'Đang tải 0%', { font: '16px Segoe UI', color: '#f0d79a' }).setOrigin(0.5).setScrollFactor(0);
    this.load.on('progress', p => { if (t && t.active) t.setText('Đang tải ' + Math.round(p * 100) + '%'); });
    // nạp thêm asset lúc chạy (trang phục) không được chạm vào text đã huỷ
    this.load.on('complete', () => { try { t.destroy(); } catch (e) { } this.load.off('progress'); });
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
      { const hk = 'hdx:' + cid + ':' + cl; const src = (this.textures.exists(hk) && this.textures.get(hk).frameTotal > 1) ? hk : ((this.textures.exists(cid + ':' + cl) && this.textures.get(cid + ':' + cl).frameTotal > 1) ? cid + ':' + cl : null); if (src) { const tx = this.textures.get(src); const total = tx.frameTotal - (tx.has('__BASE') ? 1 : 0); const end = Math.min(c.frames - 1, total - 1); const n = end + 1; const baseRate = (cl === 'run' ? 0.75 : 1) * 1000 / c.ms; /* sheet có thể ít frame hơn manifest: giữ NGUYÊN tổng thời lượng clip thay vì tua nhanh */ const rate = baseRate * (n / c.frames); if (this.anims.exists(cid + ':' + cl)) this.anims.remove(cid + ':' + cl); this.anims.create({ key: cid + ':' + cl, frames: this.anims.generateFrameNumbers(src, { start: 0, end }), frameRate: rate, repeat: (cl === 'idle' || cl === 'run') ? -1 : 0 }); } }
    for (const [k, v] of Object.entries(this.M.vfx))
      if (this.textures.exists('vfx:' + k) && this.textures.get('vfx:' + k).frameTotal > 1) { const txv = this.textures.get('vfx:' + k); const tv = txv.frameTotal - (txv.has('__BASE') ? 1 : 0); this.anims.create({ key: 'vfx:' + k, frames: this.anims.generateFrameNumbers('vfx:' + k, { start: 0, end: Math.min(v.frames - 1, tv - 1) }), frameRate: 1000 / v.ms, repeat: 0 }); }
  }

  create() {
    this.makeTextures(); this.makeAnims();
    try { window.KT_PROPS = this.cache.json.get('propdefs') || null; } catch (e) { window.KT_PROPS = null; }
    // thư viện vật thể dùng chung (data-driven): id -> file, anchor, bóng, bán kính chặn
    // (gộp thư viện props sau khi OH/SH được khai báo — xem bên dưới)
    const MINPROP = 1.6;   // khoảng cách tối thiểu giữa 2 vật thể (ô)
    const map = this.map = genMap(MAPCFG.seed);
    // Tân thủ trấn: dọn cây/đá rải ngẫu nhiên trong lõi phố; để mặt phố, hai hàng nhà và quảng trường đọc rõ.
    if (TOWN) { const CITY_R = 20;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (Math.max(Math.abs(c - VILLAGE.c), Math.abs(r - VILLAGE.r)) <= CITY_R) {
        map.obj[r][c] = null; map.block[r][c] = G.WATER.includes(map.t[r][c]); }
      map.deco = map.deco.filter(d => Math.max(Math.abs(d.c - VILLAGE.c), Math.abs(d.r - VILLAGE.r)) > CITY_R);
    }
    { const keep = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const p = map.obj[r][c]; if (!p) continue;
        let ok = true; for (const k of keep) if (Math.hypot(k[0] - c, k[1] - r) < MINPROP) { ok = false; break; }
        if (ok) keep.push([c, r]); else { map.obj[r][c] = null; map.block[r][c] = false; } } }
    { // CỤM: 60% vật thể giữ trong 12 cụm, ngoài cụm chỉ giữ 40% -> mọc thành đám như map thật
      const R2 = rng(MAPCFG.seed + 77), CL = [];
      for (let i = 0; i < 12; i++) CL.push([6 + R2() * (N - 12), 6 + R2() * (N - 12)]);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const p = map.obj[r][c]; if (!p || /^(gate|flag|drum|well|shrine|cart|hut|bridge|house-|v-)/.test(p)) continue;
        const inC = CL.some(q => Math.hypot(q[0] - c, q[1] - r) < 4.5);
        if (!inC && R2() > 0.4) { map.obj[r][c] = null; map.block[r][c] = false; } } }
    // công trình thôn quanh quảng trường (đặt tay, không ngẫu nhiên)
    // LÀNG kiểu TIÊU TỬ BÁ ĐẠO: phố đầy đủ nhà cửa/cửa hàng/NPC (assets/village, vẽ isometric 2:1)
    const STRUCTS = MAPDEF.structs || [];   // công trình đặt tay: đọc từ file map
    for (const [k, c0, r0] of STRUCTS) { const c = Math.round(c0), r = Math.round(r0); if (c > 0 && r > 0 && c < N && r < N) { map.obj[r][c] = k; map.block[r][c] = true; } }
    window.KTGround.RAD_OVERRIDE = Object.assign(window.KTGround.RAD_OVERRIDE || {}, VILLAGE_RAD);
    // tranh làng đã có nhà/cây sẵn: xoá vật thể trùng trong bán kính 8 ô (giữ vài món điểm nhấn)
    { const KEEP = /^(well|drum|gate|flag|lantern|shrine|v-.*)$/;
      for (let r2 = 0; r2 < N; r2++) for (let c2 = 0; c2 < N; c2++) { const q = map.obj[r2][c2]; if (!q || KEEP.test(q)) continue;
        if (Math.hypot(c2 - VILLAGE.c, r2 - VILLAGE.r) < 9) { map.obj[r2][c2] = null; map.block[r2][c2] = false; } } }
    // VIỀN CẢNH: vành đá chạy quanh biên để mép map không bị cắt cụt
    for (let i = 1; i < N - 1; i++) for (const [r, c] of [[1, i], [N - 2, i], [i, 1], [i, N - 2]]) {
      if (!map.obj[r][c] && (i % 3 !== 0)) { map.obj[r][c] = 'rock'; map.block[r][c] = true; } }
    // lớp 1: nền vẽ LIỀN — một texture cho cả map, không lặp ô 128×64
    map.N = N;
    const tG0 = performance.now();
    const texPix = k => { if (!this.textures.exists(k)) return null; const im = this.textures.get(k).getSourceImage(); const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const x = cv.getContext('2d'); x.drawImage(im, 0, 0); return { d: x.getImageData(0, 0, im.width, im.height).data, w: im.width, h: im.height }; };
    const tex = { grass: texPix('tex-grass'), dirt: texPix('tex-dirt'), brick: texPix('tex-brick'), stone: texPix('tex-stone'), paint: texPix('tex-ground-paint') };
    const gt = KTGround.makeGroundTexture(this, map, G, { isoX, isoY, TW, TH, div: 2, tex, plaza: TOWN ? { c: VILLAGE.c, r: VILLAGE.r, rad: MAPDEF.plazaRadius || 2.9 } : null });
    this.add.image(gt.midX, gt.midY, gt.key).setDisplaySize(gt.W, gt.H).setDepth(-1e6);
    // TOÀN MAP = 1 ảnh liền đã keystone (nghiêng vào trong), phủ đúng 7168x3584 world px
    // NỀN MỚI: 3 texture liền mép trộn theo địa hình, vẽ đúng độ phân giải gốc (js/terrain.js)
    if (window.KTTerrain && this.textures.exists('g-grass')) { const tVil = TOWN ? Object.assign({}, VILLAGE, { plazaRadius: MAPDEF.plazaRadius || 5.6 }) : Object.assign({}, VILLAGE, { plaza: false }); const tSpots = TOWN ? (MAPDEF.streets || []) : SPOTS; this.terrain = KTTerrain.init(this, { N, TW, TH, village: tVil, spots: tSpots, seed: (MAPCFG.seed || 7), river: TOWN ? MAPDEF.river : null, plate: (MAPDEF.plate && this.textures.exists('map-plate')) ? 'map-plate' : null, tiles: (MAPDEF.tileLayer && !/[?&]notile=1/.test(location.search)) ? { stone: ['tile-stone-a', 'tile-stone-b'].map(k => this.textures.get(k).getSourceImage()), dirt: ['tile-dirt-a', 'tile-dirt-b'].map(k => this.textures.get(k).getSourceImage()) } : null }); }
    if (!/[?&]noback=1/.test(location.search)) this.buildBackdrop();
    this.buildElevation();
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
    { const wmP = MAPDEF.walkmask ? this.cache.json.get('walkmask') : null;
      if (wmP && wmP.w) {
        const KEEP = /^(gate|flag|drum|well|lantern|shrine|cart|hut|bridge|house-|v-)/;   // công trình đặt tay: giữ
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
    // THÔN KHÉP KÍN: ngoài vùng thôn bỏ hết vật thể, vành rừng dày 3 ô bao quanh
    if (TOWN) { const RT = rng(MAPCFG.seed + 515); let nw = 0;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const d = Math.max(Math.abs(c - VILLAGE.c), Math.abs(r - VILLAGE.r));
        if (d <= TOWN_R) continue;
        map.obj[r][c] = null; map.block[r][c] = true;
        if (d <= TOWN_R + 3 && c > 0 && r > 0 && c < N - 1 && r < N - 1 && ((c + r) % 2 === 0 || d === TOWN_R + 1)) {
          const x = RT(); map.obj[r][c] = x < 0.55 ? 'pine' : x < 0.8 ? 'oak' : x < 0.9 ? 'sakura' : 'rock'; nw++; }
      }
      this.townWall = nw; }
    this.obs = KTGround.buildObstacles(map, G);
    if (TOWN) { const SUB = this.obs.SUB, FN = this.obs.FN, fine = this.obs.fine;
      for (let rr = 0; rr < FN; rr++) for (let cc = 0; cc < FN; cc++) {
        const c = cc / SUB, r = rr / SUB;
        if (Math.max(Math.abs(c - VILLAGE.c - 0.5 / SUB), Math.abs(r - VILLAGE.r - 0.5 / SUB)) > TOWN_R + 0.5) fine[rr * FN + cc] = 1; } }
    // ---- lớp chặn sinh từ TRANH NỀN (nhà/đá/nước vẽ trong ảnh) ----
    { const wm = MAPDEF.walkmask ? this.cache.json.get('walkmask') : null;
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
    { const wm = MAPDEF.walkmask ? this.cache.json.get('walkmask') : null;
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
      const isV = p.startsWith('v-');
      const x = isoX(c, r) + (isV ? 0 : (hash(c, r, 9) - 0.5) * 18), y = isoY(c, r) + (isV ? 0 : (hash(c, r, 11) - 0.5) * 8);
      const s = this.add.image(x, y + 6, p).setOrigin(0.5, p === 'v-fish' ? 0.5 : isV ? 0.86 : OH[p]).setDepth(y + 6);
      if (isV) s.setScale(1 / 1.5);   // ảnh làng giữ góc chéo: không lật, không co ngẫu nhiên
      else if (p.startsWith('deco-')) {
        // Lá rụng / hoa cỏ: ảnh gốc 300-500 px, nếu dùng scale 0,7 như cây thì một chiếc lá
        // phủ 2-3 ô -> sai tỷ lệ. Ép về 0,26-0,42 ô (33-54 px) mới đúng cỡ chi tiết nền.
        const target = TW * (0.26 + hash(c, r, 13) * 0.16);
        s.setScale(target / Math.max(s.width, s.height));
        if (hash(c, r, 17) < 0.5) s.setFlipX(true);
      }
      else { s.setScale(0.72 + hash(c, r, 13) * 0.2); if (hash(c, r, 17) < 0.5) s.setFlipX(true); }
      // cổng làng: 2 cổng đối xứng 2 bên đường -> bỏ jitter + scale ngẫu nhiên, lật theo phía
      if (p === 'gate') { s.setPosition(isoX(c, r), isoY(c, r) + 6); s.setScale(0.82); s.setFlipX(r > VILLAGE.r ? c < VILLAGE.c : r < VILLAGE.r); }
      const shs = isV ? (VILLAGE_RAD[p] != null ? VILLAGE_RAD[p] : 1) * 2.2 : SH[p];
      this.props.push({ s, sh: this.add.image(x + (isV ? 0 : 10), y + 2, 'shadow').setScale(shs, shs * 0.9).setAlpha(isV ? 0.55 : 1).setDepth(-8e5), c, r, fish: p === 'v-fish', homeX: x, homeY: y + 6, phase: hash(c, r, 29) * Math.PI * 2 });
      nObj++;
    }
    // Độ bão hoà theo map (MAPDEF.sat, 1 = giữ nguyên). Đo ảnh tham chiếu: map của họ
    // có sat ~141-187, TTBD chỉ 114 -> Hỏa Sơn cần +22%.
    if (MAPDEF.sat) {
      try { const fx = this.cameras.main.postFX; if (fx && fx.addColorMatrix) fx.addColorMatrix().saturate(MAPDEF.sat - 1); } catch (e) { }
    }
    if (window.KTReeds && !TOWN) { try { const rd = MAPDEF.reeds || {}; KTReeds.init(this, { map, G, N, isoX, isoY, village: VILLAGE, spots: SPOTS, seed: MAPCFG.seed, ink: !!MAPDEF.ink, count: (rd.count === undefined ? 90 : rd.count), centerClear: rd.centerClear || 9 }); } catch (e) { console.error('reeds', e); } }
    this.stats = { nGround, nDeco: map.deco.length, nObj, groundMs, groundTex: gt.w + '×' + gt.h, obstacles: this.obs.list.length };

    // nhân vật
    { const _t = this.add.text.bind(this.add); this.add.text = (x, y, t, st) => _t(x, y, t, Object.assign({ resolution: DPR }, st || {})); }
    this.sfx = k => { try { this.sound.play('sfx-' + k, { volume: k === 'voice' ? 0.6 : 0.45 }); const L = this.sfxLog || (this.sfxLog = []); L.push(k); if (L.length > 200) L.shift(); } catch (e) { } };
    this.hero = this.makeUnit('lang-van', VILLAGE.c, VILLAGE.r + 0.5, { hero: true, scale: 1.18 });
    Object.assign(this.hero, { name: 'Lăng Vân', lv: 1, exp: 0, hp: 200, maxHp: 200, mp: 80, maxMp: 80, atk: 22, def: 4, path: null, target: null, auto: false, cdSkill: 0, cdPot: 0, cds: {}, guardUntil: 0, nextAtk: 0 });
    this.heroRing = this.add.image(0, 0, 'ringGold').setDepth(-7e5);
    this.mobs = [];
    SPOTS.forEach((s, si) => { for (let i = 0; i < s.n; i++) this.spawnMob(s, si); });
    if (MAPDEF.boss) this.spawnMapBoss(MAPDEF.boss);
    this.targetRing = this.add.image(0, 0, 'ringRed').setDepth(-7e5).setVisible(false);

    // camera
    const cam = this.cameras.main;
    if (TOWN) { const R2 = TOWN_R + 2.5, vc = VILLAGE.c, vr = VILLAGE.r;
      const x0 = isoX(vc - R2, vr + R2), x1 = isoX(vc + R2, vr - R2), y0 = isoY(vc - R2, vr - R2), y1 = isoY(vc + R2, vr + R2);
      cam.setBounds(x0, y0 - 160, x1 - x0, y1 - y0 + 220); }
    else cam.setBounds(isoX(0, N - 1) - 200, -200, N * TW + 400, N * TH + 400);
    cam.startFollow(this.hero.spr, true, 0.12, 0.12);
    // Zoom xa hơn để thấy toàn cảnh map; landscape phone ~0.78 thay vì ~0.96
    // Khung ngang thấy rộng hơn; nhân vật nhỏ vừa đủ để không che map
    cam.setZoom(camZoomFor(innerWidth, innerHeight));
    cam.setBackgroundColor('#0d1408');
    // LỚP KHÔNG KHÍ: vignette tối bốn mép + sương mờ phía xa
    /* vignette sinh Ở 512px rồi phóng to khi vẽ: gradient mềm nên mắt không phân biệt,
       nhưng VRAM giảm từ ~10,6 MB (1664x1664) xuống ~1 MB. */
    { const g = this.make.graphics({ x: 0, y: 0, add: false });
      const R0 = 512;
      for (let i = 0; i < 26; i++) { const t = i / 26; g.fillStyle(0x0a1208, t * 0.055); g.fillCircle(R0 * 0.62, R0 * 0.62, R0 * (0.74 - t * 0.46)); }
      g.generateTexture('vig', R0, R0); g.destroy();
      const vig = this.add.image(innerWidth / 2, innerHeight / 2, 'vig').setScrollFactor(0).setDepth(9e5).setAlpha(0.55)
        .setDisplaySize(innerWidth * 1.15, innerHeight * 1.15);
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
    kb.on('keydown-A', () => this.toggleAuto()); kb.on('keydown-M', () => this.toggleOverview());
    ['ultimate', 'pot', 'chop', 'dash', 'guard', 'bind', 'combo', 'auto'].forEach((id, i) => kb.on('keydown-' + ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT'][i], () => this.cast(id)));
    if ($('ovBtn')) $('ovBtn').onclick = () => this.toggleOverview();
    document.querySelectorAll('#skills .sk').forEach(el => { el.onclick = () => this.cast(el.dataset.sk); });

    // canvas bản đồ nhỏ phải đúng bằng N ô của map — map 48 hay 56 đều phủ kín khung,
    // không còn viền trống (trước đây canvas cố định 56×56).
    { const a = $('mm'), b = $('mmd'); if (a && a.width !== N) { a.width = N; a.height = N; } if (b && b.width !== N) { b.width = N; b.height = N; } }
    this.drawMinimap();
    this.musicOn = true;
    try { this.music = this.sound.add(MAPCFG.bgm, { loop: true, volume: 0.35 }); } catch (e) { this.music = null; HUD.log('Không nạp được nhạc nền'); }
    this.tryMusic();
    // Trình duyệt chặn tự phát nhạc: mở khoá ở lần chạm/phím đầu tiên
    this.input.on('pointerdown', () => this.tryMusic());
    const musBtn = document.getElementById('mus');
    if (musBtn) musBtn.onclick = () => this.toggleMusic();
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.regen() });
    HUD.log(TOWN ? 'Đến ' + VILLAGE.name + '. Ra dã ngoại qua điểm truyền tống ở cổng Nam.' : 'Đến ' + VILLAGE.name + '. Điểm truyền tống về thôn ở ngay cạnh.');
    if (window.KTStory) { try { KTStory.install(this); } catch (e) { showErr('story: ' + e.message); } }
    if (window.KTLoot) { try { KTLoot.install(this); } catch (e) { showErr('loot: ' + e.message); } }
    if (window.KTQuests) { try { KTQuests.install(this); } catch (e) { showErr('quest: ' + e.message); } }
    if (window.KTFeel) { try { KTFeel.install(this); } catch (e) { showErr('feel: ' + e.message); } }
    window.__kt = this; if (window.KTOutfits) this.outfits = window.KTOutfits.attach(this, this.hero); this.children.list.forEach(o => { if (o.texture && o.texture.key === '__MISSING') o.setVisible(false); });
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
    // clip không có trong manifest (ví dụ run-front/run-back khi chưa có atlas 4 hướng) -> lùi về clip an toàn
    if (!(this.M.chars[u.cid].clips || {})[clip]) clip = (this.M.chars[u.cid].clips || {}).idle ? 'idle' : clip;
    if (u.clip === clip && !force) return;
    if (u.hdStatic) { u.clip = clip; return; }
    const c = (window.KTOutfits && window.KTOutfits.clipFor) ? window.KTOutfits.clipFor(this, u, clip) : this.M.chars[u.cid].clips[clip];
    u.clip = clip;
    u.spr.setTexture(u.cid + ':' + clip).setOrigin(c.pivotX / c.w, c.footY / c.h);
    // giữ chiều cao nhân vật không đổi giữa các động tác: đo charH (thân thật) thay vì chiều cao khung,
    // vì mỗi clip bị cắt khung khác nhau; fall-die không có charH nên vẫn dùng khung.
    u.spr.setScale((u.targetH || 120) / ((c.charH || c.h) * 2));
    { const base = u.cid + ':' + clip;
      const ak = (window.KTOutfits && window.KTOutfits.keyFor) ? window.KTOutfits.keyFor(this, u, clip) : base;
      let a = this.anims.get(ak);
      if (!a || !a.frames.length) a = this.anims.get(base);
      if (a && a.frames.length) u.spr.play(ak && this.anims.get(ak) ? ak : base); }
  }

  place(u) {
    const x = isoX(u.c, u.r), y = isoY(u.c, u.r);
    const lift = this.heightAt ? this.heightAt(u.c, u.r) * (this.hStep || 0) : 0;
    u.spr.setPosition(x, y - lift).setDepth(y + 1).setFlipX(u.face < 0);
    u.shadow.setPosition(x + 4, y + 2 - lift);
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

  bossAbility(m, h, dt, time) {
    // Giai đoạn 2: máu còn ≤50% thì boss nổi giận — đổi màu, gọi 3 Tàn Ảnh, quét đuôi nhanh hơn
    if (!m.phase2 && m.hp <= m.maxHp * 0.5) {
      m.phase2 = true;
      m.spr.setTint(0xb08cff);
      HUD.toast(m.name + ' nổi giận — gọi Tàn Ảnh!');
      HUD.log(m.name + ': giai đoạn 2');
      this.shake(6, 220); this.sfx('skill-vortex');
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const spot = { c: m.c + Math.cos(a) * 2.6, r: m.r + Math.sin(a) * 2.6, char: 'bach-dien', name: 'Tàn Ảnh Thủy', lv: Math.max(1, m.lv - 6), n: 1, tint: 0x9fd7ff, aggro: true };
        if (!this.obs.solid(spot.c, spot.r)) this.spawnMob(spot, 0);
      }
      m.nextSlam = time + 1800;
    }
    // Gợn nước dưới chân khi boss máu lớn còn sống (sân thủy mạc): vòng loang theo nhịp
    if (!m._ripple && m.spr) {
      m._ripple = this.time.addEvent({
        delay: 820, loop: true, callback: () => {
          if (m.dead || h.dead) return;
          const ring = this.add.image(m.spr.x, m.spr.y + 6, 'ringGold').setDepth(-7e5).setScale(0.45).setAlpha(0.45);
          this.tweens.add({ targets: ring, scale: 1.6, alpha: 0, duration: 950, onComplete: () => ring.destroy() });
        }
      });
    }
    if (m.dead || h.dead) return;
    // Đòn quét đuôi: báo trước bằng vòng đỏ trên đất, 0,9 s sau mới gây sát thương diện rộng
    if (!m.nextSlam) m.nextSlam = time + 3000;
    if (time < m.nextSlam) return;
    if (Math.hypot(h.c - m.c, h.r - m.r) > 5.5) { m.nextSlam = time + 900; return; }
    m.nextSlam = time + (m.phase2 ? 3900 : 5200);
    const c = m.c, r = m.r, R = 2.6;
    const gx = isoX(c, r), gy = isoY(c, r);
    this.play(m, 'basic', true); this.sfx('skill');
    const ring = this.add.ellipse(gx, gy, R * TW * 1.05, R * TH * 1.05).setStrokeStyle(3, 0xff5540, 0.95).setDepth(-7.4e5).setAlpha(0.15);
    this.tweens.add({ targets: ring, alpha: 1, duration: 750 });
    this.time.delayedCall(900, () => {
      ring.destroy();
      if (m.dead) return;
      const fx = this.add.image(gx, gy, 'vfx-boss').setDepth(2e6).setScale(0.9).setAlpha(0.95);
      this.tweens.add({ targets: fx, alpha: 0, scale: 1.7, duration: 520, onComplete: () => fx.destroy() });
      this.shake(5, 160); this.sfx('skill-vfx');
      if (Math.hypot(h.c - c, h.r - r) <= R) this.damage(h, dmgCalc(m.atk, h.def, 1.35), true);
      HUD.log(m.name + ': quét đuôi!');
    });
  }

  // ---- ĐỊA HÌNH CAO THẤP (v1) ----
  // Mỗi ô có độ cao 0..n. Vẽ mặt đứng (vách) + mặt trên, nhân vật đứng trên cao bị nâng
  // sprite lên theo bậc, và chỉ lên/xuống được ở ô dốc. Depth vẫn theo y nên tự đúng thứ tự.
  buildElevation() {
    const E = MAPDEF.elevation; if (!E) return;
    this.hStep = E.stepPx || 26;
    this.hmap = new Uint8Array(N * N);
    this.ramps = new Set((E.ramps || []).map(([c, r]) => r * N + c));
    for (const z of (E.zones || [])) for (let r = z.r; r < z.r + z.h; r++) for (let c = z.c; c < z.c + z.w; c++)
      if (c >= 0 && r >= 0 && c < N && r < N) this.hmap[r * N + c] = z.level || 1;
    const g = this.add.graphics().setDepth(-8.6e5);
    for (const z of (E.zones || [])) {
      const lv = (z.level || 1) * this.hStep;
      const A = [isoX(z.c, z.r), isoY(z.c, z.r)], B = [isoX(z.c + z.w, z.r), isoY(z.c + z.w, z.r)];
      const C = [isoX(z.c + z.w, z.r + z.h), isoY(z.c + z.w, z.r + z.h)], D = [isoX(z.c, z.r + z.h), isoY(z.c, z.r + z.h)];
      // mặt đứng phía nam (C-D) và phía đông (B-C)
      g.fillStyle(0x4a3b32, 1);
      g.beginPath(); g.moveTo(D[0], D[1] - lv); g.lineTo(C[0], C[1] - lv); g.lineTo(C[0], C[1]); g.lineTo(D[0], D[1]); g.closePath(); g.fillPath();
      g.fillStyle(0x3a2e27, 1);
      g.beginPath(); g.moveTo(C[0], C[1] - lv); g.lineTo(B[0], B[1] - lv); g.lineTo(B[0], B[1]); g.lineTo(C[0], C[1]); g.closePath(); g.fillPath();
      // mặt trên: nền đá xám + viền sáng
      g.fillStyle(0x6b5a4c, 1);
      g.beginPath(); g.moveTo(A[0], A[1] - lv); g.lineTo(B[0], B[1] - lv); g.lineTo(C[0], C[1] - lv); g.lineTo(D[0], D[1] - lv); g.closePath(); g.fillPath();
      g.lineStyle(2, 0x9c8a74, 0.8);
      g.beginPath(); g.moveTo(A[0], A[1] - lv); g.lineTo(B[0], B[1] - lv); g.lineTo(C[0], C[1] - lv); g.lineTo(D[0], D[1] - lv); g.closePath(); g.strokePath();
      // BỀ MẶT CÓ VÂN: vật liệu theo map (elevation.mat: stone|dirt|grass). Hỏa Sơn/Thiết Cốc
      // là đá/kim loại nên KHÔNG dùng cỏ -> trước đây mặt cao nguyên xanh lè, lệch hẳn với map.
      const mat = /[?&]grassmat=1/.test(location.search) ? 'grass' : (E.mat || 'stone');
      const texTop = this.textures.exists('g-' + mat) ? 'g-' + mat : null;
      const texWall = this.textures.exists('g-stone') ? 'g-stone' : null;
      const pts = [[A[0], A[1] - lv], [B[0], B[1] - lv], [C[0], C[1] - lv], [D[0], D[1] - lv]];
      if (texTop) {
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const w = Math.max(...xs) - Math.min(...xs), hh = Math.max(...ys) - Math.min(...ys);
        if (w > 4 && hh > 4) {
          const ts = this.add.tileSprite(cx, cy, w, hh, texTop).setDepth(-8.55e5).setAlpha(0.75);
          // Tối theo map: Hỏa Sơn nền rất tối (mean 57) nên mặt cao nguyên phải tối theo,
          // nếu không nó thành "miếng dán sáng" giữa map.
          if (E.topTint) { try { ts.setTint(parseInt(E.topTint, 16)); } catch (e) { } }
          const mg = this.make.graphics({ add: false }); mg.fillStyle(0xffffff);
          mg.fillPoints(pts.map(p => ({ x: p[0], y: p[1] })), true);
          ts.setMask(mg.createGeometryMask());
        }
      }
      if (texWall) {
        for (const [p1, p2, dep] of [[D, C, -8.58e5], [C, B, -8.57e5]]) {
          const xs = [p1[0], p2[0]], ys = [p1[1] - lv, p2[1] - lv, p1[1], p2[1]];
          const cx = (xs[0] + xs[1]) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
          const w = Math.max(Math.abs(xs[1] - xs[0]), 6), hh = Math.max(Math.max(...ys) - Math.min(...ys), 6);
          const tw = this.add.tileSprite(cx, cy, w, hh, texWall).setDepth(dep).setAlpha(0.85);
          const mg = this.make.graphics({ add: false }); mg.fillStyle(0xffffff);
          mg.fillPoints([{ x: p1[0], y: p1[1] - lv }, { x: p2[0], y: p2[1] - lv }, { x: p2[0], y: p2[1] }, { x: p1[0], y: p1[1] }], true);
          tw.setMask(mg.createGeometryMask());
        }
      }
      // bóng đổ ở chân vách
      g.fillStyle(0x000000, 0.22);
      g.beginPath(); g.moveTo(D[0], D[1] + 4); g.lineTo(C[0], C[1] + 4); g.lineTo(B[0], B[1] + 4);
      g.lineTo(B[0] + 10, B[1] + 10); g.lineTo(C[0], C[1] + 12); g.lineTo(D[0] - 10, D[1] + 10); g.closePath(); g.fillPath();
    }
    // dốc: vẽ vệt sáng để người chơi thấy lối lên
    g.fillStyle(0x8c7a62, 0.85);
    for (const [c, r] of (E.ramps || [])) {
      const x = isoX(c, r), y = isoY(c, r);
      g.beginPath(); g.moveTo(x, y - this.hStep * 0.5); g.lineTo(x + TW / 2, y + TH / 2 - this.hStep * 0.5);
      g.lineTo(x, y + TH - this.hStep * 0.5); g.lineTo(x - TW / 2, y + TH / 2 - this.hStep * 0.5); g.closePath(); g.fillPath();
    }
  }

  heightAt(c, r) {
    if (!this.hmap) return 0;
    const cc = Math.round(c), rr = Math.round(r);
    if (cc < 0 || rr < 0 || cc >= N || rr >= N) return 0;
    return this.hmap[rr * N + cc];
  }

  canStep(c0, r0, c1, r1) {
    const h0 = this.heightAt(c0, r0), h1 = this.heightAt(c1, r1);
    if (h0 === h1) return true;
    // chỉ lên/xuống được ở ô dốc
    return this.ramps && (this.ramps.has(Math.round(r1) * N + Math.round(c1)) || this.ramps.has(Math.round(r0) * N + Math.round(c0)));
  }

  spawnMapBoss(b) {
    // Boss của map (map.json -> boss): một đơn vị to hơn, máu nhiều, đứng giữa sân đấu.
    const nm = b.name || 'Bạch Xà Mẫu';
    const u = this.makeUnit(b.char || 'bach-dien', b.c, b.r, { tint: b.tint });
    const idleC = this.M.chars[b.char || 'bach-dien'].clips.idle;
    const targetH = 120 * (b.scale || 1.55);
    u.targetH = targetH;
    u.spr.setScale(targetH / (idleC.h * 2));
    u.shadow.setScale(0.55 * u.spr.scale, 0.5 * u.spr.scale);
    Object.assign(u, {
      name: nm, lv: b.lv || 16, maxHp: b.hp || 4200, hp: b.hp || 4200,
      atk: b.atk || 52, def: b.lv || 16, home: { c: b.c, r: b.r },
      state: 'idle', wait: 1, nextAtk: 0, isBoss: true, isMapBoss: true,
      spot: { c: b.c, r: b.r, boss: true, aggro: true, name: nm }
    });
    this.mobs.push(u);
    HUD.log(nm + ' xuất hiện!');
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

  toggleAuto() { this.hero.auto = !this.hero.auto; const el = $('sk-auto') || $('skAuto'); if (el) el.classList.toggle('on', this.hero.auto); HUD.log(this.hero.auto ? 'Bật tự đánh' : 'Tắt tự đánh'); }

  /* ---------- kỹ năng: một cửa vào duy nhất ---------- */
  cast(id) {
    const h = this.hero, S = SKILLS[id];
    if (!h || h.dead || !S) return false;
    if (S.toggle) { this.toggleAuto(); return true; }
    if (id === 'ultimate' && !this.ultimateUnlocked) { this.sfx('ui'); HUD.log('Chưa lĩnh ngộ tuyệt kỹ'); return false; }
    if (h.lv < (S.lv || 1)) { this.sfx('ui'); HUD.log(S.name + ' mở ở cấp ' + S.lv); return false; }
    if ((h.cds[id] || 0) > 0) return false;
    if (h.mp < S.mp) { this.sfx('ui'); HUD.log('Không đủ nội lực (' + S.mp + ')'); return false; }
    h.mp -= S.mp; h.cds[id] = S.cd; this.sfx('ui');
    if (id === 'ultimate') this.castUltimate();
    else if (id === 'pot') this.castPot();
    else if (id === 'chop') this.castChop();
    else if (id === 'dash') this.castDash();
    else if (id === 'guard') this.castGuard();
    else if (id === 'bind') this.castBind();
    else if (id === 'combo') this.castCombo();
    return true;
  }

  nearestMob(radius) {
    const h = this.hero;
    if (h.target && !h.target.dead) return h.target;
    let best = null, bd = radius;
    for (const m of this.mobs) { if (m.dead) continue; const d = Math.hypot(m.c - h.c, m.r - h.r); if (d < bd) { bd = d; best = m; } }
    return best;
  }

  castUltimate() {
    const h = this.hero;
    this.play(h, this.anims.get('lang-van:ultimate') ? 'ultimate' : 'basic', true); this.sfx('skill'); this.shake(6, 180); this.time.delayedCall(180, () => this.sfx('skill-vortex'));
    let n = 0;
    for (const m of this.mobs) if (!m.dead && Math.hypot(m.c - h.c, m.r - h.r) < 3.2) {
      this.vfx('skill', m); this.time.delayedCall(560, () => { if (!m.dead) { this.sfx('skill-vfx'); this.damage(m, dmgCalc(h.atk, m.def, skillCoef(h.lv) * 1.9), true); } });
      n++;
    }
    if (!n) this.vfx('skill', h);
    this.time.delayedCall(600, () => this.sfx('skill-hit'));
    HUD.log('Tuyệt kỹ · ' + n + ' mục tiêu');
  }

  castPot() {
    const h = this.hero; const v = Math.round(h.maxHp * 0.4); h.hp = Math.min(h.maxHp, h.hp + v);
    this.floatText(h, '+' + v, '#6aff7a'); this.sfx('passive');
    HUD.log('Hồi máu +' + v);
  }

  castChop() {
    const h = this.hero, m = this.nearestMob(2.2);
    this.play(h, 'basic', true); this.sfx('atk2');
    if (!m) { this.vfx('skill', h); HUD.log('Trảm: không có mục tiêu'); return; }
    this.faceTo(h, m);
    this.time.delayedCall(260, () => { if (m.dead || h.dead) return; this.vfx('hit', m); this.damage(m, dmgCalc(h.atk, m.def, skillCoef(h.lv) * 1.45), true); });
  }

  castDash() {
    const h = this.hero;
    let dc = 0, dr = 0;
    if (h.path && h.path.length) { dc = h.path[h.path.length - 1].c - h.c; dr = h.path[h.path.length - 1].r - h.r; }
    else if (h.target && !h.target.dead) { dc = h.target.c - h.c; dr = h.target.r - h.r; }
    else { dc = (h.face || 1); dr = 0; }
    const d = Math.hypot(dc, dr) || 1, step = 0.22, maxDist = 2.4;
    let moved = 0, c = h.c, r = h.r;
    while (moved + step <= maxDist) {
      const nc = c + dc / d * step, nr = r + dr / d * step;
      if (this.obs.solid(nc, nr)) break;
      c = nc; r = nr; moved += step;
    }
    if (moved <= 0) { this.vfx('skill', h); HUD.log('Tốc biến: bị chặn'); return; }
    h.c = c; h.r = r; h.path = null;
    this.place(h); this.heroRing.setPosition(h.spr.x, h.spr.y);
    this.vfx('skill', h); this.sfx('skill'); this.shake(3, 90);
    HUD.log('Tốc biến ' + moved.toFixed(1) + ' ô');
  }

  castGuard() {
    const h = this.hero; h.guardUntil = performance.now() + 6000;
    this.vfx('skill', h); this.floatText(h, 'Hộ thân', '#ffe08a'); this.sfx('passive');
    HUD.log('Hộ thân: giảm 40% sát thương trong 6 giây');
  }

  castBind() {
    const h = this.hero; let n = 0;
    for (const m of this.mobs) if (!m.dead && Math.hypot(m.c - h.c, m.r - h.r) < 3.2) { m.stunUntil = performance.now() + 2500; this.vfx('hit', m); n++; }
    this.vfx('skill', h); this.sfx('skill-vortex');
    HUD.log(n ? 'Định thân ' + n + ' mục tiêu · 2,5 giây' : 'Định thân: không có mục tiêu');
  }

  castCombo() {
    const h = this.hero, m = this.nearestMob(2.2);
    this.play(h, 'basic', true); this.sfx('atk');
    if (!m) { this.vfx('skill', h); HUD.log('Liên hoàn: không có mục tiêu'); return; }
    this.faceTo(h, m);
    for (let i = 0; i < 3; i++) this.time.delayedCall(200 + i * 230, () => {
      if (m.dead || h.dead) return;
      if (Math.hypot(m.c - h.c, m.r - h.r) > 3) return;
      this.vfx('hit', m); this.damage(m, dmgCalc(h.atk, m.def, skillCoef(h.lv) * 0.62), i === 2);
    });
  }

  /* tương thích chỗ gọi cũ */
  castSkill() { return this.cast('ultimate'); }
  usePot() { return this.cast('pot'); }

  vfx(k, u) {
    if (this.lowQ) return;
    const v = this.M.vfx[k];
    const s = this.add.sprite(u.spr.x, u.spr.y - 46 * u.scale, 'vfx:' + k).setDepth(u.spr.depth + 2).setScale(k === 'skill' ? 2.3 : 1.7);
    if (v.blend === 'screen') s.setBlendMode(Phaser.BlendModes.SCREEN);
    { const a = this.anims.get('vfx:' + k); if (a && a.frames.length) { s.play('vfx:' + k); s.on('animationcomplete', () => s.destroy()); } else { s.destroy(); return; } }
  }

  shake(px, ms) {
    const cam = this.cameras.main; if (!cam || !cam.width) return;
    try { cam.shake(ms, px / Math.max(320, cam.width), true); } catch (e) { }
  }

  floatText(u, txt, color, big) {
    const t = this.add.text(u.spr.x + (Math.random() - 0.5) * 20, u.spr.y - 100 * u.scale, txt, { font: (big ? 'bold 22px' : 'bold 16px') + ' Segoe UI', color, stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(1e6 + 1);
    const st = this.ft || (this.ft = { n: 0, live: 0 });
    st.n++; st.live++; t.__ft = 1; t.once('destroy', () => { st.live--; });
    this.tweens.add({ targets: t, y: t.y - 40, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
    return t;
  }

  damage(u, dmg, crit) {
    if (u.dead) return;
    if (u === this.hero && this.hero.guardUntil && performance.now() < this.hero.guardUntil) dmg = Math.max(1, Math.round(dmg * 0.6));
    u.hp -= dmg;
    if (u === this.hero) { this.floatText(u, '-' + dmg, '#ff6a5a'); this.sfx('hit'); this.shake(4, 120); }
    else { this.floatText(u, (crit ? 'Bạo kích ' : '') + dmg, crit ? '#ffd23a' : '#ffffff', crit); this.sfx('mob-hit'); this.shake(2, 80); u.provoked = true; if (u.state !== 'chase') { u.state = 'chase'; u.prey = this.hero; } }
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
    if (!obs.solid(nc, nr) && this.canStep(u.c, u.r, nc, nr) || (stuckNow && !obs.solid(nc, nr))) { u.c = nc; u.r = nr; moved = true; }
    else { // trượt dọc vật cản theo từng trục, giống cảm giác đi sát mép nhà bên TIÊU TỬ BÁ ĐẠO
      if (!obs.solid(nc, u.r) && this.canStep(u.c, u.r, nc, u.r)) { u.c = nc; moved = true; }
      if (!obs.solid(u.c, nr) && this.canStep(u.c, u.r, u.c, nr)) { u.r = nr; moved = true; }
      if (!moved) {
        // vẫn kẹt: bước ngang (vuông góc hướng đi) để lách qua, KHÔNG bỏ waypoint
        const ux = -dr / d, uy = dc / d;
        const sx2 = u.c + ux * s, sy2 = u.r + uy * s;
        const tx2 = u.c - ux * s, ty2 = u.r - uy * s;
        if (!obs.solid(sx2, sy2) && this.canStep(u.c, u.r, sx2, sy2)) { u.c = sx2; u.r = sy2; moved = true; }
        else if (!obs.solid(tx2, ty2) && this.canStep(u.c, u.r, tx2, ty2)) { u.c = tx2; u.r = ty2; moved = true; }
        if (!moved) return false;   // kẹt thật thì giữ waypoint, thử lại nhịp sau
      }
    }
    u.clipWanted = this.runClipFor(u, dc, dr); u.moveVx = dc; u.moveVr = dr;
    return Math.hypot(tc - u.c, tr - u.r) < 0.08;
  }

  faceTo(u, t) { const sx = (t.c - t.r) - (u.c - u.r); if (Math.abs(sx) > 0.02) u.face = sx > 0 ? 1 : -1; }

  /* Hướng đi -> clip 8 hướng isometric 2:1.
     Screen dx = (dc - dr) * 64, Screen dy = (dc + dr) * 32.
     deg = atan2(dy, dx) in degrees [-180, 180]. */
  runClipFor(u, dc, dr) {
    const clips = (this.M.chars[u.cid] || {}).clips || {};
    const sx = (dc - dr) * 64.0;
    const sy = (dc + dr) * 32.0;
    const deg = Math.atan2(sy, sx) * (180 / Math.PI);
    const adeg = Math.abs(deg);

    let want = 'run';
    let face = (deg > -90 && deg < 90) ? 1 : -1;

    if (adeg <= 15 || adeg >= 165) {
      want = 'run';
      face = adeg <= 90 ? 1 : -1;
    } else if (adeg >= 65 && adeg <= 115) {
      want = deg > 0 ? 'run-front' : 'run-back';
      face = 1;
    } else if (deg > 0) {
      want = 'run-front-diag';
      face = deg < 90 ? 1 : -1;
    } else {
      want = 'run-back-diag';
      face = deg > -90 ? 1 : -1;
    }

    u.dirWant = want;
    u.face = face;
    if (clips[want]) return want;
    if (want === 'run-front-diag' && clips['run-front']) return 'run-front';
    if (want === 'run-back-diag' && clips['run-back']) return 'run-back';
    return clips.run ? 'run' : 'idle';
  }

  playRun(u) { this.play(u, u.clipWanted || 'run'); }

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
    if (el) el.textContent = VILLAGE.name;   // fps da co o #fps, khong lap vao ten vung
    const el2 = document.getElementById('fps');
    if (el2) el2.textContent = Math.round(this.game.loop.actualFps) + ' fps · ' + vis + '/' + this.props.length;
  }

  update(time, deltaMs) {
    if (window.KTTerrain && this.terrain) KTTerrain.update(this, this.overview);
    if (window.KTQuests) { try { KTQuests.tick(this, 0.033); } catch (e) { } }
    if (this.afkLock) return;
    this.cull(time);
    // C? koi b?i ch?m trong su?i, chuy?n ??ng nh? ?? v?n ??c r? ? zoom gameplay.
    for (const p of this.props) if (p.fish) { const w = time * 0.001 + p.phase; p.s.x = p.homeX + Math.sin(w) * 2.5; p.s.y = p.homeY + Math.sin(w * 1.6) * 1.1; p.s.rotation = Math.sin(w) * 0.035; }
    // dt theo GIỜ THỰC, không phụ thuộc nhịp khung hình của trình duyệt
    const nowMs = performance.now();
    let dt = (nowMs - (this._tLast || nowMs)) / 1000;
    this._tLast = nowMs;
    if (!(dt > 0) || dt > 0.5) dt = 0.016;   // khung hình đầu / tab vừa quay lại
    dt = Math.min(dt, 0.25);
    // HUD cập nhật theo vòng lặp game (timer 200ms của Phaser bị trễ khi máy yếu,
    // khiến số hồi chiêu đứng im vài nhịp). 10 lần/giây là đủ mượt cho thanh máu.
    this._hudT = (this._hudT || 0) + dt;
    if (this._hudT >= 0.1) { this._hudT = 0; this.updateHud(); }
    const h = this.hero;
    // parallax: dải núi xa trôi chậm hơn map -> tạo chiều sâu
    if (this._back) { const scx = this.cameras.main.scrollX; for (const l of this._back) l.g.x = -scx * l.k; }
    // CAMERA THẤP: kéo giãn trục dọc (zoomY > zoomX) -> nhìn thấy mặt đứng nhiều hơn, map có chiều sâu.
    // setZoom() ở nơi khác sẽ ghi đè zoomY, nên mỗi khung hình kiểm lại một lần (rẻ).
    { const cam = this.cameras.main, tilt = /[?&]notilt=1/.test(location.search) ? 1 : (MAPDEF.camTilt || 1.12);
      if (Math.abs(cam.zoomY - cam.zoomX * tilt) > 0.001) cam.zoomY = cam.zoomX * tilt; }    // sân đấu: khi boss đang truy đuổi thì giữ nhân vật trong vòng (muốn bỏ chạy cứ chạy ra mép,
    // boss leash về chỗ cũ rồi vòng sẽ nhả) — không nhốt người chơi vĩnh viễn trong sân
    if (MAPDEF.arenaRadius && this.mobs.some(m => m.isBoss && !m.dead && m.state === 'chase')) {
      const adx = h.c - VILLAGE.c, adr = h.r - VILLAGE.r, AR = MAPDEF.arenaRadius, add = Math.hypot(adx, adr);
      if (add > AR && add > 0.001) {
        h.c = VILLAGE.c + adx / add * AR; h.r = VILLAGE.r + adr / add * AR;
        this.place(h); if (this.heroRing) this.heroRing.setPosition(h.spr.x, h.spr.y);
      }
    }
    if (h.cds) { for (const k in h.cds) if (h.cds[k] > 0) h.cds[k] = Math.max(0, h.cds[k] - dt); }
    h.cdSkill = (h.cds && h.cds.ultimate) || 0; h.cdPot = (h.cds && h.cds.pot) || 0;
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
          if (!busy) { this.stepToward(h, h.target.c, h.target.r, 2.1, dt); this.playRun(h); }
        } else {
          this.faceTo(h, h.target);
          if (time >= h.nextAtk && !busy) {
            h.nextAtk = time + 850; this.play(h, 'basic', true); this.sfx(Math.random() < 0.5 ? 'atk' : 'atk2'); h.combo = (h.combo || 0) + 1; if (h.combo % 4 === 0) { this.time.delayedCall(320, () => { this.sfx('passive'); if (h.target && !h.target.dead) { this.vfx('hit', h.target); this.damage(h.target, Math.round(h.atk * 0.8), true); } }); HUD.log('Nội tại: Vân Ảnh'); }
            const m = h.target;
            this.time.delayedCall(330, () => {
              if (m.dead || h.dead) return;
              const _miss = Math.min(0.3, Math.max(0.02, (m.dodge || 0) * 0.004 - (h.acc || 0) * 0.002));
              if (Math.random() < _miss) { this.floatText(m, 'trượt', '#9fd7ff'); if (this.sfxMiss) this.sfxMiss(); return; }
              const crit = Math.random() < CRIT_RATE; let dmg = dmgCalc(h.atk, m.def, skillCoef(h.lv)); if (crit) dmg = Math.round(dmg * CRIT_MULT);
              this.vfx('hit', m); this.damage(m, dmg, crit);
            });
          } else if (!busy) this.play(h, 'idle');
        }
      } else if (h.path && h.path.length) {
        if (!busy) {
          if (this.stepToward(h, h.path[0].c, h.path[0].r, 2.3, dt)) h.path.shift();
          this.playRun(h);
        }
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
      // bị Định thân: đứng yên, không chạy AI
      if (m.stunUntil && performance.now() < m.stunUntil) {
        if (!busy) this.play(m, 'idle');
        if (!m._stunMark) { m._stunMark = true; m.spr.setTint(0x9a7bff); }
        this.place(m); continue;
      }
      if (m._stunMark) { m._stunMark = false; m.spr.clearTint(); if (m.spot && m.spot.tint !== 0xffffff) m.spr.setTint(m.spot.tint); }
      if (m.isBoss) this.bossAbility(m, h, dt, time);
      // Quái ôn hoà: chỉ truy đuổi khi bị hero đánh trúng (provoked, set trong damage()).
      // Boss cốt truyện giữ nguyên aggro theo khoảng cách; quái đang leash về bãi thì không bị kéo lại.
      if (m.state !== 'chase' && m.state !== 'return' && !h.dead && dh < 3.5 && m.isBoss) { m.state = 'chase'; }
      if (m.state === 'chase') {
        if (h.dead || dHome > 9) { m.state = 'return'; }
        else if (dh > 1.15) { if (!busy) { this.playRun(m); this.stepToward(m, h.c, h.r, 1.6, dt); } }
        else {
          this.faceTo(m, h);
          if (time >= m.nextAtk && !busy) {
            m.nextAtk = time + 1400; this.play(m, 'basic', true);
            this.time.delayedCall(380, () => { if (m.dead || h.dead) return; if (Math.hypot(h.c - m.c, h.r - m.r) < 1.6) {
                const _dg = Math.min(0.4, Math.max(0, (h.dodge || 0) * 0.003 - (m.acc || 0) * 0.002));
                if (Math.random() < _dg) { this.floatText(h, 'trượt', '#9fd7ff'); if (this.sfxMiss) this.sfxMiss(); return; }
                this.damage(h, dmgCalc(m.atk, h.def, 1.0)); } });
          } else if (!busy) this.play(m, 'idle');
        }
      } else if (m.state === 'return') {
        this.playRun(m); m.hp = Math.min(m.maxHp, m.hp + m.maxHp * dt * 0.5);
        if (this.stepToward(m, m.home.c, m.home.r, 2.0, dt)) { m.state = 'idle'; m.hp = m.maxHp; m.provoked = false; }
      } else if (m.state === 'idle') {
        if (!busy) this.play(m, 'idle');
        if (m.isBoss) { continue; }   // boss đứng giữa sân, không đi lang thang
        if (m.wait === undefined) m.wait = Math.random() * 10;   // lệch pha: không cả bãi cùng bước
        m.wait -= dt;
        if (m.wait <= 0) { // ~10 giây mới nhích 2-3 bước (0,5-0,8 ô), không rời chỗ quá 2,5 ô
          const a = Math.random() * Math.PI * 2, d = 1.0 + Math.random() * 0.5;
          let gc = m.c + Math.cos(a) * d, gr = m.r + Math.sin(a) * d;
          if (Math.hypot(gc - m.home.c, gr - m.home.r) > 3.2) { const k = d / Math.max(0.01, Math.hypot(m.home.c - m.c, m.home.r - m.r)); gc = m.c + (m.home.c - m.c) * k; gr = m.r + (m.home.r - m.r) * k; }
          m.state = 'wander'; m.goal = { c: gc, r: gr }; m.wanderT = 0; }
      } else if (m.state === 'wander') {
        this.playRun(m);
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

  // NỀN XA + SƯƠNG: 3 dải núi mờ trôi chậm hơn map (parallax) + dải sương ở đỉnh màn hình.
  // Đây là thứ tạo "chiều sâu" mà map phẳng không có: mắt thấy lớp xa đứng yên tương đối.
  buildBackdrop() {
    const W = this.scale.width, H = this.scale.height;
    const layers = [];
    const mk = (color, alpha, k, baseY, amp, step) => {
      const g = this.add.graphics().setScrollFactor(0).setDepth(-1.2e6 + baseY * 0.0001).setAlpha(alpha);
      g.fillStyle(color, 1);
      g.beginPath(); g.moveTo(-W, H);
      for (let x = -W; x <= W * 2; x += step) {
        const y = baseY + Math.sin(x * 0.0037 + baseY * 0.03) * amp + Math.sin(x * 0.011 + baseY * 0.07) * amp * 0.4;
        g.lineTo(x, y);
      }
      g.lineTo(W * 2, H); g.closePath(); g.fillPath();
      layers.push({ g, k });
    };
    mk(0x1d2a33, 0.55, 0.05, H * 0.40, 24, 40);
    mk(0x24333c, 0.45, 0.11, H * 0.50, 32, 30);
    mk(0x2c3d46, 0.34, 0.18, H * 0.60, 42, 24);
    const key = 'mist-band';
    if (!this.textures.exists(key)) {
      const cv = this.textures.createCanvas(key, 8, 256);
      const cx = cv.getContext();
      const grd = cx.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, 'rgba(214,222,226,0.55)');
      grd.addColorStop(0.55, 'rgba(214,222,226,0.10)');
      grd.addColorStop(1, 'rgba(214,222,226,0)');
      cx.fillStyle = grd; cx.fillRect(0, 0, 8, 256); cv.refresh();
    }
    const mist = this.add.image(W / 2, 0, key).setOrigin(0.5, 0).setDisplaySize(W, H * 0.40)
      .setScrollFactor(0).setDepth(-1.18e6).setAlpha(0.42);
    this._back = layers; this._mist = mist;
  }

  updateHud() {
    const h = this.hero;
    HUD.bar('hp', h.hp, h.maxHp); HUD.bar('mp', h.mp, h.maxMp);
    const lvEl = $('lv'); if (lvEl) lvEl.textContent = 'Cấp ' + h.lv;
    const badge = $('lvBadge'); if (badge && badge.textContent !== String(h.lv)) badge.textContent = h.lv;
    const stEl = $('stats');
    if (stEl) { const t = 'Công ' + h.atk + ' · Thủ ' + h.def + ((h.guardUntil && performance.now() < h.guardUntil) ? ' · Hộ thân' : ''); if (stEl.textContent !== t) stEl.textContent = t; }
    $('exp').firstChild.style.width = (h.exp / this.expNeed(h.lv) * 100) + '%';
    // 8 ô kỹ năng — cache DOM, chỉ ghi khi giá trị đổi
    if (!this._slots) this._slots = Array.from(document.querySelectorAll('#skills .sk')).map(el => ({ el, id: el.dataset.sk, L: el.querySelector('.cd'), T: el.querySelector('.cdt') }));
    for (const s of this._slots) {
      const S = SKILLS[s.id]; if (!S || !s.L) continue;
      const locked = h.lv < (S.lv || 1) || (s.id === 'ultimate' && !this.ultimateUnlocked);
      if (s._locked !== locked) {
        s._locked = locked; s.el.classList.toggle('lock', locked);
        s.el.dataset.lock = locked ? (s.id === 'ultimate' && h.lv >= (S.lv || 1) ? 'Chưa ngộ' : 'Cấp ' + S.lv) : '';
      }
      const left = (h.cds && h.cds[s.id]) || 0;
      const pct = S.cd > 0 ? Math.round(100 * left / S.cd) : 0;
      if (s._pct !== pct) { s._pct = pct; s.L.style.height = pct + '%'; }
      const txt = left > 0.15 ? String(Math.ceil(left)) : '';
      if (s._txt !== txt) { s._txt = txt; s.T.textContent = txt; }
      const noMana = !locked && S.mp > 0 && h.mp < S.mp;
      if (s._noMana !== noMana) { s._noMana = noMana; s.el.classList.toggle('noMana', noMana); }
    }
    // khung mục tiêu
    const tgt = $('tgt'), tm = (h.target && !h.target.dead) ? h.target : null;
    if (tgt) {
      const on = !!tm; if (this._tgtOn !== on) { this._tgtOn = on; tgt.classList.toggle('on', on); }
      if (tm) {
        if (this._tgtId !== tm) { this._tgtId = tm; $('tgtName').textContent = tm.name; $('tgtLv').textContent = 'Lv ' + tm.lv; }
        HUD.bar('tgtHp', tm.hp, tm.maxHp);
      } else this._tgtId = null;
    }
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

