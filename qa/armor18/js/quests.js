/* quests.js — hệ thống nhiệm vụ cho Tiêu Tử Bá Đạo
 * Gắn: KTQuests.install(scene) trong create(); KTQuests.onKill(u) khi quái chết;
 *      KTQuests.tick(scene, dt) trong update().
 * Lưu tiến độ vào localStorage.
 */
(function () {
  const KEY = 'ttbd.quest.v1';

  // SPOTS index: 0..8 (map 1). kill: giết N quái ở bãi; visit: đi tới bãi
  const QUESTS = [
    { id: 'q1', type: 'kill', spot: 0, n: 10, name: 'Dẹp Tịnh Mặc', desc: 'Giết 10 Tịnh Mặc ở Bãi Tịnh Mặc', exp: 120 },
    { id: 'q2', type: 'kill', spot: 1, n: 15, name: 'Đồng Tịnh Mặc', desc: 'Giết 15 Tịnh Mặc ở Đồng Tịnh Mặc', exp: 200 },
    { id: 'q3', type: 'visit', spot: 2, name: 'Thám thính rừng', desc: 'Đi tới Rừng Lang Tiêu', exp: 150 },
    { id: 'q4', type: 'kill', spot: 2, n: 20, name: 'Lang Tiêu quấy phá', desc: 'Giết 20 Lang Tiêu ở Rừng Lang Tiêu', exp: 320 },
    { id: 'q5', type: 'kill', spot: 3, n: 20, name: 'Bãi Lang Nguyệt', desc: 'Giết 20 Lang Nguyệt ở Bãi Lang Nguyệt', exp: 380 },
    { id: 'q6', type: 'visit', spot: 4, name: 'Dò Đồi Bạch Diện', desc: 'Đi tới Đồi Bạch Diện', exp: 260 },
    { id: 'q7', type: 'kill', spot: 4, n: 25, name: 'Bạch Diện', desc: 'Giết 25 Bạch Diện ở Đồi Bạch Diện', exp: 520 },
    { id: 'q8', type: 'kill', spot: 5, n: 25, name: 'Rừng Nguyệt', desc: 'Giết 25 Lang Nguyệt ở Rừng Nguyệt', exp: 560 },
    { id: 'q9', type: 'kill', spot: 6, n: 30, name: 'Gốc Tiểu Linh', desc: 'Giết 30 Tiểu Linh ở Gốc Tiểu Linh', exp: 700 },
    { id: 'q10', type: 'elite', n: 3, name: 'Tinh Anh xuất hiện', desc: 'Hạ 3 Tinh Anh (100 mạng ra 1 con)', exp: 1200 }
  ];

  let st = { idx: 0, prog: 0, done: [] };
  let sc = null, panel = null, toastEl = null, beacon = null, open = true, lastSave = 0;

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && typeof s.idx === 'number' && s.idx >= 0 && s.idx <= QUESTS.length) st = s;
    } catch (e) { }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { }
  }
  function cur() { return QUESTS[st.idx] || null; }
  function spotOf(q) {
    const arr = (window.SPOTS && window.SPOTS.length) ? window.SPOTS : (sc && sc.spots) || [];
    return (q && q.spot !== undefined) ? arr[q.spot] || null : null;
  }
  function sameSpot(a, b) {
    return !!(a && b && Math.abs(a.c - b.c) < 0.01 && Math.abs(a.r - b.r) < 0.01);
  }

  function css() {
    if (document.getElementById('qcss')) return;
    const s = document.createElement('style'); s.id = 'qcss';
    s.textContent = `
#qpanel{position:fixed;right:10px;top:76px;width:250px;z-index:60;font:13px/1.45 system-ui,Segoe UI,sans-serif;
  background:linear-gradient(180deg,rgba(28,22,16,.94),rgba(18,14,10,.94));border:1px solid #7a5c33;border-radius:10px;
  box-shadow:0 8px 24px rgba(0,0,0,.45);color:#f2e6cf;overflow:hidden}
#qpanel.hide{display:none}
#qpanel h4{margin:0;padding:8px 10px;font-size:13px;letter-spacing:.4px;background:rgba(122,92,51,.35);border-bottom:1px solid #7a5c33;display:flex;justify-content:space-between;align-items:center}
#qpanel h4 b{color:#ffd98a;font-weight:700}
#qpanel .body{padding:9px 10px 11px}
#qpanel .qname{color:#ffd98a;font-weight:700;margin-bottom:3px}
#qpanel .qdesc{color:#d9c9ad;margin-bottom:7px}
#qpanel .qbar{height:9px;background:#2a2117;border:1px solid #5c4527;border-radius:6px;overflow:hidden}
#qpanel .qbar i{display:block;height:100%;background:linear-gradient(90deg,#d8a84a,#ffd98a);width:0%}
#qpanel .qnum{display:flex;justify-content:space-between;font-size:12px;color:#c9b593;margin-top:4px}
#qpanel .qrw{color:#9fd07a;font-size:12px;margin-top:6px}
#qpanel .qall{color:#9fd07a;padding:10px}
#qpanel .btn{margin-left:auto;font-size:11px;color:#c9b593;cursor:pointer;border:1px solid #5c4527;border-radius:6px;padding:1px 6px;background:#241b12}
#qtoast{position:fixed;left:50%;transform:translateX(-50%);top:14px;z-index:70;display:flex;flex-direction:column;gap:6px;pointer-events:none}
#qtoast div{background:rgba(24,18,12,.95);border:1px solid #7a5c33;color:#ffe9bd;padding:7px 14px;border-radius:8px;font:13px system-ui,Segoe UI,sans-serif;opacity:0;transform:translateY(-6px);transition:.25s}
#qtoast div.on{opacity:1;transform:none}
`;
    document.head.appendChild(s);
  }

  function build() {
    css();
    if (document.getElementById('qpanel')) { panel = document.getElementById('qpanel'); return; }
    panel = document.createElement('div'); panel.id = 'qpanel';
    panel.innerHTML = '<h4>NHIỆM VỤ <b id="qid"></b><span class="btn" id="qreset">bắt đầu lại</span></h4><div class="body" id="qbody"></div>';
    document.body.appendChild(panel);
    toastEl = document.createElement('div'); toastEl.id = 'qtoast'; document.body.appendChild(toastEl);
    panel.querySelector('#qreset').onclick = () => { st = { idx: 0, prog: 0, done: [] }; save(); render(true); toast('Đã bắt đầu lại nhiệm vụ'); };
    document.addEventListener('keydown', e => {
      if (e.key === 'j' || e.key === 'J') { open = !open; panel.classList.toggle('hide', !open); }
    });
  }

  function toast(txt, ms) {
    if (!toastEl) return;
    const d = document.createElement('div'); d.textContent = txt; toastEl.appendChild(d);
    requestAnimationFrame(() => d.classList.add('on'));
    setTimeout(() => { d.classList.remove('on'); setTimeout(() => d.remove(), 300); }, ms || 2600);
  }

  function render(loud) {
    if (!panel) return;
    const q = cur();
    const body = panel.querySelector('#qbody');
    const idEl = panel.querySelector('#qid');
    if (!q) {
      idEl.textContent = '';
      body.className = 'qall';
      body.innerHTML = 'Đã xong 10 nhiệm vụ. Tiếp tục luyện công!';
      if (beacon) { beacon.destroy(); beacon = null; }
      return;
    }
    body.className = 'body';
    idEl.textContent = (st.idx + 1) + '/10';
    const nn = q.type === 'kill' ? q.n : q.type === 'elite' ? q.n : 1;
    const pc = Math.min(100, st.prog / nn * 100);
    body.innerHTML = `<div class="qname">${q.name}</div><div class="qdesc">${q.desc}</div>
      <div class="qbar"><i style="width:${pc}%"></i></div>
      <div class="qnum"><span>${st.prog}/${nn}</span><span>${Math.round(pc)}%</span></div>
      <div class="qrw">Thưởng: ${q.exp} kinh nghiệm</div>`;
    if (loud) toast('Nhận nhiệm vụ: ' + q.name);
    setBeacon(q);
  }

  function setBeacon(q) {
    if (!sc || !sc.add) return;
    const sp = spotOf(q);
    if (!sp) return;
    if (beacon) { beacon.destroy(); beacon = null; }
    const TW = 128, TH = 64;
    const x = (sp.c - sp.r) * TW / 2, y = (sp.c + sp.r) * TH / 2;
    beacon = sc.add.circle(x, y, TH * 0.9, 0xffd98a, 0.16).setDepth(9e5);
    beacon.setStrokeStyle(3, 0xffd98a, 0.7);
    if (sc.tweens) sc.tweens.add({ targets: beacon, alpha: { from: 0.10, to: 0.30 }, scale: { from: 0.85, to: 1.12 }, duration: 1100, yoyo: true, repeat: -1 });
  }

  function complete() {
    const q = cur();
    if (!q) return;
    st.done.push(q.id); st.idx++; st.prog = 0;
    if (sc && sc.hero) {
      sc.hero.exp += q.exp;
      if (sc.expNeed) while (sc.hero.exp >= sc.expNeed(sc.hero.lv)) { sc.hero.exp -= sc.expNeed(sc.hero.lv); if (sc.levelUp) sc.levelUp(); }
    }
    toast('Xong: ' + q.name + '  +' + q.exp + ' kinh nghiệm', 3200);
    save(); render(true);
  }

  function bump(kind, u) {
    const q = cur(); if (!q) return;
    if (q.type === 'kill' && kind === 'kill' && u && u.spot && sameSpot(u.spot, spotOf(q))) {
      if (u.elite) return;
      st.prog++; render(); save(); if (st.prog >= q.n) complete();
    } else if (q.type === 'elite' && kind === 'kill' && u && u.elite) {
      st.prog++; render(); save(); if (st.prog >= q.n) complete();
    }
  }

  let visitT = 0;
  function tick(scene, dt) {
    if (!scene || !scene.hero || !scene.hero.spr) return;
    const q = cur(); if (!q || q.type !== 'visit') return;
    visitT += dt || 0.016;
    if (visitT < 0.25) return;
    visitT = 0;
    const sp = spotOf(q); if (!sp) return;
    const h = scene.hero;
    if (Math.hypot(h.c - sp.c, h.r - sp.r) < 4) { st.prog = 1; render(); complete(); }
  }

  function install(scene) {
    sc = scene;
    load(); build(); render(false);
    if (!window.__qKeys) {
      window.__qKeys = true;
      window.addEventListener('beforeunload', save);
    }
  }

  window.KTQuests = {
    install, tick, onKill: u => bump('kill', u),
    get state() { return st; }, QUESTS,
    reset() { st = { idx: 0, prog: 0, done: [] }; save(); render(true); }
  };
})();
