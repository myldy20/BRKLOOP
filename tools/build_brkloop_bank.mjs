// SPDX-License-Identifier: GPL-3.0-only
// Derive the web groovebox sound bank from the SLOOP editor mock, never a parallel hand-maintained preset bank.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync('web/editor.html', 'utf8');
const begin = html.indexOf('/*PROTO-BEGIN*/');
const end = html.indexOf('/*PROTO-END*/');
if (begin < 0 || end < begin) throw new Error('SLOOP protocol markers missing');
const E = vm.runInNewContext(html.slice(begin, end) + ';({makeMockDevice, previewSnapshot, CMD, req, frame, unframe, parse})',
  { setTimeout, clearTimeout, setInterval, clearInterval, console, TextEncoder, TextDecoder, Blob, Response, DecompressionStream });
const m = E.makeMockDevice();
const input = [...m.access.inputs.values()][0];
const output = [...m.access.outputs.values()][0];
function request([cmd, args]) {
  return new Promise((resolve, reject) => {
    input.onmidimessage = ({data}) => {
      const reply = E.unframe(data);
      if (!reply || reply.cmd !== cmd) return reject(new Error('Invalid mock reply to ' + cmd));
      resolve(reply.a);
    };
    try { output.send(E.frame(cmd, args)); } catch (e) { reject(e); }
  });
}
const info = E.parse[E.CMD.INFO](await request(E.req.info()));
if (info.nengines !== 12 || info.ntrk !== 4) throw new Error('SLOOP layout changed; review BRKLOOP runtime');
const baseline = E.previewSnapshot(m.state);
await request(E.req.track(0));
const lengthDesc = E.parse[E.CMD.DESC](await request(E.req.desc(0, 29)));
const divisionDesc = E.parse[E.CMD.DESC](await request(E.req.desc(0, 30)));
if (lengthDesc.label !== 'LEN' || lengthDesc.min !== 1 || lengthDesc.max !== 64 ||
    divisionDesc.label !== 'DIV' || divisionDesc.names.length < 8)
  throw new Error('SLOOP sequence descriptors changed; revise BRKLOOP UI mapping');
const sequence = { length: {id:29, min:lengthDesc.min, max:lengthDesc.max, def:lengthDesc.def},
  division: {id:30, names:divisionDesc.names, def:divisionDesc.def}, maxSteps:64 };
const engines = [];
for (let k = 0; k < info.nengines; k++) {
  const names = E.parse[E.CMD.NAMES](await request(E.req.names(k))).names;
  const presets = [];
  await request(E.req.track(0));
  await request(E.req.preset(k, 0));
  const controls = [];
  for (let j = 0; j < 8; j++) {
    const d = E.parse[E.CMD.DESC](await request(E.req.desc(0, info.pe0 + j)));
    controls.push({label:d.label, min:d.min, max:d.max, names:d.names, def:d.def});
  }
  for (let i = 0; i < names.length; i++) {
    await request(E.req.preset(k, i));
    const t = m.state.tracks[0];
    presets.push({name:names[i], p:Array.from(t.p), fm6:Array.from(t.fm6)});
  }
  engines.push({name:info.engines[k], controls, presets});
}
await request(E.req.track(3));
const kit = E.parse[E.CMD.DESC](await request(E.req.desc(0, info.pe0)));
const bank = {format:'BRKLOOP_BANK_V1', source:'SLOOP 2.7.x', pe0:info.pe0, baseline, sequence, engines, kits:kit.names};
if (engines.reduce((n,e)=>n+e.presets.length,0) < 100 || bank.kits.length < 35) throw new Error('Incomplete extracted factory bank');
mkdirSync('dist', {recursive:true});
writeFileSync('dist/bank.json', JSON.stringify(bank));
m.stop();
console.log('BRKLOOP bank:', engines.length, 'engines,', engines.reduce((n,e)=>n+e.presets.length,0), 'factory sounds,',bank.kits.length,'kits');