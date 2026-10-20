# BRKLOOP UX / sound capability RFC (discussion draft)

**Status:** design RFC, 2026-10-20. **Approved direction:** Step Write and Piano Roll are equal, one-tap-switchable editors sharing canonical SLOOP data. Still discussion-only for detailed gestures and browser-bridge fixes; do not merge or implement without review.

Detailed specifications:
- [Hybrid editor, phone/desktop interaction and data invariants](BRKLOOP_HYBRID_EDITOR_SPEC.md)
- [SLOOP parameter inventory, browser-bridge gaps and validation gates](BRKLOOP_CAPABILITY_CONTRACT.md)

These are design documents only: this RFC branch intentionally changes no shipping application files.

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

### PATTERN: peer editor modes (product direction agreed)

**Step Write + Piano Roll are peers**, visible as a one-tap STEP / ROLL control on both phone and desktop, retained per track; never hidden as an advanced option.

- STEP uses selecting steps and playing the onboard piano to immediately write/replace notes; optional auto-advance, explicit Erase, atomic 1–4-note chord composition. No mandatory note drop-down or Set Step Note action.
- ROLL provides a scrollable time × pitch matrix with up to 4 notes **per native step**; respects NOTE/TIE/REST, per-note level/ratchet and 1–64 steps, without inventing arbitrary MIDI note length clips.
- DRUM editor is lane-first in STEP and full 16-lane time grid in ROLL. Same per-hit expression and shared per-step nudge/fill.
- Cursor, undo history, selection, playback state and musical data stay consistent and synchronized between modes. A switch is strictly a view operation.
- Mobile gets a sticky audition keyboard and an on-demand step drawer; desktop a stable three-area layout and the same capabilities plus shortcuts.
- Real-time record and free note drag/resize await explicit browser-bridge/undo acceptance criteria; no misleading UX placeholders.

See the linked hybrid spec for exact tap semantics, chord commit, navigation and acceptance scripts.

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

Build a machine-readable registry (63 common track, 47 global, eight edits per engine in current mock), with: `scope/id/name/type/min/max/default/enum/unit/applicableEngines/browserDSPRoute/uiRoute/persistence/testStatus`.

Classify each original feature as:
- A. Works in browser **and** has UI.
- B. Runs in browser but **no UI** (fix).
- C. Native data exists but browser bridge needs implementation.
- D. Hardware/OTA specific and intentionally out of web-groovebox scope.

Map 63 common track params, 8 per-engine params (12 engines), global/master params, 1–64 step fields, presets, samples, kit slots, banks and sections. Check round-trip serialization and runtime behavior before marking A.

Automated gates: source descriptors match extracted registry; supported params never silently disappear; preset inventory investigates 115 extracted vs 153 documented; browser SF_CONT continuity is validated; 1/16/17/32/64 steps work; all four-note chords/ties/ratchets/locks/micro/fill survive export/import; mobile/desktop interaction tests and original native-vs-WASM DSP parity stay green.

## 5. Development sequence / exit criteria

1. **Inventory first:** source-to-bridge-to-UI parameter map and preset discrepancy, and continuation-flag P0; no UI rewrite.
2. **Hybrid editor vertical slice:** implement and user-test both STEP and ROLL as peers, selection/write/erase, 1-note/chord, auto-advance toggle and compact inspector on Pixel/desktop.
3. **Sound coverage:** metadata-generated Advanced page for every supported SLOOP parameter, then polished quick pages by musical use.
4. **Composition scope:** scenes/song, parameter-lock authoring and replay, user samples, MIDI/audio export as separately scoped vertical slices.

No code changes in this RFC PR. The equal STEP + ROLL direction is agreed; review the specific tap/draw/erase/chord gestures and audio-bridge constraints before implementation.

**MVP acceptance scenario:** make a short bass riff, a chord progression and a drum rhythm on a phone, change preset/FX without stopping, save, reopen, and hear the same pattern without losing any stored native attributes.
