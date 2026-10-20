# BRKLOOP — Hybrid Pattern Editor interaction specification

**Status:** RFC / design-only. Approved product decision 2026-10-20: **Step Write and Piano Roll are peers**, not primary/secondary modes. No production code changes here. Proposed interaction details require user validation before implementation.

## 1. North star and non-negotiables

- One native SLOOP musical model, one canonical project state, two equal editors; no second JS sequencer or MIDI clip format.
- Toggle **STEP / ROLL** in the same Pattern workspace. This must be available on both mobile and desktop, independent of the selected track.
- Both can insert, select, transpose, delete, adjust velocity, gate/tie/rest, nudge, fill and parameter locks; each may use different interaction density.
- 1–64 steps **per track**, with per-track DIV and polyphonic notes (up to 4 per synth step), 16 drum lanes.
- Switching modes must not start/stop audio, reset selection or modify the song; no accidental edits from viewport gestures.
- Canonical SLOOP step state is the source of truth. View state (mode, zoom, pan, octave, selection, opened drawer) is UI-only, never a substitute for SLOOP steps.

## 2. Shared screen grammar

Phone portrait, conceptual hierarchy (not pixel-perfect):
- Compact transport: Play/Stop, tempo, record status, output level.
- Four always-visible track chips: colour / sound / mute. Selected track accent.
- Pattern header: **STEP | ROLL** segmented toggle (equal width/visual priority), track length, DIV, editor tool.
- Main editor canvas: Step rows or Piano Roll, independently scrollable within the available height.
- Sticky bottom strip: C-based playable keyboard for synth, 16 pads/lane selector for drums; octave controls. Collapsible when more pattern space is needed.
- One **Details** action opens a bottom sheet (max ~45% viewport, its own scroll); closes without leaving Pattern. Undo/Redo and Erase are directly accessible.
- Sound/Mix/Song remain workspace-level navigation; no repeated track selector in each panel.

Desktop:
- Permanent track strip on the left, central STEP/ROLL canvas, right context inspector (collapsible), compact keyboard at the bottom or via QWERTY. Same actions/data as mobile.
- Panel positions remain stable when moving between Sound, Mix and Pattern; no off-screen side shifts.
- Keyboard/mouse shortcuts enhance the flow, never unlock otherwise unavailable actions.

Important: Pattern length controls musical playback length, **not** the number of steps stored. Shortening 64 to 16 and extending back restores steps 17–64 intact.

## 3. Shared interaction and navigation state

Canonical state (from SLOOP):
- Tracks 0–2: per-track parameter array, 64 synth steps with up to 4 note slots, ST_NOTE / ST_TIE / ST_REST, flags, velocity, per-note 2-bit level and ratchet.
- Track 3: 64 drum steps × 16 hit lanes, 2-bit level and ratchet per lane.
- Per track: micro[64] from −32 to +31, fill packed as 16 bytes, parameter locks capped at 24; LEN and DIV within native parameter array.

Ephemeral editor state:
- selectedTrack, selectedStep, selectedPitch/notes, selectedDrumLane, mode (step or roll), editTool, keyboardOctave, rollPitchRange, zoom, viewportAnchor, autoAdvance, openInspector.
- Mode can be remembered **per track** so changing from drums to bass returns to the last-used bass editor, but manual STEP/ROLL toggle is always visible.

Mapping invariant: mode switch uses selectedStep and pitch range to bring the same musical event into view, not raw scroll pixels. A note entered in STEP must immediately appear in ROLL and vice versa. Undo history shared between modes.

## 4. STEP mode (event-oriented / write notes quickly)

**Normal tool = SELECT/WRITE**:
1. Tap a step: select it and highlight it. Existing data is **not** erased; empty step remains empty until entry.
2. Tap a piano key with a step selected: write/replace note at that step immediately and audition it. No modal or “Set Step Note” confirmation.
3. Tap another piano key: replace pitch on the same step unless Auto Advance is enabled. Auto Advance, when enabled, moves to next step after a committed note, wrapping at current LEN. Visible ON/OFF state; default OFF until preference is established.
4. Long press step OR tap “DETAILS” to access expression; no hidden mandatory gesture. Tap Erase to clear a selected event; Undo remains one action away.
5. Optional STAMP tool: choose a pitch/chord first, then one tap per step writes it. Visually distinct from Select/Write so selecting a step never accidentally creates a note.

**CHORD entry**:
- Press CHORD (same availability in STEP/ROLL). Open a 1–4-note staging buffer; tap piano keys to toggle pitches; show count and selected note chips; press DONE to commit **one atomic transaction**, then (if enabled) auto-advance **once**.
- If editing an existing chord, start staging from its existing notes (not a blank implicit overwrite). Cancel never alters canonical state.
- If 4 notes are present, the 5th must show an explicit “4 notes maximum” response and leave the step unchanged. No silent eviction or replacement.
- Per-note level/ratchet slot alignment and flags must be preserved when replacing/reordering notes. This needs dedicated adapter tests.

**Drum STEP**:
- Select one of 16 sounds/pads; tapping a step writes a hit at that lane; tapping it again selects rather than deletes (Erase tool is explicit). Clear, velocity-level, ratchet and micro controls are available without changing modes.
- Drum step micro/fill is **column-wide**, not per lane (the SLOOP data model). UI must say “Whole step” for those two controls.

**Editing during PLAY:** no transport reset, selection and writes remain immediate; highlight actual per-track playhead from DSP.

## 5. ROLL mode (pitch-oriented / same native steps)

For synth tracks:
- Horizontal axis = step index 1..LEN (not seconds). Tick positions reflect DIV, swing is playback, not a second visual timeline.
- Vertical axis = MIDI pitch with labelled C/octaves and alternating semitone bands. Scroll pitch range independently from timeline, and zoom without altering notes.
- Draw tool: tap empty (step, pitch) inserts that pitch into one of 4 note slots at that step (ST_NOTE). Tap occupied selects it, does not delete. Erase tool explicitly removes.
- One step may contain **up to four simultaneous notes**, shown as separate rectangles in one time column. Adding a 5th must fail visibly without data loss.
- At initial MVP, note rectangles occupy one grid column; a continuation across steps is represented using **native TIE/continuation flags**, not fictitious arbitrary-duration MIDI notes. No freely resizable independent note tails until browser DSP supports SLOOP 2.7 polyphonic continuations.
- A step-level TIE should be visible as a connected segment and editable as such. A REST breaks the connection. Labels must distinguish NOTE/TIE/REST from mere missing notes.
- Step inspector supports note slots, velocity, gate, accent/slide, per-note ratchet/level, micro, fill and parameter locks as native fields become available.
- Roll's cursor/selected step always maps 1:1 to STEP selection.

For drums:
- ROLL becomes a **drum lane grid**: 16 vertically pinned sound rows × horizontally scrolling time. Visual strength shows hit level, small marks show ratchets; tapping edits exact (lane, step).
- STEP remains lane-first with rapid writing for the selected drum sound. Both modes continue to show every lane, no functionality sacrificed.

**Touch gestures policy**:
- Scroll canvas with swipe / two-axis scrolling. No gesture may write notes while ordinary navigation occurs.
- MVP uses explicit SELECT / DRAW / ERASE tools to remove ambiguity. Drag to move/lengthen notes is deferred until undo + pointer capture + scroll conflict tests pass.
- Hardware keyboard shortcuts can be added, but are not required for any operation.
- Navigation remains possible when LEN=64 on a narrow phone without tiny 16-column hit targets.

## 6. Shared command model (design, not implementation)

Commands must operate on canonical steps, not on view widgets:
- select(track, step, optionalPitchOrLane)
- addNote, replaceNote, removeNote, writeChord
- setGate(NOTE/TIE/REST), setVelocity, setAccent, setSlide
- setMicro, setFill, setRatchet/level (per note slot or drum lane), setParamLock, removeParamLock
- setLength, setDivision, editDrumHit, eraseStep
- undo, redo; undo groups chord commit and pointer interactions into one transaction.

Command rules:
- All edits validate index, legal value, 4-voice cap, 24-lock cap and lockability of the parameter **before mutation**.
- Writes preserve unrelated step properties including packed per-note values and fills. Don't reset locks or micro merely by changing one pitch.
- Erase step deliberately clears related micro/locks/fill only if specified by user (offer “Clear note” versus “Reset entire step”).
- Repeatedly switching STEP↔ROLL must be idempotent: editing in either view never serializes/reimports a different schema.
- Browser project data format stays BRKLOOP_PROJECT_V1 for this scope; new UI preferences stored separately.
- Auto Advance is a cursor-only command, not a transport or pattern edit.

## 7. Red flags from fresh SLOOP source audit

**P0 browser parity blocker**: original firmware supports SF_CONT0 = 8, SF_CONT(k) and SF_CONT_ALL (2.7 held polyphonic note continuation). In firmware/host/preview.c, preview_step currently applies s->flags &= 3u; this strips continuation flags sent by web/preview-worklet.js. Browser projects may *store* flags correctly while playing them incorrectly. Do not claim accurate sustained-note playback, arbitrary note durations or full 2.7 polyphonic parity until native-vs-WASM tests cover it and an isolated bridge fix is separately reviewed.

Other important distinctions:
- No independent per-note gate durations in the old step model. ROLL UI must respect how TIE and SF_CONT are defined by SLOOP.
- The 24 parameter locks are per **track**, not 24 per step. Creating/editing locks needs full validation and playback tests.
- FM6 internal operator envelopes are special; do not show generic ADSR as if it changes FM6's internal amp envelope.
- Sections, Song, LIVE effects and device flash banks are not automatically part of the browser preview state. A visually complete screen does not guarantee the browser can execute it.

## 8. Minimum acceptance scripts (before rollout)

| Test | Phone and desktop expected result |
| --- | --- |
| Start → STEP → select #1 → press C3 | Step 1 holds C3, audible preview, no modal |
| STEP, Auto Advance ON, press C3 E3 G3 | Three successive steps written; exactly one step per press |
| Select step #4, CHORD C3+E3+G3 → Done | One polyphonic step, 3 notes, 1 Undo transaction |
| Switch STEP → ROLL → STEP ten times | All pitches, expression, selected cursor and undo state unchanged |
| ROLL draw 4 notes in step #17 then 5th | Fifth rejected visibly; first four and per-note values unchanged |
| ROLL scroll to #64, switch STEP | The same step remains selected and in view |
| Change LEN 64 → 16 → 64 | Steps #17..#64, locks, fills and micro unchanged |
| Drum edit lane 13 / step 32, change view | Exact hit, level and ratchet retained |
| Change a pitch on a locked/microtimed step | Unrelated parameter locks, micro, fill and accent remain |
| NOTE → TIE → REST with chord | Timing and continuation match SLOOP native output (blocked until flag fix) |
| Reload browser + JSON roundtrip | Same native pattern, sound and expression; UI defaults can be restored |
| Running playback + UI change | No transport restart, hanging note or spurious engine reload |

Quality checks:
- On Pixel-sized portrait: main tool switching is one tap; entering eight consecutive notes requires eight key taps after selecting the first step (Auto Advance ON); primary UI needs no 128-item note dropdown.
- Both modes work with touch and mouse. When available, verify gestures against Android Chrome, macOS desktop Chrome, and small viewport.
- No unverified visual roll drag handles; no regressions to original firmware/editor or WASM DSP parity.

## 9. Decisions still requiring product review

1. Auto Advance default: OFF (safe) or ON (tracker-inspired). Proposed OFF with a highly visible toggle.
2. ROLL on phones: starting viewport 8 steps × 12 semitones or 12 steps × 12 semitones. Adapt to physical tap target (~40 CSS px), not arbitrary fitting.
3. Chord commit policy: explicit DONE versus commit-on-release for multitouch. Proposed explicit DONE to preserve atomic undo.
4. Drum default tap: Select vs Stamp. Proposed Select mode initially, with obvious Paint mode for one-tap hit entry.

No working application files are altered by this document.
