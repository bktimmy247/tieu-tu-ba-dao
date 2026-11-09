/* Tiêu Tử Bá Đạo — cốt truyện chương 1, NPC thoại, chuỗi nhiệm vụ, boss, lưu tiến độ, chết có giá.
 * Gắn vào scene Main bằng KTStory.install(scene) ở cuối create(). Không sửa logic chiến đấu gốc,
 * chỉ bọc (wrap) các hàm kill / onClick / castSkill / spawnMob.
 */
(function () {
  const SAVE_KEY = 'ttbd-save-v1';
  const el = id => document.getElementById(id);

  const NPCS = {
    pho: { name: 'Ông Hàng Phở', img: 'npc-pho', bust: 'assets/lt/bust-pho.webp', dc: 1.8, dr: -1.4,
      idle: ['Nồi phở này từng giữ Ấn Phố đấy, cháu ạ.', 'Ăn bát phở rồi hẵng đi, đường còn dài.'] },
    mo: { name: 'Thầy Mo', img: 'npc-mo', bust: 'assets/lt/bust-mo.webp', dc: -2.4, dr: 1.6,
      idle: ['Tàn Ảnh sợ tiếng chuông và nước sạch.', 'Ấn mà vỡ hết, người sẽ quên cả tên mình.'] },
  };

  const NARRATOR = { name: 'Lời dẫn', bust: null };

  // Chuỗi nhiệm vụ chương 1 — Ấn Phố (xem docs/story.md)
  const STEPS = [
    { id: 'talk_pho', type: 'talk', npc: 'pho', title: 'Gặp Ông Hàng Phở ở giữa thôn',
      lines: [
        ['pho', 'Lăng Vân! Tỉnh rồi à? Đêm qua Ấn Phố dưới thôn ta bị xé toạc.'],
        ['pho', 'Bóng người cũ trồi lên — người ta gọi là Tàn Ảnh. Vết sáng trên tay cháu… cháu là Người Giữ Ấn.'],
        ['pho', 'Ra Bãi Tịnh Mặc phía tây nam, dẹp bớt lũ Tàn Ảnh đi đã. Đi theo đường đất ấy.'],
      ], reward: { exp: 30 } },
    { id: 'kill_tm', type: 'kill', char: 'tinh-mac', need: 6, spot: 0, title: 'Diệt Tàn Ảnh Tịnh Mặc', reward: { exp: 160 },
      done: [['pho', 'Khá lắm! Nhưng Tàn Ảnh còn sinh ra mãi. Cháu đi gặp Thầy Mo, ông ấy biết cách đối phó.']] },
    { id: 'talk_mo', type: 'talk', npc: 'mo', title: 'Gặp Thầy Mo ở rìa thôn',
      lines: [
        ['mo', 'Ta thấy vết Ấn trên tay ngươi. Tàn Ảnh không chết bằng giáo thường — phải dùng nước của Ấn.'],
        ['mo', 'Ta dạy ngươi Song Thương Loạn Vân Phá. Bấm nút 1 để tung chiêu khi đủ nội lực.'],
        ['mo', 'Rừng phía đông có tiếng sấm không mây. Lăng Tiêu đã thành Tàn Ảnh. Đi đi.'],
      ], reward: { exp: 60 }, unlock: 'skill' },
    { id: 'kill_lt', type: 'kill', char: 'lang-tieu', need: 6, spot: 1, title: 'Diệt Tàn Ảnh Lăng Tiêu trong rừng', reward: { exp: 380 },
      done: [['mo', 'Sấm đã tắt. Kẻ cầm mảnh Ấn Thổ đang ở Đồi Bạch Diện — tên Bạch Diện, kẻ đổi mặt.']] },
    { id: 'boss', type: 'boss', spot: 2, title: 'Hạ Bạch Diện — kẻ đổi mặt', reward: { exp: 900 },
      done: [['pho', '…', true], [null, 'Bạch Diện tan thành khói. Trong tay Lăng Vân là một mảnh đá ấm — mảnh Ấn Thổ.']] },
    { id: 'return', type: 'talk', npc: 'pho', title: 'Mang mảnh Ấn Thổ về cho Ông Phở',
      lines: [
        ['pho', 'Đúng nó rồi! Để ông đặt lại vào nồi… Ấn Phố đóng lại rồi, cháu thấy không — trời trong hẳn.'],
        ['pho', 'Nhưng còn năm Ấn nữa, và kẻ trộm Ấn vẫn ngoài kia. Cổng phía đông sẽ mở khi cháu sẵn sàng.'],
      ], reward: { exp: 400 } },
    { id: 'portal1', type: 'portal', map: 1, title: 'Đi qua cổng phía đông vào Rừng Thề' },
    { id: 'kill_ln', type: 'kill', ch: 'Chương 2 · Ấn Rừng', map: 2, char: 'lang-nguyet', need: 10, spot: 0, title: 'Hạ 10 Tàn Ảnh Lăng Nguyệt', reward: { exp: 1500 },
      done: [[null, 'Tên của Tàn Ảnh cắm đầy thân cây — mũi nào cũng chỉ về một hướng: Gốc Cổ Thụ.']] },
    { id: 'boss2', type: 'boss', ch: 'Chương 2 · Ấn Rừng', map: 2, spot: 2, bossChar: 'tieu-linh', bossName: 'Tiểu Linh ☠', bossLv: 18, bossHp: 7000, bossAtk: 90, bossTint: 0xb6ffb6,
      title: 'Giải thoát Tiểu Linh ở Gốc Cổ Thụ', reward: { exp: 4000 },
      done: [[null, 'Hồ lô trên tay Tiểu Linh vỡ, khói xanh tan ra. Cô bé ngã xuống, rồi mở mắt.'],
        [null, '"Rừng này thề giữ Ấn Mộc… Kẻ Trộm Ấn bắt nó nuốt người." Tiểu Linh trao lại mảnh Ấn Mộc cho Lăng Vân.']] },
    { id: 'end2', type: 'done', ch: 'Chương 2 · Ấn Rừng', map: 2, title: 'Chương 2 hoàn tất · Chương 3: Ấn Biển sắp mở' },
  ];

  function css() {
    const s = document.createElement('style');
    s.textContent = `
#quest{position:fixed;left:8px;top:96px;z-index:6;max-width:min(62vw,280px);padding:7px 10px;border-radius:8px;
  background:rgba(14,10,6,.78);border:1px solid #8a6a2c;color:#f2dfb0;font:12px/1.35 'Segoe UI',Arial,sans-serif;pointer-events:none}
#quest .qh{color:#ffcf6a;font-weight:700;font-size:11px;letter-spacing:.4px;text-transform:uppercase;margin-bottom:2px}
#quest .qt{font-weight:600}#quest .qp{color:#b8e08a}
#dlg{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);width:min(96vw,640px);z-index:20;display:none;
  background:linear-gradient(#2a1a0c,#160e06);border:2px solid #b58a3c;border-radius:12px;box-shadow:0 6px 24px #000a;
  color:#f3e2bb;font:15px/1.5 'Segoe UI',Arial,sans-serif;min-height:120px}
#dlg img{position:absolute;left:10px;bottom:100%;height:min(30vh,200px);pointer-events:none;filter:drop-shadow(0 4px 6px #000a)}
#dlg .dn{position:absolute;left:12px;top:-14px;background:#b58a3c;color:#1a0f05;font-weight:700;padding:2px 12px;border-radius:10px;font-size:13px}
#dlg .dt{padding:20px 16px 44px}
#dlg button{position:absolute;right:12px;bottom:10px;background:#d6a24a;color:#1a0f05;border:0;border-radius:8px;
  padding:7px 18px;font:700 14px 'Segoe UI',Arial,sans-serif;cursor:pointer}`;
    document.head.appendChild(s);
    const q = document.createElement('div'); q.id = 'quest'; document.body.appendChild(q);
    const d = document.createElement('div'); d.id = 'dlg';
    d.innerHTML = '<img alt=""><div class="dn"></div><div class="dt"></div><button>Tiếp ▸</button>';
    document.body.appendChild(d);
  }

  function install(sc) {
    css();
    const h = sc.hero;
    const st = sc.story = { step: 0, prog: 0, skill: false, boss: null, talking: false, pending: null, warping: false, seen2: false };
    const cur = () => STEPS[st.step] || STEPS[STEPS.length - 1];

    /* ---------- NPC ---------- */
    sc.npcs = [];
    for (const [id, n] of Object.entries(MAP_ID === 1 ? NPCS : {})) {
      const c = VILLAGE.c + n.dc, r = VILLAGE.r + n.dr, x = isoX(c, r), y = isoY(c, r);
      const s = sc.add.image(x, y, n.img).setOrigin(0.5, 0.96).setDepth(y + 1).setScale(id === 'mo' ? 0.82 : 0.9);
      sc.add.image(x + 4, y + 2, 'shadow').setScale(0.6, 0.5).setDepth(-7.5e5);
      const lb = sc.add.text(x, y - s.displayHeight - 4, n.name, { font: 'bold 12px Segoe UI', color: '#9fe0ff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(1e6);
      const mk = sc.add.text(x, y - s.displayHeight - 20, '!', { font: 'bold 26px Segoe UI', color: '#ffd23a', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5, 1).setDepth(1e6).setVisible(false);
      sc.tweens.add({ targets: mk, y: mk.y - 8, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.inOut' });
      sc.npcs.push({ id, ...n, c, r, s, lb, mk });
    }

    /* ---------- Thoại ---------- */
    const dlg = el('dlg');
    function say(lines, onEnd) {
      st.talking = true; h.path = null; h.target = null;
      let i = 0;
      const show = () => {
        const [who, text] = lines[i];
        const n = who ? NPCS[who] : NARRATOR;
        const img = dlg.querySelector('img');
        if (n.bust) { img.src = n.bust; img.style.display = ''; } else img.style.display = 'none';
        dlg.querySelector('.dn').textContent = n.name;
        dlg.querySelector('.dt').textContent = text;
        dlg.querySelector('button').textContent = i < lines.length - 1 ? 'Tiếp ▸' : 'Đóng';
        dlg.style.display = 'block';
      };
      dlg.querySelector('button').onclick = ev => {
        ev.stopPropagation(); sc.sfx('ui'); i++;
        if (i < lines.length) return show();
        dlg.style.display = 'none'; st.talking = false; if (onEnd) onEnd();
      };
      show();
    }

    /* ---------- Nhiệm vụ ---------- */
    function renderQuest() {
      const s = cur();
      let p = '';
      if (s.type === 'kill') p = `<div class="qp">${Math.min(st.prog, s.need)} / ${s.need}</div>`;
      el('quest').innerHTML = `<div class="qh">${s.ch || 'Chương 1 · Ấn Phố'}</div><div class="qt">${s.title}</div>${p}`;
      for (const n of sc.npcs) n.mk.setVisible(s.type === 'talk' && s.npc === n.id);
      refreshPortals();
    }
    function giveExp(v) {
      if (!v) return; h.exp += v; HUD.log('+' + v + ' kinh nghiệm (nhiệm vụ)');
      while (h.exp >= sc.expNeed(h.lv)) { h.exp -= sc.expNeed(h.lv); sc.levelUp(); }
    }
    function complete() {
      const s = cur();
      giveExp(s.reward && s.reward.exp);
      if (s.unlock === 'skill') { st.skill = true; HUD.toast('Lĩnh ngộ tuyệt kỹ: Song Thương Loạn Vân Phá'); el('sk1') && el('sk1').classList.remove('lock'); }
      sc.sfx('win');
      st.step++; st.prog = 0;
      const after = () => { onEnterStep(); renderQuest(); save(); };
      if (s.done) say(s.done.filter(l => !l[2]), after); else after();
    }
    function onEnterStep() {
      const s = cur();
      HUD.toast('Nhiệm vụ: ' + s.title);
      if (s.type === 'boss' && (s.map || 1) === MAP_ID) spawnBoss();
      refreshPortals();
    }

    /* ---------- Boss Bạch Diện ---------- */
    function spawnBoss() {
      if (st.boss && !st.boss.dead) return;
      const s = cur(), si = s.spot != null ? s.spot : 2, sp = SPOTS[si];
      const ch = s.bossChar || 'bach-dien', nm = s.bossName || 'Bạch Diện ☠', lv = s.bossLv || 10, hp = s.bossHp || 2200, atk = s.bossAtk || 46, tint = s.bossTint || 0xffb0b0;
      const spot = Object.assign({}, sp, { boss: true, aggro: true, name: nm, lv, tint });
      const u = sc.makeUnit(ch, sp.c, sp.r, { scale: 2.2, tint });
      Object.assign(u, { spot, si, name: nm, lv, maxHp: hp, hp, atk, def: lv, home: { c: sp.c, r: sp.r }, state: 'idle', wait: 1, nextAtk: 0, isBoss: true, nextSlam: 0 });
      sc.mobs.push(u); st.boss = u;
      HUD.log(nm.replace(' ☠', '') + ' xuất hiện!');
    }
    let ring = null;
    function bossTick(time) {
      const b = st.boss; if (!b || b.dead || h.dead) return;
      if (b.cid === 'tieu-linh' && time > (b.nextHeal || 0) && b.state === 'chase') { b.nextHeal = time + 9000; if (b.hp < b.maxHp * 0.9) { const v = Math.round(b.maxHp * 0.06); b.hp = Math.min(b.maxHp, b.hp + v); sc.floatText(b, '+' + v, '#7dff8a', true); HUD.toast('Tiểu Linh hồi máu bằng hồ lô — dồn sát thương!'); } }
      const d = Math.hypot(b.c - h.c, b.r - h.r);
      if (d > 7 || time < b.nextSlam) return;
      b.nextSlam = time + 6500;
      // chiêu báo trước: vòng đỏ dưới chân Lăng Vân, 1,1 s sau nổ — đứng ra ngoài là né được
      const tc = h.c, tr = h.r;
      ring && ring.destroy();
      ring = sc.add.ellipse(isoX(tc, tr), isoY(tc, tr), 190, 95, 0xff2020, 0.28).setStrokeStyle(3, 0xff5040, 0.9).setDepth(-6e5);
      sc.tweens.add({ targets: ring, alpha: { from: 0.4, to: 1 }, duration: 250, yoyo: true, repeat: 1 });
      HUD.toast((b.cid === 'tieu-linh' ? 'Tiểu Linh: Loạn Thế Hồi Xuân' : 'Bạch Diện: Ly Hồn Đoạt Phách') + ' — tránh vòng đỏ!');
      sc.sfx('skill-vortex');
      sc.time.delayedCall(1100, () => {
        if (ring) { ring.destroy(); ring = null; }
        if (b.dead) return;
        sc.play(b, 'ultimate' in sc.M.chars[b.cid].clips ? 'ultimate' : 'basic', true);
        sc.vfx('skill', h); sc.sfx('skill-hit');
        if (!h.dead && Math.hypot(h.c - tc, h.r - tr) < 1.4) sc.damage(h, Math.round(70 + b.lv * 6));
        sc.cameras.main.shake(180, 0.006);
      });
    }

    /* ---------- Bọc các hàm gốc ---------- */
    const _kill = sc.kill.bind(sc);
    sc.kill = function (u) {
      if (u === h) {
        const lose = Math.floor(sc.expNeed(h.lv) * 0.1);
        h.exp = Math.max(0, h.exp - lose);
        HUD.log('Trọng thương: mất ' + lose + ' kinh nghiệm');
        const r = _kill(u); sc.time.delayedCall(3100, save); return r;
      }
      const s = cur();
      if (u.isBoss) {
        _kill(u); st.boss = null;
        if (s.type === 'boss') complete();
        return;
      }
      const r = _kill(u);
      if (s.type === 'kill' && u.cid === s.char) {
        st.prog++; renderQuest();
        if (st.prog >= s.need) complete(); else HUD.toast(s.title + ' ' + st.prog + '/' + s.need);
      }
      return r;
    };
    const _spawn = sc.spawnMob.bind(sc);
    sc.spawnMob = function (s, si) { if (s && s.boss) return; return _spawn(s, si); };

    const _cast = sc.castSkill.bind(sc);
    sc.castSkill = function () {
      if (!st.skill) { HUD.toast('Chưa lĩnh ngộ — gặp Thầy Mo để học tuyệt kỹ'); return; }
      return _cast();
    };

    const _click = sc.onClick.bind(sc);
    sc.onClick = function (wx, wy) {
      if (st.talking) return;
      for (const n of sc.npcs) {
        if (Math.abs(wx - n.s.x) < 45 && wy < n.s.y + 15 && wy > n.s.y - n.s.displayHeight - 10) {
          st.pending = n; h.target = null; sc.moveTo(n.c + 0.7, n.r + 0.7); return;
        }
      }
      st.pending = null;
      return _click(wx, wy);
    };

    function talkTo(n) {
      const s = cur();
      if (s.type === 'talk' && s.npc === n.id) say(s.lines, complete);
      else say([[n.id, n.idle[Math.floor(Math.random() * n.idle.length)]]]);
    }

    /* ---------- Mũi tên chỉ đường ---------- */
    const arrow = sc.add.text(0, 0, '➤', { font: 'bold 30px Segoe UI', color: '#ffd23a', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(1e6 + 2);
    function targetOf() {
      const s = cur();
      if ((s.map || 1) !== MAP_ID || s.type === 'portal') { const p = portals.find(x => x.to === (s.map || 1) || s.type === 'portal'); return p && { c: p.c, r: p.r }; }
      if (s.type === 'talk') { const n = sc.npcs.find(x => x.id === s.npc); return n && { c: n.c, r: n.r }; }
      if (s.type === 'kill' || s.type === 'boss') { const p = SPOTS[s.spot]; return { c: p.c, r: p.r }; }
      return null;
    }

    sc.events.on('update', (time) => {
      if (st.pending && !st.talking && Math.hypot(h.c - st.pending.c, h.r - st.pending.r) < 1.6) {
        const n = st.pending; st.pending = null; h.path = null; talkTo(n);
      }
      bossTick(time); portalTick();
      const t = targetOf();
      if (!t || h.dead) { arrow.setVisible(false); return; }
      const dx = isoX(t.c, t.r) - h.spr.x, dy = isoY(t.c, t.r) - h.spr.y, dist = Math.hypot(dx, dy);
      arrow.setVisible(dist > 260);
      const a = Math.atan2(dy, dx);
      arrow.setPosition(h.spr.x + Math.cos(a) * 90, h.spr.y - 60 + Math.sin(a) * 60).setRotation(a);
    });

    /* ---------- Cổng dịch chuyển giữa map ---------- */
    const portals = [];
    function freeNear(c, r) {
      for (let k = 0; k < 60; k++) { const a = k * 2.4, d = k * 0.12, cc = c + Math.cos(a) * d, rr = r + Math.sin(a) * d;
        if (cc > 2 && rr > 2 && cc < N - 3 && rr < N - 3 && !sc.obs.solid(cc, rr)) return { c: cc, r: rr }; }
      return { c, r };
    }
    function addPortal(c, r, label, to, cond) {
      const p = freeNear(c, r), x = isoX(p.c, p.r), y = isoY(p.c, p.r);
      const g1 = sc.add.ellipse(x, y, 130, 64, 0x55ccff, 0.25).setStrokeStyle(3, 0x9fe8ff, 0.95).setDepth(-6e5);
      const g2 = sc.add.ellipse(x, y - 46, 54, 96, 0x88ddff, 0.35).setDepth(y);
      sc.tweens.add({ targets: [g1, g2], alpha: { from: 0.45, to: 1 }, yoyo: true, repeat: -1, duration: 900 });
      const t = sc.add.text(x, y - 108, label, { font: 'bold 13px Segoe UI', color: '#bff0ff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(1e6);
      const P = { c: p.c, r: p.r, to, cond, parts: [g1, g2, t] }; portals.push(P); return P;
    }
    const idxOf = id => STEPS.findIndex(x => x.id === id);
    function refreshPortals() { for (const p of portals) { const on = p.cond(); p.parts.forEach(o => o.setVisible(on)); } }
    function portalTick() {
      if (st.warping || h.dead || st.talking) return;
      for (const p of portals) {
        if (!p.cond() || Math.hypot(h.c - p.c, h.r - p.r) > 1.0) continue;
        if (p.to === 2 && cur().id === 'portal1') { sc.sfx('win'); st.step++; st.prog = 0; }
        const dest = p.to === 2 ? MAPS[2].village : { c: 10, r: 10 };
        save({ map: p.to, c: dest.c + 0.5, r: dest.r + 1.2 });
        st.warping = true;
        HUD.toast(p.to === 2 ? 'Đang vào Rừng Thề…' : 'Đang về Thôn Vân Sơn…');
        sc.cameras.main.fadeOut(600, 0, 0, 0);
        setTimeout(() => location.reload(), 750);
        return;
      }
    }
    if (MAP_ID === 1) { const s1 = SPOTS[1]; addPortal(Math.min(N - 5, s1.c + 9), Math.max(5, s1.r - 7), 'Cổng → Rừng Thề', 2, () => st.step >= idxOf('portal1')); }
    else addPortal(VILLAGE.c - 2.5, VILLAGE.r + 1.5, 'Cổng → Thôn Vân Sơn', 1, () => true);

    /* ---------- Lưu / nạp ---------- */
    function save(o) {
      if (st.warping) return;
      if (o && o.type) o = null;
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(Object.assign({ v: 1, map: MAP_ID, seen2: st.seen2, lv: h.lv, exp: h.exp, hp: Math.round(h.hp), mp: Math.round(h.mp),
          c: +h.c.toFixed(2), r: +h.r.toFixed(2), step: st.step, prog: st.prog, skill: st.skill, t: Date.now() }, o || {})));
      } catch (e) { }
    }
    function load() {
      let d = null;
      try { d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { }
      if (!d || d.v !== 1) return false;
      const L = Math.max(1, d.lv | 0);
      Object.assign(h, { lv: L, exp: d.exp | 0, maxHp: 200 + 30 * (L - 1), maxMp: 80 + 8 * (L - 1), atk: 22 + 6 * (L - 1), def: 4 + (L - 1) });
      h.hp = Math.min(h.maxHp, Math.max(1, d.hp || h.maxHp)); h.mp = Math.min(h.maxMp, d.mp || h.maxMp);
      if (!sc.obs.solid(d.c, d.r)) { h.c = d.c; h.r = d.r; }
      st.seen2 = !!d.seen2; st.step = Math.min(STEPS.length - 1, d.step | 0); st.prog = d.prog | 0; st.skill = !!d.skill || st.step > 2;
      return true;
    }
    sc.saveGame = save;
    sc.time.addEvent({ delay: 20000, loop: true, callback: save });
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
    window.addEventListener('pagehide', save);
    const _lv = sc.levelUp.bind(sc);
    sc.levelUp = function () { const r = _lv(); save(); return r; };

    /* ---------- Khởi động ---------- */
    const had = load();
    if (!st.skill && el('sk1')) el('sk1').classList.add('lock');
    renderQuest();
    if (cur().type === 'boss' && (cur().map || 1) === MAP_ID) spawnBoss();
    if (had) HUD.toast('Đã nạp tiến độ · Lv' + h.lv);
    else say([
      [null, 'Lục Châu từng được sáu Ấn giữ yên. Đêm qua, Kẻ Trộm Ấn xé toạc Ấn Phố dưới Thôn Vân Sơn.'],
      [null, 'Tàn Ảnh — bóng của những người cũ — trồi lên khắp nơi. Lăng Vân tỉnh dậy, trên tay một vết Ấn đang sáng.'],
    ], () => HUD.toast('Nhiệm vụ: ' + cur().title));
    if (MAP_ID === 2 && cur().id === 'kill_ln' && !st.seen2) {
      st.seen2 = true; save();
      say([[null, 'Rừng Thề. Cây ở đây từng thề giữ Ấn Mộc cho Lục Châu — nay lời thề chưa xong đã hoá đói.'],
        [null, 'Tàn Ảnh Lăng Nguyệt ẩn dưới tán cây, giương cung vào bất cứ ai bước qua.']], () => HUD.toast('Nhiệm vụ: ' + cur().title));
    }
    window.__story = st;
  }

  window.KTStory = { install, STEPS, SAVE_KEY };
})();
