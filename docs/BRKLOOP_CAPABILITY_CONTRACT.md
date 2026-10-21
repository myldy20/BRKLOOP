# BRKLOOP — SLOOP feature inventory and browser acceptance contract

**Status:** RFC design artifact only, 2026-10-20. Not a declaration of parity. Works alongside BRKLOOP_HYBRID_EDITOR_SPEC.md and the earlier BRKLOOP_FEATURE_PARITY.md. Original SLOOP 2.7.1 source remains untouched.

## 1. Audit scope and evidence

SLOOP sources checked:
- firmware/src/core.h: SLOOP track / step / global enums, flags, sample state and native arrangement.
- web/editor.html: editor mock's descriptor lists for **63 common track parameters**, **49 global parameters**, and 8 engine-specific edit parameters per active engine (12 engines).
- web/EDITOR_PROTOCOL.md: parameter GET/DESC, TRACK_PARAM, step, micro, locks and fill encoding.
- firmware/host/preview.c, web/preview.js, web/preview-worklet.js: actual browser-to-WASM DSP bridge and playback behaviour.
- SLOOP.md: original product behaviour, recording, scenes and sections, user sounds and Song.
- app.js and tools/build_brkloop_bank.mjs: currently exposed UI and factory bank extraction.

The source may contain more than the mock editor currently exposes. **Every count below must be reconciled against compiled source descriptors before it becomes a CI invariant.** Parameter labels such as WAVE, MODE, FX or RATE are repeated across scopes; canonical identity is (scope, numeric id, engine), never label text.

## 2. Coverage levels (never collapse them)

| State | Meaning | Evidence required |
| --- | --- | --- |
| NATIVE | Defined and used by SLOOP firmware | Source reference and format |
| SERIALIZED | Round-trips through browser project state | Lossless save/load test |
| BRIDGED | Web/WASM adapter accepts and applies it | Integration test against real compiled DSP |
| AUDIBLE | DSP changes actual sound/sequence as specified | Audio or transport behavioural test |
| EDITABLE | BRKLOOP exposes a validated control | Browser UI test and user scenario |
| EXCLUDED | Hardware-only or out of product scope | Explicit rationale, not silently discarded |

An item can be NATIVE + SERIALIZED but fail BRIDGED or AUDIBLE (example below). This is why a simple “present in JSON” matrix is insufficient.

## 3. Parameter register fields

Proposed generated manifest keyed by SLOOP version and source commit:
- scope: TRACK_COMMON / TRACK_ENGINE / GLOBAL / DRUM / STEP / ARRANGEMENT / BANK / HARDWARE.
- id: numeric native SLOOP index, plus engine ID only for TRACK_ENGINE.
- title, group, type, min, max, default, unit, full enum choices.
- applicability: 3 synths / drum / specific engine, dependence on other params.
- persistent paths and value encoding: track.p[], global.g[], track.step/dstep/micro/fill/locks, fm6, sample or section.
- source descriptor and firmware/bridge implementation path.
- status for NATIVE/SERIALIZED/BRIDGED/AUDIBLE/EDITABLE/EXCLUDED; reason for every gap.
- intended route (Sound > Source/Shape/Motion/FX/Play, Pattern > Details, Mix/Master, Arrangement, Hardware only).
- regression tests and documented known limitations.

Generate from SLOOP descriptors/build artefacts instead of writing a second manual parameter table. Human-authored information is restricted to UI grouping, help texts, exclusions and per-engine relevance.

## 4. Native capability groups that need deliberate routes

**TRACK_COMMON (63):**
- Level and envelopes (including per-engine applicability / FM6 caveat)
- ENV destinations and LFO1/LFO2: FLT/PIT/SHP/FX, rate, wave, phase, fade, polarity, tempo sync, retrigger
- ARP/roll and performance: MODE, RATE, OCT, GATE, SWG, PROB, HOLD, ORD
- SEL/keyboard: ROOT, 16 scales, quantization, transpose, chord, strum, voice leading
- SEQ: 1..64 length, division, independent track swing and gate
- Sends and FX: distortion, chorus, delay, reverb, filter, insert type, three insert params and mix, filter type
- VOICE: poly/mono/legato/unison, glide, priority, allocation, detune
- Slicer and other performance params; several field names repeat with different indexes
- Eight engine edit params must be routed separately for each engine.

**GLOBAL (49 descriptors in mock):**
- BPM/swing/click, tuning
- Delay/reverb/chorus/mix master, dust/duck/filter, texture
- Drum settings, mixer buses and per-track routing
- USB/TRS MIDI channels, sync and firmware settings
- Song/section/project controls and hardware maintenance.
  
Treat hardware-only commands as EXCLUDED from the standalone groovebox **only after** matching them to a concrete device-only feature and explaining why.

**STEP + DRUM:**
- Synth: NOTE/TIE/REST; up to 4 MIDI notes, global velocity, accent, slide, per-note level and ratchet; SLOOP 2.7 per-note continuation flags.
- Drum: 16 hit lanes, per-lane level and ratchet; nudge/fill operate at the whole step (column).
- Per track: packed fill conditions, micro[64], parameter locks with maximum 24 per track.
- Not present natively: arbitrary independent MIDI note clip lengths / unbounded simultaneous voices / DAW automation lanes. Do not fabricate data to make Piano Roll look more capable than native.
- Probability in the parameter descriptors relates to ARP/performance; **do not advertise per-step probability unless a native field is found.**

**Presets and banks:**
- SLOOP.md reports 153 built-in sounds, build output currently reports 115 mock-extracted presets; 12 engines.
- 37 base drum kits, additional user/SYN kits and sample slots require bank/asset management; BRKLOOP current kit picker accesses only built-in subset.
- Bank audit procedure: enumerate source preset definitions by engine and type; compare compiled native library, mock NAMES responses and extracted bank.json; list each missing name/engine, cause and tested playback. Do not fix by fabricating 38 presets or copying lists by hand.

**Arranger and live behaviour:**
- Original sections A–D, chaining, Song REC and Song playback have their own states. BRKLOOP's current project snapshot includes tracks/global state but **does not capture device flash A–D or an authored song arrangement**.
- 2.7 live performance FX/scenes, real-time recording, 32 user presets, custom sample kits, FM6 SysEx may need additional preview exports/bridge and persistence architecture.
- Do not add a fake JavaScript arranger until the desired native Song semantics and transport/section boundaries have been designed.

## 5. Verified compatibility blocker (P0, keep outside working app for now)

Source:
- firmware/src/core.h declares SF_CONT0 = 8 and SF_CONT(k), used in SLOOP 2.7 to keep individual notes alive when recording a new note over held notes.
- web/preview-worklet.js passes step flags in the 12-byte transfer to the WASM host.
- firmware/host/preview.c::preview_step() applies **s->flags &= 3u**, truncating all SF_CONT flags.

Consequence: a project can store continuation flags but browser audio can ignore them, so note overlaps/long chords may not match original SLOOP. The current browser native/WASM parity tests can still pass without fixtures using these flags.

Proposed isolated follow-up:
1. Create a native SLOOP fixture of a sustained chord with an overdubbed note using SF_CONT.
2. Reproduce in preview WASM and compare timing/audible continuity.
3. Review and fix the bridge's flag mask without altering the original firmware sequencer.
4. Add regression fixture for roundtrip + mixed NOTE/TIE/REST, lock and nudge. **Only after this** approve sustained-note gestures in Piano Roll.

## 6. Work gates and sequencing

**Phase A — inventory, without UI code:** registry extractor design, full baseline audit, preset reconciliation, bridge coverage matrix, proven P0s and comprehensive prioritized backlog. No UI additions until gaps are classified.

**Phase B — editing engine and equivalence:** pure canonical step command contract; undo/redo; mode switching; mobile/desktop interaction smoke tests. Fix any bridge-only P0 in a separate reviewed PR.

**Phase C — sound exposure:** metadata-driven Advanced panel that covers *every BRIDGED supported parameter*, with engine-specific quick views. Tests generated for all descriptor IDs, not only the handful selected for the design.

**Phase D — song, LIVE, sample and MIDI scope:** each needs an explicit acceptance contract and bridge/persistence design; do not equate product descriptions with implemented controls.

CI invariants proposed:
- Descriptor version/hash recorded with source commit. New/removed param or changed enum/range blocks deployment until reconciled.
- No UI save/load drops native data, including steps beyond LEN, micro/fill/locks, FM6 and future supported user banks.
- Each BRIDGED field has an editable route or a documented temporarily deferred exception with an owner.
- Native vs WASM audio tests include special step flags, note/chord ties, drum ratchets, all engines and common FX.
- User scenarios on phone width ~390 CSS px and desktop: length 1/16/17/32/64, note entry in both modes, mode-switch identity, auto-advance and Undo.

## 7. Priority and product impact

**P0 — prevent misleading behaviour/data loss:** 2.7 continuation flags in preview host; any destructive note-slot/ratchet reordering; missing roundtrip for future custom banks; modal edits that mutate before confirmation.

**P1 — make BRKLOOP enjoyable:** equal STEP/ROLL editor input, Undo/Redo, actual full feature descriptor inventory, consistent all-engine presets, sound preview and accessible Advanced controls.

**P2 — expand composition:** native-compatible sections/song, sample assets, device MIDI bridge, advanced LIVE performance and render/export.

This is a design registry and review plan; no claim that every functionality is already implemented.
