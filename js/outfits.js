/* Trang phục 2D theo mô hình TIÊU TỬ BÁ ĐẠO: mỗi bộ = bộ hình riêng cho từng action
   (manifest.chars.<cid>.outfits.<id>.clips). Đổi bộ = đổi texture/animation, KHÔNG đổi
   bất kỳ chỉ số chiến đấu nào. Nạp theo yêu cầu (lazy) để không làm nặng lúc vào game.
   Mọi hình trong assets/outfit-* do tools/gen_outfits.py sinh từ silhouette của chính nhân vật. */
(function () {
  'use strict';
  const KEY = 'ttbd.outfit.v2';
  const HD_CLIPS = { idle: 1, run: 1, basic: 1 };
  const controllers = new WeakMap();
  function storeGet() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; } }
  function storeSet(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (_) {} }

  function animKey(cid, clip, outfit) { return outfit && outfit !== 'original' ? 'of:' + outfit + ':' + cid + ':' + clip : cid + ':' + clip; }

  function texKey(cid, clip, outfit, hd) { return (outfit && outfit !== 'original' ? 'of:' + outfit + ':' : '') + (hd ? 'hdx:' : '') + cid + ':' + clip; }

  function attach(scene, unit) {
    if (controllers.has(unit)) return controllers.get(unit);
    const man = scene.M.chars[unit.cid] || {};
    const defs = man.outfits || {};
    const state = { outfit: (storeGet()[unit.cid] || 'original'), loading: null, clips: {}, applied: null };
    if (!defs[state.outfit]) state.outfit = 'original';

    function ensure(outfit) {
      // nạp bộ hình của outfit (SD + HD cho các clip nhìn lâu) rồi tạo animation riêng
      if (outfit === 'original' || !defs[outfit]) return Promise.resolve();
      const def = defs[outfit];
      const missing = [];
      for (const [cl, c] of Object.entries(def.clips)) {
        const hd = !!HD_CLIPS[cl];
        const kSD = texKey(unit.cid, cl, outfit, false);
        if (!scene.textures.exists(kSD)) missing.push([kSD, 'assets/lt/' + def.dir + '/' + c.file, c.w, c.h, c]);
        if (hd) {
          const kHD = texKey(unit.cid, cl, outfit, true);
          if (!scene.textures.exists(kHD)) missing.push([kHD, 'assets/lt-hd/' + def.dir + '/' + c.file, c.w * 2, c.h * 2, c]);
        }
      }
      if (!missing.length) { mkAnims(outfit); return Promise.resolve(); }
      if (state.loading) return state.loading;
      state.loading = new Promise(resolve => {
        for (const [key, url, w, h] of missing) scene.load.spritesheet(key, url, { frameWidth: w, frameHeight: h });
        scene.load.once('complete', () => { mkAnims(outfit); state.loading = null; resolve(); });
        scene.load.start();
      });
      return state.loading;
    }

    function mkAnims(outfit) {
      const def = defs[outfit]; if (!def || state.clips[outfit]) return;
      state.clips[outfit] = 1;
      for (const [cl, c] of Object.entries(def.clips)) {
        // giống game: ưu tiên bản HD cho clip nhìn lâu, còn lại dùng SD
        let k = texKey(unit.cid, cl, outfit, false);
        if (HD_CLIPS[cl]) { const kh = texKey(unit.cid, cl, outfit, true); if (scene.textures.exists(kh)) k = kh; }
        if (!scene.textures.exists(k)) continue;
        const tk = scene.textures.get(k);
        const total = tk.frameTotal - (tk.has('__BASE') ? 1 : 0);
        const n = Math.min(c.frames, total);
        if (n < 2) continue;
        const rate = (cl === 'run' ? 0.75 : 1) * 1000 / c.ms * (n / c.frames);
        const ak = animKey(unit.cid, cl, outfit);
        if (scene.anims.exists(ak)) continue;
        scene.anims.create({ key: ak, frames: scene.anims.generateFrameNumbers(k, { start: 0, end: n - 1 }),
          frameRate: rate, repeat: (cl === 'idle' || cl === 'run') ? -1 : 0 });
      }
    }

    function apply() {
      const clip = unit.clip || 'idle';
      // game.js đã chọn anim theo window.KTOutfits.animKey nên chỉ cần đảm bảo bộ đã nạp
      if (state.outfit !== 'original' && state.applied !== state.outfit + '/' + clip) {
        state.applied = state.outfit + '/' + clip;
      }
    }

    function equip(id) {
      if (id !== 'original' && !defs[id]) throw Error('Không có bộ: ' + id);
      return ensure(id).then(() => {
        state.outfit = id; state.applied = null;
        const o = storeGet(); o[unit.cid] = id; storeSet(o);
        refresh();
        if (scene.play) scene.play(unit, unit.clip || 'idle', true);
        return id;
      });
    }

    // --- UI ---
    const root = document.createElement('div'); root.id = 'outfit-ui';
    root.innerHTML = '<button id="outfit-open" aria-expanded="false">Trang phục</button>' +
      '<section hidden><strong>Trang phục Lăng Vân</strong><p>Đổi bộ áo — kỹ năng, sát thương, cooldown giữ nguyên.</p>' +
      '<div class="outfit-options"></div><small id="outfit-note">Mỗi bộ là một bộ hình riêng cho từng động tác (kiểu TIÊU TỬ BÁ ĐẠO).</small>' +
      '<button id="outfit-close">Đóng</button></section>';
    const css = document.createElement('style');
    css.textContent = '#outfit-ui{position:fixed;left:12px;bottom:66px;z-index:91;font:14px Segoe UI;color:#f5e9cf}' +
      '#outfit-ui>button{background:#272922;color:#f5e9cf;border:1px solid #aa9260;border-radius:5px;padding:9px 12px;cursor:pointer}' +
      '#outfit-ui section{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);background:#182125;border:1px solid #b99a5d;' +
      'border-radius:10px;padding:20px;width:min(360px,86vw);box-shadow:0 8px 40px #000b}' +
      '#outfit-ui .outfit-options{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}' +
      '#outfit-ui .outfit-options button{background:#232b2f;color:#e8e0cc;border:1px solid #7d6c47;border-radius:6px;padding:8px 10px;cursor:pointer}' +
      '#outfit-ui small{display:block;margin-bottom:14px;color:#bcbaa9;line-height:1.35}' +
      '#outfit-ui button[aria-pressed=true]{background:#6b552d;border-color:#ffe0a0}';
    document.head.append(css); document.body.append(root);
    const options = root.querySelector('.outfit-options');
    const ids = ['original'].concat(Object.keys(defs));
    for (const id of ids) {
      const b = document.createElement('button'); b.dataset.outfit = id;
      b.textContent = id === 'original' ? 'Nguyên bản' : defs[id].name;
      b.onclick = () => { b.disabled = true; equip(id).then(() => { b.disabled = false; }).catch(e => { b.disabled = false; console.error(e); }); };
      options.append(b);
    }
    function refresh() { for (const b of options.children) b.setAttribute('aria-pressed', String(b.dataset.outfit === state.outfit)); }
    const panel = root.querySelector('section'), open = root.querySelector('#outfit-open');
    function toggle(show) { panel.hidden = !show; open.setAttribute('aria-expanded', String(show)); }
    open.onclick = () => toggle(panel.hidden);
    root.querySelector('#outfit-close').onclick = () => toggle(false);
    root.addEventListener('pointerdown', e => e.stopPropagation());
    scene.events.once('shutdown', () => { root.remove(); css.remove(); controllers.delete(unit); });

    const api = { equip, state, defs, animKey: (clip) => animKey(unit.cid, clip, state.outfit), texKey, ensure };
    controllers.set(unit, api); refresh();
    if (state.outfit !== 'original') ensure(state.outfit).then(() => scene.play(unit, unit.clip || 'idle', true));
    return api;
  }

  window.KTOutfits = {
    attach, animKey,
    // game.js dùng: bộ đang mặc của 1 unit (nếu có) để chọn animation đúng
    keyFor(scene, unit, clip) {
      const c = controllers.get(unit);
      const id = c ? c.state.outfit : 'original';
      const hasClip = c && c.defs[id] && c.defs[id].clips[clip];
      return animKey(unit.cid, clip, hasClip ? id : 'original');
    },
    clipFor(scene, unit, clip) {
      const c = controllers.get(unit), id = c ? c.state.outfit : 'original';
      return (c && c.defs[id] && c.defs[id].clips[clip]) || scene.M.chars[unit.cid].clips[clip];
    },
    outfitOf(unit) { const c = controllers.get(unit); return c ? c.state.outfit : 'original'; }
  };
})();
