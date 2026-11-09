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

  function cellMat(map, c, r, G, cache, plaza) {
    if (c < 0 || r < 0 || c >= map.N || r >= map.N) return 'rock';
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
    if (plaza && name !== 'water' && Math.hypot(c - plaza.c, r - plaza.r) < plaza.rad) name = 'brick';
    cache.set(key, name);
    return name;
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
    const T = opts.tex || {}, plaza = opts.plaza || null;
    const TEXM = {
      grass: { t: T.grass, mul: [1, 1, 1] },
      dirt: { t: T.dirt, mul: [1, 1, 1] },
      path: { t: T.dirt, mul: [1.14, 1.1, 1.04] },
      sand: { t: T.dirt, mul: [1, 1, 1], mix: 0.55, col: BIOME.sand },
      rock: { t: T.stone, mul: [0.92, 0.92, 0.92] },
      wood: { t: T.dirt, mul: [0.72, 0.6, 0.5] },
      brick: { t: T.brick, mul: [1, 1, 1], s: 92 },
    };
    const samp = (name, c, r, out) => {
      const m = TEXM[name];
      if (!m || !m.t) { const col = BIOME[name] || BIOME.grass; out[0] = col[0]; out[1] = col[1]; out[2] = col[2]; return; }
      const tx = m.t, s = m.s || 112;
      let u = (c * s) % tx.w; if (u < 0) u += tx.w;
      let v = (r * s) % tx.h; if (v < 0) v += tx.h;
      const i = ((v | 0) * tx.w + (u | 0)) * 4, d = tx.d;
      let R = d[i] * m.mul[0], Gc = d[i + 1] * m.mul[1], Bl = d[i + 2] * m.mul[2];
      if (m.mix) { R = R * (1 - m.mix) + m.col[0] * m.mix; Gc = Gc * (1 - m.mix) + m.col[1] * m.mix; Bl = Bl * (1 - m.mix) + m.col[2] * m.mix; }
      out[0] = R; out[1] = Gc; out[2] = Bl;
    };
    const S0 = [0, 0, 0], S1 = [0, 0, 0], S2 = [0, 0, 0], S3 = [0, 0, 0];
    const hasTex = !!T.grass;

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
        let R, Gc, Bl, v;
        if (hasTex) {
          samp(cellMat(map, c0, r0, G, cache, plaza), c, r, S0);
          samp(cellMat(map, c0 + 1, r0, G, cache, plaza), c, r, S1);
          samp(cellMat(map, c0, r0 + 1, G, cache, plaza), c, r, S2);
          samp(cellMat(map, c0 + 1, r0 + 1, G, cache, plaza), c, r, S3);
          const w0 = (1 - fc) * (1 - fr), w1 = fc * (1 - fr), w2 = (1 - fc) * fr, w3 = fc * fr;
          R = S0[0] * w0 + S1[0] * w1 + S2[0] * w2 + S3[0] * w3;
          Gc = S0[1] * w0 + S1[1] * w1 + S2[1] * w2 + S3[1] * w3;
          Bl = S0[2] * w0 + S1[2] * w1 + S2[2] * w2 + S3[2] * w3;
          v = (fbm(c * 0.13 + 11, r * 0.13 - 5) - 0.5) * 30 + (vnoise(c * 9, r * 9) - 0.5) * 8;
          // bộ màu chung: ấm, hơi trầm (thu)
          if (T.paint) { const tx = T.paint, sc = 6; let u = (c * sc) % tx.w; if (u < 0) u += tx.w; let vv = (r * sc) % tx.h; if (vv < 0) vv += tx.h; const pi = ((vv | 0) * tx.w + (u | 0)) * 4, pd = tx.d; R = R * 0.58 + pd[pi] * 0.42; Gc = (Gc) * 0.58 + pd[pi + 1] * 0.42; Bl = Bl * 0.58 + pd[pi + 2] * 0.42; }
          R = 128 + (R + v * 0.9 - 128) * 1.06 + 4;
          Gc = 128 + (Gc + v * 0.95 - 128) * 1.06 - 1;
          Bl = 128 + (Bl + v * 0.8 - 128) * 1.06 - 10;
        } else {
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
        }

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
    'house-a': 0.62, 'house-b': 0.62, 'house-c': 0.62, 'house-d': 0.62, 'house-e': 0.62, 'house-f': 0.62,
    gate: 0.7, flag: 0.16, drum: 0.24, well: 0.3 };
  function buildObstacles(map, G) {
    const list = [];
    for (let r = 0; r < map.N; r++) for (let c = 0; c < map.N; c++) {
      const p = map.obj[r][c];
      const rad = (window.KTGround && window.KTGround.RAD_OVERRIDE && window.KTGround.RAD_OVERRIDE[p] != null) ? window.KTGround.RAD_OVERRIDE[p] : RAD[p];
      if (p && rad > 0) list.push({ c: c, r: r, rad: rad, kind: p });
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
    // ---- lưới mịn 64x32 (2x2 ô con mỗi ô 128x64) — chặn theo CHÂN vật thể ----
    const SUB = 2, FN = map.N * SUB;
    const fine = new Uint8Array(FN * FN);
    for (const o of list) {
      const rad = o.rad + 0.22;                       // bán kính + thân nhân vật
      const c0 = Math.floor((o.c - rad) * SUB), c1 = Math.ceil((o.c + rad) * SUB);
      const r0 = Math.floor((o.r - rad) * SUB), r1 = Math.ceil((o.r + rad) * SUB);
      for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
        if (rr < 0 || cc < 0 || rr >= FN || cc >= FN) continue;
        const wx = (cc + 0.5) / SUB, wy = (rr + 0.5) / SUB;   // tâm ô con trong hệ ô
        if (Math.hypot(wx - o.c, wy - o.r) < rad) fine[rr * FN + cc] = 1;
      }
    }
    let fineBlocked = 0; for (let i = 0; i < fine.length; i++) fineBlocked += fine[i];
    const finePct = fineBlocked / fine.length * 100;

    return {
      list, water, bins, CELL, N: map.N, fine, SUB, FN, finePct, fineBlocked,
      solid(c, r) {
        if (c < 1 || r < 1 || c > map.N - 2.02 || r > map.N - 2.02) return true;
        const ci = Math.round(c), ri = Math.round(r);
        if (ci >= 0 && ri >= 0 && ci < map.N && ri < map.N && water[ri * map.N + ci]) return true;
        // lưới mịn trước: nhanh và chặn đúng theo chân vật thể
        const fc = Math.floor(c * SUB), fr = Math.floor(r * SUB);
        if (fc >= 0 && fr >= 0 && fc < FN && fr < FN && fine[fr * FN + fc]) return true;
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
