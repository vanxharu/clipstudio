/* Muxer MP4 tối giản cho WebCodecs: H.264 (avc) + AAC hoặc Opus. Ghi moov ở đầu (faststart). */
var MP4Muxer = (function () {
  function u8(n) { return [n & 255]; }
  function u16(n) { return [(n >> 8) & 255, n & 255]; }
  function u24(n) { return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function u32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
  function str(s) { return Array.from(s).map(function (c) { return c.charCodeAt(0); }); }
  function flat(parts) {
    var len = 0; parts.forEach(function (p) { len += p.length; });
    var out = new Uint8Array(len), o = 0;
    parts.forEach(function (p) { out.set(p, o); o += p.length; });
    return out;
  }
  function box(type) {
    var parts = Array.prototype.slice.call(arguments, 1).map(function (p) { return p instanceof Uint8Array ? p : new Uint8Array(p); });
    var body = flat(parts);
    return flat([new Uint8Array(u32(body.length + 8).concat(str(type))), body]);
  }
  function full(type, version, flags) { return box.apply(null, [type, [version].concat(u24(flags))].concat(Array.prototype.slice.call(arguments, 3))); }
  var MATRIX = [].concat(u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000));
  function toU8(d) { return d instanceof ArrayBuffer ? new Uint8Array(d) : new Uint8Array(d.buffer, d.byteOffset, d.byteLength); }

  function Muxer(opts) {
    this.w = opts.width; this.h = opts.height; this.fps = opts.fps;
    this.vScale = 90000; this.vDelta = Math.round(90000 / opts.fps);
    this.audio = opts.audio || null; // {codec:'aac'|'opus', sampleRate, channels}
    this.v = []; this.a = []; this.avcC = null; this.asc = null; this.opusHead = null;
  }
  Muxer.prototype.addVideoChunk = function (chunk, meta) {
    if (meta && meta.decoderConfig && meta.decoderConfig.description) this.avcC = new Uint8Array(toU8(meta.decoderConfig.description));
    var d = new Uint8Array(chunk.byteLength); chunk.copyTo(d);
    this.v.push({ data: d, key: chunk.type === 'key', dur: this.vDelta, time: chunk.timestamp / 1e6 });
  };
  Muxer.prototype.addAudioChunk = function (chunk, meta) {
    if (meta && meta.decoderConfig && meta.decoderConfig.description) {
      var desc = new Uint8Array(toU8(meta.decoderConfig.description));
      if (this.audio.codec === 'aac') this.asc = desc; else this.opusHead = desc;
    }
    var d = new Uint8Array(chunk.byteLength); chunk.copyTo(d);
    var dur = this.audio.codec === 'aac' ? 1024 : Math.round((chunk.duration || 20000) * this.audio.sampleRate / 1e6);
    this.a.push({ data: d, key: true, dur: dur, time: chunk.timestamp / 1e6 });
  };

  Muxer.prototype._stbl = function (samples, entry, offsets, isVideo) {
    var stts = [], last = null;
    samples.forEach(function (s) { if (last && last[1] === s.dur) last[0]++; else { last = [1, s.dur]; stts.push(last); } });
    var sttsB = full('stts', 0, 0, u32(stts.length), [].concat.apply([], stts.map(function (e) { return u32(e[0]).concat(u32(e[1])); })));
    var stsc = full('stsc', 0, 0, u32(1), u32(1), u32(1), u32(1));
    var stsz = full('stsz', 0, 0, u32(0), u32(samples.length), [].concat.apply([], samples.map(function (s) { return u32(s.data.length); })));
    var stco = full('stco', 0, 0, u32(offsets.length), [].concat.apply([], offsets.map(u32)));
    var parts = [full('stsd', 0, 0, u32(1), entry), sttsB];
    if (isVideo) {
      var keys = []; samples.forEach(function (s, i) { if (s.key) keys.push(i + 1); });
      parts.push(full('stss', 0, 0, u32(keys.length), [].concat.apply([], keys.map(u32))));
    }
    parts.push(stsc, stsz, stco);
    return box.apply(null, ['stbl'].concat(parts));
  };

  Muxer.prototype._esds = function () {
    var asc = this.asc;
    if (!asc) { // AAC-LC, 48k/44.1k, stereo
      var fi = { 96000: 0, 88200: 1, 64000: 2, 48000: 3, 44100: 4, 32000: 5, 24000: 6, 22050: 7, 16000: 8 }[this.audio.sampleRate];
      if (fi === undefined) fi = 3;
      var bits = (2 << 11) | (fi << 7) | (this.audio.channels << 3);
      asc = new Uint8Array([(bits >> 8) & 255, bits & 255]);
    }
    function desc(tag, body) { return [tag, 0x80, 0x80, 0x80, body.length].concat(body); }
    var dsi = desc(0x05, Array.from(asc));
    var dcd = desc(0x04, [0x40, 0x15].concat(u24(0), u32(192000), u32(192000), dsi));
    var sl = desc(0x06, [0x02]);
    var es = desc(0x03, u16(1).concat([0], dcd, sl));
    return full('esds', 0, 0, es);
  };
  Muxer.prototype._dOps = function () {
    var preSkip = 312, ch = this.audio.channels;
    var h = this.opusHead;
    if (h && h.length >= 19 && String.fromCharCode.apply(null, h.slice(0, 8)) === 'OpusHead') { preSkip = h[10] | (h[11] << 8); ch = h[9]; }
    return box('dOps', [0, ch], u16(preSkip), u32(this.audio.sampleRate), u16(0), [0]);
  };

  Muxer.prototype._moov = function (base) {
    var self = this, off = base;
    // Xen kẽ mẫu video/audio theo thời gian
    var all = this.v.map(function (s) { return { s: s, v: 1 }; }).concat(this.a.map(function (s) { return { s: s, v: 0 }; }));
    all.sort(function (x, y) { return x.s.time - y.s.time || y.v - x.v; });
    var vOff = [], aOff = [];
    all.forEach(function (e) { (e.v ? vOff : aOff).push(off); off += e.s.data.length; });
    this._order = all;

    var vDurTicks = this.v.reduce(function (n, s) { return n + s.dur; }, 0);
    var vDurMs = Math.round(vDurTicks * 1000 / this.vScale);
    var aDurTicks = this.a.reduce(function (n, s) { return n + s.dur; }, 0);
    var aDurMs = this.audio ? Math.round(aDurTicks * 1000 / this.audio.sampleRate) : 0;
    var movieMs = Math.max(vDurMs, aDurMs);

    function tkhd(id, durMs, isAudio, w, h) {
      return full('tkhd', 0, 3, u32(0), u32(0), u32(id), u32(0), u32(durMs), u32(0), u32(0), u16(0), u16(0),
        u16(isAudio ? 0x100 : 0), u16(0), MATRIX, u32(w << 16), u32(h << 16));
    }
    function mdhd(scale, dur) { return full('mdhd', 0, 0, u32(0), u32(0), u32(scale), u32(dur), u16(0x55c4), u16(0)); }
    function hdlr(t, name) { return full('hdlr', 0, 0, u32(0), str(t), u32(0), u32(0), u32(0), str(name), [0]); }
    var dinf = box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1)));

    var avc1 = box('avc1', [0, 0, 0, 0, 0, 0], u16(1), u16(0), u16(0), u32(0), u32(0), u32(0),
      u16(this.w), u16(this.h), u32(0x480000), u32(0x480000), u32(0), u16(1), new Array(32).fill(0), u16(0x18), u16(0xffff),
      box('avcC', this.avcC || []));
    var vtrak = box('trak', tkhd(1, vDurMs, false, this.w, this.h),
      box('mdia', mdhd(this.vScale, vDurTicks), hdlr('vide', 'VideoHandler'),
        box('minf', full('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0)), dinf, this._stbl(this.v, avc1, vOff, true))));
    var traks = [vtrak];
    if (this.audio && this.a.length) {
      var A = this.audio;
      var entry = box(A.codec === 'aac' ? 'mp4a' : 'Opus', [0, 0, 0, 0, 0, 0], u16(1), u32(0), u32(0), u16(A.channels), u16(16), u16(0), u16(0),
        u32(A.sampleRate << 16 >>> 0), A.codec === 'aac' ? this._esds() : this._dOps());
      traks.push(box('trak', tkhd(2, aDurMs, true, 0, 0),
        box('mdia', mdhd(A.sampleRate, aDurTicks), hdlr('soun', 'SoundHandler'),
          box('minf', full('smhd', 0, 0, u16(0), u16(0)), dinf, this._stbl(this.a, entry, aOff, false)))));
    }
    var mvhd = full('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(movieMs), u32(0x10000), u16(0x100), u16(0), u32(0), u32(0),
      MATRIX, new Array(24).fill(0), u32(traks.length + 1));
    return box.apply(null, ['moov', mvhd].concat(traks));
  };

  Muxer.prototype.finalize = function () {
    if (!this.avcC) throw new Error('Thiếu cấu hình avcC từ VideoEncoder');
    var ftyp = box('ftyp', str('isom'), u32(512), str('isom'), str('iso2'), str('avc1'), str('mp41'));
    var mdatSize = 8; this.v.forEach(function (s) { mdatSize += s.data.length; }); this.a.forEach(function (s) { mdatSize += s.data.length; });
    var moov0 = this._moov(0);
    var base = ftyp.length + moov0.length + 8;
    var moov = this._moov(base);
    var parts = [ftyp, moov, new Uint8Array(u32(mdatSize).concat(str('mdat')))];
    this._order.forEach(function (e) { parts.push(e.s.data); });
    return new Blob(parts, { type: 'video/mp4' });
  };
  return Muxer;
})();
if (typeof module !== 'undefined') module.exports = MP4Muxer;
