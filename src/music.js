/* Trình tạo nhạc nền tự sinh (không bản quyền: âm thanh được tổng hợp mới hoàn toàn bằng Web Audio). */
var H2VMusic = (function () {
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  var CH = { maj: [0, 4, 7], min: [0, 3, 7], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], '7': [0, 4, 7, 10], sus2: [0, 2, 7], add9: [0, 4, 7, 14], m9: [0, 3, 7, 10, 14] };

  var PRESETS = {
    lofi: { name: 'Lo-fi chill', bpm: [72, 86], keys: [0, 2, 5, 7, 9], swing: 0.12, barsPerChord: 1,
      progs: [[[0, 'maj7'], [9, 'm7'], [2, 'm7'], [7, '7']], [[5, 'maj7'], [4, 'm7'], [2, 'm9'], [0, 'maj7']], [[9, 'm9'], [5, 'maj7'], [0, 'maj7'], [7, 'sus2']]] },
    ambient: { name: 'Ambient nhẹ nhàng', bpm: [60, 70], keys: [0, 2, 4, 7], barsPerChord: 2,
      progs: [[[0, 'add9'], [5, 'maj7'], [9, 'm7'], [7, 'sus2']], [[9, 'm9'], [5, 'maj7'], [0, 'add9'], [7, 'sus2']]] },
    upbeat: { name: 'Sôi động / quảng cáo', bpm: [112, 124], keys: [0, 2, 5, 7], barsPerChord: 1,
      progs: [[[0, 'maj'], [7, 'maj'], [9, 'min'], [5, 'maj']], [[5, 'maj'], [0, 'maj'], [7, 'maj'], [9, 'min']], [[9, 'min'], [5, 'maj'], [0, 'maj'], [7, 'maj']]] },
    cinematic: { name: 'Điện ảnh / kịch tính', bpm: [84, 96], keys: [0, 2, 4, 9], barsPerChord: 2,
      progs: [[[0, 'min'], [8, 'maj'], [3, 'maj'], [10, 'maj']], [[0, 'min'], [5, 'min'], [8, 'maj'], [7, 'maj']]] },
    corporate: { name: 'Doanh nghiệp / tích cực', bpm: [100, 110], keys: [0, 2, 7], barsPerChord: 1,
      progs: [[[0, 'add9'], [9, 'm7'], [5, 'maj7'], [7, 'sus2']], [[5, 'maj7'], [7, 'sus2'], [9, 'm7'], [0, 'add9']]] }
  };

  async function generate(opts) {
    var preset = PRESETS[opts.preset] || PRESETS.lofi;
    var sr = opts.sampleRate || 48000, dur = Math.max(1, opts.duration);
    var R = rng((opts.seed || 1) * 7919 + 13);
    var ctx = new OfflineAudioContext(2, Math.ceil(sr * dur), sr);
    var bpm = Math.round(preset.bpm[0] + R() * (preset.bpm[1] - preset.bpm[0]));
    var key = preset.keys[Math.floor(R() * preset.keys.length)];
    var prog = preset.progs[Math.floor(R() * preset.progs.length)];
    var beat = 60 / bpm, bar = beat * 4;
    var root = 48 + key;

    // Chuỗi master: comp -> fade
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
    var master = ctx.createGain();
    master.gain.setValueAtTime(0, 0); master.gain.linearRampToValueAtTime(0.85, Math.min(1, dur / 4));
    master.gain.setValueAtTime(0.85, Math.max(0, dur - 2.5)); master.gain.linearRampToValueAtTime(0, dur);
    comp.connect(master); master.connect(ctx.destination);
    // Reverb
    var rev = ctx.createConvolver(), irLen = Math.floor(sr * 2.6), ir = ctx.createBuffer(2, irLen, sr);
    for (var c = 0; c < 2; c++) { var d = ir.getChannelData(c); for (var i = 0; i < irLen; i++) d[i] = (R() * 2 - 1) * Math.pow(1 - i / irLen, 3); }
    rev.buffer = ir; var revGain = ctx.createGain(); revGain.gain.value = opts.preset === 'ambient' ? 0.7 : 0.3; rev.connect(revGain); revGain.connect(comp);
    // Noise
    var nb = ctx.createBuffer(1, sr, sr), nd = nb.getChannelData(0); for (var k = 0; k < sr; k++) nd[k] = R() * 2 - 1;

    function out(node, wet, pan) {
      var p = ctx.createStereoPanner(); p.pan.value = pan || 0; node.connect(p); p.connect(comp);
      if (wet) { var g = ctx.createGain(); g.gain.value = wet; node.connect(g); g.connect(rev); }
    }
    function env(g, t, a, peak, hold, rel) {
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a);
      g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
      return t + a + hold + rel + 0.05;
    }
    function pad(t, len, notes, vol, cutoff) {
      var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 0.5;
      var g = ctx.createGain(); var end = env(g, t, Math.min(1.2, len * 0.3), vol, len * 0.5, len * 0.6);
      f.connect(g); out(g, 0.8, 0);
      notes.forEach(function (n, idx) {
        [-6, 6].forEach(function (det) {
          var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(n); o.detune.value = det + (idx % 2 ? 3 : -3);
          o.connect(f); o.start(t); o.stop(end);
        });
      });
    }
    function keys(t, notes, vol) {
      notes.forEach(function (n, idx) {
        var tt = t + idx * 0.012 + R() * 0.008;
        var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz(n);
        var o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = hz(n) * 2;
        var g2 = ctx.createGain(); g2.gain.value = 0.15; o2.connect(g2);
        var g = ctx.createGain(); var end = env(g, tt, 0.01, vol, 0.05, 1.4);
        o.connect(g); g2.connect(g); out(g, 0.5, (idx - 1.5) * 0.15);
        o.start(tt); o2.start(tt); o.stop(end); o2.stop(end);
      });
    }
    function pluck(t, n, vol, pan) {
      var o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = hz(n);
      var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3500, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.2);
      var g = ctx.createGain(); var end = env(g, t, 0.003, vol, 0.01, 0.22);
      o.connect(f); f.connect(g); out(g, 0.35, pan); o.start(t); o.stop(end);
    }
    function bass(t, n, len, vol, type) {
      var o = ctx.createOscillator(); o.type = type || 'triangle'; o.frequency.value = hz(n);
      var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
      var g = ctx.createGain(); var end = env(g, t, 0.01, vol, len * 0.6, len * 0.35);
      o.connect(f); f.connect(g); out(g, 0, 0); o.start(t); o.stop(end);
    }
    function kick(t, vol) {
      var o = ctx.createOscillator(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      var g = ctx.createGain(); var end = env(g, t, 0.002, vol, 0.02, 0.32); o.connect(g); out(g, 0, 0); o.start(t); o.stop(end);
    }
    function noise(t, type, freq, vol, decay, pan, wet) {
      var s = ctx.createBufferSource(); s.buffer = nb; var f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
      var g = ctx.createGain(); var end = env(g, t, 0.001, vol, 0.005, decay); s.connect(f); f.connect(g); out(g, wet || 0, pan); s.start(t, R() * 0.5); s.stop(end);
    }
    function snare(t, vol) { noise(t, 'bandpass', 1900, vol, 0.17, 0, 0.25); var o = ctx.createOscillator(); o.frequency.value = 190; var g = ctx.createGain(); var e = env(g, t, 0.001, vol * 0.5, 0.01, 0.08); o.connect(g); out(g, 0, 0); o.start(t); o.stop(e); }
    function hat(t, vol, pan) { noise(t, 'highpass', 7500, vol, 0.045, pan); }
    function tom(t, vol) { var o = ctx.createOscillator(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.4); var g = ctx.createGain(); var e = env(g, t, 0.003, vol, 0.05, 0.6); o.connect(g); out(g, 0.5, 0); o.start(t); o.stop(e); }

    var P = opts.preset;
    var nBars = Math.ceil(dur / bar) + 1;
    for (var b = 0; b < nBars; b++) {
      var t0 = b * bar; if (t0 >= dur) break;
      var ci = Math.floor(b / preset.barsPerChord) % prog.length;
      var ch = prog[ci], chRoot = root + ch[0];
      var notes = CH[ch[1]].map(function (iv) { return chRoot + 12 + iv; });
      var first = b % preset.barsPerChord === 0;
      var intro = b < 1, fill = b % 8 === 7;
      if (P === 'lofi') {
        keys(t0 + R() * 0.02, notes, 0.07); keys(t0 + beat * 2.5, notes, 0.045);
        bass(t0, chRoot - 12, beat * 1.5, 0.32); bass(t0 + beat * 2.5, chRoot - 12 + (R() < 0.5 ? 7 : 0), beat, 0.25);
        if (!intro) for (var s = 0; s < 8; s++) {
          var sw = s % 2 ? preset.swing * beat : 0, tt = t0 + s * beat / 2 + sw;
          if (s === 0 || s === 5 || (s === 3 && R() < 0.4)) kick(tt, 0.55);
          if (s === 2 || s === 6) snare(tt, 0.22);
          hat(tt, s % 2 ? 0.05 : 0.08, 0.2);
        }
        noise(t0, 'lowpass', 2500, 0.012, bar, 0, 0); // tiếng vinyl nhẹ
      } else if (P === 'ambient') {
        if (first) pad(t0, bar * preset.barsPerChord, notes.concat([notes[0] + 12]), 0.04, 1400);
        if (first) bass(t0, chRoot - 12, bar * preset.barsPerChord * 0.9, 0.14, 'sine');
        for (var q = 0; q < 4; q++) if (R() < 0.45) pluck(t0 + q * beat + R() * 0.1, notes[Math.floor(R() * notes.length)] + 12, 0.025, R() * 1.4 - 0.7);
      } else if (P === 'upbeat' || P === 'corporate') {
        var corp = P === 'corporate';
        if (first) pad(t0, bar * preset.barsPerChord, notes, corp ? 0.03 : 0.025, corp ? 2200 : 3000);
        for (var e8 = 0; e8 < 8; e8++) {
          var t8 = t0 + e8 * beat / 2;
          if (!intro && e8 % 2 === 0) kick(t8, corp ? 0.45 : 0.6);
          if (!intro && (e8 === 2 || e8 === 6)) snare(t8, corp ? 0.12 : 0.22);
          if (!intro) hat(t8 + (e8 % 2 ? 0 : beat / 4), 0.06, -0.2);
          bass(t8, chRoot - 12 + (e8 % 2 ? 12 : 0), beat / 2, e8 % 2 ? 0.2 : 0.28, corp ? 'triangle' : 'sawtooth');
        }
        for (var s16 = 0; s16 < 16; s16++) {
          if (corp && s16 % 2) continue;
          var arpN = notes[(s16 + (s16 > 7 ? 1 : 0)) % notes.length] + 12;
          pluck(t0 + s16 * beat / 4, arpN, corp ? 0.03 : 0.035, s16 % 2 ? 0.35 : -0.35);
        }
        if (fill) for (var fl = 0; fl < 4; fl++) snare(t0 + bar - beat + fl * beat / 4, 0.1 + fl * 0.04);
      } else if (P === 'cinematic') {
        if (first) pad(t0, bar * preset.barsPerChord, notes.concat([notes[0] - 12]), 0.045, 1100);
        for (var p8 = 0; p8 < 8; p8++) bass(t0 + p8 * beat / 2, chRoot - 12, beat / 2.2, 0.22, 'sawtooth');
        if (!intro && b % 2 === 0) { tom(t0, 0.5); tom(t0 + beat * 1.5, 0.35); tom(t0 + beat * 2, 0.45); }
        if (!intro && b % 2 === 1) kick(t0, 0.5);
        if (fill) for (var tf = 0; tf < 6; tf++) tom(t0 + bar - beat * 1.5 + tf * beat / 4, 0.25 + tf * 0.06);
      }
    }
    var buf = await ctx.startRendering();
    buf.__info = { bpm: bpm, key: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][key % 12] };
    return buf;
  }
  return { generate: generate, PRESETS: PRESETS };
})();
