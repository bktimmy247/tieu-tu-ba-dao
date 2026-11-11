/* KTFeel — cảm giác đánh + âm thanh cho "Tiêu Tử Bá Đạo".
 *
 * Gói trong 1 module để không phình js/game.js:
 *   1. Đếm số text sát thương (game.js đã tạo text; ở đây chỉ đọc bộ đếm sc.ft)
 *   2. Rung màn hình: game.js gọi sc.shake(px, ms) — module này chỉ kiểm tra/tắt an toàn
 *   3. Nhạc nền theo vùng: làng = bgm-field, ngoài làng = bgm-forest, fade 0,6 giây
 *   4. Tiếng bước chân: tổng hợp WebAudio (không có file sfx-step trong assets)
 *   5. Tiếng đánh trượt: tổng hợp WebAudio (không có file sfx-miss trong assets)
 *
 * File âm thanh có thật (assets/lt/manifest.json):
 *   sfx: atk, atk2, hit, mob-hit, mob-atk, mob-die, skill, skill-hit, voice, ui, win,
 *        skill-vortex, skill-vfx, passive
 *   bgm: bgm-field, bgm-forest
 * KHÔNG có: sfx-miss (đánh trượt), sfx-step (bước chân), nhạc riêng cho làng.
 */
'use strict';
(function () {
  const VOL = 0.30;        // âm lượng đích của mỗi track nhạc
  const FADE = 0.60;       // giây — yêu cầu fade 0,6 giây
  const STEP_GAP = 0.40;   // giây/bước
  const VILLAGE_R = 6;     // bán kính vùng làng (ô) — trùng game.js updateHud
  const TRACK = { village: 'bgm-field', field: 'bgm-forest' };

  const KTFeel = window.KTFeel = {};

  KTFeel.install = function (sc) {
    if (sc.__feel) return; sc.__feel = true;

    /* ---------- nhạc nền 2 track, fade theo dt ---------- */
    const tracks = sc.bgmTracks = {};
    for (const z in TRACK) {
      let snd = null;
      try { snd = sc.sound.add(TRACK[z], { loop: true, volume: 0 }); } catch (e) { snd = null; }
      tracks[z] = { key: TRACK[z], snd, cur: 0 };
    }
    // game.js đã tạo 1 track đơn — tắt để không phát chồng
    if (sc.music) { try { sc.music.stop(); sc.music.destroy(); } catch (e) { } sc.music = null; }
    sc.bgmZone = 'village';                  // 'village' | 'field'
    sc.bgmKey = TRACK.village;               // key đang phát (để kiểm chứng)
    sc.audioUnlocked = false;

    // mốc làng: window.VILLAGE (game.js công bố). KHÔNG dùng chỗ tướng đứng lúc cài đặt,
    // vì story.js có thể đã nạp lại vị trí từ save ở bãi quái.
    const VC = window.VILLAGE ? { c: window.VILLAGE.c, r: window.VILLAGE.r } : { c: sc.hero.c, r: sc.hero.r };

    sc.tryMusic = function () {
      try { const ctx = sc.sound.context; if (ctx && ctx.state === 'suspended') ctx.resume(); } catch (e) { }
      sc.audioUnlocked = true;
    };
    sc.toggleMusic = function () {
      sc.musicOn = !sc.musicOn;
      if (sc.musicOn) sc.audioUnlocked = true;
      const el = document.getElementById('mus');
      if (el) { el.classList.toggle('off', !sc.musicOn); const b = el.querySelector('b'); if (b) b.textContent = sc.musicOn ? '♪' : '✕'; }
      if (window.HUD && HUD.log) HUD.log(sc.musicOn ? 'Bật nhạc' : 'Tắt nhạc');
    };

    function audioTick(dt) {
      const step = VOL / FADE;
      for (const z in tracks) {
        const t = tracks[z], s = t.snd; if (!s) continue;
        const want = (sc.musicOn && sc.audioUnlocked && sc.bgmZone === z) ? VOL : 0;
        if (t.cur < want) t.cur = Math.min(want, t.cur + step * dt);
        else if (t.cur > want) t.cur = Math.max(want, t.cur - step * dt);
        if (t.cur > 0.002) {
          if (!s.isPlaying) { try { s.play(); } catch (e) { } }
          try { s.setVolume(t.cur); } catch (e) { }
        } else if (s.isPlaying) {
          try { s.setVolume(0); s.stop(); } catch (e) { }
        }
      }
      sc.bgmKey = TRACK[sc.bgmZone];
    }

    function zoneTick() {
      const h = sc.hero; if (!h || h.dead) return;
      const inVillage = Math.hypot(h.c - VC.c, h.r - VC.r) < VILLAGE_R;
      const z = inVillage ? 'village' : 'field';
      if (z !== sc.bgmZone) {
        sc.bgmZone = z;
        if (window.HUD && HUD.log) HUD.log(inVillage ? 'Về ' + (VC.name || 'làng') + ' — nhạc làng' : 'Ra bãi quái — nhạc rừng');
      }
    }

    /* ---------- âm thanh tổng hợp (WebAudio): bước chân + đánh trượt ---------- */
    let audioCtx = null, noiseBuf = null, noiseRate = 44100;
    function ctxNow() {
      try {
        const c = sc.sound && sc.sound.context;
        if (!c || c.state !== 'running') return null;
        if (c !== audioCtx) { audioCtx = c; noiseBuf = null; }
        return c;
      } catch (e) { return null; }
    }
    function noise(c) {
      if (noiseBuf && noiseRate === c.sampleRate) return noiseBuf;
      const n = Math.floor(c.sampleRate * 0.12);
      noiseBuf = c.createBuffer(1, n, c.sampleRate); noiseRate = c.sampleRate;
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.2);
      return noiseBuf;
    }
    let stepCount = 0;
    function footstep() {
      const c = ctxNow(); if (!c) return;
      const t0 = c.currentTime;
      const src = c.createBufferSource(); src.buffer = noise(c);
      src.playbackRate.value = 0.85 + Math.random() * 0.30;   // cao độ ngẫu nhiên nhẹ
      const lp = c.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.value = 380 + Math.random() * 180;         // tiếng bịt, trầm
      const g = c.createGain();
      g.gain.setValueAtTime(0.10, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.10);
      src.connect(lp); lp.connect(g); g.connect(c.destination);
      src.start(t0); src.stop(t0 + 0.11);
      stepCount++;
    }
    let missCount = 0;
    sc.sfxMiss = function () {                                  // đánh trượt: không có file -> whoosh tổng hợp
      missCount++;
      const c = ctxNow(); if (!c) return;
      const t0 = c.currentTime;
      const src = c.createBufferSource(); src.buffer = noise(c);
      src.playbackRate.value = 1.1 + Math.random() * 0.3;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
      bp.frequency.setValueAtTime(1600, t0);
      bp.frequency.exponentialRampToValueAtTime(420, t0 + 0.16);
      const g = c.createGain();
      g.gain.setValueAtTime(0.13, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
      src.connect(bp); bp.connect(g); g.connect(c.destination);
      src.start(t0); src.stop(t0 + 0.19);
    };

    /* ---------- vòng tick: nhạc + vùng + bước chân ---------- */
    let stepT = 0, lastC = sc.hero.c, lastR = sc.hero.r;
    sc.events.on('update', function (time, deltaMs) {
      const dt = Math.min(0.25, Math.max(0, (deltaMs || 16) / 1000));
      zoneTick();
      audioTick(dt);
      const h = sc.hero;
      if (!h || h.dead) { lastC = h ? h.c : lastC; lastR = h ? h.r : lastR; stepT = 0; return; }
      const moved = Math.hypot(h.c - lastC, h.r - lastR);
      lastC = h.c; lastR = h.r;
      const running = moved > 0.004 && h.clip === 'run';
      if (!running) { stepT = 0; return; }
      stepT += dt;
      if (stepT >= STEP_GAP) { stepT -= STEP_GAP; if (sc.audioUnlocked) footstep(); }
    });

    // điểm móc kiểm chứng trong page
    sc.feelInfo = function () {
      return {
        ft: sc.ft || null, bgmZone: sc.bgmZone, bgmKey: sc.bgmKey,
        musicOn: sc.musicOn, unlocked: sc.audioUnlocked,
        vol: { village: tracks.village.cur, field: tracks.field.cur },
        steps: stepCount, misses: missCount,
      };
    };
  };
})();
