/* Tiêu Tử Bá Đạo — rơi đồ, túi đồ, trang bị 5 màu, vàng. Gắn bằng KTLoot.install(scene) SAU KTStory. */
(function () {
  const KEY = 'ttbd-inv-v1';
  const el = id => document.getElementById(id);
  const RAR = [
    { n: 'Phàm', c: '#e8e8e8', hex: 0xe8e8e8, w: 55, m: 1.0 },
    { n: 'Tinh', c: '#6fe07a', hex: 0x6fe07a, w: 27, m: 1.35 },
    { n: 'Huyền', c: '#5fb0ff', hex: 0x5fb0ff, w: 12, m: 1.8 },
    { n: 'Địa', c: '#c47bff', hex: 0xc47bff, w: 5, m: 2.4 },
    { n: 'Thiên', c: '#ffad33', hex: 0xffad33, w: 1, m: 3.2 },
  ];
  const SLOT = {
    weapon: { n: 'Thương', ic: '⚔', lab: 'Vũ khí' },
    armor: { n: 'Giáp', ic: '🛡', lab: 'Giáp' },
    ring: { n: 'Nhẫn', ic: '💍', lab: 'Nhẫn' },
  };
  const ELEM = ['Thủy', 'Phong', 'Lôi', 'Băng', 'Vân'];

  function makeItem(lv, boss) {
    const R = Math.random;
    let roll = R() * 100, ri = 0;
    if (boss) roll = 55 + R() * 45;               // boss: chắc chắn từ Tinh trở lên
    for (let a = 0; ri < RAR.length - 1; ri++) { a += RAR[ri].w; if (roll < a) break; }
    const slot = ['weapon', 'armor', 'ring'][Math.floor(R() * 3)];
    const r = RAR[ri], base = 2 + lv * 1.6;
    const it = { id: Date.now().toString(36) + Math.floor(R() * 1e6).toString(36), slot, rar: ri, lv,
      name: r.n + ' ' + ELEM[Math.floor(R() * ELEM.length)] + ' ' + SLOT[slot].n, atk: 0, def: 0, hp: 0 };
    if (slot === 'weapon') it.atk = Math.round(base * 1.5 * r.m);
    if (slot === 'armor') { it.def = Math.round(base * 0.5 * r.m); it.hp = Math.round(base * 4 * r.m); }
    if (slot === 'ring') { it.hp = Math.round(base * 3 * r.m); it.atk = Math.round(base * 0.6 * r.m); }
    it.price = Math.round((5 + lv * 3) * r.m * r.m);
    return it;
  }
  const statTxt = it => [it.atk && 'Công +' + it.atk, it.def && 'Thủ +' + it.def, it.hp && 'Máu +' + it.hp].filter(Boolean).join(' · ');

  function css() {
    const s = document.createElement('style');
    s.textContent = `
#bagBtn{position:fixed;right:10px;bottom:84px;z-index:7;width:54px;height:54px;border-radius:12px;border:2px solid #b58a3c;
  background:linear-gradient(#3a2410,#1b1108);color:#f0d79a;font:700 12px 'Segoe UI',Arial;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center}
#bagBtn b{font-size:20px;line-height:1}
#gold{position:fixed;right:10px;bottom:144px;z-index:7;color:#ffd96a;font:700 13px 'Segoe UI',Arial;text-shadow:0 1px 2px #000;background:rgba(10,8,6,.7);padding:2px 8px;border-radius:8px}
#bag{position:fixed;inset:0;z-index:25;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55)}
#bag .pn{width:min(96vw,560px);max-height:88vh;overflow:auto;background:linear-gradient(#2a1a0c,#160e06);border:2px solid #b58a3c;border-radius:12px;color:#f3e2bb;font:13px/1.4 'Segoe UI',Arial;padding:12px}
#bag h3{margin:0 0 8px;color:#ffcf6a;font-size:15px;display:flex;justify-content:space-between;align-items:center}
#bag h3 button{background:#d6a24a;border:0;border-radius:6px;padding:4px 12px;font-weight:700;cursor:pointer}
#bag .eq{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px}
#bag .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(54px,1fr));gap:6px}
#bag .cell{aspect-ratio:1;border:2px solid #4a3418;border-radius:8px;background:#0e0904;display:flex;align-items:center;justify-content:center;font-size:24px;cursor:pointer;position:relative}
#bag .cell small{position:absolute;right:3px;bottom:1px;font-size:10px;color:#ccc}
#bag .slot{border:2px dashed #6b5124;border-radius:8px;padding:6px;min-height:52px;cursor:pointer}
#bag .slot .k{color:#b9a07a;font-size:11px}
#bag .info{margin-top:8px;padding:8px;border-radius:8px;background:#0e0904;min-height:56px}
#bag .info button{margin:6px 6px 0 0;border:0;border-radius:6px;padding:5px 12px;font-weight:700;cursor:pointer}
#bag .tot{color:#b8e08a;margin-bottom:6px}`;
    document.head.appendChild(s);
    const b = document.createElement('div'); b.id = 'bagBtn'; b.innerHTML = '<b>🎒</b>Túi'; document.body.appendChild(b);
    const g = document.createElement('div'); g.id = 'gold'; document.body.appendChild(g);
    const p = document.createElement('div'); p.id = 'bag';
    p.innerHTML = '<div class="pn"><h3>Hành trang <button id="bagClose">Đóng</button></h3><div class="tot"></div><div class="eq"></div><div class="grid"></div><div class="info">Chạm vào món đồ để xem.</div></div>';
    document.body.appendChild(p);
  }

  function install(sc) {
    css();
    const h = sc.hero;
    const inv = sc.inv = { gold: 0, bag: [], eq: {} };
    const MAXBAG = 24;
    const bonus = () => { const b = { atk: 0, def: 0, hp: 0 }; for (const it of Object.values(inv.eq)) if (it) { b.atk += it.atk; b.def += it.def; b.hp += it.hp; } return b; };
    let applied = { atk: 0, def: 0, hp: 0 };
    function applyBonus() {               // cộng phần chênh lệch để không phá chỉ số tăng theo cấp
      const b = bonus();
      h.atk += b.atk - applied.atk; h.def += b.def - applied.def; h.maxHp += b.hp - applied.hp;
      h.hp = Math.min(h.hp, h.maxHp); applied = b;
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(inv)); } catch (e) { } }
    function load() {
      try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d) { inv.gold = d.gold | 0; inv.bag = d.bag || []; inv.eq = d.eq || {}; } } catch (e) { }
    }
    const goldTxt = () => { el('gold').textContent = '💰 ' + inv.gold; };

    /* ---------- vật phẩm dưới đất ---------- */
    const g = sc.add.graphics();
    g.fillStyle(0xffffff, 1).fillTriangle(10, 0, 20, 7, 10, 14).fillTriangle(10, 0, 0, 7, 10, 14);
    g.generateTexture('lootGem', 20, 14); g.destroy();
    sc.drops = [];
    function dropAt(c, r, it) {
      const x = isoX(c, r), y = isoY(c, r);
      const s = sc.add.image(x, y - 6, 'lootGem').setTint(RAR[it.rar].hex).setDepth(y).setScale(1.2);
      const glow = sc.add.ellipse(x, y + 2, 30, 14, RAR[it.rar].hex, 0.35).setDepth(-6.5e5);
      sc.tweens.add({ targets: s, y: y - 14, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.inOut' });
      sc.drops.push({ c, r, it, s, glow, t: performance.now() });
    }
    function pickup(d) {
      if (inv.bag.length >= MAXBAG) { if (!d.full) { HUD.toast('Túi đầy! Bán bớt đồ'); d.full = true; } return false; }
      inv.bag.push(d.it); d.s.destroy(); d.glow.destroy();
      HUD.log('Nhặt: ' + d.it.name + ' (' + statTxt(d.it) + ')');
      sc.floatText(h, d.it.name, RAR[d.it.rar].c, d.it.rar >= 3);
      if (d.it.rar >= 3) sc.sfx('win'); else sc.sfx('ui');
      save(); if (el('bag').style.display === 'flex') render();
      return true;
    }

    /* ---------- bọc kill: rơi đồ + vàng ---------- */
    const _kill = sc.kill.bind(sc);
    sc.kill = function (u) {
      const wasDead = u.dead, isHero = u === h;
      const r = _kill(u);
      if (!isHero && !wasDead) {
        const gold = Math.round((3 + u.lv * 2) * (u.isBoss ? 25 : 1) * (0.7 + Math.random() * 0.6));
        inv.gold += gold; goldTxt();
        const n = u.isBoss ? 3 : (Math.random() < 0.32 ? 1 : 0);
        for (let i = 0; i < n; i++) dropAt(u.c + (Math.random() - 0.5) * 0.8, u.r + (Math.random() - 0.5) * 0.8, makeItem(u.lv, u.isBoss));
        save();
      }
      return r;
    };

    sc.events.on('update', () => {
      if (h.dead || !sc.drops.length) return;
      for (let i = sc.drops.length - 1; i >= 0; i--) {
        const d = sc.drops[i];
        if (Math.hypot(d.c - h.c, d.r - h.r) < 1.1 && pickup(d)) sc.drops.splice(i, 1);
      }
    });

    /* ---------- giao diện túi ---------- */
    let sel = null;
    function render() {
      const b = bonus();
      el('bag').querySelector('.tot').textContent = `Lăng Vân Lv${h.lv} · Công ${h.atk} · Thủ ${h.def} · Máu ${h.maxHp}  (trang bị: +${b.atk} công, +${b.def} thủ, +${b.hp} máu) · 💰 ${inv.gold}`;
      el('bag').querySelector('.eq').innerHTML = Object.entries(SLOT).map(([k, s]) => {
        const it = inv.eq[k];
        return `<div class="slot" data-eq="${k}"><div class="k">${s.lab}</div>${it ? `<span style="color:${RAR[it.rar].c}">${s.ic} ${it.name}</span><div class="k">${statTxt(it)}</div>` : '<span class="k">— trống —</span>'}</div>`;
      }).join('');
      el('bag').querySelector('.grid').innerHTML = inv.bag.map((it, i) =>
        `<div class="cell" data-i="${i}" style="border-color:${RAR[it.rar].c}">${SLOT[it.slot].ic}<small>${it.lv}</small></div>`).join('') +
        Array(Math.max(0, MAXBAG - inv.bag.length)).fill('<div class="cell" style="cursor:default"></div>').join('');
      const info = el('bag').querySelector('.info');
      if (sel == null || !inv.bag[sel]) { info.innerHTML = `Túi ${inv.bag.length}/${MAXBAG}. Chạm vào món đồ để xem.`; return; }
      const it = inv.bag[sel], cur = inv.eq[it.slot];
      const diff = cur ? ` <span class="k">(đang mặc: ${statTxt(cur)})</span>` : '';
      info.innerHTML = `<b style="color:${RAR[it.rar].c}">${it.name}</b> · cấp ${it.lv}<br>${statTxt(it)}${diff}<br>
        <button id="bEq" style="background:#6fd06a">Trang bị</button><button id="bSell" style="background:#d6a24a">Bán ${it.price} 💰</button>`;
      el('bEq').onclick = () => { const old = inv.eq[it.slot]; inv.eq[it.slot] = it; inv.bag.splice(sel, 1); if (old) inv.bag.push(old); sel = null; applyBonus(); sc.sfx('ui'); HUD.toast('Đã trang bị ' + it.name); save(); render(); };
      el('bSell').onclick = () => { inv.gold += it.price; inv.bag.splice(sel, 1); sel = null; goldTxt(); sc.sfx('ui'); save(); render(); };
    }
    el('bag').addEventListener('click', ev => {
      const c = ev.target.closest('[data-i]'); if (c) { sel = +c.dataset.i; render(); return; }
      const e = ev.target.closest('[data-eq]');
      if (e && inv.eq[e.dataset.eq]) {
        if (inv.bag.length >= MAXBAG) { HUD.toast('Túi đầy'); return; }
        inv.bag.push(inv.eq[e.dataset.eq]); delete inv.eq[e.dataset.eq]; applyBonus(); save(); render();
      }
    });
    const open = () => { sel = null; render(); el('bag').style.display = 'flex'; sc.sfx('ui'); };
    const close = () => { el('bag').style.display = 'none'; };
    el('bagBtn').onclick = ev => { ev.stopPropagation(); open(); };
    el('bagClose').onclick = close;
    el('bag').addEventListener('pointerdown', ev => ev.stopPropagation());
    sc.input.keyboard.on('keydown-B', () => (el('bag').style.display === 'flex' ? close() : open()));
    sc.input.keyboard.on('keydown-I', () => (el('bag').style.display === 'flex' ? close() : open()));

    load(); applyBonus(); goldTxt();
    sc.time.addEvent({ delay: 20000, loop: true, callback: save });
    window.addEventListener('pagehide', save);
    window.__inv = inv;
    sc.lootDebug = { makeItem, dropAt, render, applyBonus };
  }
  window.KTLoot = { install };
})();
