# BRKLOOP — adaptive workspace and STEP / ROLL wireframe contract

**Status:** layout proposal only (2026-10-20). Complements [the hybrid editor spec](BRKLOOP_HYBRID_EDITOR_SPEC.md). These are indicative content layouts, **not rendered screenshots and not CSS dimensions to hard-code**. No application code changes.

## 1. Shared navigation

Keep four track chips reachable on mobile and a stable left rail on desktop:
- BASS / CHORDS / LEAD / DRUMS are **initial track labels**, not fixed roles or different SLOOP engines. Rename later; all synth slots accept the 12 SLOOP engines.
- Main destinations: **PATTERN**, **SOUND**, **MIX**, future **SONG** (disabled/clearly marked until browser Song support is real).
- PATTERN always has a same-level **STEP | ROLL** toggle. Remember mode per track; don't change it when opening Sound/Mix or during playback.
- Master Play/Stop, tempo, audio readiness, dirty state and Undo/Redo have stable locations and accessible labels.
- Desktop uses a fixed panel frame; phone uses one main editing canvas, not nested page stacks.

## 2. Mobile portrait composition (~390 CSS px)

```text
┌─────────────────────────────────┐
│ BRKLOOP       ● READY     ↶ ↷  │  fixed/compact status
│ ▶/Ⅱ  ■    BPM 120        MIX  │  transport is always reachable
├─────────────────────────────────┤
│ [01] [02] [03] [04]            │  choose independent SLOOP track
│ [PATTERN] [SOUND] [MIX] [SONG] │  destinations; SONG later
├─────────────────────────────────┤
│ [  STEP  ][  ROLL  ]           │  equal editor modes, one tap
│ LEN [16]   DIV [1/16]  ⋯     │  musical boundaries, not pages
│ [SELECT] [DRAW] [ERASE] [EDIT] │  mode-aware tools
│                               │
│      EDITOR CANVAS            │  scrolls without moving transport
│  (see STEP/ROLL examples)     │
│                               │
├─────────────────────────────────┤
│ AUTO [off]  CHORD [off]        │  shown when writing notes
│ OCT [−]     C3—C4      [+]    │  real C-based piano
│  ♫  playable keyboard         │  sticky or collapsible
└─────────────────────────────────┘
        DETAILS drawer ↑          35–45% view, dismissible
```

**STEP** for synth: group 1–16 is two rows of eight independently tappable cells, labels at each step. Additional 16-step groups are revealed by **continuous vertical scrolling** for LEN up to 64. This is layout grouping, never musical bar ownership. Selecting step 05 and touching E3 writes E3 there immediately; optional Auto Advance moves to step 06. Playing transport never steals selection.

**ROLL** for synth: note names on the vertical axis (one-octave initial window), horizontal axis steps in chronological order (8–12 visible depending on actual tap target). Time scrolls **horizontally** all the way to LEN 64 with no pagination. Pitch scrolls vertically, pinch-to-zoom may be introduced only when it cannot trigger edits. Visible notes reflect up to 4 pitches per native step. Native NOTE/TIE/REST and continuation rules are truth; arbitrary MIDI note durations are not silently approximated.

**DRUM STEP**: selected drum sound/pad has a 1–64-step write strip with fast level/ratchet shortcuts; groups of 16 (two × eight) keep large touch targets. Drum sound selection stays visible via compact row/slot selector.

**DRUM ROLL**: all 16 drum lanes vertically, time horizontally, pinned lane labels. Level appears as a shade; ratchet as a small count/mark. Microtiming and fill edit the **whole step column**, not an isolated hit, consistent with SLOOP.

Phone interaction:
- Tap existing cell/note selects; tap empty in DRAW/WRITE inserts; **ERASE is explicit** (long press an optional shortcut only).
- During normal canvas scroll, no note is created. Only gestures associated with the active draw tool can write.
- Persistent 128-note drop-downs and the button `SET STEP NOTE` are not part of the primary UX.
- Details drawer hosts advanced velocity, per-note ratchet/level, accent/slide, nudge, fill, lock editor, tie/rest. One note/chord change should never rewrite unrelated fields.
- Keyboard is playable even without an armed step: **audition only**, no project edit until selection or WRITE arm. Chord mode stages 1–4 notes with explicit Done and Cancel.
- When onscreen keyboard would cover too much canvas, user can collapse it to a narrow action strip without losing access to it.

## 3. Desktop layout (~1440 CSS px)

```text
┌──────────────────────────────────────────────────────────────────────┐
│ BRKLOOP  ▶/Ⅱ  ■  BPM 120  ∿ SWING   ↶ ↷    STATUS  SAVE / EXPORT      │
├───────────┬────────────────────────────────────┬─────────────────────┤
│ TRACKS    │ PATTERN   SOUND   MIX   SONG        │ CONTEXT / DETAILS   │
│           │ [ STEP ][ ROLL ] LEN [16] DIV[..]  │ Selected step /     │
│ 01 BASS   │                                    │ note / chord / lock │
│ 02 CHORDS │  EDITOR CANVAS                     │                     │
│ 03 LEAD   │  (mode-specific, full height)      │ [tabbed expression] │
│ 04 DRUMS  │                                    │                     │
│           │                                    │                     │
├───────────┴────────────────────────────────────┴─────────────────────┤
│ [AUTO] [CHORD]  [OCT−]       C—C piano / QWERTY       [OCT+]          │
└──────────────────────────────────────────────────────────────────────┘
```

- Track rail, central workspace and inspector **never jump between screen sides** when selecting Sound/Mix or Step/Roll.
- Right context panel is collapsible; canvas expands to fill the saved space. Piano sits at bottom, optionally hidden for expert users who type notes.
- In ROLL mode: horizontal pitch/time editor; in STEP mode: compact 16-step section tiles, vertical group stacking and contextual single-step editing.
- Desktop shortcuts are convenience; touch can still perform every action.

## 4. Geometry and accessibility targets

- Test 360×800, 390×844 mobile portrait; 768px tablet; 1280/1440 desktop. Adapt to actual viewport height, soft keyboard and OS safe insets.
- Recommended primary touch targets ~44 CSS px or larger where possible; do not squeeze 16 note-cell columns into one narrow phone row. Allow scrolling rather than microscopic hit targets.
- One dominant canvas scroll container. Fixed/sticky controls should never overlap the last note/lane or inspector.
- Sound editing uses expandable groups with an **All Parameters** view backed by SLOOP descriptors, not permanent endless grids of naked numeric inputs.
- Colours help identify tracks, but playback, selection, mute and edit modes remain distinguishable by labels, outlines, and text.
- With selected note, changing STEP↔ROLL preserves musical focus; undo/redo history, notes and transport stay intact.

## 5. State rules and quality scenarios

| Situation | UX contract |
| --- | --- |
| Edit bass step 64, switch to ROLL | Selected step 64 and its pitch remain visible, pattern unchanged |
| Change LEN 64→16→64 | Hidden step data and expression restored unchanged |
| Select SOUND then return PATTERN | Same track, mode, selected musical step and scroll position |
| During playing, open DETAILS | No stop/start, no new sound engine loading |
| CHORD C/E/G then commit | One native 3-note step; single Undo restores previous step |
| Copy 8 steps in STEP → paste in ROLL | Exactly one project mutation, expression and lock policy explicit |
| Scroll drum lanes/timeline on phone | No accidental hit creation; pinned drum names readable |
| Phone screen width changes | No clipped first step, phantom pseudo-element stripes or hidden keyboard keys |

## 6. Open UI decisions to validate in a design review

1. Mobile Roll initial view: 8 notes/steps width vs 10–12 smaller columns; tune with real Pixel touch tests.
2. Keyboard Auto Advance default (OFF proposed, clearly accessible); chord commit remains explicit.
3. Where to expose selected drum lane in STEP so all 16 sounds are a single action away without taking the whole canvas.
4. Whether phone keyboard remains always docked or collapses automatically while scrolling; ensure no focus/scroll surprises.

This document is intentionally independent of SLOOP DSP changes and existing BRKLOOP `index.html`, `app.js`, `styles.css`.
