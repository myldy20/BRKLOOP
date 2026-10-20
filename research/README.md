# BRKLOOP research: native SLOOP parity and shared editing

**Status:** isolated research/prototyping branch. Neither app.js nor any firmware/host/preview code is changed. Do **not** merge before reviewing the findings and the accepted hybrid editor RFC #4.

## Source-level findings (verify the generated CI report)

- Native SLOOP 2.7 factory trim table \`firmware/src/preset_trim.h\` has **153 names for 12 compiled engine families**, plus four entries for the experimental, disabled \`FELUCCA_SLICE\` engine. The current \`web/editor.html\` mock only exposes **115 names**, used by \`tools/build_brkloop_bank.mjs\`. Hence the BRKLOOP web catalog is missing **38 factory sound selections** relative to the native firmware. This does *not* by itself prove all native patch states are available to the browser, nor does it justify fabricating missing presets.
- The mock exposes 63 common track descriptors, 47 global descriptors and eight engine descriptors in each of 12 engines; the audit program interrogates these through the same mock editor command protocol as the production bank builder and exports raw metadata to \`dist/audit/sloop-capabilities.json\`.
- \`web/preview-worklet.js\` sends note flags, but \`firmware/host/preview.c::preview_step()\` masks them with \`&=3u\`, losing SLOOP 2.7's \`SF_CONT0..3\` note-continuation flags. **The browser cannot be claimed equivalent for overlapping sustained polyphonic notes until a native/WASM behaviour fixture passes.** Existing general engine sample-parity tests do not prove this corner.
- The original binary preview host and sequencer were left untouched. No browser runtime fix was silently slipped into an audit.

## Prototype in research/

\`research/shared-edit-commands.mjs\` is a pure JavaScript **experiment**, not a shipping module. It tries out one command vocabulary for equal Step Write/Piano Roll frontends:

- Write one note, write 1–4-note chord, add/remove notes preserving per-note level/ratchet and continuation identity.
- Erase as native REST with preserved note/expression values.
- Drum per-lane toggle and level/ratchet; shared per-step micro and fill; native locks (24/track).
- LEN 1–64 with non-destructive shortening, DIV and pitch/velocity/gate.
- Shared Undo/Redo, bounded history, UI view switch/selection kept outside project snapshots.

The tests operate on \`previewSnapshot(makeMockDevice())\`, not an invented new MIDI clip model. Note: it is a *research* model; native lock eligibility, expanded sound param ranges, real timing, mouse gestures, performance, memory bounds and browser audio still need audit and tests before release.

## How to reproduce

From this branch, with Node 22+:
 
    node tools/audit_brkloop_parity.mjs
    node tests/shared_edit_commands_test.mjs

The first writes \`dist/audit/sloop-capabilities.json\` and \`dist/audit/summary.md\`. The GitHub Actions PR build uploads the report artifact and still runs native/WASM audio parity, browser interaction checks and the original build.

## Next slices

1. Compare missing native sound names **per engine** against the mock, source patches, and the WASM source building process. Do not fix by renaming 115 selections as 153.
2. Isolate and correct browser continuation flags in a separate test-backed PR, with real native vs WASM continuous note audio fixtures; preserve accent/slide/reserved bits.
3. Design a parameter map with NATIVE/SERIALIZED/BRIDGED/AUDIBLE/EDITABLE statuses. Descriptor existence alone must not count as DSP proof.
4. Validate common Step/Roll commands in a one-track interaction prototype on Pixel and desktop, then review/approve before importing the research code into the actual app.
5. Finalize RFC #4 and gain licence/provenance approval for any direct code moved from proprietary BRKTRK.

**Not in scope:** opening the BRKTRK repository, changing BRKTRK licence, replacing SLOOP DSP, switching to 8 tracks, or creating a second sequencer and clock.
