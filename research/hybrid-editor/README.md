# BRKLOOP equal STEP / ROLL — isolated interaction prototype

Status: research-only. Follows UX RFC #4 and the native SLOOP command contract in draft PR #5. The published app is unchanged.

## How it works

- Both STEP and ROLL change the exact same canonical 64-step SLOOP state. Neither editor converts to a second clip/track format.
- Four SLOOP tracks, each with independent 1–64 LEN and DIV. Synth tracks contain up to four notes/step; drums use native 16-lane hit masks.
- STEP tap selects (safe). Playing the proper C–C onscreen piano writes that note immediately; optional AUTO advances the cursor.
- ROLL displays 24 MIDI pitches vertically and 1..LEN steps horizontally. Select, Draw and Erase tools are explicit; vertical pitch/horizontal time scroll without paginated 8-step navigation.
- CHORD stages 1–4 notes and commits one atomic history event. Undo/Redo applies to all editor operations, regardless of which mode created them.
- REST and TIE map to native NOTE/TIE/REST semantics. SLOOP's individual note continuation across steps needs the separate, test-backed browser bridge PR #6.
- The Play/Stop buttons use the original SLOOP WASM AudioWorklet through web/preview.js, not new oscillators.

## How to try it without changing production

1. Open the GitHub Actions run for draft PR #8 and download artifact **brkloop-hybrid-standalone-preview**.
2. Extract the ZIP anywhere, open a terminal in the extracted directory and run `python3 -m http.server 8766`.
3. In a browser, visit `http://localhost:8766/research/hybrid-editor/`.
4. Choose an empty step, tap C3 on the keyboard, switch to ROLL, draw E3 on step two, then Undo and Redo. Change LEN 64 and try step 64.

CI captures 390px-phone and 1440px-desktop screenshots and checks identical behaviour. Physical Android/Pixel feel has NOT been validated.

## Known gaps (deliberate, before integrating into main)

- No durable project persistence yet; refresh resets the research pattern (no interference with your existing BRKLOOP localStorage).
- No production-quality live recording, free note-tail resizing, drag operations, keyboard-shortcut mapping, waveform, Song or scenes.
- STEP has 8 columns per visible row; ROLL uses 38px time columns and horizontal scroll. These are **hypotheses** to test with actual fingers before final pixel layout.
- Drum pad audition and a semantic parameter-lock inspector are not implemented. All SLOOP parameters still need their proper registry/Advanced Sound editor.
- Original 115-sound bank and SF_CONT workaround continue to be used by the published app; independent PRs #6/#7 address the upgrade candidates.
- Testing real audio on browsers limited to 48 kHz may fail because SLOOP's current preview requires a 44.1-kHz context.

**Do not merge this demo into the production UI without a dedicated UX acceptance round and full browser/data compatibility gates.**
