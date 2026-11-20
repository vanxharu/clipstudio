// Lõi render chất lượng cao: Chrome (Playwright) chụp từng khung hình -> FFmpeg mã hoá H.264/AAC
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const SHIM = fs.readFileSync(path.join(__dirname, '..', 'src', 'timeshim.js'), 'utf8');
// FFmpeg: biến môi trường > bản đóng gói sẵn (ffmpeg-static) > ffmpeg trong PATH
function findFfmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const p = require('ffmpeg-static');
    if (p) { const unpacked = p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep); if (fs.existsSync(unpacked)) return unpacked; if (fs.existsSync(p)) return p; }
  } catch (e) {}
  return 'ffmpeg';
}
const FFMPEG = findFfmpeg();

function readMeta(html) {
  const m = html.match(/<meta\s+name=["']h2v["']\s+content=["']([^"']+)["']/i);
  const o = {};
  if (m) m[1].split(',').forEach(kv => { const [k, v] = kv.split('=').map(s => s.trim()); if (k) o[k] = +v; });
  return o;
}

function has(cmd, args) {
  try { const r = spawnSync(cmd, args, { stdio: 'ignore', timeout: 15000 }); return r.status === 0; } catch (e) { return false; }
}
function ttsCommand() {
  if (has('edge-tts', ['--help'])) return ['edge-tts', []];
  for (const py of ['python3', 'python', 'py']) if (has(py, ['-m', 'edge_tts', '--help'])) return [py, ['-m', 'edge_tts']];
  return null;
}
const ffmpegOk = () => has(FFMPEG, ['-version']);

let browserP = null;
async function getBrowser() {
  if (browserP) return browserP;
  browserP = (async () => {
    let pw;
    try { pw = require('playwright'); } catch (e) {
      try { pw = require('playwright-core'); } catch (e2) { throw new Error('Thiếu Playwright. Chạy: npm install'); }
    }
    const args = ['--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required', '--font-render-hinting=none'];
    const tries = [];
    if (process.env.CHROME_PATH) tries.push({ executablePath: process.env.CHROME_PATH });
    tries.push({}, { channel: 'chrome' }, { channel: 'msedge' });
    let lastErr;
    for (const t of tries) {
      try { return await pw.chromium.launch({ headless: true, args, ...t }); } catch (e) { lastErr = e; }
    }
    throw new Error('Không mở được Chromium. Chạy: npx playwright install chromium\n' + (lastErr && lastErr.message));
  })();
  browserP.catch(() => { browserP = null; });
  return browserP;
}
async function closeBrowser() { if (browserP) { try { (await browserP).close(); } catch (e) {} browserP = null; } }

function tts({ text, voice = 'vi-VN-HoaiMyNeural', rate = 0, out }) {
  const cmd = ttsCommand();
  if (!cmd) return Promise.reject(new Error('Chưa cài edge-tts. Chạy: pip install edge-tts'));
  const r = (rate >= 0 ? '+' : '') + Math.round(rate) + '%';
  const tmpTxt = path.join(os.tmpdir(), 'h2v-tts-' + process.pid + '-' + Date.now() + '.txt');
  fs.writeFileSync(tmpTxt, text, 'utf8');
  return new Promise((resolve, reject) => {
    const p = spawn(cmd[0], [...cmd[1], '--voice', voice, '--rate=' + r, '-f', tmpTxt, '--write-media', out]);
    let err = ''; p.stderr.on('data', d => err += d);
    p.on('error', reject);
    p.on('close', code => { fs.rmSync(tmpTxt, { force: true }); code === 0 && fs.existsSync(out) ? resolve(out) : reject(new Error('edge-tts lỗi: ' + err.slice(-400))); });
  });
}

/**
 * Render video.
 * opts: { url | html, width, height, fps, duration, out, audio: [{path, start, volume, voice?:bool}], quality: 0.6..1.8, onProgress, isCancelled }
 */
async function render(opts) {
  const { width, height, fps, duration, out } = opts;
  if (!ffmpegOk()) throw new Error('Không tìm thấy FFmpeg. Cài FFmpeg rồi thử lại (xem README).');
  const total = Math.max(1, Math.round(duration * fps));
  let tmpHtml = null, url = opts.url;
  if (!url) {
    tmpHtml = path.join(os.tmpdir(), 'h2v-' + process.pid + '-' + Date.now() + '.html');
    fs.writeFileSync(tmpHtml, opts.html, 'utf8');
    url = pathToFileURL(tmpHtml).href;
  }
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const logs = [];
  page.on('pageerror', e => logs.push('Lỗi JS trong trang: ' + e.message));
  await page.addInitScript(SHIM);
  let ff = null;
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => Promise.race([window.__h2v.ready(), new Promise(r => setTimeout(r, 5000))]));
    const cdp = await context.newCDPSession(page);

    // FFmpeg
    const crf = opts.quality >= 1.5 ? 15 : opts.quality <= 0.7 ? 23 : 18;
    const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', 'pipe:0'];
    const audio = (opts.audio || []).filter(a => a && a.path && fs.existsSync(a.path));
    audio.forEach(a => args.push('-i', a.path));
    if (audio.length) {
      const voices = [], beds = [];
      const parts = audio.map((a, i) => {
        const ms = Math.round((a.start || 0) * 1000), lab = 'a' + i;
        (a.voice ? voices : beds).push(lab);
        return `[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${a.volume ?? 1},adelay=${ms}|${ms}[${lab}]`;
      });
      let graph = parts.join(';');
      const mixIn = (labs, name) => labs.length === 1 ? (graph += `;[${labs[0]}]anull[${name}]`) : (graph += `;${labs.map(l => `[${l}]`).join('')}amix=inputs=${labs.length}:normalize=0[${name}]`);
      if (voices.length && beds.length && opts.duck !== false) {
        mixIn(voices, 'v'); mixIn(beds, 'b');
        graph += ';[v]asplit=2[v1][v2];[v1]apad[v1p];[b][v1p]sidechaincompress=threshold=0.03:ratio=8:attack=30:release=500[bd];[bd][v2]amix=inputs=2:normalize=0[aout]';
      } else mixIn(voices.concat(beds), 'aout');
      graph += `;[aout]apad,atrim=0:${duration}[afinal]`;
      args.push('-filter_complex', graph, '-map', '0:v', '-map', '[afinal]', '-c:a', 'aac', '-b:a', '192k');
    }
    args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-r', String(fps),
      '-t', String(duration), '-movflags', '+faststart', out);
    ff = spawn(FFMPEG, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let ffErr = ''; ff.stderr.on('data', d => ffErr += d);
    const ffDone = new Promise((res, rej) => { ff.on('close', c => c === 0 ? res() : rej(new Error('FFmpeg lỗi: ' + ffErr.slice(-800)))); ff.on('error', rej); });
    ff.stdin.on('error', () => {});

    const t0 = Date.now();
    for (let i = 0; i < total; i++) {
      if (opts.isCancelled && opts.isCancelled()) throw new Error('Đã huỷ');
      await page.evaluate(t => window.__h2v.advance(t), i * 1000 / fps);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 96, optimizeForSpeed: true, captureBeyondViewport: false });
      const buf = Buffer.from(data, 'base64');
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (opts.onProgress && (i % 5 === 4 || i === total - 1)) opts.onProgress({ frame: i + 1, total, elapsed: (Date.now() - t0) / 1000 });
    }
    ff.stdin.end();
    if (opts.onProgress) opts.onProgress({ frame: total, total, encoding: true });
    await ffDone;
    return { out, logs };
  } catch (e) {
    if (ff) { try { ff.kill('SIGKILL'); } catch (x) {} }
    if (logs.length) e.message += '\n' + logs.slice(0, 5).join('\n');
    throw e;
  } finally {
    await context.close().catch(() => {});
    if (tmpHtml) fs.rmSync(tmpHtml, { force: true });
  }
}

module.exports = { render, tts, ttsCommand, ffmpegOk, readMeta, closeBrowser, getBrowser };
