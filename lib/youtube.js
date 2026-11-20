// Lấy thông tin video và phụ đề YouTube (không cần API key).
// YouTube thay đổi thường xuyên: nếu không lấy được phụ đề, app sẽ nhờ Gemini nghe video.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const ANDROID = { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 34, osName: 'Android', osVersion: '14' };
const BASE = process.env.H2V_YT_BASE || 'https://www.youtube.com';

function videoId(input) {
  const s = String(input || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/|\/v\/)([\w-]{11})/);
  return m ? m[1] : null;
}

/** Tìm và đọc một object JSON đứng sau một đoạn đánh dấu trong HTML (đếm ngoặc, bỏ qua chuỗi). */
function extractJson(html, marker) {
  let i = html.indexOf(marker); if (i < 0) return null;
  i = html.indexOf('{', i); if (i < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { try { return JSON.parse(html.slice(i, j + 1)); } catch (e) { return null; } } }
  }
  return null;
}
const num = s => { if (s == null) return null; const d = String(s).replace(/[^\d]/g, ''); return d ? +d : null; };

function findLikes(html, data) {
  let m = html.match(/"likeCount"\s*:\s*"?(\d+)/); if (m) return +m[1];
  m = html.match(/"label"\s*:\s*"([\d.,\s]+)\s*(?:lượt thích|likes?|người thích)/i); if (m) return num(m[1]);
  m = html.match(/"accessibilityText"\s*:\s*"[^"]*?([\d.,]+)\s*(?:lượt thích|likes?)/i); if (m) return num(m[1]);
  return null;
}

async function fetchText(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { 'User-Agent': UA, 'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8', Cookie: 'CONSENT=YES+cb; SOCS=CAI', ...(opts.headers || {}) } });
  if (!r.ok) throw new Error('YouTube trả lỗi ' + r.status);
  return r.text();
}

function pickTrack(tracks, prefer) {
  if (!tracks || !tracks.length) return null;
  const manual = tracks.filter(t => t.kind !== 'asr'), auto = tracks.filter(t => t.kind === 'asr');
  for (const list of [manual, auto]) for (const lang of prefer) { const t = list.find(x => (x.languageCode || '').startsWith(lang)); if (t) return t; }
  return manual[0] || auto[0];
}

function parseJson3(txt) {
  const j = JSON.parse(txt), out = [];
  (j.events || []).forEach(e => {
    if (!e.segs) return;
    const text = decodeEntities(e.segs.map(s => s.utf8 || '').join('')).replace(/\s+/g, ' ').trim();
    if (text) out.push({ start: (e.tStartMs || 0) / 1000, dur: (e.dDurationMs || 0) / 1000, text });
  });
  return out;
}
function decodeEntities(s) { return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)); }
function parseXml(txt) {
  const out = [];
  const re = /<text start="([\d.]+)"(?: dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g; let m;
  while ((m = re.exec(txt))) { const t = decodeEntities(decodeEntities(m[3].replace(/<[^>]+>/g, ''))).replace(/\s+/g, ' ').trim(); if (t) out.push({ start: +m[1], dur: +(m[2] || 0), text: t }); }
  if (!out.length) { // định dạng srv3: <p t="ms" d="ms">
    const re2 = /<p t="(\d+)"(?: d="(\d+)")?[^>]*>([\s\S]*?)<\/p>/g;
    while ((m = re2.exec(txt))) { const t = decodeEntities(m[3].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim(); if (t) out.push({ start: +m[1] / 1000, dur: +(m[2] || 0) / 1000, text: t }); }
  }
  return out;
}
async function downloadTrack(track) {
  const base = track.baseUrl.replace(/&fmt=[^&]*/g, '');
  try { const t = await fetchText(base + '&fmt=json3'); if (t.trim()) { const s = parseJson3(t); if (s.length) return s; } } catch (e) {}
  const x = await fetchText(base); if (!x.trim()) throw new Error('YouTube trả phụ đề rỗng (có thể cần mã xác thực PoToken)');
  const s = parseXml(x); if (!s.length) throw new Error('Không đọc được phụ đề'); return s;
}

async function innertubeTracks(id) {
  const r = await fetch(BASE + '/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': `com.google.android.youtube/${ANDROID.clientVersion} (Linux; U; Android 14) gzip`, 'X-YouTube-Client-Name': '3', 'X-YouTube-Client-Version': ANDROID.clientVersion },
    body: JSON.stringify({ context: { client: { ...ANDROID, hl: 'vi', gl: 'VN' } }, videoId: id, contentCheckOk: true, racyCheckOk: true })
  });
  if (!r.ok) throw new Error('InnerTube lỗi ' + r.status);
  const j = await r.json();
  return { tracks: (((j.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks) || [], details: j.videoDetails || null };
}

/** Lấy thông tin + phụ đề. Trả về { info, transcript, transcriptError } */
async function getVideo(url, prefer = ['vi']) {
  const id = videoId(url);
  if (!id) throw new Error('Link YouTube không hợp lệ');
  let info = { id, url: 'https://www.youtube.com/watch?v=' + id, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }, webTracks = [], lang0 = null;
  try {
    const html = await fetchText(`${BASE}/watch?v=${id}&hl=vi&gl=VN`);
    const player = extractJson(html, 'ytInitialPlayerResponse = ') || extractJson(html, 'ytInitialPlayerResponse=');
    if (player) {
      const vd = player.videoDetails || {}, mf = ((player.microformat || {}).playerMicroformatRenderer) || {};
      Object.assign(info, {
        title: vd.title || (mf.title && mf.title.simpleText), channel: vd.author || mf.ownerChannelName, channelId: vd.channelId,
        lengthSeconds: num(vd.lengthSeconds), views: num(vd.viewCount), description: vd.shortDescription || '', keywords: vd.keywords || [],
        category: mf.category || null, publishDate: (mf.publishDate || mf.uploadDate || '').slice(0, 10) || null, likes: findLikes(html)
      });
      webTracks = (((player.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks) || [];
      const pa = player.playabilityStatus; if (pa && pa.status && pa.status !== 'OK') info.playability = pa.reason || pa.status;
    }
  } catch (e) { info.error = e.message; }
  if (!info.title) { // dự phòng: oEmbed (chỉ có tên video và kênh)
    try { const j = JSON.parse(await fetchText(`${BASE}/oembed?format=json&url=${encodeURIComponent(info.url)}`)); info.title = j.title; info.channel = j.author_name; } catch (e) {}
  }
  // Phụ đề: thử InnerTube (ANDROID) trước, rồi tới phụ đề từ trang xem
  let transcript = null, transcriptError = null;
  const attempts = [];
  try { const it = await innertubeTracks(id); attempts.push(['android', it.tracks]); if (it.details && !info.title) { info.title = it.details.title; info.channel = it.details.author; info.lengthSeconds = num(it.details.lengthSeconds); info.views = num(it.details.viewCount); } } catch (e) { transcriptError = e.message; }
  attempts.push(['web', webTracks]);
  for (const [src, tracks] of attempts) {
    if (!tracks.length) continue;
    lang0 = lang0 || (tracks.find(t => t.kind === 'asr') || tracks[0]).languageCode;
    const tr = pickTrack(tracks, prefer.concat(lang0 ? [lang0] : []));
    try {
      const segs = await downloadTrack(tr);
      transcript = { segments: segs, lang: tr.languageCode, auto: tr.kind === 'asr', source: 'youtube-' + src };
      transcriptError = null;
      break;
    } catch (e) { transcriptError = e.message; }
  }
  if (!transcript && !transcriptError) transcriptError = 'Video không có phụ đề';
  return { info, transcript, transcriptError };
}

module.exports = { getVideo, videoId, extractJson, parseJson3, parseXml };
