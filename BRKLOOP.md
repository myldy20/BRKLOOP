# BRKLOOP experimental web groovebox

An independent, browser-first experiment inside the SLOOP 2.7.1 fork. All sound comes from the **unmodified SLOOP firmware DSP and sequencer compiled to WebAssembly**, not a new JavaScript synthesizer.

## Try it
After merging the experimental PR and a successful GitHub Pages deployment, open:
https://myldy20.github.io/BRKLOOP/

For GitHub Pages: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## First slice
- Four SLOOP tracks (three synths + 16-lane drums) with 16-step UI and native 64-step data structure.
- All 12 synth engines and their factory presets, extracted automatically from the original editor protocol at build time.
- Sound parameter macros, envelopes, sends, insert effects and per-track mixer.
- Touch and mouse step editing; eight-step pages on narrow screens, 16 steps on desktops.
- Onscreen audition keys/pads, real AudioWorklet transport/playhead, BPM and swing.
- Local autosave plus portable BRKLOOP_PROJECT_V1 JSON import/export.
- Offline WebAssembly render parity tests inherited from SLOOP.

## Known limitations (intentionally not masquerading as complete features)
- This is **not** a hardware FM-1 controller; it runs standalone in the browser.
- No song/scenes arrangement, audio export, arbitrary sample upload or tracker-style phrase reuse yet.
- 16 steps are editable in this first UI. The underlying SLOOP step arrays retain 64 steps; further pages will come in later slices.
- User sample / custom SYN-kit import is not exposed. Choose built-in engines, factory sounds and standard drum kits for now.
- Changes do not sync to the hardware FM-1. Projects save locally in this browser; export JSON regularly.
- Browser SLOOP playback uses 44.1 kHz. If a browser/device only exposes 48 kHz, startup currently fails with an explicit error.
- Source code GPL-3.0-only. See inherited LICENSE and LICENSING.md; non-GPL artwork/assets have separate restrictions.

## Development
Run on a machine with Node 22, Python 3, Pillow, clang+wasm-ld (or Emscripten):

```sh
python -m pip install Pillow
node tools/build_brkloop_bank.mjs
python tools/build_preview.py
sh tests/run_preview_tests.sh
mkdir -p dist/site/web
cp index.html app.js styles.css dist/site
cp web/preview.js web/preview-worklet.js dist/site/web
cp build/preview/sloop-preview.wasm dist/site/web
cp dist/bank.json dist/site/
python -m http.server -d dist/site 8766
```

Navigate to http://localhost:8766/. The Pages workflow assembles and deploys the same site. The factory bank is generated from SLOOP's own mock protocol rather than maintained independently.

## Scope boundary
No changes to the upstream SLOOP firmware or web editor. All BRKLOOP custom UI code is confined to index.html, app.js, styles.css, tools/build_brkloop_bank.mjs and .github/workflows/brkloop-pages.yml. Future upstream merges remain straightforward.