// SPDX-License-Identifier: GPL-3.0-only
// A SLOOP FM-1 panel key is transposed by P_TRANS (core.h / seq.c kb_pitch).
// AudioWorklet preview_note() takes an ALREADY-MAPPED raw MIDI note; it never
// invokes the FM-1's 16-key kb_map(). Piano Roll cells remain absolute pitches.
export function panelAuditionPitch(note,trackParams){
  if(!Number.isInteger(note)||note<0||note>127)throw RangeError('MIDI note 0..127 required');
  const trn=Number(trackParams?.[28]??0);
  if(!Number.isInteger(trn)||trn<-24||trn>24)throw RangeError('SLOOP P_TRANS -24..24 required');
  return Math.max(0,Math.min(127,note+trn));
}
