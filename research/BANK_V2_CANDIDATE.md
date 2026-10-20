# Native SLOOP factory bank V2 — isolated release candidate

Status: research only. Built atop draft PR #5. No changes to shipping app, published bank, firmware or Pages.

## Build and source of truth

- Compile original SLOOP firmware C engine tables through research/native_factory_dump.c: exactly 153 factory sounds in twelve engines.
- tools/build_native_bank_v2_candidate.mjs generates dist/audit/bank-v2-candidate.json, preserving original factory parameters, engine controls, kit/sequence metadata and native preset indexes.
- FM6 has separate packed operator patches. We preserve existing eight factory FM6 patches matched by exact name; generic ADSR must never overwrite them.
- Explicit legacy index mapping records the 30 V1 selections whose native positions have changed.

## Audio qualification

- All 153 native presets must play a finite, bounded, non-silent signal on at least one appropriate MIDI note with real WASM FirmwareAudio.
- The SAMPLE preset GM KIT is a GM keymap: C4 (60) has no sound; MIDI note 36 plays the kick. The test checks drum keys to avoid a false-negative.
- All 115 existing V1 presets must sound identical before and after name-based index migration (maximum sample delta 1/32768). Keep exact saved sound parameter arrays and FM6 packed patch intact.
- All existing native/WASM and browser layout regressions remain enabled.

## Explicit project V2 candidate envelope

- research/v2-project-migration.mjs takes a BRKLOOP_PROJECT_V1 document and produces BRKLOOP_PROJECT_V2_CANDIDATE with native bank identity.
- Preserves everything in the original SLOOP snapshot except selection index: 64 steps, per-note expression, micro, fills, locks, all p[] values, drum lanes, FM6.
- Remaps each known legacy factory selection by (engine, exact name); unknown custom indices are left alone and reported.
- Idempotent by version marker. Never reinterprets a native index a second time. Unknown formats fail closed.
- tests/v2_project_migration_test.mjs validates all 115 legacy sound choices and repeat reopens.

## Release blockers

- This is NOT plugged into running app.js; the production app only accepts old V1 projects and V1 bank.
- A production-grade V2 bank and project version decision, backup/rollback, and end-to-end browser import/export tests remain required.
- The full SLOOP Sound parameter UI and user sample banks remain separate gaps.
- Polyphonic continuation is fixed in independent draft PR #6, not this bank candidate.

CI uploads dist/audit/bank-v2-candidate.json and dist/audit/bank-v2-qualification.json as an artifact. Do not deploy this experiment until release gates pass.
