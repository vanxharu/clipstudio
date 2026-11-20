// Giọng đọc Piper (https://github.com/rhasspy/piper, MIT): AI chạy ngay trên máy, miễn phí, không giới hạn, offline.
// Chương trình piper đóng gói kèm app; giọng (file .onnx) tải từ Hugging Face rhasspy/piper-voices khi dùng lần đầu.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const VOICE_BASE = process.env.H2V_PIPER_BASE || 'https://huggingface.co/rhasspy/piper-voices/resolve/main/';
const DATA = process.env.H2V_DATA || path.join(os.homedir(), '.html-video-studio');
const VOICE_DIR = path.join(DATA, 'piper-voices');

function findPiper() {
  const exe = process.platform === 'win32' ? 'piper.exe' : 'piper';
  const c = [process.env.PIPER_PATH, path.join(__dirname, '..', 'vendor', 'piper', exe)].filter(Boolean);
  return c.find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) || null;
}
const available = () => !!findPiper();

// Gợi ý giới tính theo tên giọng (danh mục Piper không ghi giới tính)
const FEMALE = /amy|lessac|kathleen|kristin|hfc_female|ljspeech|alba|cori|jenny|southern_english_female|eva_k|kerstin|ramona|siwis|upmc|irina|paola|huayan|nathalie|vais1000|25hours|natia|lili|berta|ona|mls_\d+|female/i;
const MALE = /ryan|joe|john|bryce|danny|hfc_male|norman|alan|northern_english_male|thorsten|karlsson|pavoque|gilles|tom|dmitri|denis|ruslan|riccardo|faber|cadu|jeff|kareem|davefx|carlfm|ald|pim|fahrettin|dfki|male/i;
const QUALITY = { medium: 0, high: 1, low: 2, x_low: 3 };
// Giọng ưu tiên khi có
const PREFER = { vi_VN: ['vi_VN-vais1000-medium', 'vi_VN-25hours_single-low'], en_US: ['en_US-lessac-medium', 'en_US-ryan-medium'], en_GB: ['en_GB-alba-medium', 'en_GB-alan-medium'],
  de_DE: ['de_DE-kerstin-low', 'de_DE-thorsten-medium'], fr_FR: ['fr_FR-siwis-medium', 'fr_FR-gilles-low'], es_ES: ['es_ES-sharvard-medium', 'es_ES-davefx-medium'] };

let catalogP = null;
async function catalog() {
  if (catalogP) return catalogP;
  const file = path.join(VOICE_DIR, 'voices.json');
  catalogP = (async () => {
    fs.mkdirSync(VOICE_DIR, { recursive: true });
    let fresh = false; try { fresh = Date.now() - fs.statSync(file).mtimeMs < 7 * 864e5; } catch (e) {}
    if (!fresh) {
      try { await download(VOICE_BASE + 'voices.json', file, { got: 0, total: 0 }); } catch (e) { if (!fs.existsSync(file)) throw new Error('Không tải được danh sách giọng Piper (' + e.message + '). Cần Internet cho lần đầu.'); }
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  })();
  catalogP.catch(() => { catalogP = null; });
  return catalogP;
}
/** Các giọng của một ngôn ngữ ("vi-VN" hoặc "vi_VN"), giọng tốt xếp trước. */
async function voicesFor(lang) {
  const cat = await catalog(), code = String(lang || 'vi-VN').replace('-', '_');
  const pre = code.split('_')[0];
  let list = Object.values(cat).filter(v => v.language && v.language.code === code);
  if (!list.length) list = Object.values(cat).filter(v => v.language && v.language.family === pre);
  const pref = PREFER[code] || [];
  return list.map(v => ({ key: v.key, name: v.name, quality: v.quality, lang: v.language.code, speakers: v.num_speakers,
    gender: FEMALE.test(v.name) ? 'female' : MALE.test(v.name) ? 'male' : '', size: Object.values(v.files || {}).reduce((n, f) => n + (f.size_bytes || 0), 0),
    installed: isInstalled(v.key) }))
    .sort((a, b) => ((pref.indexOf(a.key) + 1 || 99) - (pref.indexOf(b.key) + 1 || 99)) || (QUALITY[a.quality] ?? 9) - (QUALITY[b.quality] ?? 9) || a.key.localeCompare(b.key));
}
const modelPath = key => path.join(VOICE_DIR, key + '.onnx');
const isInstalled = key => fs.existsSync(modelPath(key)) && fs.existsSync(modelPath(key) + '.json');

const downloads = new Map(); // key -> { promise, got, total }
/** Tải file bằng http/https của Node (theo chuyển hướng, ghi dần ra đĩa). */
function download(url, dest, prog, hops = 0) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? require('https') : require('http');
    const req = mod.get(url, { headers: { 'User-Agent': 'HTML-Video-Studio' } }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && hops < 6) {
        res.resume(); return resolve(download(new URL(res.headers.location, url).toString(), dest, prog, hops + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('Tải giọng lỗi HTTP ' + res.statusCode)); }
      prog.total += +res.headers['content-length'] || 0;
      const tmp = dest + '.part', ws = fs.createWriteStream(tmp);
      res.on('data', c => { prog.got += c.length; });
      res.pipe(ws);
      ws.on('finish', () => { try { fs.renameSync(tmp, dest); resolve(); } catch (e) { reject(e); } });
      ws.on('error', reject); res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('Tải giọng quá lâu, kiểm tra Internet')));
  });
}
/** Tải giọng (nếu chưa có). Trả về đường dẫn .onnx */
async function ensureVoice(key) {
  if (isInstalled(key)) return modelPath(key);
  if (downloads.has(key)) return downloads.get(key).promise;
  const prog = { got: 0, total: 0 };
  prog.promise = (async () => {
    const cat = await catalog(), v = cat[key];
    if (!v) throw new Error('Không có giọng Piper "' + key + '"');
    const files = Object.keys(v.files || {});
    const onnx = files.find(f => f.endsWith('.onnx')), json = files.find(f => f.endsWith('.onnx.json'));
    if (!onnx || !json) throw new Error('Giọng "' + key + '" thiếu file');
    fs.mkdirSync(VOICE_DIR, { recursive: true });
    await download(VOICE_BASE + json, modelPath(key) + '.json', prog);
    await download(VOICE_BASE + onnx, modelPath(key), prog);
    return modelPath(key);
  })();
  downloads.set(key, prog);
  try { return await prog.promise; } finally { downloads.delete(key); }
}
const progress = () => Object.fromEntries([...downloads].map(([k, p]) => [k, { got: p.got, total: p.total }]));

/** Chọn giọng: key cụ thể, hoặc theo ngôn ngữ + giới tính */
async function pickVoice({ key, lang, gender }) {
  if (key) return key;
  const list = await voicesFor(lang);
  if (!list.length) throw new Error('Piper chưa có giọng cho ' + lang + '. Hãy chọn dịch vụ giọng đọc khác cho ngôn ngữ này.');
  return (list.find(v => v.installed && (!gender || v.gender === gender)) || list.find(v => !gender || v.gender === gender) || list.find(v => v.installed) || list[0]).key;
}

/** Tạo giọng đọc: out là .wav hoặc .mp3 (cần ffmpeg) */
async function tts({ text, lang = 'vi-VN', gender, key, rate = 0, out, ffmpeg }) {
  const bin = findPiper(); if (!bin) throw new Error('Bản này chưa có Piper.');
  const voice = await pickVoice({ key, lang, gender });
  const model = await ensureVoice(voice);
  const wav = /\.wav$/i.test(out) ? out : out.replace(/\.[^.]+$/, '') + '-piper.wav';
  const lengthScale = Math.max(0.5, Math.min(2, 1 / (1 + (+rate || 0) / 100)));
  await new Promise((resolve, reject) => {
    const p = spawn(bin, ['--model', model, '--output_file', wav, '--length_scale', lengthScale.toFixed(3), '--sentence_silence', '0.25'], { cwd: path.dirname(bin), windowsHide: true });
    let err = ''; p.stderr.on('data', d => { err += d; if (err.length > 4000) err = err.slice(-2000); });
    p.on('error', reject);
    p.on('close', code => code === 0 && fs.existsSync(wav) ? resolve() : reject(new Error('Piper lỗi: ' + err.slice(-300))));
    p.stdin.end(String(text).replace(/\s*\n\s*/g, ' ') + '\n', 'utf8');
  });
  if (wav === out) return { out, voice };
  await new Promise((resolve, reject) => {
    const f = spawn(ffmpeg || 'ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-b:a', '96k', out], { windowsHide: true });
    let fe = ''; f.stderr.on('data', d => fe += d);
    f.on('error', reject);
    f.on('close', c => { fs.rmSync(wav, { force: true }); c === 0 ? resolve() : reject(new Error('FFmpeg lỗi: ' + fe.slice(-300))); });
  });
  return { out, voice };
}
module.exports = { available, findPiper, voicesFor, ensureVoice, progress, tts, VOICE_DIR };
