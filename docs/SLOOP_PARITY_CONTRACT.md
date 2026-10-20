# SLOOP 2.7.1 → BRKLOOP compatibility contract

**Status:** incremental audit, NOT a claim of 100% SLOOP implementation. Release blocker for future BRKLOOP promotion. The original firmware + protocol/editor behavior is the source of truth.

This contract applies to the published GitHub Pages root app and the separate `/preview/` research editor. The root keeps its established V1 bank and saved projects until a tested versioned migration. The Preview may use the native V2 bank with no migration because it has no persistent state.

## Why source fidelity matters

The editor's `makeMockDevice()` is a demo simulator. `tools/build_brkloop_bank.mjs` historically imported **115 simplified mock patches**, unlike the **153 compiled firmware factory patches**. Even the same-named sounds can differ.

**Regression anchor: ANALOG/WOBBLE**

| Data | compiled firmware | old HTML mock |
| --- | ---: | ---: |
| ANALOG preset index | 7 | 4 |
| LFO RATE (p[9]) | 74 | 60 |
| LFO FILTER (p[14]) | 40 | 0 |
| TRANSPOSE (p[28]) | -24 | 0 |

Reference: `firmware/src/eng_analog.c` WOBBLE `XP(P_LRATE + 1, 74, P_LD_FLT + 1, 40, P_TRANS + 1, -24)`. The mock WOBBLE `P(...)` has no preset extras. `firmware/src/params.c` defines the native parameter limits and `ui.c::apply_preset_to` applies factory extras. The browser AudioWorklet uses actual firmware DSP, so the omitted extras change the sound.

The Preview native bank is generated via compiled `research/native_factory_dump.c` then `tools/build_native_bank_v2_candidate.mjs`, with 153 factory patches. The production site retains `dist/bank.json` V1 for existing project identity and backwards compatibility. The Preview loads **bank-preview-v2.json** exclusively.

## Inventory / evidence / remaining parity work

Legend: **PASS** = execution covered by an automated native/WASM or browser test; **PARTIAL** = some controls or cases work; **NOT RELEASED** = not present in the browser Preview. Presence of a widget is not proof of DSP effect.

| Original SLOOP capability | BRKLOOP Preview | Required proof / remaining work |
| --- | --- | --- |
| 12 synthesis engines | PASS for real native/WASM sample output | Retest preset and parameter changes in live audio |
| 153 native factory presets | PASS on candidate build, native source, WASM audition | Confirm physical FM-1 tonal parity on selected patches |
| WOBBLE -24 transpose and LFO FILTER | PASS source fixture + actual WASM audible delta | Manual FM-1 listening remains |
| 3 synth tracks + 16-lane drums | PASS basic editing/playback | SYN drum kits and full drum parameters partial |
| 1–64 steps per track, DIV | PASS editing + 64→16→64 | Preserve independent track clock and expression |
| Step Write and Piano Roll, shared history | PASS browser input, chords, Undo/Redo | Range editing, clipboard and touch gestures remain |
| BPM 40..240, swing 0..100 | PASS native parameter descriptors + visible transport | BPM real sequencer timing checked in WASM |
| Common per-track params (63) | PARTIAL | All source numeric IDs exist, many advanced; need SLOOP layout and individual UI→DSP qualified routes |
| 8 per-engine parameters, ENV, LFO, TRANSPOSE | PARTIAL | Engine macros + grouped original LFO; FM6 operator editor incomplete |
| 49 global params | PARTIAL | Hardware-only commands (MIDI, SAVE, CONNECT, etc.) must be excluded from browser controls or clearly marked |
| Filter, insert FX, sends, global FX | PARTIAL | Create audible parameter-sweep tests, including engine-specific behavior |
| Step microtiming, fill conditions, locks, ratchet, continuation | PARTIAL | Native data present; dedicated inspectors, gestures and SF_CONT bridge needed (PR #6) |
| Project persistence, reload, backup, import/export | NOT RELEASED in Preview | Design and test stable schema, offline restore and migration; root still has V1 persistence |
| Sample import, 37 kits, user kits, SYN drum patches | PARTIAL | Resolve original SLOOP sample user flows and sound-kit MIDI/note mapping |
| Song / sections / live scenes, morphing, 27 punch-in FX | NOT RELEASED | Scope realistic browser-only implementation before advertising |
| Hardware Web MIDI, panel settings / device backup | NOT RELEASED | Requires connected FM-1 and browser permissions; keep optional separate surface |

## Mandatory acceptance gates before every future Pages Preview change

1. **Source inventory:** per-feature status and evidence updated here. Any omitted capability must be a conscious documented decision; no silent disappearance when designing the interface.
2. **Factory sound fidelity:** compiled SLOOP tables, native name+index, exact 153 `p[]` + packed FM6 values. Assert native WOBBLE RATE 74, FILTER LFO 40, transpose −24. Avoid the mock bank as the source for sounds.
3. **Real DSP:** test actual WASM, audible notes for all 153, WOBBLE LFO on/off and transpose difference, tempo 60/180 different clock progress. **A UI slider alone does not count.**
4. **Data and migration:** no implicit index migration. Root app remains V1 until a standalone V1→V2 migration that preserves 115 old sound states, p[], FM6, 64 steps, locks, fill, micro, mixer, user projects; 30 indices differ. Follow research PRs #5 and #7.
5. **Cross-device UI:** Playwright phone/desktop verifies MIDI pitch, note editing, undo/redo, BPM, Sound source identity, responsive layouts and no JS exceptions. Subjective musical flow needs only periodic user listening, not manual detection of omitted features.
6. **No fake controls:** separate global hardware actions from browser-editable parameters. Render true parameter names in coherent original-style pages: ENGINE, ENV, LFO, VOICE/TUNING, FX, MIX. Use the original editor's descriptors and group mapping as a design reference.
7. **Artifacts:** attach per-run native factory diff, catalog, WASM qualification and phone/desktop screenshots. Block publication if any gate fails.

## Pointers
- Original supplied editor: `sloop-editor-2.7.1.html` (user upload) and repo `web/editor.html` (`makeMockDevice`, protocol descriptions, grouped UI).
- Original firmware: `firmware/src/eng_analog.c`, `engines.c`, `params.c`, `core.h`, `ui.c`, `firmware/host/preview.c`.
- Preview audio path: `web/preview.js` → `web/preview-worklet.js` → SLOOP WASM.
- Native candidate research: PR #7, native factory dump, original project migration and audio qualification.
- Unmerged SF_CONT fix: PR #6.
- UI RFC: PR #4 and shared STEP/ROLL research #5.

**Note:** GitHub Issues are disabled in this repository. Keep this document in the repo as the canonical tracker, with actionable slices in PR descriptions and review comments until Issues are enabled.
