#!/usr/bin/env node
// Máy chủ local: phục vụ web app + render HQ (Chrome + FFmpeg) + giọng đọc TTS (giọng Windows / edge-tts nếu có)
// Chạy: npm start   (mặc định http://localhost:3210)
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const core = require('./lib/core');
const piper = require('./lib/piper');

const PORT = process.env.PORT !== undefined ? +process.env.PORT : 3210;
const HOST = process.env.HOST || '127.0.0.1';
const INDEX = path.join(__dirname, 'public', 'index.html');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'h2v-server-'));
// Chỉ ghép lại web app khi đang chạy từ mã nguồn (bản .exe đã ghép sẵn)
try {
  const src = path.join(__dirname, 'src', 'app.html');
  if (fs.existsSync(src) && (!fs.existsSync(INDEX) || fs.statSync(INDEX).mtimeMs < fs.statSync(src).mtimeMs)) require('./build');
} catch (e) { console.warn('Không ghép lại được web app:', e.message); }
// Chỉ cho phép chuyển tiếp yêu cầu giọng đọc tới đúng các dịch vụ này
const PROXY_HOSTS = [/^generativelanguage\.googleapis\.com$/, /^[a-z0-9-]+\.tts\.speech\.microsoft\.com$/, /^[a-z0-9-]+\.cognitiveservices\.azure\.com$/];

const jobs = new Map();
let queue = Promise.resolve();
const TTS = core.ttsAvailable();
const FF = core.ffmpegOk();

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req, limit = 300 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { reject(new Error('Dữ liệu quá lớn')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(new Error('JSON không hợp lệ')); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) return send(res, 200, fs.readFileSync(INDEX), 'text/html; charset=utf-8');
    if (p === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (p === '/api/health') return send(res, 200, { ok: true, tts: !!TTS, ffmpeg: FF, proxy: true, youtube: true, piper: piper.available(), app: process.env.H2V_APP_VERSION || null });

    // YouTube: thông tin video + phụ đề
    if (p === '/api/youtube' && req.method === 'GET') {
      try { return send(res, 200, await require('./lib/youtube').getVideo(url.searchParams.get('url'), (url.searchParams.get('lang') || 'vi').split(','))); }
      catch (e) { return send(res, 400, e.message, 'text/plain; charset=utf-8'); }
    }

    // Chuyển tiếp gọi API giọng đọc (Gemini/Azure) để không bị trình duyệt chặn CORS
    if (p === '/api/proxy' && req.method === 'POST') {
      const b = await readBody(req, 5e6);
      let u; try { u = new URL(b.url); } catch (e) { return send(res, 400, 'URL không hợp lệ', 'text/plain; charset=utf-8'); }
      if (u.protocol !== 'https:' || !PROXY_HOSTS.some(r => r.test(u.hostname))) return send(res, 403, 'Không được phép gọi tới ' + u.hostname, 'text/plain; charset=utf-8');
      const headers = {};
      Object.entries(b.headers || {}).forEach(([k, v]) => { if (!/^(host|origin|referer|cookie|content-length)$/i.test(k)) headers[k] = String(v); });
      let r;
      try { r = await fetch(u.href, { method: b.method || 'POST', headers, body: b.body == null ? undefined : String(b.body) }); }
      catch (e) { return send(res, 502, 'Không kết nối được tới ' + u.hostname + ' (kiểm tra Internet): ' + ((e.cause && e.cause.code) || e.message), 'text/plain; charset=utf-8'); }
      const buf = Buffer.from(await r.arrayBuffer());
      res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'no-store' });
      return res.end(buf);
    }

    if (p === '/api/tts' && req.method === 'POST') {
      const b = await readBody(req, 1e6);
      if (!b.text || !b.text.trim()) return send(res, 400, 'Thiếu nội dung', 'text/plain; charset=utf-8');
      const out = path.join(WORK, 'tts-' + crypto.randomUUID() + '.mp3');
      let used = '';
      if (b.engine === 'piper') {
        try { used = (await piper.tts({ text: b.text.slice(0, 20000), lang: b.lang, gender: b.gender, key: b.piperVoice, rate: +b.rate || 0, out, ffmpeg: core.ffmpegPath() })).voice; }
        catch (e) { if (/chưa có giọng/.test(e.message)) return send(res, 422, e.message, 'text/plain; charset=utf-8'); throw e; }
      }
      else await core.tts({ text: b.text.slice(0, 20000), voice: b.voice, rate: +b.rate || 0, out });
      const data = fs.readFileSync(out); fs.rmSync(out, { force: true });
      res.setHeader('X-Voice', used);
      return send(res, 200, data, 'audio/mpeg');
    }

    // Piper: danh sách giọng theo ngôn ngữ, tải giọng, tiến độ tải
    if (p === '/api/piper/voices' && req.method === 'GET') return send(res, 200, await piper.voicesFor(url.searchParams.get('lang') || 'vi-VN'));
    if (p === '/api/piper/progress' && req.method === 'GET') return send(res, 200, piper.progress());
    if (p === '/api/piper/download' && req.method === 'POST') {
      const b = await readBody(req, 1e4);
      await piper.ensureVoice(String(b.key || ''));
      return send(res, 200, { ok: true });
    }

    if (p === '/api/render' && req.method === 'POST') {
      const b = await readBody(req);
      const id = crypto.randomUUID();
      const job = { id, status: 'queued', frame: 0, total: 0, cancelled: false, out: path.join(WORK, id + '.mp4') };
      jobs.set(id, job);
      const audio = [];
      if (b.audioWav) { const wav = path.join(WORK, id + '.wav'); fs.writeFileSync(wav, Buffer.from(b.audioWav, 'base64')); audio.push({ path: wav }); job.wav = wav; }
      const even = n => { n = Math.max(16, Math.round(+n || 0)); return n % 2 ? n + 1 : n; };
      queue = queue.then(async () => {
        if (job.cancelled) return;
        job.status = 'rendering';
        try {
          await core.render({
            html: String(b.html || ''), width: even(b.width || 1920), height: even(b.height || 1080),
            fps: Math.min(120, Math.max(1, +b.fps || 30)), duration: Math.min(1800, Math.max(0.1, +b.duration || 5)),
            quality: +b.quality || 1, audio, out: job.out,
            isCancelled: () => job.cancelled,
            onProgress: s => { job.frame = s.frame; job.total = s.total; if (s.encoding) job.status = 'encoding'; }
          });
          job.status = 'done';
        } catch (e) { job.status = 'error'; job.error = e.message; console.error('[render]', e.message); }
        if (job.wav) fs.rmSync(job.wav, { force: true });
      });
      return send(res, 200, { id });
    }

    const m = p.match(/^\/api\/jobs\/([\w-]+)(\/file)?$/);
    if (m) {
      const job = jobs.get(m[1]);
      if (!job) return send(res, 404, { error: 'Không thấy job' });
      if (req.method === 'DELETE') { job.cancelled = true; return send(res, 200, { ok: true }); }
      if (m[2]) {
        if (job.status !== 'done') return send(res, 409, { error: 'Chưa xong' });
        res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': fs.statSync(job.out).size });
        const st = fs.createReadStream(job.out);
        st.on('close', () => setTimeout(() => { fs.rmSync(job.out, { force: true }); jobs.delete(job.id); }, 60000));
        return st.pipe(res);
      }
      return send(res, 200, { status: job.status, frame: job.frame, total: job.total, error: job.error });
    }
    send(res, 404, 'Not found', 'text/plain');
  } catch (e) {
    console.error(e);
    send(res, 500, e.message || String(e), 'text/plain; charset=utf-8');
  }
});

/** Khởi động máy chủ. port = 0 để tự chọn cổng trống. Trả về cổng thực tế. */
function start(port = PORT, host = HOST) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server.address().port));
  });
}
async function stop() {
  await core.closeBrowser();
  try { server.close(); } catch (e) {}
  fs.rmSync(WORK, { recursive: true, force: true });
}
module.exports = { start, stop, info: { tts: !!TTS, ffmpeg: FF } };

if (require.main === module) {
  start().then(port => {
    console.log(`\n  HTML → Video Studio đang chạy:  http://localhost:${port}\n`);
    console.log(`  FFmpeg: ${FF ? 'có ✓' : 'CHƯA CÓ ✗ (cần để Xuất HQ)'}   ·   giọng Edge: ${TTS ? 'có ✓' : 'chưa có (npm install)'}\n`);
  }).catch(e => { console.error('Không mở được cổng:', e.message); process.exit(1); });
  const bye = async () => { await stop(); process.exit(0); };
  process.on('SIGINT', bye); process.on('SIGTERM', bye);
}
