/* Lớp lau sậy cao (học từ map boss thủy mặc): cụm lau vẽ bằng canvas lúc chạy (0 byte asset),
   sort theo y như vật thể, CHE nhân vật khi đứng sau; hero ở sau cụm nào thì cụm đó mờ đi để vẫn thấy mình.
   Không chặn đường đi. */
(function () {
  'use strict';
  const SEG = 8;
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function makeTex(scene, key, seed) {
    const W = 260, H = 300, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d'), R = rng(seed);
    const N = 70 + ((R() * 30) | 0);
    for (let i = 0; i < N; i++) {
      // gốc dồn vào giữa, ngọn thấp dần ra mép => cụm hình vòm tự nhiên, không thành khối chữ nhật
      const u = (R() + R() + R()) / 3, bx = W * (0.08 + u * 0.84), by = H - 4 - R() * 14;
      const edge = 1 - Math.abs(u - 0.5) * 1.5;
      const h = H * (0.25 + edge * (0.45 + R() * 0.3)), lean = (u - 0.5) * 120 + (R() - 0.5) * 50, tx = bx + lean, ty = by - h;
      const tone = 150 + R() * 70;
      x.strokeStyle = `rgba(${tone * 0.82 | 0},${tone * 0.76 | 0},${tone * 0.6 | 0},0.9)`;
      x.lineWidth = 1 + R() * 1.4;
      x.beginPath(); x.moveTo(bx, by); x.quadraticCurveTo(bx + lean * 0.3, by - h * 0.55, tx, ty); x.stroke();
      // bông lau
      const pl = 18 + R() * 26;
      for (let k = 0; k < 9; k++) {
        const t = k / 8, px = tx + lean * 0.12 * t + (R() - 0.5) * 6, py = ty + pl * t;
        x.strokeStyle = `rgba(${236 - R() * 30 | 0},${226 - R() * 30 | 0},${206 - R() * 30 | 0},${0.55 + R() * 0.35})`;
        x.lineWidth = 1.2;
        x.beginPath(); x.moveTo(px, py); x.lineTo(px + (R() - 0.3) * 14, py + 5 + R() * 6); x.stroke();
      }
      // lá dài
      if (R() < 0.35) {
        x.strokeStyle = `rgba(${tone * 0.62 | 0},${tone * 0.64 | 0},${tone * 0.48 | 0},0.85)`;
        x.beginPath(); x.moveTo(bx, by - h * 0.2); x.quadraticCurveTo(bx + (R() - 0.5) * 50, by - h * 0.45, bx + (R() - 0.5) * 80, by - h * 0.3); x.stroke();
      }
    }
    scene.textures.addCanvas(key, cv);
  }

  function init(scene, o) {
    const { map, G, N, isoX, isoY, village, spots } = o;
    const keys = [0, 1, 2].map(i => { const art = 'reed-art' + i; if (scene.textures.exists(art)) return art; const k = 'reed' + i; if (!scene.textures.exists(k)) makeTex(scene, k, 1234 + i * 97); return k; });
    const R = rng((o.seed || 7) * 31 + 5);
    const clumps = [];
    const ok = (c, r) => {
      if (c < 3 || r < 3 || c > N - 4 || r > N - 4) return false;
      if (map.obj[r][c] || map.block[r][c]) return false;
      const k = map.t[r][c];
      if (G.PATH.includes(k) || k === G.WOOD || G.WATER.includes(k)) return false;
      if (Math.hypot(c - village.c, r - village.r) < (o.centerClear || 9)) return false;
      if ((spots || []).some(s => Math.hypot(c - s.c, r - s.r) < 4.5)) return false;
      return true;
    };
    // rải theo BÃI (nhóm lớn), không rải đều — giống tranh tham chiếu
    let tries = 0;
    const want = (o.count === undefined || o.count === null) ? 90 : o.count;
    while (clumps.length < want && tries++ < 4000) {
      const c0 = 3 + R() * (N - 6), r0 = 3 + R() * (N - 6);
      if (!ok(c0 | 0, r0 | 0)) continue;
      const n = 4 + ((R() * 6) | 0);
      for (let i = 0; i < n; i++) {
        const c = c0 + (R() - 0.5) * 3.2, r = r0 + (R() - 0.5) * 3.2;
        if (!ok(c | 0, r | 0)) continue;
        const x = isoX(c, r), y = isoY(c, r);
        // Rope dọc: texture được uốn theo dãy điểm => GỐC đứng yên, NGỌN cong theo gió (không xoay cứng cả ảnh)
        const key = keys[(R() * 3) | 0], tx = scene.textures.get(key).getSourceImage(), TH = tx.height;
        const pts = []; for (let i = 0; i <= SEG; i++) pts.push(new Phaser.Math.Vector2(0, -TH + (TH * i) / SEG));
        const s = scene.add.rope(x, y, key, null, pts, false).setDepth(y + 4);
        const sc = 0.5 + R() * 0.25; s.setScale(sc); if (R() < 0.5) s.setFlipX(true);
        clumps.push({ s, x, y, c, r, a: 1, pts, TH, w: tx.width * sc, h: TH * sc });
      }
    }
    // mờ cụm đang che hero
    const hero = () => scene.hero;
    for (const k of clumps) { k.ph = R() * 6.28; k.sp = 0.8 + R() * 0.6; k.push = 0; }
    scene.events.on('postupdate', () => {
      const h = hero(); if (!h || !h.spr) return;
      const hx = h.spr.x, hy = h.spr.y, hh = h.spr.displayHeight;
      const t = scene.time.now / 1000;
      // gió: sóng chạy theo trục x nên cả bãi lau gợn lần lượt, không lắc đồng loạt
      const gust = 0.6 + 0.4 * Math.sin(t * 0.37);
      for (const k of clumps) {
        const s = k.s;
        // nhân vật đi xuyên qua: lau rẽ sang hai bên rồi bật lại
        const dx = k.x - hx, dy = k.y - hy;
        const near = Math.abs(dx) < k.w * 0.5 && Math.abs(dy) < 34;
        if (near) k.push += ((dx >= 0 ? 1 : -1) * 0.22 - k.push) * 0.18;
        else k.push *= 0.93;
        // 2 sóng chồng nhau (chậm + nhanh) cho chuyển động không đều như thật
        const bend = (Math.sin(t * k.sp + k.ph + k.x * 0.004) * 0.06 + Math.sin(t * k.sp * 2.3 + k.ph * 1.7) * 0.018) * gust + k.push;
        for (let i = 0; i <= SEG; i++) { const hN = 1 - i / SEG; k.pts[i].x = bend * Math.pow(hN, 1.7) * k.TH; }
        s.setDirty();
        const behind = hy < k.y + 2 && Math.abs(hx - k.x) < k.w * 0.42 && hy > k.y - k.h * 0.95 - hh * 0.2;
        const ta = behind ? 0.32 : 1;
        if (k.a !== ta) { k.a += (ta - k.a) * 0.25; if (Math.abs(k.a - ta) < 0.02) k.a = ta; s.setAlpha(k.a); }
      }
    });
    // thủy mặc: giảm bão hoà nhẹ toàn cảnh (nếu Phaser có postFX)
    let ink = false;
    try { const fx = scene.cameras.main.postFX; if (fx && fx.addColorMatrix) { fx.addColorMatrix().saturate(-0.28); ink = true; } } catch (e) { }
    scene.reeds = { count: clumps.length, clumps, ink };
    return scene.reeds;
  }
  window.KTReeds = { init };
})();
