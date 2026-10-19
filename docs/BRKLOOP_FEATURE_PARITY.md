# BRKLOOP / SLOOP capability and regression matrix

Source: the fork's unchanged SLOOP 2.7.1 firmware, \`SLOOP.md\`, \`web/editor.html\` protocol mock and \`firmware/host/preview.c\`.
Status: 2026-10-20, experimental browser release. This is a feature-gap tracker, **not** a claim that BRKLOOP exposes all SLOOP capabilities.

## Architecture guardrail

BRKLOOP is an additional web entry point in the SLOOP fork. Original firmware, UI, web editor, headers, musical clock and DSP stay untouched. The DSP and sequencer are compiled from the original SLOOP sources through \`tools/build_preview.py\`. The native/WASM audio parity suite must remain green.

BRKLOOP_PROJECT_V1 contains the **complete SLOOP per-track arrays**: 64 synth steps, 64 drum steps, microtiming[64], fill[16], parameter locks, FM6 patch, all params, and global state. UI controls only alter the fields explicitly selected. Shrinking the visible/playable length must NEVER destroy steps beyond that length.

## Capability audit

| SLOOP capability | Engine and data | BRKLOOP web UI | Next action |
| --- | --- | --- | --- |
| 3 synth tracks, 1 × 16-lane drums | Preserved | Yes | Keep 4-track constraints explicit |
| 12 synthesis engines | Present in WASM | Yes | Regression on all engines |
| Factory presets / kits | Extracted directly from SLOOP mock descriptors | 115 synth preset entries and 37 base drum kits accessible; source lists 46 kits incl. user/synth kits | Build real user kit import/editor |
| 1–64 steps **per track** | \`p[29]\`, \`step[64]\`, \`dstep[64]\` | **Yes**: length 1–64, all active steps reachable via continuous scroll sections | Acceptance test length changes while playing |
| Per-track step division | \`p[30]\`, descriptor including 1/4, 1/8, 1/16, triplets, long divisions | **Yes**: select from original descriptor | Verify timing on several divisions |
| Polyphonic 4-note synth steps | \`step[i].n/notes[4]\` | **Yes**: step inspector with up to 4 pitches | UX/interaction polish |
| Step on/rest/tie + velocity | \`step[i].time/vel\` | **Yes**: inspector | Test tie transitions audibly |
| Microtiming -32..31 | \`micro[64]\` | **Yes**: per-step signed nudge | Test native/WASM timing with nonzero micro |
| Drum step level, ratchet | \`dstep[i].lvl/rat\` | **Yes**: per-lane inspector | Verify naming vs engine behavior |
| Step fill conditions | \`fill[16]\`, 2 bits each | Selectable for active step; no fill trigger yet | Fill trigger / bar action UI |
| Parameter locks (24 per track) | \`locks[]\` preserved and played | Existing locks survive import/edit/export; no authoring UI | Add sound lock editor |
| Swing, BPM, mixer, synth macros, ADSR, FX | Engine preserved | Basic controls exposed | Fill feature gaps: LFO/scale, insert params, global texture |
| SLOOP live punch FX (27), 8 scenes, morphing | Firmware/editor functionality | **Not exposed** by BRKLOOP | Evaluate browser API versus LIVE hardware-only route |
| Song A–D, quick chain, arrangement | Firmware + original editor | **Not exposed** | Build arranger without a second clock |
| MIDI, clock, controller learn | Firmware and physical device | **Not exposed**; Web preview has no hardware imports | Decide browser Web MIDI scope |
| User WAV samples, drum kit editing, FM6 SysEx | Original editor / firmware | **Not exposed** | Browser import, save and memory strategy |
| Factory updater / hardware configuration | Original SLOOP repo intact | Intentionally outside this groovebox | Leave existing firmware workflow intact |
| Browser project save | BRKLOOP JSON full state | Autosave + export/import | Future schema migration and samples |
| Audio render / recording | Native browser preview | Live audio only, no WAV render/export | Build offline recording with DSP parity tests |

**Do not confuse preserved engine/data with complete UI parity.** Hardware-specific features may need browser adapters and could be deferred beyond the groovebox MVP; their availability in the SLOOP repository is not equivalent to support in the new web app.

## Shipping gates for each change

1. Keep upstream firmware, DSP, web/editor.html and original SLOOP resources unchanged unless a narrowly scoped compatibility fix is justified and reviewed.
2. Derive engine names, factory preset state, drum kit names, and sequencer LEN/DIV ranges from original SLOOP descriptors; fail the build on incompatible upstream changes.
3. Preserve all 64 steps and related state on every track when toggling, changing presets, shortening patterns, saving/loading JSON, or reordering UI.
4. Test 16, 17, 32 and 64 steps; test both desktop and 390px touch viewport in Chrome. Never assume the pattern is one 16-step bar: DIV controls actual musical duration.
5. Native/WASM parity tests, browser interaction tests, and GitHub Pages deployment must pass before declaring changes released.
6. Explicitly update this matrix whenever a SLOOP feature becomes exposed or is blocked.
7. Never describe unimplemented SLOOP features as BRKLOOP features merely because firmware source exists.
