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
    { id: 'end', type: 'done', title: 'Chương 1 hoàn tất · Chương 2: Ấn Rừng sắp mở' },
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
    const st = sc.story = { step: 0, prog: 0, skill: false, boss: null, talking: false, pending: null };
    const cur = () => STEPS[st.step] || STEPS[STEPS.length - 1];

    /* ---------- NPC ---------- */
    sc.npcs = [];
    for (const [id, n] of Object.entries(NPCS)) {
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
      el('quest').innerHTML = `<div class="qh">Chương 1 · Ấn Phố</div><div class="qt">${s.title}</div>${p}`;
      for (const n of sc.npcs) n.mk.setVisible(s.type === 'talk' && s.npc === n.id);
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
      if (s.type === 'boss') spawnBoss();
    }

    /* ---------- Boss Bạch Diện ---------- */
    function spawnBoss() {
      if (st.boss && !st.boss.dead) return;
      const sp = SPOTS[2];
      const spot = Object.assign({}, sp, { boss: true, aggro: true, name: 'Bạch Diện', lv: 10, tint: 0xffb0b0 });
      const u = sc.makeUnit('bach-dien', sp.c, sp.r, { scale: 2.2, tint: 0xffb0b0 });
      Object.assign(u, { spot, si: 2, name: 'Bạch Diện ☠', lv: 10, maxHp: 2200, hp: 2200, atk: 46, def: 10,
        home: { c: sp.c, r: sp.r }, state: 'idle', wait: 1, nextAtk: 0, isBoss: true, nextSlam: 0 });
      sc.mobs.push(u); st.boss = u;
      HUD.log('Bạch Diện xuất hiện trên đồi!');
    }
    let ring = null;
    function bossTick(time) {
      const b = st.boss; if (!b || b.dead || h.dead) return;
      const d = Math.hypot(b.c - h.c, b.r - h.r);
      if (d > 7 || time < b.nextSlam) return;
      b.nextSlam = time + 6500;
      // chiêu báo trước: vòng đỏ dưới chân Lăng Vân, 1,1 s sau nổ — đứng ra ngoài là né được
      const tc = h.c, tr = h.r;
      ring && ring.destroy();
      ring = sc.add.ellipse(isoX(tc, tr), isoY(tc, tr), 190, 95, 0xff2020, 0.28).setStrokeStyle(3, 0xff5040, 0.9).setDepth(-6e5);
      sc.tweens.add({ targets: ring, alpha: { from: 0.4, to: 1 }, duration: 250, yoyo: true, repeat: 1 });
      HUD.toast('Bạch Diện: Ly Hồn Đoạt Phách — tránh vòng đỏ!');
      sc.sfx('skill-vortex');
      sc.time.delayedCall(1100, () => {
        if (ring) { ring.destroy(); ring = null; }
        if (b.dead) return;
        sc.play(b, 'ultimate' in sc.M.chars['bach-dien'].clips ? 'ultimate' : 'basic', true);
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
      if (s.type === 'talk') { const n = sc.npcs.find(x => x.id === s.npc); return n && { c: n.c, r: n.r }; }
      if (s.type === 'kill' || s.type === 'boss') { const p = SPOTS[s.spot]; return { c: p.c, r: p.r }; }
      return null;
    }

    sc.events.on('update', (time) => {
      if (st.pending && !st.talking && Math.hypot(h.c - st.pending.c, h.r - st.pending.r) < 1.6) {
        const n = st.pending; st.pending = null; h.path = null; talkTo(n);
      }
      bossTick(time);
      const t = targetOf();
      if (!t || h.dead) { arrow.setVisible(false); return; }
      const dx = isoX(t.c, t.r) - h.spr.x, dy = isoY(t.c, t.r) - h.spr.y, dist = Math.hypot(dx, dy);
      arrow.setVisible(dist > 260);
      const a = Math.atan2(dy, dx);
      arrow.setPosition(h.spr.x + Math.cos(a) * 90, h.spr.y - 60 + Math.sin(a) * 60).setRotation(a);
    });

    /* ---------- Lưu / nạp ---------- */
    function save() {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, lv: h.lv, exp: h.exp, hp: Math.round(h.hp), mp: Math.round(h.mp),
          c: +h.c.toFixed(2), r: +h.r.toFixed(2), step: st.step, prog: st.prog, skill: st.skill, t: Date.now() }));
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
      st.step = Math.min(STEPS.length - 1, d.step | 0); st.prog = d.prog | 0; st.skill = !!d.skill || st.step > 2;
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
    if (cur().type === 'boss') spawnBoss();
    if (had) HUD.toast('Đã nạp tiến độ · Lv' + h.lv);
    else say([
      [null, 'Lục Châu từng được sáu Ấn giữ yên. Đêm qua, Kẻ Trộm Ấn xé toạc Ấn Phố dưới Thôn Vân Sơn.'],
      [null, 'Tàn Ảnh — bóng của những người cũ — trồi lên khắp nơi. Lăng Vân tỉnh dậy, trên tay một vết Ấn đang sáng.'],
    ], () => HUD.toast('Nhiệm vụ: ' + cur().title));
    window.__story = st;
  }

  window.KTStory = { install, STEPS, SAVE_KEY };
})();
