# BRKLOOP UX / sound capability RFC (discussion draft)

**Status:** proposal for discussion; do not merge or implement before agreeing on core note-entry interactions.

## 1. Product goal

BRKLOOP should feel like a playable **web groovebox**, using the original SLOOP/Felucca DSP, clocks and step model. Desktop mouse/keyboard and Android touch get equivalent musical capabilities and layouts optimized for their interaction.

A clean UI alone is not success. Success = an idea becomes a 4-track loop within minutes, with access to the underlying sound parameters and reliable save/reopen.

## 2. Source audit: findings

Source of truth: `web/editor.html`, `SLOOP.md`, `web/preview.js`, `web/preview-worklet.js`, `firmware/host/preview.c`, `docs/BRKLOOP_FEATURE_PARITY.md`.

- SLOOP web editor mock contains **63 common track parameters** plus **8 engine parameters**. BRKLOOP displays only a subset of the common fields: macros, ADSR, selected sends/FX, volume/pan/mute, length/division, tempo/swing.
- SLOOP documents **153 factory sounds**, while BRKLOOP's build log reported **115 mock-extracted presets**. This is a real unresolved data-parity discrepancy, not a cosmetic issue. Audit source bank versus mock catalog before claiming complete coverage.
- SLOOP supports 1–64 steps per track, polyphonic notes/chords, step velocity/tie/rest, drum ratchet/level, microtiming, fills, 24 parameter locks, scales, LFOs, inserts, chord/strum, MIDI and song sections. Many are not surfaced by BRKLOOP.
- SLOOP's FM6 patches have internal operator envelopes; generic track ADSR does not shape FM6 notes as users might expect. Sound UI must be engine-aware.
- Browser preview bridge supports 4-track sound playback, parameter writes, steps, locks, select, notes and transport, but hardware-only UI actions/songs/samples are not automatically available.

## 3. UI interaction contract (proposed)

### PATTERN: compose quickly

**Core mobile workflow (Step Write):**
1. Tap empty step = insert **last played note/chord** and select it; tap existing step = **select** rather than accidentally delete. Dedicated erase action, long-press shortcut to clear.
2. Play a pitch on the C-based onscreen keyboard while a step is selected = **write that pitch immediately**, audition it and optionally auto-advance the cursor. No separate SET STEP NOTE button.
3. Toggle **CHORD** input to build a 1–4 note step from keyboard presses; a visible commit/done button completes the chord.
4. Long press / Details opens a *compact bottom sheet* for velocity, gate/tie/rest, micro, fill, ratchet and locks. Inspectors do not permanently take half the screen.
5. Optional alternate **PIANO ROLL** view for dense melodies/lengths; same underlying native SLOOP state, not another sequencing model. Drums retain 16-lane step matrix; velocity and ratchets visible.
6. Always support 1–64 lengths and independent per-track division, with non-destructive shortening. Scroll sequential 16-step groups rather than paged navigation. No duplicated transport or clock.

**Desktop:** Same semantics with direct pointer selection, QWERTY input, shift-selection, hotkeys and a persistent context panel. One state model and no mobile-only feature loss.

**Record** and **Undo/Redo:** Treat step entry, chords, timing, fills and parameter locks as undoable changes. Add realtime record only after stabilizing step-write UX. Browser audio playback/editing should remain responsive throughout.

### SOUND: progressive disclosure with full coverage

- Quick controls: sound/preset, essential engine macros, 2–4 performance tweaks.
- Complete indexed source registry and advanced controls grouped **SOURCE**, **SHAPE**, **MOTION**, **FX**, **PLAY**, plus **GLOBAL/MASTER** settings.
- Engine-dependent control types and semantically correct values: named enums, ratios, Hz/ms/cents where available. Disable/hide inapplicable controls (e.g. redundant FM6 ADSR).
- Every DSP-exposed sound control must be reachable without editing code; a fallback advanced page automatically renders any new metadata descriptor.
- Only one canonical parameter-to-data mapping. No manually recopied factory preset arrays or second synth/step engine.

### Layout

Phone: compact transport + 4 track selectors; main Pattern canvas + sticky C-keyboard; contextual step drawer; top-level Pattern / Sound / Mix / Song. Avoid extra permanent toolbars and sprawling full-page forms.

Desktop: left track strip, main pattern editor, right inspector/sound panel, lower audition keyboard if needed. A consistent layout frame, no shifting panels.

## 4. Feature parity verification pipeline

Build a machine-readable registry with: `scope/id/name/type/min/max/default/enum/unit/applicableEngines/browserDSPRoute/uiRoute/persistence/testStatus`.

Classify each original feature as:
- A. Works in browser **and** has UI.
- B. Runs in browser but **no UI** (fix).
- C. Native data exists but browser bridge needs implementation.
- D. Hardware/OTA specific and intentionally out of web-groovebox scope.

Map 63 common track params, 8 per-engine params (12 engines), global/master params, 1–64 step fields, presets, samples, kit slots, banks and sections. Check round-trip serialization and runtime behavior before marking A.

Automated gates: source descriptors match extracted registry; supported params never silently disappear; preset inventory reconciles 115 vs 153; 1/16/17/32/64 steps work; all four-note chords/ties/ratchets/locks/micro/fill survive export/import; mobile/desktop interaction tests and original native-vs-WASM DSP parity stay green.

## 5. Development sequence / exit criteria

1. **Inventory first:** source-to-bridge-to-UI parameter map and preset discrepancy; no UI rewrite.
2. **Note entry vertical slice:** implement and user-test Step Write, 1-note/chord input, auto-advance toggle and compact inspector with one track on Pixel.
3. **Sound coverage:** metadata-generated Advanced page for every supported SLOOP parameter, then polished quick pages by musical use.
4. **Composition scope:** scenes/song, parameter-lock authoring and replay, user samples, MIDI/audio export as separately scoped vertical slices.

No code changes in this RFC PR. Review and agree on the primary **Step Write vs Piano Roll** workflow before implementing.

**MVP acceptance scenario:** make a short bass riff, a chord progression and a drum rhythm on a phone, change preset/FX without stopping, save, reopen, and hear the same pattern without losing any stored native attributes.
