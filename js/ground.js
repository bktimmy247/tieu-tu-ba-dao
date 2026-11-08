/* ground.js — nền map kiểu TIÊU TỬ BÁ ĐẠO: vẽ MỘT lần thành texture liền mạch
 * Ý tưởng: đảo ngược phép chiếu iso để biết mỗi điểm ảnh thuộc ô nào,
 * làm méo toạ độ bằng noise (domain warp) rồi trộn màu 4 ô gần nhất.
 * => biên cỏ/đất/cát/nước uốn lượn, không lộ lưới, không lặp tuần hoàn.
 */
(function () {
  const BIOME = {
    water: [70, 116, 146], sand: [214, 197, 152], grass: [122, 156, 92],
    dirt: [152, 122, 86], path: [178, 152, 112], wood: [132, 101, 66], rock: [118, 118, 110],
  };

  // giá trị 0..1 từ toạ độ, không cần bảng
  function n2(x, y) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = n2(xi, yi), b = n2(xi + 1, yi), c = n2(xi, yi + 1), d = n2(xi + 1, yi + 1);
    const u = smooth(xf), v = smooth(yf);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  function fbm(x, y) { return vnoise(x, y) * 0.6 + vnoise(x * 2.1, y * 2.1) * 0.28 + vnoise(x * 4.3, y * 4.3) * 0.12; }

  // loại ô -> màu
  function cellColor(map, c, r, G, cache) {
    if (c < 0 || r < 0 || c >= map.N || r >= map.N) return BIOME.rock;
    const key = r * map.N + c;
    const hit = cache.get(key);
    if (hit) return hit;
    const k = map.t[r][c];
    let name = 'grass';
    if (G.WATER.includes(k)) name = 'water';
    else if (k === G.SAND) name = 'sand';
    else if (G.WOOD === k) name = 'wood';
    else if (G.ROCK2 === k) name = 'rock';
    else if (G.PATH.includes(k)) name = 'path';
    else if (G.DIRT === k) name = 'dirt';
    const col = BIOME[name];
    cache.set(key, col);
    return col;
  }

  /* Trả về {key, W, H, midX, midY, ms} */
  function makeGroundTexture(scene, map, G, opts) {
    opts = opts || {};
    const div = opts.div || 3;             // 1/3 độ phân giải, phủ lên là đủ mượt
    const isoX = opts.isoX, isoY = opts.isoY, TW = opts.TW, TH = opts.TH, N = map.N;
    const minX = isoX(0, N - 1) - TW, maxX = isoX(N - 1, 0) + TW;
    const minY = isoY(0, 0) - TH, maxY = isoY(N - 1, N - 1) + TH;
    const W = maxX - minX, H = maxY - minY;
    const w = Math.max(64, Math.round(W / div)), h = Math.max(64, Math.round(H / div));

    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(w, h);
    const D = img.data;
    const cache = new Map();
    const kx = TW / 2, ky = TH / 2;
    const saw = new Uint8Array(w * h);

    for (let py = 0; py < h; py++) {
      const sy = minY + (py + 0.5) * H / h;
      for (let px = 0; px < w; px++) {
        const sx = minX + (px + 0.5) * W / w;
        const a = sx / kx, b = sy / ky;          // a = c-r, b = c+r
        let c = (a + b) / 2, r = (b - a) / 2;
        // domain warp: méo toạ độ để biên ô không thẳng
        c += (fbm(c * 0.42, r * 0.42) - 0.5) * 1.15;
        r += (fbm(c * 0.42 + 7.3, r * 0.42 - 3.1) - 0.5) * 1.15;

        const c0 = Math.floor(c), r0 = Math.floor(r);
        const fc = smooth(c - c0), fr = smooth(r - r0);
        const A = cellColor(map, c0, r0, G, cache), B = cellColor(map, c0 + 1, r0, G, cache);
        const C = cellColor(map, c0, r0 + 1, G, cache), E = cellColor(map, c0 + 1, r0 + 1, G, cache);
        let R = (A[0] * (1 - fc) + B[0] * fc) * (1 - fr) + (C[0] * (1 - fc) + E[0] * fc) * fr;
        let Gc = (A[1] * (1 - fc) + B[1] * fc) * (1 - fr) + (C[1] * (1 - fc) + E[1] * fc) * fr;
        let Bl = (A[2] * (1 - fc) + B[2] * fc) * (1 - fr) + (C[2] * (1 - fc) + E[2] * fc) * fr;

        // vân bề mặt: mảng sáng/tối lớn + hạt mịn (không lặp theo ô)
        const macro = (fbm(c * 0.13 + 11, r * 0.13 - 5) - 0.5) * 34;
        const grain = (vnoise(c * 13, r * 13) - 0.5) * 30;
        const micro = (vnoise(c * 41, r * 41) - 0.5) * 16;
        const spots = vnoise(c * 23, r * 23);
        const tint = spots > 0.88 ? 18 : spots < 0.12 ? -16 : 0;
        const v = macro + grain + micro + tint;
        R = 128 + (R + v * 0.85 - 128) * 1.12;
        Gc = 128 + (Gc + v * 1.12 - 128) * 1.12;
        Bl = 128 + (Bl + v * 0.72 - 128) * 1.12;

        const i = (py * w + px) * 4;
        D[i] = R < 0 ? 0 : R > 255 ? 255 : R;
        D[i + 1] = Gc < 0 ? 0 : Gc > 255 ? 255 : Gc;
        D[i + 2] = Bl < 0 ? 0 : Bl > 255 ? 255 : Bl;
        D[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // nướng chi tiết nhỏ (búi cỏ, sỏi, hoa) thẳng vào texture: 0 sprite, vẫn có chi tiết
    let rnd = 12345;
    const rf = () => { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return rnd / 0x7fffffff; };
    const toS = (c, r) => ({ x: (isoX(c, r) - minX) * w / W, y: (isoY(c, r) - minY) * h / H });
    for (let k = 0; k < 9000; k++) {
      const c = 1 + rf() * (N - 2), r = 1 + rf() * (N - 2);
      const cc = Math.round(c), rr = Math.round(r);
      if (cc < 0 || rr < 0 || cc >= N || rr >= N) continue;
      const key = map.t[rr][cc];
      const grass = G.GRASS.includes(key), sand = key === G.SAND, dirt = key === G.DIRT;
      if (!grass && !sand && !dirt) continue;
      const p = toS(c, r);
      const t = rf();
      if (grass) {
        ctx.strokeStyle = t < 0.5 ? 'rgba(86,116,58,0.55)' : 'rgba(150,178,104,0.45)';
        ctx.lineWidth = Math.max(1, w / 2400);
        ctx.beginPath();
        for (let b = 0; b < 3; b++) {
          const ox = (rf() - 0.5) * 5, oy = (rf() - 0.5) * 3;
          ctx.moveTo(p.x + ox, p.y + oy); ctx.lineTo(p.x + ox + (rf() - 0.5) * 3, p.y + oy - 3 - rf() * 2.5);
        }
        ctx.stroke();
        if (t > 0.93) { // hoa
          ctx.fillStyle = ['rgba(232,206,120,0.85)', 'rgba(226,150,160,0.8)', 'rgba(240,240,225,0.8)'][(rf() * 3) | 0];
          ctx.fillRect(p.x, p.y - 1, Math.max(1.5, w / 1600), Math.max(1.5, w / 1600));
        }
      } else if (dirt) {
        ctx.fillStyle = 'rgba(108,86,60,0.5)';
        ctx.fillRect(p.x, p.y, Math.max(1, w / 2600), Math.max(1, h / 2600));
      } else {
        ctx.fillStyle = 'rgba(196,186,158,0.6)';
        ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(1.2, w / 1900), Math.max(0.9, w / 2600), 0, 0, 6.283); ctx.fill();
      }
    }

    // viền tối quanh rìa map để không lơ lửng
    ctx.strokeStyle = 'rgba(20,26,16,0.55)';
    ctx.lineWidth = Math.max(2, w * 0.004);
    ctx.strokeRect(0, 0, w, h);

    const key = 'ground-' + Date.now();
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.addCanvas(key, cv);
    return { key, W, H, midX: (minX + maxX) / 2, midY: (minY + maxY) / 2, w, h, saw };
  }

  /* Vật cản theo CHÂN vật thể (hình tròn), không chặn cả ô */
  const RAD = { pine: 0.34, oak: 0.38, sakura: 0.36, rock: 0.32, lantern: 0.18, bush: 0.0,
    'house-a': 0.62, 'house-b': 0.62, 'house-c': 0.62, 'house-d': 0.62, 'house-e': 0.62, 'house-f': 0.62 };
  function buildObstacles(map, G) {
    const list = [];
    for (let r = 0; r < map.N; r++) for (let c = 0; c < map.N; c++) {
      const p = map.obj[r][c];
      if (p && RAD[p] > 0) list.push({ c: c, r: r, rad: RAD[p], kind: p });
    }
    // nước chặn cả ô (nhưng cho phép đi trên cầu gỗ)
    const water = new Uint8Array(map.N * map.N);
    for (let r = 0; r < map.N; r++) for (let c = 0; c < map.N; c++)
      if (G.WATER.includes(map.t[r][c])) water[r * map.N + c] = 1;
    // lưới không gian để tra nhanh
    const CELL = 4, bins = new Map();
    for (const o of list) {
      const cx = Math.floor(o.c / CELL), cy = Math.floor(o.r / CELL);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const k = (cx + dx) + ',' + (cy + dy);
        if (!bins.has(k)) bins.set(k, []);
        bins.get(k).push(o);
      }
    }
    return {
      list, water, bins, CELL, N: map.N,
      solid(c, r) {
        if (c < 1 || r < 1 || c > map.N - 2.02 || r > map.N - 2.02) return true;
        const ci = Math.round(c), ri = Math.round(r);
        if (ci >= 0 && ri >= 0 && ci < map.N && ri < map.N && water[ri * map.N + ci]) return true;
        const arr = bins.get(Math.floor(c / CELL) + ',' + Math.floor(r / CELL));
        if (!arr) return false;
        const pr = 0.22; // bán kính thân nhân vật (đơn vị ô)
        for (let i = 0; i < arr.length; i++) {
          const o = arr[i];
          const d = Math.hypot(c - o.c, r - o.r);
          if (d < o.rad + pr) return true;
        }
        return false;
      },
    };
  }

  window.KTGround = { makeGroundTexture, buildObstacles, BIOME };
})();
