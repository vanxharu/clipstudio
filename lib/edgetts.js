// Giọng đọc Microsoft Edge (Read Aloud) viết bằng Node: miễn phí, không cần API key, không cần Python.
// Dùng dịch vụ không chính thức của Edge, có thể thay đổi bất cứ lúc nào.
const crypto = require('crypto');
const fs = require('fs');

const TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM = '130.0.2849.68';
const BASE = process.env.H2V_EDGE_WSS || 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
let clockSkew = 0; // giây, chỉnh khi máy chủ báo lệch giờ

function secMsGec() {
  let ticks = Math.floor(Date.now() / 1000 + clockSkew) + 11644473600;
  ticks -= ticks % 300;
  return crypto.createHash('sha256').update(`${BigInt(ticks) * 10000000n}${TOKEN}`).digest('hex').toUpperCase();
}
const uid = () => crypto.randomUUID().replace(/-/g, '');
const stamp = () => new Date().toString().replace(/\(.*\)$/, '').trim() + ' (Coordinated Universal Time)';
const escXml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function getWS() {
  try { return require('ws'); } catch (e) { return null; }
}

/** Chia văn bản dài thành các đoạn ≤ max ký tự, ưu tiên cắt ở cuối câu. */
function split(text, max = 900) {
  const out = []; let rest = text.trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf('. ', max); if (cut < max * 0.5) cut = rest.lastIndexOf(' ', max); if (cut < 1) cut = max;
    out.push(rest.slice(0, cut + 1).trim()); rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

function synthOnce(text, voice, rate) {
  const WS = getWS();
  if (!WS) return Promise.reject(new Error('Thiếu thư viện ws'));
  const url = `${BASE}?TrustedClientToken=${TOKEN}&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=1-${CHROMIUM}&ConnectionId=${uid()}`;
  return new Promise((resolve, reject) => {
    const ws = new WS(url, {
      headers: {
        Pragma: 'no-cache', 'Cache-Control': 'no-cache', Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM.split('.')[0]}.0.0.0 Safari/537.36 Edg/${CHROMIUM.split('.')[0]}.0.0.0`
      }
    });
    const chunks = []; let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; try { ws.terminate(); } catch (e) {} reject(new Error('Edge TTS quá thời gian')); } }, 60000);
    ws.on('unexpected-response', (req, res) => {
      const d = res.headers && res.headers.date;
      if (d) { const skew = (Date.parse(d) - Date.now()) / 1000; if (Math.abs(skew) > 60) clockSkew = skew; }
      done = true; clearTimeout(timer); reject(new Error('Edge TTS từ chối kết nối (' + res.statusCode + ')' + (res.statusCode === 403 ? ', có thể do lệch giờ máy, thử lại' : '')));
    });
    ws.on('open', () => {
      ws.send(`X-Timestamp:${stamp()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n');
      const lang = voice.split('-').slice(0, 2).join('-');
      const r = (rate >= 0 ? '+' : '') + Math.round(rate) + '%';
      ws.send(`X-RequestId:${uid()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${stamp()}Z\r\nPath:ssml\r\n\r\n` +
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'><voice name='${voice}'><prosody pitch='+0Hz' rate='${r}' volume='+0%'>${escXml(text)}</prosody></voice></speak>`);
    });
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        if (buf.length < 2) return;
        const hl = buf.readUInt16BE(0), head = buf.slice(2, 2 + hl).toString();
        if (/Path:audio/.test(head)) chunks.push(buf.slice(2 + hl));
        return;
      }
      if (/Path:turn\.end/.test(String(data))) { done = true; clearTimeout(timer); try { ws.close(); } catch (e) {} chunks.length ? resolve(Buffer.concat(chunks)) : reject(new Error('Edge TTS không trả âm thanh')); }
    });
    ws.on('error', e => { if (!done) { done = true; clearTimeout(timer); reject(new Error('Edge TTS lỗi: ' + e.message)); } });
    ws.on('close', () => { if (!done) { done = true; clearTimeout(timer); chunks.length ? resolve(Buffer.concat(chunks)) : reject(new Error('Edge TTS đóng kết nối')); } });
  });
}

/** Tạo file mp3. */
async function tts({ text, voice = 'vi-VN-HoaiMyNeural', rate = 0, out }) {
  const parts = split(text);
  const bufs = [];
  for (const p of parts) {
    let lastErr;
    for (let i = 0; i < 2; i++) { try { bufs.push(await synthOnce(p, voice, rate)); lastErr = null; break; } catch (e) { lastErr = e; } }
    if (lastErr) throw lastErr;
  }
  fs.writeFileSync(out, Buffer.concat(bufs));
  return out;
}

module.exports = { tts, available: () => !!getWS(), _secMsGec: secMsGec, _split: split };
