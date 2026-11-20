#!/usr/bin/env node
// CLI: node render.js <file.html> [tuỳ chọn]   — xem `node render.js --help`
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const core = require('./lib/core');

const HELP = `
Cách dùng:  node render.js <file.html | thư-mục> [tuỳ chọn]

  -o, --out <file.mp4>      File xuất (mặc định: cùng tên .mp4)
  -w, --width <px>          Chiều rộng   (mặc định 1920, hoặc theo <meta name="h2v">)
  -h, --height <px>         Chiều cao    (mặc định 1080)
      --fps <n>             Số khung/giây (mặc định 30)
  -d, --duration <giây>     Thời lượng   (mặc định 5)
      --preset <tên>        16x9 | 9x16 | 1x1 | 4x5 | 720p | 4k
  -q, --quality <mức>       low | high | max  (mặc định high)
  -a, --audio <file>        Thêm âm thanh; viết dạng file.mp3@2.5 để bắt đầu ở giây 2.5,
                            file.mp3@0:0.4 để đặt âm lượng 0.4 (dùng nhiều lần được)
      --tts "<nội dung>"    Thêm giọng đọc (cần: pip install edge-tts)
      --voice <tên>         Giọng (mặc định vi-VN-HoaiMyNeural; nam: vi-VN-NamMinhNeural)
      --tts-start <giây>    Thời điểm bắt đầu đọc (mặc định 0.5)
      --tts-rate <%>        Tốc độ đọc, ví dụ 10 hoặc -15
      --fit-audio           Tự đặt thời lượng = độ dài giọng đọc + 0.5s
      --no-duck             Không tự giảm nhạc khi có giọng đọc

Thư mục: render mọi file .html bên trong (mỗi file một video).

Ví dụ:
  node render.js examples/02-social-9x16.html
  node render.js intro.html --preset 9x16 -d 12 -a nhac.mp3@0:0.6 --tts "Xin chào các bạn" --fit-audio
`;

const PRESETS = { '16x9': [1920, 1080], '9x16': [1080, 1920], '1x1': [1080, 1080], '4x5': [1080, 1350], '720p': [1280, 720], '4k': [3840, 2160] };

function parse(argv) {
  const o = { audio: [] }; const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    switch (a) {
      case '--help': o.help = true; break;
      case '-o': case '--out': o.out = next(); break;
      case '-w': case '--width': o.width = +next(); break;
      case '-h': case '--height': o.height = +next(); break;
      case '--fps': o.fps = +next(); break;
      case '-d': case '--duration': o.duration = +next(); break;
      case '--preset': o.preset = next(); break;
      case '-q': case '--quality': o.quality = { low: 0.6, high: 1, max: 1.8 }[next()] || 1; break;
      case '-a': case '--audio': o.audio.push(next()); break;
      case '--tts': o.tts = next(); break;
      case '--voice': o.voice = next(); break;
      case '--tts-start': o.ttsStart = +next(); break;
      case '--tts-rate': o.ttsRate = +next(); break;
      case '--fit-audio': o.fit = true; break;
      case '--no-duck': o.duck = false; break;
      default: pos.push(a);
    }
  }
  o.input = pos[0];
  return o;
}

function probeDuration(file) {
  const r = require('child_process').spawnSync(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return parseFloat(r.stdout) || 0;
}

function bar(p, w = 28) { const n = Math.round(p * w); return '█'.repeat(n) + '░'.repeat(w - n); }

async function renderOne(file, o, tmp) {
  const html = fs.readFileSync(file, 'utf8');
  const meta = core.readMeta(html);
  const pr = o.preset && PRESETS[o.preset.toLowerCase()];
  const even = n => { n = Math.round(n); return n % 2 ? n + 1 : n; };
  const width = even(o.width || (pr && pr[0]) || meta.width || 1920);
  const height = even(o.height || (pr && pr[1]) || meta.height || 1080);
  const fps = o.fps || meta.fps || 30;
  let duration = o.duration || meta.duration || 5;
  const out = o.out && !o.many ? o.out : file.replace(/\.html?$/i, '') + '.mp4';

  const audio = o.audio.map(spec => {
    const m = spec.match(/^(.*?)(?:@([\d.]+)(?::([\d.]+))?)?$/);
    return { path: path.resolve(m[1]), start: +m[2] || 0, volume: m[3] !== undefined ? +m[3] : 1 };
  });
  for (const a of audio) if (!fs.existsSync(a.path)) throw new Error('Không thấy file âm thanh: ' + a.path);
  if (o.tts) {
    process.stdout.write('🎙  Đang tạo giọng đọc… ');
    const mp3 = path.join(tmp, 'tts-' + Date.now() + '.mp3');
    await core.tts({ text: o.tts, voice: o.voice || 'vi-VN-HoaiMyNeural', rate: o.ttsRate || 0, out: mp3 });
    const len = probeDuration(mp3);
    const start = o.ttsStart ?? 0.5;
    console.log(len.toFixed(1) + 's');
    audio.push({ path: mp3, start, volume: 1, voice: true });
    if (o.fit) duration = Math.ceil((start + len + 0.5) * 10) / 10;
  }

  console.log(`🎬  ${path.basename(file)} → ${path.basename(out)}  (${width}×${height}, ${fps}fps, ${duration}s${audio.length ? ', ' + audio.length + ' âm thanh' : ''})`);
  const t0 = Date.now();
  const res = await core.render({
    url: pathToFileURL(path.resolve(file)).href, width, height, fps, duration, out, audio, quality: o.quality || 1, duck: o.duck,
    onProgress: s => {
      const eta = s.frame ? s.elapsed / s.frame * (s.total - s.frame) : 0;
      process.stdout.write(`\r    ${bar(s.frame / s.total)} ${s.frame}/${s.total}  ${s.encoding ? 'đang hoàn tất…   ' : 'còn ~' + Math.ceil(eta) + 's   '}`);
    }
  });
  const size = fs.statSync(out).size;
  console.log(`\r    ✅ Xong sau ${((Date.now() - t0) / 1000).toFixed(1)}s — ${out} (${(size / 1048576).toFixed(2)} MB)                `);
  res.logs.forEach(l => console.log('    ⚠️  ' + l));
}

(async () => {
  const o = parse(process.argv.slice(2));
  if (o.help || !o.input) { console.log(HELP); process.exit(o.input ? 0 : 1); }
  const st = fs.statSync(o.input);
  const files = st.isDirectory() ? fs.readdirSync(o.input).filter(f => /\.html?$/i.test(f)).sort().map(f => path.join(o.input, f)) : [o.input];
  o.many = files.length > 1;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h2v-cli-'));
  let failed = 0;
  for (const f of files) {
    try { await renderOne(f, o, tmp); } catch (e) { failed++; console.error('\n    ❌ ' + e.message); }
  }
  await core.closeBrowser();
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})();
