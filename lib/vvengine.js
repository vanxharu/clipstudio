// Giọng đọc tiếng Nhật qua VOICEVOX ENGINE (cổng 50021) hoặc AivisSpeech Engine (cổng 10101).
// Hai phần mềm miễn phí, chạy trên máy người dùng, cùng kiểu API: POST /audio_query → POST /synthesis (WAV).
'use strict';

const ENGINES = {
  aivis: { id: 'aivis', name: 'AivisSpeech', url: process.env.H2V_AIVIS_URL || 'http://127.0.0.1:10101' },
  voicevox: { id: 'voicevox', name: 'VOICEVOX', url: process.env.H2V_VOICEVOX_URL || 'http://127.0.0.1:50021' }
};

async function call(engine, path, opts = {}, timeoutMs = 120000) {
  const e = ENGINES[engine]; if (!e) throw new Error('Không rõ bộ máy giọng đọc: ' + engine);
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(e.url + path, Object.assign({ signal: ctrl.signal }, opts));
    if (!r.ok) throw new Error(`${e.name} báo lỗi ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(e.name + ' không phản hồi.');
    if (/fetch failed|ECONNREFUSED/i.test(err.message + (err.cause ? err.cause.code : ''))) throw Object.assign(new Error(e.name + ' chưa chạy. Hãy mở ' + e.name + ' rồi thử lại.'), { offline: true });
    throw err;
  } finally { clearTimeout(t); }
}

/** Bộ máy nào đang chạy */
async function engines() {
  return Promise.all(Object.values(ENGINES).map(async e => {
    try { const r = await call(e.id, '/version', {}, 1500); return { id: e.id, name: e.name, ok: true, version: String(await r.text()).replace(/"/g, '') }; }
    catch (err) { return { id: e.id, name: e.name, ok: false }; }
  }));
}

/** Danh sách nhân vật và kiểu giọng: [{ name, uuid, styles: [{ id, name }] }] */
async function speakers(engine) {
  const r = await call(engine, '/speakers', {}, 15000);
  return (await r.json()).map(s => ({ name: s.name, uuid: s.speaker_uuid, styles: (s.styles || []).filter(x => !x.type || x.type === 'talk').map(x => ({ id: x.id, name: x.name })) }))
    .filter(s => s.styles.length);
}

/** Tạo WAV. rate: % tốc độ (-50…+100); pitch: % cao độ; intonation: % ngữ điệu */
async function tts(engine, { text, speaker, rate = 0, pitch = 0, intonation = 0 }) {
  const q = new URLSearchParams({ text: String(text), speaker: String(speaker) });
  const query = await (await call(engine, '/audio_query?' + q, { method: 'POST' })).json();
  query.speedScale = Math.max(0.5, Math.min(2, 1 + (+rate || 0) / 100));
  if (engine === 'voicevox') query.pitchScale = Math.max(-0.15, Math.min(0.15, (+pitch || 0) / 100 * 0.5));
  query.intonationScale = Math.max(0, Math.min(2, 1 + (+intonation || 0) / 100));
  query.prePhonemeLength = 0.1; query.postPhonemeLength = 0.15;
  const r = await call(engine, '/synthesis?speaker=' + encodeURIComponent(speaker), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query) });
  return Buffer.from(await r.arrayBuffer());
}
module.exports = { ENGINES, engines, speakers, tts };
