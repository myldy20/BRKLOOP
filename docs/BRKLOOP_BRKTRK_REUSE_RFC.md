# BRKLOOP × BRKTRK — reuse opportunities and boundaries

**Status:** research and architecture proposal, 2026-10-20. No BRKTRK, SLOOP, BRKLOOP application code or licensing has been changed. This is a strategic shortlist, **not an implementation checklist**.

## Direction

The product is **BRKLOOP with SLOOP's original DSP and sequencing semantics**. BRKTRK provides proven interaction/product patterns, selected portable domain logic and future composing ideas. Do not import the BRKTRK architecture as a second sequencer, host or engine ecosystem.

Evidence reviewed in the *private* BRKTRK repository (main at `b09a6f78`, 2026-10-20 audit; private repo may advance): product north star/roadmap/architecture, current source modules for history, selection, row operations, durable projects, sampler assets, phrase conditions, ParameterEvents and two-slot FX. Also compared with BRKLOOP/SLOOP native step/param/preview capability documents. Only high-level findings are recorded here; **no proprietary implementation is copied into this public repository**.

## Candidates, value and feasibility

Legend: **READY** = functioning BRKTRK code/domain behaviour verified at source level, but adaptation not yet tested; **PARTIAL** = working data/UI subset but end-to-end semantics unfinished; **PLANNED** = roadmap/research concept, not shipping. All “reuse” proposals are subject to SLOOP semantics and licensing checks.

| Priority | Candidate from BRKTRK | Source maturity | How to use it in BRKLOOP | Decision / gate |
| --- | --- | --- | --- | --- |
| **P0** | Undo/Redo and transaction coalescing | READY: bounded project history and continuous-gesture semantics | Design inspiration + possible narrow adaptation of pure journal logic to native 64-step state. STEP and ROLL share one history. | Must include chord atomic commit, parameter lock undo, redo invalidation and no audio/transport snapshots. Don't copy the coupled BRKTRK ProjectStore installer. |
| **P0** | Selection, rectangular ranges, copy/paste, duplicate/clear/insert | READY: domain and controller, built for Song/Chain/Phrase | Translate semantics into (track, step, optional pitch/lane) regions; non-destructive copy, paste, shift and transpose. | Current code assumes BRKTRK 16-row Phrase/8-track grids and field schema; **redesign native adapters**, preserve SLOOP 64 steps / 4 tracks / per-step ratchets/locks/micro/fill. |
| **P0** | Durable project files, migration, recovery journal and dirty-state correctness | READY: versioned codec, recovery and browser file-session safety | Copy requirements and tests, selectively adapt isolated validation/security utilities; strengthen BRKLOOP JSON save/autosave and crash recovery. | Avoid reusing `.brktrk` schema; SLOOP state, bank blobs and BRKLOOP projects remain distinct. A download click is **not** proof of durable save. |
| **P0/P1** | Common semantic input commands and focus/playhead separation | READY as BRKTRK interaction architecture; implementation is app-coupled | Shared command layer for touch, keyboard, mouse, Step Write and Piano Roll. Selection ≠ playback; stable panel placement. | One command model; never import BRKTRK host clock/transport. Respect phone-native touch. |
| **P1** | Typed, context-sensitive value editing (Value Dock) | READY but coupled to BRKTRK field schema | Reuse design of inline numeric/enum/value controls, fine/coarse adjustment, context inspector and validation. | Generate BRKLOOP controls from SLOOP parameter registry; do not import hex or BRKTRK-specific field tables. |
| **P1/P2** | WAV import, PCM validation, content-addressed assets, IndexedDB store | READY: sampler vertical slice and file verification | Selectively reuse pure WAV/asset hashing and caching logic for later SLOOP user samples, kits, offline projects. | SLOOP expects its own constrained sample representation/slots; explicit conversion/transcoding and 44.1k runtime/memory tests required. Don't attach BRKTRK sampler package to SLOOP. |
| **P1/P2** | Phrase conditions: probability/every/offset | READY: stored + deterministic runtime in BRKTRK | Candidate for *future* per-step conditional playback/generative variation beyond native SLOOP fill. | **Extension**, not SLOOP parity. Must be owned by SLOOP's clock and have an opt-in versioned schema; no JavaScript second scheduler. |
| **P1** | ParameterEvent validation and durable target identity | PARTIAL: bounded event storage and validation established; eventual runtime parameter locks were planned | Reuse validation/UX principles for SLOOP's **already-native** 24 locks per track (plus step inspector/automation). | Don't import BRKTRK `instrumentId + parameterId` or `max8/row` as SLOOP lock representation. Use native lock schema/lockability and actual DSP consumer. |
| **P2** | Portable engine parameter descriptors, safety and tests | READY as engineering practice, but production host is separate | Apply metadata checks and automated parameter coverage gates in BRKLOOP Advanced Sound. | SLOOP already contains **12 engines** with a working host. No engine-loader or ABI duplicate. |
| **P2** | Song→Chain→Phrase reuse, Make Unique, shared objects | PARTIAL: working structure; some explicit unique/repoint behaviour deferred | Future *composition patterns/section variation* workflow, possibly snapshots and reuse of SLOOP A–D sections. | Preserve SLOOP's own A–D/song semantics first. Don't graft its entire object graph or 8-track hierarchy into BRKLOOP. |
| **P2** | Stage/performance morph, macros, controller ideas | PLANNED / research-level BRKTRK feature | Later compact Performance view / morph controls | First survey SLOOP's existing LIVE/scene/morph features, avoid second parallel scene system. |
| **P3** | Compound tracker FX, event tables, generative modulation | Mixed: selected FX primitives implemented, broader Tables/Modulation planned | Design ideas for optional advanced sequencing/expression | SLOOP already has ratchets, filter, LFO, ARP, FX. Validate new musical value before adding schema and real-time complexity. |
| **P3** | Two serial track insert FX slots (saturation, crusher, chorus, phaser) | READY in BRKTRK | A future selective DSP effect extension only if a *specific* sound is absent in SLOOP | Do **not** transplant the BRKTRK FX graph. SLOOP already has insert/chorus/drive/filter sends and limited CPU budget. |
| **NOT NOW** | BRKTRK engine registry, exact package/ABI, generic audio host and independent event-clock pipeline | READY/complex | **Do not carry over.** | Would compete with the functioning SLOOP firmware DSP/AudioWorklet and multiply lifecycle complexity. |
| **NOT NOW** | Eight audio/structural tracks and `.brktrk` file format | READY in their original product | **Do not carry over.** | Native SLOOP is 3 synth + 1 drum track. Changing the audio engine is a separate future fork-level decision. |
| **NOT NOW** | M8 importer, fixed Phrase FX grammar, full tracker hierarchy | Mostly BRKTRK product-specific | No direct carry-over | Avoid turning the groovebox into a second tracker rewrite. |

## Technical reuse tiers

**Tier 1 — idea and tested behaviour (preferred):** Undo groups, selection shapes, gestures, durable saving, error reporting, typed parameter UX. Reimplement compactly against SLOOP's native model.

**Tier 2 — small, pure and generic functions (candidate):** WAV parser, hash/asset validation, selected value normalization and security/resource-bound checks. Reuse after independence, licensing and regression tests are demonstrated.

**Tier 3 — deeply coupled modules (avoid):** BRKTRK Undo installer, selection UI/controller, project schema/store, external engine package loader, Worklet and FX runtime. Good references, poor drop-in modules.

Source distinction is important: a functioning BRKTRK feature is **not** automatically a reusable component for BRKLOOP, and a BRKTRK roadmap feature is not shipped code.

## Proposed dependency roadmap

1. **Now, design-only:** approve STEP/ROLL layout/gestures; finish SLOOP descriptor inventory and browser preview gap audit; preserve upstream semantics.
2. **First implementation slice:** canonical SLOOP edit commands + undo/redo inspired by BRKTRK; one shared selection and history for Step Write and Piano Roll.
3. **Next:** bounded range select/copy/paste/transpose/duplicate; regression for 1–64 lengths, ratchets, step fill, micro, native locks, chord continuation.
4. **In parallel after edit safety:** harden save/recovery from BRKTRK patterns; introduce versioned asset storage only when importing actual user samples.
5. **Sound/composition growth:** all original SLOOP controls, proper native parameter locks, native-compatible A–D sections/song and LIVE. Then evaluate BRKTRK-style conditions, Stage, reusable structures and new FX **one capability at a time**.

For each candidate: `source → semantic mapping → engine capability → dependency cost → adapted code provenance/license → test evidence → decision`. Reject any extension that requires a second transport authority or silent approximation of SLOOP native behavior.

## Licensing and release boundary

**BRKTRK is currently private and proprietary**; BRKLOOP inherits SLOOP's **GPL-3.0-only** terms. Product ownership does not automatically mean every embedded dependency/asset can be re-licensed. Source transplantation requires permission from the relevant rights holder(s), checking every borrowed file and third-party component/asset, preserving attribution/notices, and explicitly publishing any derivative portions under GPL-compatible terms. A future decision to open BRKTRK does not by itself authorize copying it wholesale. This RFC copies **no BRKTRK source code**.

Private source evidence must stay within authorized repository access; don't attach private sources or binaries to the public draft PR.

## Exit conditions

- Fast editing proven with **both** peer editor modes on phone and desktop.
- No loss of native SLOOP step/parameter/preset functionality (descriptor + bridge coverage tests).
- Undo, Save, Open and Undo after mode switches behave predictably.
- No double-clock / incompatible state / unverified sample or engine insertion.
- Every future feature is justified by a musician action (not by its presence in the old tracker).
