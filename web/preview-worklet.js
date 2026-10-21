// SPDX-License-Identifier: GPL-3.0-only
// The audio thread owns the firmware instance. No MIDI or hardware access.
export class FirmwareAudio {
  constructor(module) {
    const imports = WebAssembly.Module.imports(module);
    if (imports.length) throw new Error(`Unexpected DSP imports: ${imports.map((x) => x.name).join(', ')}`);
    this.w = new WebAssembly.Instance(module, {}).exports;
    this.w._initialize?.();
    this.w.preview_init();
    this.bytes = new Uint8Array(this.w.memory.buffer);
    this.transfer = this.w.preview_buffer();
    this.frames = this.w.preview_frames();
    this.audio = new Float32Array(this.w.memory.buffer, this.w.preview_render(), this.frames * 2);
    this.previous = null;
    this.position = this.frames;
    this.arrangement = null;
  }
  write(data) { this.bytes.set(data, this.transfer); }
  transport() {
    const info={ positions: [0, 1, 2, 3].map((k) => this.w.preview_position(k)) };
    if(this.arrangement){
      info.sectionIndex=this.arrangement.index;
      info.sectionCount=this.arrangement.states.length;
    }
    return info;
  }
  sync(state) {
    const old = this.previous;
    state.g.forEach((v, i) => { if (!old || v !== old.g[i]) this.w.preview_global(i, v); });
    this.w.preview_select(state.sel, state.solo);
    state.tracks.forEach((t, k) => {
      const before = old?.tracks[k];
      const changedSound = !before || t.engine !== before.engine || t.preset !== before.preset;
      if (changedSound) this.w.preview_track(k, t.engine, t.preset);
      t.p.forEach((v, i) => { if (changedSound || v !== before.p[i]) this.w.preview_param(k, i, v); });
      for (let i = 0; i < t.step.length; i++) {
        const source = [k === 3 ? t.dstep[i] : t.step[i], t.micro[i], (t.fill[i >> 2] >> ((i & 3) * 2)) & 3];
        const prior = before && [k === 3 ? before.dstep[i] : before.step[i], before.micro[i], (before.fill[i >> 2] >> ((i & 3) * 2)) & 3];
        if (prior && JSON.stringify(source) === JSON.stringify(prior)) continue;
        const data = new Uint8Array(12), [s, micro, fill] = source;
        if (k === 3) {
          data[0] = s.on & 255; data[1] = s.on >> 8;
          for (let l = 0; l < 16; l++) {
            data[2 + (l >> 2)] |= (s.lvl[l] & 3) << ((l & 3) * 2);
            data[6 + (l >> 2)] |= (s.rat[l] & 3) << ((l & 3) * 2);
          }
        } else data.set([...s.notes.slice(0, 4), s.n, s.time, s.flags, s.vel, s.lvl || 0, s.rat || 0]);
        data[10] = micro; data[11] = fill;
        this.write(data); this.w.preview_step(k, i);
      }
      if (!before || JSON.stringify(t.locks) !== JSON.stringify(before.locks)) {
        const data = new Uint8Array(24 * 4);
        t.locks.slice(0, 24).forEach((l, i) => data.set([l.step, l.param, l.value & 255, (l.value >> 8) & 255], i * 4));
        this.write(data); this.w.preview_locks(k, t.locks.length);
      }
      if (k < 3 && (changedSound || t.p[70] !== before.p[70] || JSON.stringify(t.fm6) !== JSON.stringify(before.fm6))) {
        this.write(t.fm6); this.w.preview_fm6(k);
      }
    });
    state.samples?.forEach((s, k) => { this.write(s); this.w.preview_sample(k); });
    state.kits?.forEach((kit, k) => { this.write(kit); this.w.preview_kit(k); });
    this.previous = state;
  }
  // All scenes have the same 64-step grid and division. Load the NEXT native
  // score as soon as the LAST step of this score has fired; SLOOP still plays
  // the current last step while the next score is prepared in audio memory.
  // The next beat-1 now belongs to the next section, without waiting for a
  // message to cross the browser's UI/audio thread boundary.
  setArrangement(states){
    if(!Array.isArray(states)||states.length<1||states.length>64)
      throw new RangeError('Song playback needs 1..64 section cycles');
    const div=states[0]?.tracks?.[3]?.p?.[30];
    if(!Number.isInteger(div)||div<0||div>8)
      throw new RangeError('Invalid arrangement division');
    for(const state of states){
      if(!Array.isArray(state?.tracks)||state.tracks.length!==4)
        throw new Error('Arrangement requires four native tracks');
      for(const [k,t] of state.tracks.entries())
        if(t.p?.[29]!==64||t.p?.[30]!==div||
           (k===3?t.dstep?.length!==64:t.step?.length!==64))
          throw new Error('Song sections require synchronized LEN 64 and DIV');
    }
    this.arrangement=null;
    this.sync(states[0]);
    this.arrangement={states,index:0,next:0,armed:false};
  }
  clearArrangement(){this.arrangement=null;}
  // Low-latency control path: apply immediately on audio thread, without
  // serializing 64 steps x 4 tracks or waiting for another pattern cycle.
  setTrackParam(track,id,value) {
    if (!Number.isInteger(track) || track < 0 || track > 3 || !Number.isInteger(id) || id < 0 || id >= 71 ||
        !Number.isInteger(value)) throw Error('Invalid live SLOOP track parameter');
    this.w.preview_param(track,id,value);
    if (this.previous?.tracks?.[track]) this.previous.tracks[track].p[id]=value;
  }
  setGlobalParam(id,value) {
    if (!Number.isInteger(id) || id < 0 || id >= 49 || !Number.isInteger(value)) throw Error('Invalid live SLOOP global parameter');
    this.w.preview_global(id,value);
    if (this.previous?.g) this.previous.g[id]=value;
  }
  render(left, right) {
    for (let i = 0; i < left.length; i++) {
      if (this.position >= this.frames) {
        const arr=this.arrangement;
        if(arr&&!arr.armed&&this.w.preview_position(3)===63){
          arr.next=(arr.index+1)%arr.states.length;
          this.sync(arr.states[arr.next]);arr.armed=true;
        }
        this.w.preview_render();
        if(arr&&arr.armed&&this.w.preview_position(3)===0){
          arr.index=arr.next;arr.armed=false;
        }
        this.position = 0;
      }
      left[i] = this.audio[this.position * 2]; right[i] = this.audio[this.position * 2 + 1];
      this.position++;
    }
  }
}

// Guard permits the exact same adapter to be tested with Node, without Web Audio.
if (typeof registerProcessor === 'function') {
  class SloopProcessor extends AudioWorkletProcessor {
    constructor(options) {
      super();
      this.dsp = new FirmwareAudio(options.processorOptions.module);
      this.meterFrames = 0;
      this.peak = 0;
      this.lastTransport = '';
      this.port.onmessage = ({ data }) => {
        try {
          if (data.type === 'state') {this.dsp.clearArrangement();this.dsp.sync(data.state);}
          else if (data.type === 'arrange') this.dsp.setArrangement(data.states);
          else if (data.type === 'arrange-clear') this.dsp.clearArrangement();
          else if (data.type === 'track-param') this.dsp.setTrackParam(data.track,data.id,data.value);
          else if (data.type === 'global-param') this.dsp.setGlobalParam(data.id,data.value);
          else if (data.type === 'note') this.dsp.w.preview_note(data.track, data.note, data.on ? 1 : 0);
          else if (data.type === 'play') this.dsp.w.preview_play(data.on ? 1 : 0);
          else if (data.type === 'panic') this.dsp.w.preview_panic();
          else if (data.type === 'hit') this.dsp.w.preview_hit(data.kit, data.lane, data.velocity);
        } catch (error) { this.port.postMessage({ error: error.message }); }
      };
    }
    process(_inputs, outputs) {
      this.dsp.render(outputs[0][0], outputs[0][1]);
      for (const channel of outputs[0])
        for (let i = 0; i < channel.length; i++) this.peak = Math.max(this.peak, Math.abs(channel[i]));
      this.meterFrames += outputs[0][0].length;
      const message = {}, transport = this.dsp.transport(),
        signature = transport.positions.join(',')+':'+(transport.sectionIndex??'-');
      if (signature !== this.lastTransport) {
        this.lastTransport = signature;
        message.transport = transport;
      }
      if (this.meterFrames >= 4096) {
        message.peak = this.peak;
        this.meterFrames = 0; this.peak = 0;
      }
      if (message.transport || message.peak != null) this.port.postMessage(message);
      return true;
    }
  }
  registerProcessor('sloop-preview', SloopProcessor);
}
