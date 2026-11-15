// KTTerrain — nền map vẽ ĐÚNG ĐỘ PHÂN GIẢI GỐC (1 px texture = 1 px world).
// Thay cho ảnh map-full phóng to x3 (nguyên nhân nhoè + lộ vết ghép).
// 3 texture liền mép (cỏ / đất / đá lát) được trộn theo "bản đồ địa hình" vẽ trong
// toạ độ ô; phép chiếu iso là phép affine nên mask được vẽ thẳng bằng setTransform.
// Nền chia khối 1024px, chỉ dựng khối gần camera (LRU), cộng 1 ảnh toàn map 1/4 cho overview.
(function () {
  const K = 8;            // pixel mask / 1 ô
  const CH = 1024;        // cạnh khối nền (world px)
  const LOWS = 0.25;      // tỉ lệ ảnh toàn map
  const MAXC = 18;        // số khối giữ tối đa

  function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  // nhiễu giá trị mượt trên lưới g×g, lấy mẫu song tuyến
  function valueNoise(g, seed) {
    const R = rng(seed), v = new Float32Array((g + 1) * (g + 1));
    for (let i = 0; i < v.length; i++) v[i] = R();
    return (x, y) => { // x,y trong [0,g)
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const i0 = Math.min(g, Math.max(0, xi)), j0 = Math.min(g, Math.max(0, yi)), i1 = Math.min(g, i0 + 1), j1 = Math.min(g, j0 + 1);
      const a = v[j0 * (g + 1) + i0], b = v[j0 * (g + 1) + i1], c = v[j1 * (g + 1) + i0], d = v[j1 * (g + 1) + i1];
      return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    };
  }

  function boxBlur(a, w, h, r) { // blur tách trục trên Float32Array
    const t = new Float32Array(a.length);
    for (let y = 0; y < h; y++) { let s = 0; for (let x = -r; x <= r; x++) s += a[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) { t[y * w + x] = s / (2 * r + 1); s += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)]; } }
    for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) { a[y * w + x] = s / (2 * r + 1); s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
  }

  function toCanvas(a, w, h, rgb) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const x = cv.getContext('2d'), im = x.createImageData(w, h);
    for (let i = 0; i < w * h; i++) { im.data[i * 4] = rgb[0]; im.data[i * 4 + 1] = rgb[1]; im.data[i * 4 + 2] = rgb[2]; im.data[i * 4 + 3] = Math.max(0, Math.min(255, a[i] * 255)); }
    x.putImageData(im, 0, 0); return cv;
  }

  // ---------- bản đồ địa hình (toạ độ ô) ----------
  function buildMasks(N, village, spots, seed) {
    const W = N * K, dirt = new Float32Array(W * W), stone = new Float32Array(W * W), tone = new Float32Array(W * W);
    const n1 = valueNoise(14, seed + 1), n2 = valueNoise(40, seed + 2), n3 = valueNoise(7, seed + 3);
    const at = (u, v) => Math.floor(v) * W + Math.floor(u);
    // đường đất: làng -> từng bãi, uốn nhẹ theo nhiễu
    const road = (c0, r0, c1, r1, wid) => {
      const L = Math.hypot(c1 - c0, r1 - r0), steps = Math.ceil(L * K * 1.5);
      const nx = -(r1 - r0) / L, ny = (c1 - c0) / L;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps, bend = Math.sin(t * Math.PI) * (n3(t * 6, (c1 + r1) % 7) - 0.5) * 3.5;
        const cx = c0 + (c1 - c0) * t + nx * bend, cy = r0 + (r1 - r0) * t + ny * bend;
        const rr = wid * (0.85 + 0.3 * n2(cx * 40 / N, cy * 40 / N)) * K;
        for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
          if (dx * dx + dy * dy > rr * rr) continue;
          const u = cx * K + dx, v = cy * K + dy; if (u < 0 || v < 0 || u >= W || v >= W) continue;
          dirt[at(u, v)] = 1; } } };
    // mạng đường theo cây khung nhỏ nhất (MST): không còn nhiều dải song song toả từ làng
    { const P = [village, ...spots], inT = [0], E = [];
      while (inT.length < P.length) { let best = null;
        for (const i of inT) for (let j = 0; j < P.length; j++) { if (inT.includes(j)) continue;
          const d = Math.hypot(P[i].c - P[j].c, P[i].r - P[j].r); if (!best || d < best[2]) best = [i, j, d]; }
        inT.push(best[1]); E.push(best); }
      for (const [i, j] of E) road(P[i].c, P[i].r, P[j].c, P[j].r, i === 0 ? 0.7 : 0.6); }
    // bãi luyện công: đất nện loang lổ (không tròn trịa)
    for (const s of spots) {
      const R = 3.9 * K;
      for (let dy = -R * 1.3; dy <= R * 1.3; dy++) for (let dx = -R * 1.3; dx <= R * 1.3; dx++) {
        const u = s.c * K + dx, v = s.r * K + dy; if (u < 0 || v < 0 || u >= W || v >= W) continue;
        const d = Math.hypot(dx, dy) / R, nz = n2(u / K * 40 / N, v / K * 40 / N);
        const w = Math.max(0, 1 - d * (0.75 + 0.6 * nz)) * 1.55 * (0.5 + 0.6 * n1(u / K * 14 / N, v / K * 14 / N));
        const i = at(u, v); dirt[i] = Math.max(dirt[i], Math.min(1, w)); } }
    // quảng trường đá lát quanh làng
    { const R = 3.3 * K;
      for (let dy = -R * 1.2; dy <= R * 1.2; dy++) for (let dx = -R * 1.2; dx <= R * 1.2; dx++) {
        const u = village.c * K + dx, v = village.r * K + dy; if (u < 0 || v < 0 || u >= W || v >= W) continue;
        const sq = Math.max(Math.abs(dx), Math.abs(dy)) / R, rd = Math.hypot(dx, dy) / R; const d = 0.55 * sq + 0.45 * rd + (n2(u / K * 40 / N, v / K * 40 / N) - 0.5) * 0.3;
        if (d < 1) stone[at(u, v)] = 1; } }
    // tông màu lớn: mảng cỏ đậm/nhạt
    for (let v = 0; v < W; v++) for (let u = 0; u < W; u++) tone[v * W + u] = 0.65 * n1(u / K * 14 / N, v / K * 14 / N) + 0.35 * n2(u / K * 40 / N, v / K * 40 / N);
    boxBlur(dirt, W, W, 3); boxBlur(dirt, W, W, 2);
    boxBlur(stone, W, W, 2);
    // mép đất răng cưa nhẹ (không phải đường viền mềm đều)
    for (let i = 0; i < dirt.length; i++) { const u = i % W, v = (i / W) | 0;
      const e = dirt[i]; if (e > 0.02 && e < 0.98) dirt[i] = Math.min(1, Math.max(0, (e - 0.5) * 1.8 + 0.5 + (n2(u / K * 120 / N % 40, v / K * 120 / N % 40) - 0.5) * 0.5)); }
    const toneCv = (() => { const cv = document.createElement('canvas'); cv.width = W; cv.height = W;
      const x = cv.getContext('2d'), im = x.createImageData(W, W);
      for (let i = 0; i < W * W; i++) { const g = Math.round(96 + 64 * tone[i]); im.data[i * 4] = g; im.data[i * 4 + 1] = g; im.data[i * 4 + 2] = Math.round(g * 0.96); im.data[i * 4 + 3] = 255; }
      x.putImageData(im, 0, 0); return cv; })();
    return { W, dirt: toCanvas(dirt, W, W, [255, 255, 255]), stone: toCanvas(stone, W, W, [255, 255, 255]), tone: toneCv,
      dirtArr: dirt, stoneArr: stone };
  }

  // mask pixel (qx,qy) -> world: x=(qx-qy)*TW/(2K), y=(qx+qy)*TH/(2K) - TH/2
  function maskTransform(ctx, s, ox, oy, TW, TH) {
    ctx.setTransform(s * TW / (2 * K), s * TH / (2 * K), -s * TW / (2 * K), s * TH / (2 * K), -s * ox, -s * oy);
  }

  function compose(T, cv, ox, oy, w, h, s) {
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const fillPat = (c, pat) => { c.save(); c.setTransform(s, 0, 0, s, -s * ox, -s * oy); c.fillStyle = pat; c.fillRect(ox, oy, w, h); c.restore(); };
    fillPat(ctx, T.pat.grass);
    // mảng tông cỏ (overlay)
    ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.55; maskTransform(ctx, s, ox, oy, T.TW, T.TH); ctx.drawImage(T.m.tone, 0, 0); ctx.restore();
    const layer = (mask, pat, alpha) => {
      const t = T.tmp(cv.width, cv.height), x = t.getContext('2d');
      x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, t.width, t.height);
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      maskTransform(x, s, ox, oy, T.TW, T.TH); x.drawImage(mask, 0, 0);
      x.globalCompositeOperation = 'source-in'; fillPat(x, pat);
      ctx.save(); ctx.globalAlpha = alpha; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(t, 0, 0); ctx.restore(); };
    layer(T.m.dirt, T.pat.dirt, 1);
    layer(T.m.stone, T.pat.stone, 1);
    // tối dần ra rìa hình thoi (rừng viền), ngoài hình thoi = màu rừng đậm
    ctx.save(); maskTransform(ctx, s, ox, oy, T.TW, T.TH); ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(T.edge, 0, 0); ctx.restore();
  }

  function makeEdge(N) { // viền tối mềm quanh hình thoi + phủ đậm phần ngoài map
    const W = N * K, pad = 48 * K, cv = document.createElement('canvas'); cv.width = W + 2 * pad; cv.height = W + 2 * pad;
    const x = cv.getContext('2d'), im = x.createImageData(cv.width, cv.height);
    for (let v = 0; v < cv.height; v++) for (let u = 0; u < cv.width; u++) {
      const du = Math.min(u - pad, W - 1 - (u - pad)), dv = Math.min(v - pad, W - 1 - (v - pad)), d = Math.min(du, dv) / K;
      const a = d < -1.5 ? 1 : d < 0 ? 0.8 + 0.2 * (-d / 1.5) : Math.max(0, 0.8 * Math.pow(1 - Math.min(1, d / 3.5), 2));
      const i = (v * cv.width + u) * 4; im.data[i] = 18; im.data[i + 1] = 26; im.data[i + 2] = 16; im.data[i + 3] = Math.round(a * 255); }
    x.putImageData(im, 0, 0);
    const out = document.createElement('canvas'); out.width = cv.width; out.height = cv.height;
    const o = out.getContext('2d'); o.translate(-pad, -pad); // gốc mask = ô (0,0)
    // vẽ lệch pad để toạ độ khớp mask
    const w2 = document.createElement('canvas'); w2.width = W + 2 * pad; w2.height = W + 2 * pad;
    w2.getContext('2d').drawImage(cv, 0, 0);
    return { cv: w2, pad };
  }

  const KTTerrain = {
    init(scene, opt) {
      const { N, TW, TH, village, spots, seed } = opt;
      const t0 = performance.now();
      const m = buildMasks(N, village, spots, seed || 7);
      const pat = {}, ctx0 = document.createElement('canvas').getContext('2d');
      for (const k of ['grass', 'dirt', 'stone']) pat[k] = ctx0.createPattern(scene.textures.get('g-' + k).getSourceImage(), 'repeat');
      const edge = makeEdge(N);
      // edge canvas đặt lệch -pad ô -> bọc vào canvas có gốc trùng mask bằng cách vẽ với offset
      const edgeCv = document.createElement('canvas'); edgeCv.width = edge.cv.width; edgeCv.height = edge.cv.height;
      edgeCv.getContext('2d').drawImage(edge.cv, 0, 0);
      let tmpCv = null;
      const T = this.T = { N, TW, TH, m, pat, scene, chunks: new Map(), stat: { built: 0, ms: 0 },
        tmp: (w, h) => { if (!tmpCv || tmpCv.width !== w || tmpCv.height !== h) { tmpCv = document.createElement('canvas'); tmpCv.width = w; tmpCv.height = h; } return tmpCv; },
        edge: { width: 0 } };
      // edge cần lệch -pad ô: tạo canvas phụ có gốc ô(0,0) bằng drawImage âm
      T.edge = (() => { const pad = edge.pad, c = document.createElement('canvas'); c.width = edgeCv.width; c.height = edgeCv.height; return { c, pad }; })();
      // vẽ edge qua hàm riêng (gốc lệch)
      T.drawEdge = (ctx, s, ox, oy) => { ctx.save(); ctx.setTransform(s * TW / (2 * K), s * TH / (2 * K), -s * TW / (2 * K), s * TH / (2 * K), -s * ox, -s * oy);
        ctx.drawImage(edgeCv, -edge.pad, -edge.pad); ctx.restore(); };
      // ảnh toàn map 1/4 (overview + lót dưới khi khối chưa dựng)
      const wW = N * TW, wH = N * TH, X0 = -wW / 2 - 256, Y0 = -TH / 2 - 256, LW = wW + 512, LH = wH + 512;
      const low = document.createElement('canvas'); low.width = Math.ceil(LW * LOWS); low.height = Math.ceil(LH * LOWS);
      this._compose(T, low, X0, Y0, LW, LH, LOWS);
      if (scene.textures.exists('terrain-low')) scene.textures.remove('terrain-low');
      scene.textures.addCanvas('terrain-low', low);
      this.low = scene.add.image(X0, Y0, 'terrain-low').setOrigin(0, 0).setDisplaySize(LW, LH).setDepth(-9.95e5);
      T.bounds = { x0: X0, y0: Y0, x1: X0 + LW, y1: Y0 + LH };
      T.stat.initMs = Math.round(performance.now() - t0);
      return T;
    },
    _compose(T, cv, ox, oy, w, h, s) {
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      const fillPat = (c, pat) => { c.save(); c.setTransform(s, 0, 0, s, -s * ox, -s * oy); c.fillStyle = pat; c.fillRect(ox, oy, w, h); c.restore(); };
      fillPat(ctx, T.pat.grass);
      ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.5; maskTransform(ctx, s, ox, oy, T.TW, T.TH); ctx.drawImage(T.m.tone, 0, 0); ctx.restore();
      const layer = (mask, pat) => {
        const t = T.tmp(cv.width, cv.height), x = t.getContext('2d');
        x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, t.width, t.height);
        x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
        maskTransform(x, s, ox, oy, T.TW, T.TH); x.drawImage(mask, 0, 0);
        x.globalCompositeOperation = 'source-in'; fillPat(x, pat); x.globalCompositeOperation = 'source-over';
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(t, 0, 0); ctx.restore(); };
      layer(T.m.dirt, T.pat.dirt);
      layer(T.m.stone, T.pat.stone);
      T.drawEdge(ctx, s, ox, oy);
    },
    // gọi mỗi frame: dựng khối gần camera, tối đa 1 khối/frame (2 khi mới vào)
    update(scene, overview) {
      const T = this.T; if (!T) return;
      const cam = scene.cameras.main, v = cam.worldView;
      if (overview) return;
      const mg = 256, b = T.bounds;
      const i0 = Math.floor((Math.max(b.x0, v.x - mg) - b.x0) / CH), i1 = Math.floor((Math.min(b.x1 - 1, v.right + mg) - b.x0) / CH);
      const j0 = Math.floor((Math.max(b.y0, v.y - mg) - b.y0) / CH), j1 = Math.floor((Math.min(b.y1 - 1, v.bottom + mg) - b.y0) / CH);
      let budget = T.stat.built < 4 ? 4 : 1;
      const now = scene.time.now;
      // ưu tiên khối gần tâm camera
      const want = [];
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) want.push([i, j, Math.hypot(b.x0 + (i + 0.5) * CH - cam.midPoint.x, b.y0 + (j + 0.5) * CH - cam.midPoint.y)]);
      want.sort((a, c) => a[2] - c[2]);
      for (const [i, j] of want) {
        const key = i + ',' + j, ch = T.chunks.get(key);
        if (ch) { ch.seen = now; continue; }
        if (budget-- <= 0) continue;
        const t0 = performance.now(), ox = b.x0 + i * CH, oy = b.y0 + j * CH;
        const cv = document.createElement('canvas'); cv.width = CH; cv.height = CH;
        this._compose(T, cv, ox, oy, CH, CH, 1);
        const tk = 'tchunk-' + key; if (scene.textures.exists(tk)) scene.textures.remove(tk);
        scene.textures.addCanvas(tk, cv);
        const img = scene.add.image(ox, oy, tk).setOrigin(0, 0).setDepth(-9.9e5);
        T.chunks.set(key, { img, tk, seen: now });
        T.stat.built++; T.stat.ms += performance.now() - t0;
      }
      if (T.chunks.size > MAXC) { // bỏ khối lâu không thấy
        const arr = [...T.chunks.entries()].sort((a, c) => a[1].seen - c[1].seen);
        for (let k = 0; k < arr.length - MAXC; k++) { const [key, ch] = arr[k]; if (ch.seen === now) continue; ch.img.destroy(); scene.textures.remove(ch.tk); T.chunks.delete(key); }
      }
    },
    setOverview(on) { const T = this.T; if (!T) return; for (const ch of T.chunks.values()) ch.img.setVisible(!on); },
    // chất liệu tại ô (để vật thể/âm bước chân dùng sau này)
    groundAt(c, r) { const T = this.T; if (!T) return 'grass'; const W = T.m.W, u = Math.round(c * K), v = Math.round(r * K);
      if (u < 0 || v < 0 || u >= W || v >= W) return 'grass'; const i = v * W + u;
      return T.m.stoneArr[i] > 0.5 ? 'stone' : T.m.dirtArr[i] > 0.5 ? 'dirt' : 'grass'; },
  };
  window.KTTerrain = KTTerrain;
})();
