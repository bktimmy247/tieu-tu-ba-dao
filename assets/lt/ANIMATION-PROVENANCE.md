# Lăng Vân directional animation & NPC provenance — 2026-11-17

## Generated assets (Lăng Vân 8-direction walk)

- `lang-van-run-front.webp`: 4-frame front-facing walk strip, 58×97 px/frame, 232×97 px, 17.0 KB.
- `lang-van-run-back.webp`: 4-frame back-facing walk strip, 49×97 px/frame, 196×97 px, 13.3 KB.
- `lang-van-run-front-diag.webp`: 4-frame 3/4 front diagonal walk strip, 83×97 px/frame, 332×97 px, 26.6 KB.
- `lang-van-run-back-diag.webp`: 4-frame 3/4 back diagonal walk strip, 77×97 px/frame, 308×97 px, 26.5 KB.
- Background was generated as solid magenta and removed by `tools/slice_turnaround.py`; the runtime assets are RGBA WebP.
- Manifest entries: `frames=4`, `cols=4`, `ms=100`, `footY=96`, `charH=97`.

## NPC assets from Lục Thân (`C:\lt\luc-than-main`)

- `bust-pho.webp`: Ông Hàng Phở (từ `ong-pho/dialogue-bust.png`), 160×160 WebP, 9.4 KB.
- `bust-taphoa.webp`: Bà Tư Tạp Hóa (từ `ba/dialogue-bust-v4.webp`), 160×160 WebP, 14.3 KB.
- `bust-tuu.webp`: Chưởng Quầy Tửu Lầu (từ `co-nuong/avatar.webp`), 160×160 WebP, 13.3 KB.
- `bust-thuoc.webp`: Đại Phu Lý (từ `bach-y-van-phong/portrait-4540d1ff.webp`), 160×160 WebP, 12.9 KB.
- `bust-ren.webp`: Thợ Rèn Trương (từ `lang-chan/portrait-9fd6b6ba.webp`), 160×160 WebP, 14.2 KB.
- `bust-truong.webp`: Trưởng Thôn (từ `linh-dong/card.webp`), 160×160 WebP, 17.0 KB.

## Source

- Generated with ChatGPT Image on 2026-11-17 using the existing Lăng Vân run/idle frame crops as references.
- NPC busts extracted and optimized from the local Lục Thân repository (`C:\lt\luc-than-main`).
- Source sheets are kept outside the project under the AICoworker media workspace and are not shipped in the game repository, to keep the deploy payload small.

## QA

- `tools/slice_turnaround.py`: 4/4 connected poses found for all sheets; normalized height 97/97 px; fixed-width atlas padding prevents variable-width Phaser frame errors.
- `tools/qa_dirclip.py`: 8/8 directions verified (E, SE, S, SW, W, NW, N, NE), 0 JS errors, missing clip guard verified.
- `tools/qa_npc_busts.py`: 7/7 NPC busts load with status ok: true, 0 HTTP 404s, 0 JS errors.
