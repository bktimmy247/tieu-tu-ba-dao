/* Tiêu Tử Bá Đạo — rơi đồ, túi, 6 ô trang bị, cường hoá +1..+10, vàng.
   Gắn bằng KTLoot.install(scene) SAU KTStory. */
(function () {
  const KEY = 'ttbd-inv-v2', OLDKEY = 'ttbd-inv-v1';
  const MAXBAG = 24, MAXENH = 10, ENH_RATE = 0.08;
  const el = id => document.getElementById(id);
  const RAR = [
    { n: 'Phàm', c: '#e8e8e8', hex: 0xe8e8e8, w: 55, m: 1.0 },
    { n: 'Tinh', c: '#6fe07a', hex: 0x6fe07a, w: 27, m: 1.35 },
    { n: 'Huyền', c: '#5fb0ff', hex: 0x5fb0ff, w: 12, m: 1.8 },
    { n: 'Địa', c: '#c47bff', hex: 0xc47bff, w: 5, m: 2.4 },
    { n: 'Thiên', c: '#ffad33', hex: 0xffad33, w: 1, m: 3.2 },
  ];
  /* 6 ô: mũ, áo, găng, quần, giày, vũ khí. gen = hệ số nhân theo base của cấp đồ */
  const SLOT = {
    helmet: { n: 'Mũ', ic: '🪖', lab: 'Mũ', gen: { def: 0.5, hp: 1.5, acc: 0.45 } },
    armor: { n: 'Áo', ic: '🥋', lab: 'Áo', gen: { def: 0.9, hp: 3.2 } },
    gloves: { n: 'Găng', ic: '🧤', lab: 'Găng', gen: { atk: 0.6, acc: 0.5 } },
    pants: { n: 'Quần', ic: '👖', lab: 'Quần', gen: { def: 0.6, hp: 2.0, dodge: 0.25 } },
    boots: { n: 'Giày', ic: '👟', lab: 'Giày', gen: { def: 0.25, dodge: 0.7 } },
    weapon: { n: 'Vũ khí', ic: '⚔', lab: 'Vũ khí', gen: { atk: 1.5, acc: 0.3 } },
  };
  const ORDER = ['helmet', 'armor', 'gloves', 'pants', 'boots', 'weapon'];
  const ELEM = ['Thủy', 'Phong', 'Lôi', 'Băng', 'Vân'];
  const STAT = [['atk', 'Công'], ['def', 'Thủ'], ['hp', 'Sinh lực'], ['acc', 'Chính xác'], ['dodge', 'Né']];
  const KEYS = ['atk', 'def', 'hp', 'acc', 'dodge'];

  const enhMul = it => 1 + ENH_RATE * (it.enh || 0);
  const enhCost = it => 100 * ((it.enh || 0) + 1);
  function eff(it) {
    const m = enhMul(it), o = {};
    for (const k of KEYS) o[k] = Math.round((it[k] || 0) * m);
    return o;
  }
  const score = it => { const e = eff(it); return e.atk * 2 + e.def * 3 + e.hp * 0.3 + e.acc * 2 + e.dodge * 2; };
  const itName = it => it.name + (it.enh ? ' +' + it.enh : '');
  const statTxt = it => { const e = eff(it); return STAT.filter(([k]) => e[k]).map(([k, l]) => l + ' +' + e[k]).join(' · '); };
  function norm(it) {
    if (!it || !SLOT[it.slot]) return null;
    const o = Object.assign({ enh: 0, atk: 0, def: 0, hp: 0, acc: 0, dodge: 0 }, it);
    if (!(o.enh >= 0)) o.enh = 0;
    o.enh = Math.min(MAXENH, o.enh | 0);
    return o;
  }

  function makeItem(lv, boss) {
    const R = Math.random;
    let roll = R() * 100, ri = 0;
    if (boss) roll = 55 + R() * 45;               // boss: chắc chắn từ Tinh trở lên
    for (let a = 0; ri < RAR.length - 1; ri++) { a += RAR[ri].w; if (roll < a) break; }
    const slot = ORDER[Math.floor(R() * ORDER.length)];
    const r = RAR[ri], base = 2 + lv * 1.6, g = SLOT[slot].gen;
    const it = { id: Date.now().toString(36) + Math.floor(R() * 1e6).toString(36), slot, rar: ri, lv,
      enh: 0, name: r.n + ' ' + ELEM[Math.floor(R() * ELEM.length)] + ' ' + SLOT[slot].n,
      atk: 0, def: 0, hp: 0, acc: 0, dodge: 0 };
    for (const k in g) it[k] = Math.max(1, Math.round(base * g[k] * r.m * (0.9 + R() * 0.2)));
    it.price = Math.round((5 + lv * 3) * r.m * r.m);
    return it;
  }

  /* so sánh món mới với món đang mặc cùng ô: trả chuỗi ▲/▼ từng chỉ số */
  function cmpText(it, cur) {
    const a = eff(it);
    if (!cur) return '▲ món đầu tiên cho ô ' + SLOT[it.slot].lab;
    const b = eff(cur), out = [];
    for (const [k, l] of STAT) {
      const d = a[k] - b[k];
      if (d) out.push((d > 0 ? '▲ +' : '▼ ') + d + ' ' + l.toLowerCase());
    }
    return out.join(' · ');
  }

  function css() {
    const s = document.createElement('style');
    s.textContent = `
#bagBtn{position:fixed;right:10px;bottom:84px;z-index:7;width:56px;height:56px;border-radius:12px;border:2px solid #b58a3c;
  background:linear-gradient(#3a2410,#1b1108);color:#f0d79a;font:700 11px 'Segoe UI',Arial;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center}
#bagBtn b{font-size:19px;line-height:1}
#gold{position:fixed;right:10px;bottom:146px;z-index:7;color:#ffd96a;font:700 13px 'Segoe UI',Arial;text-shadow:0 1px 2px #000;background:rgba(10,8,6,.7);padding:2px 8px;border-radius:8px}
#bag{position:fixed;inset:0;z-index:25;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6);padding:8px}
#bag .pn{width:min(98vw,760px);max-height:94vh;overflow:auto;background:linear-gradient(#2a1a0c,#160e06);border:2px solid #b58a3c;border-radius:12px;color:#f3e2bb;font:13px/1.4 'Segoe UI',Arial;padding:10px 12px}
#bag h3{margin:0 0 6px;color:#ffcf6a;font-size:15px;display:flex;gap:8px;align-items:center}
#bag h3 .gold2{margin-left:auto;color:#ffd96a;font-size:13px}
#bag h3 button{background:#d6a24a;border:0;border-radius:6px;padding:4px 12px;font-weight:700;cursor:pointer}
#bag .body{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap}
#bag .left{flex:1 1 250px;min-width:230px}
#bag .right{flex:1 1 300px;min-width:230px}
#bag .eq{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-bottom:6px}
#bag .slot{border:2px solid #4a3418;border-radius:8px;padding:5px 6px;min-height:54px;cursor:pointer;background:#120c06;overflow:hidden}
#bag .slot.empty{border-style:dashed;border-color:#6b5124}
#bag .slot.sel{outline:2px solid #ffd36a;outline-offset:1px}
#bag .slot .k{color:#b9a07a;font-size:10.5px;line-height:1.25}
#bag .slot .iname{font-size:11.5px;font-weight:700;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#bag .slot .empty{color:#8a7452;font-size:11px;margin-top:6px}
#bag .stats{display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;background:#0e0904;border:1px solid #3a2a12;border-radius:8px;padding:6px 8px}
#bag .st{display:flex;justify-content:space-between;gap:6px;font-size:12px;color:#d9c79a}
#bag .st b{color:#fff1c9}
#bag .st i{font-style:normal;color:#8fe08a;font-size:11px}
#bag .cap{color:#b9a07a;font-size:11px;margin-bottom:4px}
#bag .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(48px,1fr));gap:5px;max-height:min(38vh,290px);overflow:auto;padding-right:2px}
#bag .cell{aspect-ratio:1;border:2px solid #4a3418;border-radius:8px;background:#0e0904;display:flex;align-items:center;justify-content:center;font-size:21px;cursor:pointer;position:relative}
#bag .cell.sel{outline:2px solid #ffd36a;outline-offset:1px}
#bag .cell s{position:absolute;right:2px;top:1px;text-decoration:none;font-size:9px;color:#ffd36a}
#bag .cell small{position:absolute;right:3px;bottom:0;font-size:9.5px;color:#bbb}
#bag .info{margin-top:8px;padding:8px;border-radius:8px;background:#0e0904;min-height:60px;border:1px solid #3a2a12}
#bag .info .t{font-size:13.5px;font-weight:700}
#bag .info .row{display:inline-block;min-width:86px;color:#e6d3a6;font-size:12px;margin-right:8px}
#bag .info .row b{color:#fff1c9}
#bag .info em{font-style:normal;font-size:11px;margin-left:3px}
#bag .info em.up{color:#6fe07a}
#bag .info em.dn{color:#ff7a6a}
#bag .info .cmp{color:#9fd7ff;font-size:11.5px;margin-top:2px}
#bag .info button{margin:7px 6px 0 0;border:0;border-radius:6px;padding:6px 13px;font-weight:700;cursor:pointer;font-size:12.5px}
#bag .info button:disabled{opacity:.45;cursor:not-allowed}
@media (max-width:520px){
  #bag .pn{font-size:12px;padding:8px}
  #bag .left,#bag .right{flex:1 1 100%;min-width:0}
  #bag .grid{grid-template-columns:repeat(6,1fr);max-height:26vh}
  #bag .slot{min-height:48px;padding:4px}
  #bag .slot .iname{font-size:10.5px}
}`;
    document.head.appendChild(s);
    const b = document.createElement('div'); b.id = 'bagBtn'; b.title = 'Nhân vật (C)'; b.innerHTML = '<b>🎒</b>Đồ'; document.body.appendChild(b);
    const g = document.createElement('div'); g.id = 'gold'; document.body.appendChild(g);
    const p = document.createElement('div'); p.id = 'bag';
    p.innerHTML = `<div class="pn"><h3>Nhân vật <span class="gold2"></span><button id="bagClose">Đóng</button></h3>
      <div class="body">
        <div class="left"><div class="eq"></div><div class="stats"></div></div>
        <div class="right"><div class="cap"></div><div class="grid"></div></div>
      </div>
      <div class="info">Chạm vào món đồ để xem · phím C mở bảng nhân vật.</div></div>`;
    document.body.appendChild(p);
  }

  function install(sc) {
    css();
    const h = sc.hero;
    const inv = sc.inv = { gold: 0, bag: [], eq: {} };
    const bonus = () => {
      const b = { atk: 0, def: 0, hp: 0, acc: 0, dodge: 0 };
      for (const k of ORDER) { const it = inv.eq[k]; if (it) { const e = eff(it); for (const s of KEYS) b[s] += e[s]; } }
      return b;
    };
    let applied = { atk: 0, def: 0, hp: 0, acc: 0, dodge: 0 };
    function applyBonus() {               // cộng phần chênh lệch để không phá chỉ số tăng theo cấp
      const b = bonus();
      h.atk += b.atk - applied.atk; h.def += b.def - applied.def; h.maxHp += b.hp - applied.hp;
      h.acc = (h.acc || 0) + b.acc - applied.acc; h.dodge = (h.dodge || 0) + b.dodge - applied.dodge;
      h.hp = Math.min(h.hp, h.maxHp); applied = b;
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(inv)); } catch (e) { } }
    function load() {
      let d = null;
      try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { }
      if (!d) { try { d = JSON.parse(localStorage.getItem(OLDKEY) || 'null'); } catch (e) { } }
      if (d) { inv.gold = d.gold | 0; inv.bag = Array.isArray(d.bag) ? d.bag : []; const e = d.eq || {}; inv.eq = e; }
      // migrate v1: nhẫn -> găng, món thiếu field thì bù 0
      inv.bag = inv.bag.map(it => { if (it && it.slot === 'ring') it.slot = 'gloves'; return norm(it); }).filter(Boolean);
      const eq = {};
      for (const k of ORDER) {
        let it = inv.eq[k];
        if (it && it.slot === 'ring') it.slot = 'gloves';
        it = norm(it);
        if (it) eq[k] = it;
      }
      inv.eq = eq;
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
      // mũi tên so sánh ngay trên món đồ đang rơi
      const cur = inv.eq[it.slot];
      let cmp = null;
      if (cur) {
        const d = score(it) - score(cur);
        cmp = sc.add.text(x + 16, y - 20, d > 0 ? '▲' : '▼', {
          font: 'bold 15px Segoe UI', color: d > 0 ? '#6fe07a' : '#ff7a6a', stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(1e6);
      }
      sc.drops.push({ c, r, it, s, glow, cmp, t: performance.now() });
    }
    function pickup(d) {
      if (inv.bag.length >= MAXBAG) { if (!d.full) { HUD.toast('Túi đầy! Bán bớt đồ'); d.full = true; } return false; }
      inv.bag.push(d.it);
      const cmp = cmpText(d.it, inv.eq[d.it.slot]);
      d.s.destroy(); d.glow.destroy(); if (d.cmp) d.cmp.destroy();
      HUD.log('Nhặt: ' + itName(d.it) + ' (' + statTxt(d.it) + ')' + (cmp ? ' — ' + cmp : ''));
      sc.floatText(h, (d.cmp ? '' : '') + d.it.name, RAR[d.it.rar].c, d.it.rar >= 3);
      if (d.cmp || (inv.eq[d.it.slot] && score(d.it) > score(inv.eq[d.it.slot]))) HUD.toast('Đồ tốt hơn: ' + itName(d.it));
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

    /* ---------- giao diện: bảng nhân vật + hành trang ---------- */
    let sel = null;            // { w:'bag'|'eq', k: index|slot }
    const curItem = () => {
      if (!sel) return null;
      return sel.w === 'bag' ? inv.bag[sel.k] : inv.eq[sel.k];
    };
    function render() {
      const b = bonus();
      el('bag').querySelector('.gold2').textContent = '💰 ' + inv.gold;
      el('bag').querySelector('.eq').innerHTML = ORDER.map(k => {
        const it = inv.eq[k], s = SLOT[k];
        const on = sel && sel.w === 'eq' && sel.k === k ? ' sel' : '';
        return `<div class="slot${it ? '' : ' empty'}${on}" data-eq="${k}">
          <div class="k">${s.lab}</div>
          ${it ? `<div class="iname" style="color:${RAR[it.rar].c}">${s.ic} ${itName(it)}</div><div class="k">${statTxt(it)}</div>`
                : '<div class="empty">— trống —</div>'}
        </div>`;
      }).join('');
      el('bag').querySelector('.stats').innerHTML = STAT.map(([k, l]) =>
        `<div class="st"><span>${l}</span><b>${Math.round(h[k] || 0)}</b>${b[k] ? `<i>+${b[k]}</i>` : ''}</div>`).join('');
      el('bag').querySelector('.cap').textContent = `Hành trang ${inv.bag.length}/${MAXBAG} · Lv${h.lv}`;
      el('bag').querySelector('.grid').innerHTML = inv.bag.map((it, i) =>
        `<div class="cell${sel && sel.w === 'bag' && sel.k === i ? ' sel' : ''}" data-i="${i}" title="${itName(it)}" style="border-color:${RAR[it.rar].c}">${SLOT[it.slot].ic}<s>${it.enh ? '+' + it.enh : ''}</s><small>${it.lv}</small></div>`).join('') +
        Array(Math.max(0, MAXBAG - inv.bag.length)).fill('<div class="cell" style="cursor:default"></div>').join('');
      const info = el('bag').querySelector('.info');
      const it = curItem();
      if (!it) { info.innerHTML = `Túi ${inv.bag.length}/${MAXBAG}. Chạm vào món đồ để mặc, bỏ hoặc cường hoá.`; return; }
      const where = sel.w, e = eff(it), cur = inv.eq[it.slot], cost = enhCost(it);
      const rows = STAT.filter(([k]) => e[k]).map(([k, l]) => {
        const d = cur && cur !== it ? e[k] - eff(cur)[k] : 0;
        return `<span class="row">${l} <b>+${e[k]}</b>${d ? `<em class="${d > 0 ? 'up' : 'dn'}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</em>` : ''}</span>`;
      }).join('');
      const cmp = where === 'bag' ? cmpText(it, cur) : '';
      const btn = where === 'bag'
        ? `<button id="bEq" style="background:#6fd06a">Mặc</button>
           <button id="bEnh" style="background:#d6a24a"${it.enh >= MAXENH ? ' disabled' : ''}>${it.enh >= MAXENH ? 'Đã +10 (tối đa)' : `Cường hoá +${it.enh + 1} · ${cost} 💰`}</button>
           <button id="bSell" style="background:#b86a4a">Bán ${it.price} 💰</button>`
        : `<button id="bUn" style="background:#d6a24a">Bỏ ra</button>
           <button id="bEnh" style="background:#6f9ad0"${it.enh >= MAXENH ? ' disabled' : ''}>${it.enh >= MAXENH ? 'Đã +10 (tối đa)' : `Cường hoá +${it.enh + 1} · ${cost} 💰`}</button>`;
      info.innerHTML = `<div class="t" style="color:${RAR[it.rar].c}">${SLOT[it.slot].ic} ${itName(it)} <span class="k" style="font-weight:400">· ${RAR[it.rar].n} · cấp ${it.lv} · ${SLOT[it.slot].lab}</span></div>
        <div style="margin:3px 0">${rows || '<span class="row">Không có chỉ số</span>'}</div>
        ${cmp ? `<div class="cmp">So với món đang mặc: ${cmp}</div>` : ''}
        ${btn}`;
      if (el('bEq')) el('bEq').onclick = () => equip(sel.k);
      if (el('bUn')) el('bUn').onclick = () => unequip(sel.k);
      if (el('bSell')) el('bSell').onclick = () => {
        const x = inv.bag[sel.k]; if (!x) return;
        inv.gold += x.price; inv.bag.splice(sel.k, 1); sel = null; goldTxt(); sc.sfx('ui'); save(); render();
      };
      if (el('bEnh')) el('bEnh').onclick = () => enhance(sel.w === 'bag' ? inv.bag[sel.k] : inv.eq[sel.k]);
    }

    function equip(i) {
      const it = inv.bag[i]; if (!it) return;
      const old = inv.eq[it.slot];
      inv.eq[it.slot] = it; inv.bag.splice(i, 1);
      if (old) inv.bag.push(old);
      sel = null; applyBonus(); sc.sfx('ui'); HUD.toast('Đã mặc ' + itName(it)); save(); render();
    }
    function unequip(slot) {
      const it = inv.eq[slot]; if (!it) return;
      if (inv.bag.length >= MAXBAG) { HUD.toast('Túi đầy'); return; }
      inv.bag.push(it); delete inv.eq[slot]; sel = null;
      applyBonus(); sc.sfx('ui'); save(); render();
    }
    function enhance(it) {
      if (!it) return;
      if ((it.enh || 0) >= MAXENH) { HUD.toast('Đã đạt +10 (tối đa)'); return; }
      const cost = enhCost(it);
      if (inv.gold < cost) { HUD.toast('Cần ' + cost + ' vàng (đang có ' + inv.gold + ')'); return; }
      inv.gold -= cost; it.enh = (it.enh || 0) + 1;
      applyBonus(); goldTxt(); sc.sfx('win');
      HUD.toast('Cường hoá ' + it.name + ' +' + it.enh + ' (−' + cost + ' vàng)');
      save(); render();
    }

    el('bag').addEventListener('click', ev => {
      const c = ev.target.closest('[data-i]');
      if (c) { sel = { w: 'bag', k: +c.dataset.i }; render(); return; }
      const e = ev.target.closest('[data-eq]');
      if (e) { sel = { w: 'eq', k: e.dataset.eq }; render(); }
    });
    const open = () => { sel = null; render(); el('bag').style.display = 'flex'; sc.sfx('ui'); };
    const close = () => { el('bag').style.display = 'none'; sel = null; };
    el('bagBtn').onclick = ev => { ev.stopPropagation(); open(); };
    el('bagClose').onclick = close;
    el('bag').addEventListener('pointerdown', ev => ev.stopPropagation());
    const toggle = () => (el('bag').style.display === 'flex' ? close() : open());
    sc.input.keyboard.on('keydown-C', toggle);
    sc.input.keyboard.on('keydown-B', toggle);
    sc.input.keyboard.on('keydown-I', toggle);

    load(); applyBonus(); goldTxt();
    sc.time.addEvent({ delay: 20000, loop: true, callback: save });
    window.addEventListener('pagehide', save);
    window.__inv = inv;
    sc.lootDebug = { makeItem, dropAt, render, applyBonus, equip, unequip, enhance, eff, bonus, order: ORDER, maxEnh: MAXENH };
    window.__KT_EQUIP = sc.lootDebug;
  }
  window.KTLoot = { install };
})();
