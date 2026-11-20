/* 📺 YouTube Studio: dự án · phân tích video · viết lại kịch bản · SEO · thumbnail · mô tả.
   Dùng chung AI (aiCall), giọng đọc, nhân vật với trình dựng video. */
var H2VStudio = (function () {
  'use strict';
  var ST = { projects: [], curId: null, page: 'dash', busy: null, ctrl: null, stats: { runs: 0, lastMs: 0, totalMs: 0 }, channel: { name: '', email: '', fanpage: '', links: '' }, rwTab: 'script', seoTab: 'result' };
  var LANGS = ['Tiếng Việt', 'English', '日本語', '한국어', '中文', 'Español', 'Français', 'Bahasa Indonesia', 'ไทย'];
  var LEVELS = [['light', 'Rewrite nhẹ', 'giữ gần như nguyên câu chữ, chỉ diễn đạt lại cho mượt và tránh trùng lặp'], ['medium', 'Rewrite vừa', 'diễn đạt lại phần lớn câu chữ, giữ cấu trúc và ý'], ['full', 'Rewrite hoàn toàn', 'viết lại hoàn toàn bằng lời văn mới, có thể đổi cấu trúc, ví dụ, cách kể']];
  var MODES = [['youtube', 'Viết lại từ link YouTube'], ['file', 'Viết lại từ file tải lên'], ['none', 'Không viết lại kịch bản'], ['ref', 'Viết kịch bản từ link tham khảo'], ['idea', 'Viết kịch bản từ ý tưởng']];

  /* ---------- tiện ích ---------- */
  var $s = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmtNum(n) { return n == null ? '—' : Number(n).toLocaleString('vi-VN'); }
  function fmtTime(sec, forceH) { sec = Math.max(0, Math.round(sec || 0)); var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return (h || forceH ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(s).padStart(2, '0'); }
  function srtTime(t) { var ms = Math.round(t * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000); return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + ',' + String(ms % 1000).padStart(3, '0'); }
  function download(name, text, type) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  function copy(text) { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast('Đã copy'); }, function () { toast('Không copy được, hãy chọn và Ctrl+C'); }); }
  function fileName(s) { return (slug(s || 'du-an') || 'du-an').slice(0, 60); }
  function words(t) { return (t || '').trim().split(/\s+/).filter(Boolean).length; }
  function cur() { return ST.projects.find(function (p) { return p.id === ST.curId; }) || null; }

  function md(src) { // markdown tối giản
    var lines = String(src || '').replace(/\r/g, '').split('\n'), out = [], list = null, table = null;
    function inline(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>'); }
    function flush() { if (list) { out.push('</' + list + '>'); list = null; } if (table) { out.push(table + '</table>'); table = null; } }
    lines.forEach(function (l) {
      var m;
      if (/^\s*\|.*\|\s*$/.test(l)) {
        if (/^\s*\|[\s:|-]+\|\s*$/.test(l)) return;
        var cells = l.trim().slice(1, -1).split('|').map(function (c) { return '<td>' + inline(c.trim()) + '</td>'; }).join('');
        if (!table) { flush(); table = '<table class="st-md-table">'; }
        table += '<tr>' + cells + '</tr>'; return;
      }
      if (table) { out.push(table + '</table>'); table = null; }
      if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { flush(); out.push('<h' + (m[1].length + 2) + '>' + inline(m[2]) + '</h' + (m[1].length + 2) + '>'); }
      else if ((m = l.match(/^\s*[-*•]\s+(.*)$/))) { if (list !== 'ul') { flush(); out.push('<ul>'); list = 'ul'; } out.push('<li>' + inline(m[1]) + '</li>'); }
      else if ((m = l.match(/^\s*\d+[.)]\s+(.*)$/))) { if (list !== 'ol') { flush(); out.push('<ol>'); list = 'ol'; } out.push('<li>' + inline(m[1]) + '</li>'); }
      else if (!l.trim()) flush();
      else { if (list) flush(); out.push('<p>' + inline(l) + '</p>'); }
    });
    flush(); return out.join('');
  }
  function parseJsonLoose(text) {
    var m = text.match(/```(?:json)?\s*\n([\s\S]*?)```/), body = m ? m[1] : text;
    var a = body.indexOf('{'), b = body.lastIndexOf('}');
    if (a >= 0 && b > a) body = body.slice(a, b + 1);
    try { return JSON.parse(body); } catch (e) { try { return Function('"use strict";return (' + body + ')')(); } catch (e2) { throw new Error('AI trả về sai định dạng, hãy bấm chạy lại.'); } }
  }

  /* ---------- lưu trữ ---------- */
  function loadAll() {
    try { var o = JSON.parse(localStorage.getItem('h2v-studio') || '{}'); if (o.stats) ST.stats = o.stats; if (o.channel) ST.channel = o.channel; if (o.curId) ST.curId = o.curId; } catch (e) {}
    return IDB.get('studio-projects').then(function (v) { ST.projects = v || []; }).catch(function () { ST.projects = []; });
  }
  var saveT = null;
  function saveAll() {
    try { localStorage.setItem('h2v-studio', JSON.stringify({ stats: ST.stats, channel: ST.channel, curId: ST.curId })); } catch (e) {}
    clearTimeout(saveT); saveT = setTimeout(function () { IDB.set('studio-projects', ST.projects).catch(function (e) { toast('Không lưu được dự án: ' + e.message); }); }, 300);
  }
  function newProject(name) {
    var p = { id: 'p' + Date.now().toString(36), name: name || 'Dự án mới', created: Date.now(), updated: Date.now(), status: 'Mới',
      url: '', info: null, transcript: null, analysis: '', rewrite: { mode: 'youtube', level: 'light', keepIdea: true, keepEmotion: true, keepCta: true, lang: 'Tiếng Việt', dur: '00:05:00', extra: '', idea: '', refUrl: '', fileText: '', fileName: '' },
      script: '', scriptSrc: '', srt: '', seo: null, chosenTitle: '', thumb: { style: 'webcomic', aspect: '16:9', note: '', charId: '', concepts: null }, desc: null };
    ST.projects.unshift(p); ST.curId = p.id; saveAll(); return p;
  }
  function touch(p, status) { p.updated = Date.now(); if (status) p.status = status; saveAll(); }

  /* ---------- AI ---------- */
  function aiReady() { return !!aiKey(); }
  function modelName() { return (AI.provider === 'gemini' ? 'Gemini · ' : 'ChatGPT · ') + (aiModel() || 'chưa chọn'); }
  function setStatus(msg) { var el = $s('stStatus'); if (el) el.textContent = msg || ('Sẵn sàng (Dự án: ' + ((cur() || {}).name || '—') + ' | Model: ' + modelName() + ')'); }
  async function runAI(label, system, user, onText) {
    if (!aiReady()) { ST.page = 'settings'; render(); throw new Error('Chưa có API key. Nhập Gemini key (miễn phí) trong ⚙️ Cài đặt của Studio.'); }
    if (ST.busy) throw new Error('Đang chạy: ' + ST.busy);
    ST.busy = label; ST.ctrl = new AbortController(); renderBusy();
    var t0 = performance.now(), last = 0;
    try {
      var r = await aiCall(system, user, function (txt) {
        var now = performance.now(); if (now - last < 200) return; last = now;
        setStatus('⏳ ' + label + '… ' + Math.round((now - t0) / 1000) + 's · ' + (txt.length / 1000).toFixed(1) + 'k ký tự');
        if (onText) onText(txt);
      }, ST.ctrl.signal);
      var ms = performance.now() - t0; ST.stats.runs++; ST.stats.lastMs = ms; ST.stats.totalMs += ms; saveAll();
      return r.text;
    } catch (e) { if (e.name === 'AbortError') throw new Error('Đã dừng'); throw e; }
    finally { ST.busy = null; ST.ctrl = null; renderBusy(); setStatus(); }
  }
  function renderBusy() { var b = $s('stStop'); if (b) b.style.display = ST.busy ? '' : 'none'; document.querySelectorAll('#studio [data-ai]').forEach(function (x) { x.disabled = !!ST.busy; }); }
  function sourceText(p) { return p.script || transcriptText(p, 'plain'); }

  /* ---------- lời thoại ---------- */
  function transcriptText(p, fmt) {
    var segs = p.transcript && p.transcript.segments; if (!segs || !segs.length) return '';
    if (fmt === 'srt') return segs.map(function (s, i) { return (i + 1) + '\n' + srtTime(s.start) + ' --> ' + srtTime(s.start + (s.dur || 2)) + '\n' + s.text + '\n'; }).join('\n');
    var longV = segs[segs.length - 1].start >= 3600;
    if (fmt === 'time') return segs.map(function (s) { return '[' + fmtTime(s.start, longV) + '] ' + s.text; }).join('\n');
    // văn bản liền: gộp thành đoạn ~ mỗi 45 giây
    var out = [], para = [], t0 = segs[0].start;
    segs.forEach(function (s) { if (s.start - t0 > 45 && /[.!?…]$/.test(para.join(' ').trim())) { out.push(para.join(' ')); para = []; t0 = s.start; } para.push(s.text); });
    if (para.length) out.push(para.join(' '));
    return out.join('\n\n');
  }
  function chaptersSource(p) { // tóm lược mốc thời gian cho AI (~mỗi 30s một dòng)
    var segs = p.transcript && p.transcript.segments;
    if (p.srt) return p.srt.split(/\n\n+/).map(function (b) { var l = b.split('\n'); return l[1] ? '[' + l[1].slice(0, 8) + '] ' + l.slice(2).join(' ') : ''; }).filter(Boolean).join('\n').slice(0, 30000);
    if (!segs) return '';
    var out = [], buf = [], t0 = 0;
    segs.forEach(function (s) { if (s.start - t0 >= 30 && buf.length) { out.push('[' + fmtTime(t0) + '] ' + buf.join(' ')); buf = []; t0 = s.start; } buf.push(s.text); });
    if (buf.length) out.push('[' + fmtTime(t0) + '] ' + buf.join(' '));
    return out.join('\n').slice(0, 30000);
  }
  function parseTimedText(text) {
    var segs = [];
    text.split(/\r?\n/).forEach(function (l) {
      var m = l.trim().match(/^\[?(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,]\d+)?\]?\s*[-–:]?\s*(.+)$/);
      if (!m) { if (segs.length && l.trim()) segs[segs.length - 1].text += ' ' + l.trim(); return; }
      var t = m[3] != null ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : (+m[1]) * 60 + (+m[2]);
      segs.push({ start: t, dur: 0, text: m[4].trim() });
    });
    segs.forEach(function (s, i) { s.dur = segs[i + 1] ? Math.max(0.5, segs[i + 1].start - s.start) : 3; });
    return segs.filter(function (s) { return s.text && !/^\(không có lời thoại\)$/i.test(s.text); });
  }
  function parseSrt(text) {
    return text.replace(/\r/g, '').split(/\n\n+/).map(function (b) {
      var l = b.trim().split('\n'), i = /-->/.test(l[0]) ? 0 : 1; if (!l[i] || !/-->/.test(l[i])) return null;
      var tt = l[i].split('-->').map(function (x) { var m = x.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000 : 0; });
      return { start: tt[0], dur: Math.max(0.3, tt[1] - tt[0]), text: l.slice(i + 1).join(' ').trim() };
    }).filter(Boolean);
  }
  async function geminiTranscribe(p, onText) {
    var key = TTS.gKey.trim(); if (!key) throw new Error('Cần Gemini API key (⚙️ Cài đặt) để nhờ Gemini nghe video.');
    var model = (AI.provider === 'gemini' && AI.gModel) || 'gemini-3.5-flash';
    ST.busy = 'Gemini đang nghe video'; ST.ctrl = new AbortController(); renderBusy();
    var t0 = performance.now(), text = '';
    try {
      var r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':streamGenerateContent?alt=sse', {
        method: 'POST', signal: ST.ctrl.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ fileData: { fileUri: p.url } }, { text: 'Chép lại CHÍNH XÁC toàn bộ lời nói trong video, giữ nguyên ngôn ngữ gốc, không tóm tắt, không thêm bình luận hay mô tả hình ảnh. Mỗi dòng một câu theo định dạng [mm:ss] nội dung (video dài hơn 1 giờ thì [h:mm:ss]). Nếu video không có lời nói, chỉ ghi: [00:00] (không có lời thoại)' }] }],
          generationConfig: { temperature: 0.1, mediaResolution: 'MEDIA_RESOLUTION_LOW' } })
      });
      if (!r.ok) throw await aiHttpError(r, 'Gemini');
      for await (var d of sseData(r)) {
        var j; try { j = JSON.parse(d); } catch (e) { continue; }
        if (j.error) throw new Error('Gemini: ' + j.error.message);
        var c = j.candidates && j.candidates[0];
        ((c && c.content && c.content.parts) || []).forEach(function (pt) { if (pt.text && !pt.thought) text += pt.text; });
        setStatus('⏳ Gemini đang nghe video… ' + Math.round((performance.now() - t0) / 1000) + 's · ' + text.split('\n').length + ' dòng');
        if (onText) onText(text);
      }
      var ms = performance.now() - t0; ST.stats.runs++; ST.stats.lastMs = ms; ST.stats.totalMs += ms;
      var segs = parseTimedText(text);
      if (!segs.length) throw new Error('Gemini không chép được lời thoại (video có thể riêng tư, quá dài hoặc không có lời nói).');
      return { segments: segs, lang: null, auto: true, source: 'gemini' };
    } catch (e) { if (e.name === 'AbortError') throw new Error('Đã dừng'); throw e; }
    finally { ST.busy = null; ST.ctrl = null; renderBusy(); setStatus(); }
  }

  /* ---------- so sánh thay đổi ---------- */
  function sentences(t) { return (t || '').replace(/\r/g, '').split(/(?<=[.!?…])\s+|\n+/).map(function (s) { return s.trim(); }).filter(Boolean); }
  function lcsOps(a, b, key) {
    var n = a.length, m = b.length, w = m + 1, dp = new Uint32Array((n + 1) * w);
    for (var i = n - 1; i >= 0; i--) for (var j = m - 1; j >= 0; j--) dp[i * w + j] = key(a[i]) === key(b[j]) ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    var ops = []; i = 0; j = 0;
    while (i < n && j < m) { if (key(a[i]) === key(b[j])) { ops.push(['=', b[j]]); i++; j++; } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) ops.push(['-', a[i++]]); else ops.push(['+', b[j++]]); }
    while (i < n) ops.push(['-', a[i++]]); while (j < m) ops.push(['+', b[j++]]);
    return ops;
  }
  function diffHtml(oldT, newT) {
    var A = sentences(oldT), B = sentences(newT);
    if (A.length * B.length > 4e6) { A = A.slice(0, 1500); B = B.slice(0, 1500); }
    var norm = function (s) { return s.toLowerCase().replace(/\s+/g, ' '); };
    var ops = lcsOps(A, B, norm), out = [], del = [], ins = [], stat = { same: 0, changed: 0 };
    function flushBlock() {
      if (!del.length && !ins.length) return;
      var a = del.join(' ').split(/\s+/).filter(Boolean), b = ins.join(' ').split(/\s+/).filter(Boolean);
      if (a.length && b.length && a.length * b.length < 300000) {
        lcsOps(a, b, norm).forEach(function (o) { out.push(o[0] === '=' ? esc(o[1]) + ' ' : '<span class="st-' + (o[0] === '+' ? 'ins' : 'del') + '">' + esc(o[1]) + '</span> '); });
      } else {
        if (a.length) out.push('<span class="st-del">' + esc(del.join(' ')) + '</span> ');
        if (b.length) out.push('<span class="st-ins">' + esc(ins.join(' ')) + '</span> ');
      }
      stat.changed += Math.max(del.length, ins.length); del = []; ins = [];
    }
    ops.forEach(function (o) { if (o[0] === '=') { flushBlock(); out.push(esc(o[1]) + ' '); stat.same++; } else (o[0] === '-' ? del : ins).push(o[1]); });
    flushBlock();
    return { html: out.join(''), stat: stat };
  }

  /* ---------- phụ đề SRT từ kịch bản ---------- */
  function buildSrt(script, totalSec) {
    var chunks = [];
    sentences(script).forEach(function (s) {
      var w = s.split(/\s+/);
      if (w.length <= 14) { chunks.push(s); return; }
      var parts = s.split(/(?<=[,;:])\s+/), buf = [];
      parts.forEach(function (pt) { var pw = pt.split(/\s+/); if (buf.length + pw.length > 14 && buf.length) { chunks.push(buf.join(' ')); buf = []; } while (pw.length > 14) { chunks.push(pw.splice(0, 12).join(' ')); } buf = buf.concat(pw); });
      if (buf.length) chunks.push(buf.join(' '));
    });
    if (!chunks.length) return '';
    var chars = chunks.reduce(function (n, c) { return n + c.length + 8; }, 0);
    var total = totalSec || Math.max(5, words(script) / 2.5), t = 0;
    return chunks.map(function (c, i) { var d = Math.max(1.2, total * (c.length + 8) / chars); var s = (i + 1) + '\n' + srtTime(t) + ' --> ' + srtTime(t + d - 0.05) + '\n' + c + '\n'; t += d; return s; }).join('\n');
  }
  function durToSec(s) { var p = String(s || '').split(':').map(Number); return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0); }

  /* ---------- giao diện chung ---------- */
  var CSS = '\
#studio{position:fixed;inset:0;z-index:15;background:var(--bg);display:none;grid-template-columns:86px 1fr;grid-template-rows:52px 1fr 30px;color:var(--text)}\
#studio.on{display:grid}\
.st-top{grid-column:1/-1;display:flex;align-items:center;gap:10px;padding:0 16px;border-bottom:1px solid var(--line);background:var(--panel)}\
.st-top b{font-size:16px}.st-top .sp{flex:1}\
.st-nav{border-right:1px solid var(--line);background:var(--panel);display:flex;flex-direction:column;gap:4px;padding:10px 6px}\
.st-nav button{background:none;border:0;border-radius:10px;padding:9px 4px;color:var(--mute);cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:11px}\
.st-nav button span{font-size:20px}.st-nav button.on{color:var(--acc2);background:color-mix(in srgb,var(--acc) 13%,transparent)}\
.st-main{overflow-y:auto;padding:20px 26px 40px}\
.st-main h1{font-size:26px;margin:0 0 16px}\
.st-card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:14px}\
.st-card h2{font-size:16px;margin:0 0 12px;display:flex;align-items:center;gap:8px}.st-card h2 .sp{flex:1}\
.st-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}\
.st-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:14px}\
.st-grid2 b{color:var(--mute);font-weight:500}\
.st-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}\
.st-stat{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;display:flex;gap:12px;align-items:center}\
.st-stat span{font-size:28px}.st-stat small{color:var(--mute);display:block}.st-stat b{font-size:20px}\
.st-table{width:100%;border-collapse:collapse;font-size:13px}.st-table th,.st-table td{text-align:left;padding:8px;border-bottom:1px solid var(--line)}.st-table th{color:var(--mute);font-weight:500}\
.st-table tr.on td{background:color-mix(in srgb,var(--acc) 10%,transparent)}\
.st-text{width:100%;min-height:200px;resize:vertical;font:13px/1.65 system-ui,sans-serif}\
.st-out{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:12px 14px;min-height:120px;max-height:60vh;overflow-y:auto;font-size:14px;line-height:1.65;white-space:pre-wrap}\
.st-out.md{white-space:normal}.st-out.md h3,.st-out.md h4{margin:12px 0 6px}.st-out.md p{margin:6px 0}\
.st-md-table{border-collapse:collapse;margin:8px 0}.st-md-table td{border:1px solid var(--line);padding:4px 8px}\
.st-tabs{display:flex;gap:6px;margin-bottom:10px}\
.st-del{background:rgba(255,93,108,.22);color:#ffb3bb;text-decoration:line-through}.st-ins{background:rgba(62,207,142,.2);color:#b8f5d8}\
.st-empty{color:var(--mute);font-size:13px;padding:10px 0}\
.st-status{grid-column:1/-1;border-top:1px solid var(--line);background:var(--panel);font-size:12px;color:var(--mute);padding:6px 16px;display:flex;gap:10px;align-items:center}\
.st-status .sp{flex:1}\
.st-radio{display:flex;gap:6px 18px;flex-wrap:wrap;font-size:14px}.st-radio label{display:flex;gap:6px;align-items:center;cursor:pointer}\
.st-concept{border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:10px;background:var(--bg)}\
.st-concept h3{margin:0 0 6px;font-size:15px;color:var(--acc2)}\
.st-thumb{width:220px;border-radius:8px;border:1px solid var(--line)}\
.st-score{font-weight:700}.st-score.hi{color:var(--ok)}.st-score.mid{color:var(--acc2)}\
@media(max-width:900px){.st-stats{grid-template-columns:1fr 1fr}.st-grid2{grid-template-columns:1fr}}';

  var PAGES = [['dash', '🏠', 'Dự án'], ['analyze', '📺', 'Phân tích'], ['rewrite', '✍️', 'Viết lại'], ['seo', '🏷️', 'SEO'], ['thumb', '🖼️', 'Thumbnail'], ['desc', '📄', 'Mô tả'], ['settings', '⚙️', 'Cài đặt']];
  function shell() {
    var root = document.createElement('div'); root.id = 'studio';
    root.innerHTML = '<div class="st-top"><b>📺 YouTube Studio</b><select class="inp" id="stProj" title="Dự án đang mở"></select><span class="sp"></span>' +
      '<button class="btn" id="stBack">← Về trình dựng video</button></div>' +
      '<nav class="st-nav" id="stNav">' + PAGES.map(function (p) { return '<button data-page="' + p[0] + '"><span>' + p[1] + '</span>' + p[2] + '</button>'; }).join('') + '</nav>' +
      '<main class="st-main" id="stMain"></main>' +
      '<div class="st-status"><span id="stStatus"></span><span class="sp"></span><button class="btn" id="stStop" style="display:none;padding:2px 10px">■ Dừng</button></div>';
    document.body.appendChild(root);
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    $s('stNav').onclick = function (e) { var b = e.target.closest('[data-page]'); if (b) { ST.page = b.dataset.page; render(); } };
    $s('stBack').onclick = close;
    $s('stStop').onclick = function () { if (ST.ctrl) ST.ctrl.abort(); };
    $s('stProj').onchange = function () { ST.curId = this.value; saveAll(); render(); };
    $s('stMain').addEventListener('click', onClick);
    $s('stMain').addEventListener('change', onChange);
    $s('stMain').addEventListener('input', onInput);
  }
  function render() {
    document.querySelectorAll('#stNav [data-page]').forEach(function (b) { b.classList.toggle('on', b.dataset.page === ST.page); });
    $s('stProj').innerHTML = (ST.projects.length ? '' : '<option value="">(chưa có dự án)</option>') + ST.projects.map(function (p) { return '<option value="' + p.id + '"' + (p.id === ST.curId ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('');
    var p = cur(), m = $s('stMain');
    if (!p && ['analyze', 'rewrite', 'seo', 'thumb', 'desc'].indexOf(ST.page) >= 0) p = newProject('Dự án ' + (ST.projects.length + 1));
    m.innerHTML = ({ dash: pageDash, analyze: pageAnalyze, rewrite: pageRewrite, seo: pageSeo, thumb: pageThumb, desc: pageDesc, settings: pageSettings })[ST.page](p);
    renderBusy(); setStatus();
  }

  /* ---------- trang: Dự án ---------- */
  function pageDash() {
    var avg = ST.stats.runs ? (ST.stats.totalMs / ST.stats.runs / 1000).toFixed(1) + 's' : '—';
    return '<h1>Bảng điều khiển</h1><div class="st-stats">' +
      '<div class="st-stat"><span>📁</span><div><small>Tổng dự án</small><b>' + ST.projects.length + '</b></div></div>' +
      '<div class="st-stat"><span>⚡</span><div><small>Lượt chạy AI</small><b>' + ST.stats.runs + '</b></div></div>' +
      '<div class="st-stat"><span>🤖</span><div><small>Model đang dùng</small><b style="font-size:14px">' + esc(modelName()) + '</b></div></div>' +
      '<div class="st-stat"><span>⏱️</span><div><small>Thời gian AI trung bình</small><b>' + avg + '</b></div></div></div>' +
      '<div class="st-card"><h2>Dự án gần đây<span class="sp"></span><input class="inp" id="stNewName" placeholder="Tên dự án mới" style="width:240px"><button class="btn pri" data-act="new">＋ Tạo dự án mới</button></h2>' +
      (ST.projects.length ? '<table class="st-table"><tr><th>Tên dự án</th><th>Kênh YouTube</th><th>Trạng thái</th><th>Ngày tạo</th><th>Hành động</th></tr>' +
        ST.projects.map(function (p) { return '<tr class="' + (p.id === ST.curId ? 'on' : '') + '"><td>' + esc(p.name) + '</td><td>' + esc((p.info && p.info.channel) || '—') + '</td><td>' + esc(p.status) + '</td><td>' + new Date(p.created).toLocaleDateString('vi-VN') + '</td>' +
          '<td><button class="btn" data-act="open" data-id="' + p.id + '">Mở</button> <button class="btn" data-act="del" data-id="' + p.id + '">Xoá</button></td></tr>'; }).join('') + '</table>'
        : '<div class="st-empty">Chưa có dự án. Tạo dự án mới, hoặc vào 📺 Phân tích và dán link YouTube.</div>') + '</div>';
  }

  /* ---------- trang: Phân tích ---------- */
  function pageAnalyze(p) {
    var i = p.info || {}, tr = p.transcript, fmt = ST.trFmt || 'plain';
    var note = SERVER ? '' : '<div class="st-empty">⚠️ Bản trình duyệt không đọc trực tiếp được YouTube (bị chặn). Hãy dùng bản app (.exe) hoặc <code>npm start</code>, hoặc bấm "Nhờ Gemini nghe video" / tự dán lời thoại.</div>';
    return '<h1>Phân tích video YouTube</h1><div class="st-card"><h2>Nhập đường dẫn YouTube</h2><div class="st-row">' +
      '<input class="inp" id="stUrl" style="flex:1;min-width:280px" placeholder="https://www.youtube.com/watch?v=…" value="' + esc(p.url) + '">' +
      '<button class="btn pri" data-act="analyze" data-ai>Phân tích video</button></div>' + note + '</div>' +
      '<div class="st-card"><h2>Thông tin video</h2>' + (i.title || i.id ? '<div class="st-row" style="align-items:flex-start;gap:16px">' + (i.thumb ? '<img class="st-thumb" src="' + esc(i.thumb) + '" onerror="this.remove()">' : '') +
        '<div class="st-grid2" style="flex:1"><div><b>Tiêu đề:</b> ' + esc(i.title || '—') + '</div><div><b>Độ dài:</b> ' + (i.lengthSeconds ? fmtTime(i.lengthSeconds, i.lengthSeconds >= 3600) : '—') + '</div>' +
        '<div><b>Kênh:</b> ' + esc(i.channel || '—') + '</div><div><b>Ngày đăng:</b> ' + esc(i.publishDate || '—') + '</div>' +
        '<div><b>Danh mục:</b> ' + esc(i.category || '—') + '</div><div><b>Lượt thích:</b> ' + fmtNum(i.likes) + '</div>' +
        '<div><b>Lượt xem:</b> ' + fmtNum(i.views) + '</div><div><b>Lời thoại:</b> ' + (tr ? tr.segments.length + ' câu · ' + ({ 'youtube-android': 'phụ đề YouTube', 'youtube-web': 'phụ đề YouTube', gemini: 'Gemini nghe video', manual: 'tự dán' }[tr.source] || tr.source) + (tr.auto ? ' (tự động)' : '') : 'chưa có') + '</div></div></div>' + (i.playability ? '<div class="st-empty">⚠️ ' + esc(i.playability) + '</div>' : '')
        : '<div class="st-empty">Dán link rồi bấm Phân tích video.</div>') + '</div>' +
      '<div class="st-card"><h2>Lời thoại gốc (Transcript)<select class="inp" id="stTrFmt" style="width:auto">' +
        [['plain', 'Dạng văn bản'], ['time', 'Có mốc thời gian'], ['srt', 'Dạng SRT']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === fmt ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
        '</select><span class="sp"></span><button class="btn" data-act="tr-gemini" data-ai title="Dùng khi video không có phụ đề">🎧 Nhờ Gemini nghe video</button><button class="btn" data-act="tr-paste">Dán / tải lời thoại</button>' +
        '<button class="btn" data-act="tr-copy">Copy</button><button class="btn" data-act="tr-txt">Xuất TXT</button><button class="btn" data-act="tr-srt">Xuất SRT</button></h2>' +
        (ST.trEdit ? '<textarea class="inp st-text" id="stTrEdit" placeholder="Dán lời thoại (văn bản thường, dạng [mm:ss] câu, hoặc nội dung file .srt)"></textarea><div class="st-row" style="margin-top:8px"><button class="btn pri" data-act="tr-save">Lưu lời thoại</button><button class="btn" data-act="tr-file">Tải file .txt / .srt</button><button class="btn" data-act="tr-cancel">Huỷ</button></div>'
          : '<div class="st-out" id="stTrOut">' + (tr ? esc(transcriptText(p, fmt)) : '<span class="st-empty">Nội dung lời thoại sẽ hiển thị ở đây…</span>') + '</div>') + '</div>' +
      '<div class="st-card"><h2>Phân tích AI<span class="sp"></span><button class="btn pri" data-act="analysis" data-ai>Phân tích kịch bản</button></h2>' +
        '<div class="st-out md" id="stAnaOut">' + (p.analysis ? md(p.analysis) : '<span class="st-empty">Bấm "Phân tích kịch bản" để AI phân tích chiều sâu video: cấu trúc, hook, cảm xúc, điểm giữ chân, đối tượng, cách cải thiện…</span>') + '</div></div>';
  }
  async function doAnalyze(p) {
    var url = $s('stUrl').value.trim(); if (!url) { toast('Dán link YouTube trước'); return; }
    var id = (url.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/) || [])[1] || (/^[\w-]{11}$/.test(url) ? url : null);
    if (!id) { toast('Link YouTube không hợp lệ'); return; }
    p.url = 'https://www.youtube.com/watch?v=' + id;
    if (!SERVER) { p.info = Object.assign({}, p.info || {}, { id: id, thumb: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg' }); touch(p); render(); toast('Bản trình duyệt: không lấy được thông tin. Bấm "Nhờ Gemini nghe video" để lấy lời thoại.', 6000); return; }
    setStatus('⏳ Đang đọc video YouTube…');
    try {
      var r = await fetch('/api/youtube?url=' + encodeURIComponent(p.url) + '&lang=' + encodeURIComponent(ST.channel.subLang || 'vi'));
      if (!r.ok) throw new Error(await r.text());
      var j = await r.json();
      p.info = j.info;
      if (j.info && j.info.title && /^Dự án \d+$|^Dự án mới$/.test(p.name)) p.name = j.info.title.slice(0, 80);
      if (j.transcript) { p.transcript = j.transcript; touch(p, 'Đã phân tích'); render(); toast('Đã lấy ' + j.transcript.segments.length + ' câu lời thoại'); return; }
      touch(p); render();
      if (TTS.gKey.trim()) { toast('Không lấy được phụ đề YouTube (' + (j.transcriptError || '') + '). Đang nhờ Gemini nghe video…', 6000); await doGemini(p); }
      else toast('Không lấy được phụ đề: ' + (j.transcriptError || '') + '. Nhập Gemini key (⚙️ Cài đặt) để Gemini nghe video, hoặc tự dán lời thoại.', 8000);
    } catch (e) { toast('Lỗi: ' + e.message, 7000); }
    finally { setStatus(); }
  }
  async function doGemini(p) {
    if (!p.url) { var u = $s('stUrl') && $s('stUrl').value.trim(); if (u) p.url = u; }
    if (!p.url) { toast('Dán link YouTube trước'); return; }
    var out = $s('stTrOut');
    try {
      p.transcript = await geminiTranscribe(p, function (t) { if (out) out.textContent = t; });
      touch(p, 'Đã phân tích'); render(); toast('Gemini đã chép ' + p.transcript.segments.length + ' câu');
    } catch (e) { toast(e.message, 8000); render(); }
  }
  async function doAnalysis(p) {
    var src = transcriptText(p, 'plain'); if (!src) { toast('Chưa có lời thoại để phân tích'); return; }
    var i = p.info || {}, out = $s('stAnaOut');
    try {
      p.analysis = await runAI('Phân tích kịch bản',
        'Bạn là chuyên gia chiến lược nội dung YouTube và biên kịch video. Phân tích sâu, cụ thể, có dẫn chứng từ lời thoại. Trả lời bằng tiếng Việt, định dạng Markdown với tiêu đề ##.',
        'Video: "' + (i.title || '') + '" · Kênh: ' + (i.channel || '') + ' · Thời lượng: ' + (i.lengthSeconds ? fmtTime(i.lengthSeconds) : '?') + ' · Lượt xem: ' + fmtNum(i.views) + '\n\nLỜI THOẠI:\n' + src.slice(0, 60000) +
        '\n\nHãy phân tích:\n## Tóm tắt nội dung (5–7 ý)\n## Cấu trúc kịch bản (hook, mở bài, các phần chính kèm mốc ước lượng, kết, CTA)\n## Kỹ thuật giữ chân người xem\n## Cảm xúc và giọng điệu\n## Đối tượng người xem\n## Điểm mạnh / điểm yếu\n## Gợi ý cải thiện khi làm lại\n## 5 ý tưởng video tiếp theo',
        function (t) { if (out) out.innerHTML = md(t); });
      touch(p); render();
    } catch (e) { toast(e.message, 7000); }
  }

  /* ---------- trang: Viết lại ---------- */
  function pageRewrite(p) {
    var r = p.rewrite, tab = ST.rwTab;
    var modeExtra = r.mode === 'idea' ? '<label class="f" style="margin-top:10px">Ý tưởng kịch bản chi tiết<textarea class="inp" data-rw="idea" rows="4" placeholder="Ví dụ: Dự án kiếm 10 tỷ trong 1 năm: sai lầm, bài học, con số thật…">' + esc(r.idea) + '</textarea></label>'
      : r.mode === 'ref' ? '<div class="st-row" style="margin-top:10px"><input class="inp" data-rw="refUrl" style="flex:1" placeholder="Link YouTube tham khảo (lấy phong cách, cấu trúc)" value="' + esc(r.refUrl) + '"></div><label class="f" style="margin-top:8px">Chủ đề / ý tưởng cho kịch bản mới<textarea class="inp" data-rw="idea" rows="3">' + esc(r.idea) + '</textarea></label>'
      : r.mode === 'file' ? '<div class="st-row" style="margin-top:10px"><button class="btn" data-act="rw-file">📂 Chọn file .txt / .srt / .md</button><span class="st-empty">' + (r.fileName ? '✓ ' + esc(r.fileName) + ' · ' + words(r.fileText) + ' từ' : 'Chưa chọn file') + '</span></div>'
      : r.mode === 'youtube' ? '<div class="st-empty" style="margin-top:6px">' + (p.transcript ? '✓ Dùng lời thoại video "' + esc((p.info && p.info.title) || p.url) + '" (' + words(transcriptText(p, 'plain')) + ' từ)' : '⚠️ Chưa có lời thoại: vào 📺 Phân tích để dán link trước.') + '</div>'
      : '<div class="st-empty" style="margin-top:6px">Dùng nguyên lời thoại gốc làm kịch bản (chỉ tạo phụ đề và dựng video).</div>';
    var srcForDiff = p.scriptSrc || '';
    var d = tab === 'diff' && p.script ? diffHtml(srcForDiff, p.script) : null;
    return '<h1>Viết lại kịch bản</h1><div class="st-card"><h2>Tham số viết lại</h2>' +
      '<div class="st-radio">' + MODES.map(function (m) { return '<label><input type="radio" name="stMode" data-rw="mode" value="' + m[0] + '"' + (r.mode === m[0] ? ' checked' : '') + '> ' + m[1] + '</label>'; }).join('') + '</div>' + modeExtra +
      '<div class="st-row" style="margin-top:12px"><select class="inp" data-rw="level" style="width:auto">' + LEVELS.map(function (l) { return '<option value="' + l[0] + '"' + (r.level === l[0] ? ' selected' : '') + '>' + l[1] + '</option>'; }).join('') + '</select>' +
      '<label class="chk"><input type="checkbox" data-rw="keepIdea"' + (r.keepIdea ? ' checked' : '') + '> Giữ ý chính</label><label class="chk"><input type="checkbox" data-rw="keepEmotion"' + (r.keepEmotion ? ' checked' : '') + '> Giữ cảm xúc</label><label class="chk"><input type="checkbox" data-rw="keepCta"' + (r.keepCta ? ' checked' : '') + '> Giữ CTA</label></div>' +
      '<div class="st-row" style="margin-top:10px">Ngôn ngữ <select class="inp" data-rw="lang" style="width:auto">' + LANGS.map(function (l) { return '<option' + (r.lang === l ? ' selected' : '') + '>' + l + '</option>'; }).join('') + '</select>' +
      '&nbsp; Thời lượng kịch bản (hh:mm:ss) <input class="inp" data-rw="dur" value="' + esc(r.dur) + '" style="width:100px"> <span class="st-empty">≈ ' + Math.round(durToSec(r.dur) / 60 * 150) + ' từ</span></div>' +
      '<label class="f" style="margin-top:12px">Hướng dẫn bổ sung cho AI (Prompt Editor)<textarea class="inp" data-rw="extra" rows="2" placeholder="Ví dụ: Dùng ngôn từ hài hước hơn, nhiều câu hỏi tu từ, giọng chuyên gia tài chính…">' + esc(r.extra) + '</textarea></label>' +
      '<div class="st-row" style="margin-top:12px"><button class="btn pri" data-act="rewrite" data-ai>' + (r.mode === 'none' ? 'Dùng lời thoại gốc' : r.mode === 'idea' || r.mode === 'ref' ? 'Bắt đầu viết kịch bản' : 'Bắt đầu viết lại') + '</button>' +
      '<button class="btn" data-act="srt-sync"' + (p.script ? '' : ' disabled') + '>Đồng bộ phụ đề SRT</button><button class="btn" data-act="script-save"' + (p.script ? '' : ' disabled') + '>Lưu kịch bản mới</button>' +
      '<span class="sp" style="flex:1"></span><button class="btn pri" data-act="make-video"' + (p.script ? '' : ' disabled') + '>🎬 Dựng video từ kịch bản</button></div></div>' +
      '<div class="st-card"><div class="st-tabs">' + [['script', 'Kịch bản mới'], ['diff', 'So sánh thay đổi (Diff)'], ['srt', 'Phụ đề SRT mới']].map(function (t) { return '<button class="chip' + (tab === t[0] ? ' on' : '') + '" data-rwtab="' + t[0] + '">' + t[1] + '</button>'; }).join('') +
      '<span class="sp" style="flex:1"></span><span class="st-empty">' + (p.script ? words(p.script) + ' từ · ≈ ' + fmtTime(words(p.script) / 2.5) : '') + '</span></div>' +
      (tab === 'script' ? '<textarea class="inp st-text" id="stScript" style="min-height:360px" placeholder="Kịch bản viết lại sẽ hiển thị ở đây. Bạn có thể sửa trực tiếp…">' + esc(p.script) + '</textarea><div class="st-row" style="margin-top:8px"><button class="btn" data-act="script-copy">Copy</button><button class="btn" data-act="script-txt">Xuất TXT</button></div>'
        : tab === 'diff' ? (d ? '<div class="st-empty">Giữ nguyên ' + d.stat.same + ' câu · thay đổi ~' + d.stat.changed + ' câu. <span class="st-del">đỏ</span> = bỏ, <span class="st-ins">xanh</span> = mới.</div><div class="st-out">' + d.html + '</div>' : '<div class="st-empty">Chưa có kịch bản mới để so sánh.</div>')
        : '<textarea class="inp st-text" id="stSrt" style="min-height:320px;font-family:var(--mono)">' + esc(p.srt) + '</textarea><div class="st-row" style="margin-top:8px"><button class="btn" data-act="srt-copy">Copy</button><button class="btn" data-act="srt-dl">Xuất SRT</button></div>') + '</div>';
  }
  async function fetchRefTranscript(url) {
    if (!SERVER) throw new Error('Bản trình duyệt không đọc được YouTube tham khảo. Hãy dùng bản app.');
    var r = await fetch('/api/youtube?url=' + encodeURIComponent(url)); if (!r.ok) throw new Error(await r.text());
    var j = await r.json(); if (!j.transcript) throw new Error('Video tham khảo không có phụ đề: ' + (j.transcriptError || ''));
    return { title: j.info && j.info.title, text: j.transcript.segments.map(function (s) { return s.text; }).join(' ') };
  }
  async function doRewrite(p) {
    var r = p.rewrite, target = durToSec(r.dur), wTarget = Math.round(target / 60 * 150), lvl = LEVELS.find(function (l) { return l[0] === r.level; });
    var keep = [r.keepIdea && 'giữ đầy đủ các ý chính', r.keepEmotion && 'giữ cảm xúc và giọng điệu gốc', r.keepCta && 'giữ lời kêu gọi hành động (CTA)'].filter(Boolean).join(', ');
    var src = '', sys = 'Bạn là biên kịch YouTube chuyên nghiệp, viết lời thoại để đọc thành tiếng (voice-over): câu ngắn gọn, tự nhiên, dễ nghe, có nhịp. CHỈ trả về nội dung kịch bản (các đoạn văn liền mạch), KHÔNG tiêu đề phần, KHÔNG ghi chú, KHÔNG markdown, KHÔNG mô tả hình ảnh, KHÔNG ghi tên người nói.', user;
    try {
      if (r.mode === 'none') { src = transcriptText(p, 'plain'); if (!src) throw new Error('Chưa có lời thoại gốc'); p.scriptSrc = src; p.script = src; }
      else {
        if (r.mode === 'youtube') { src = transcriptText(p, 'plain'); if (!src) throw new Error('Chưa có lời thoại: vào 📺 Phân tích để dán link YouTube trước.'); }
        if (r.mode === 'file') { src = r.fileText; if (!src) throw new Error('Chưa chọn file'); }
        if (r.mode === 'youtube' || r.mode === 'file') {
          user = 'KỊCH BẢN GỐC:\n' + src.slice(0, 80000) + '\n\nYÊU CẦU: Viết lại kịch bản trên bằng ' + r.lang + ', mức độ: ' + lvl[2] + '. ' + (keep ? 'Bắt buộc ' + keep + '. ' : '') +
            'Độ dài khoảng ' + wTarget + ' từ (≈ ' + fmtTime(target) + ' khi đọc). Không sao chép nguyên văn quá 2 câu liên tiếp nếu mức độ không phải "nhẹ".' + (r.extra ? '\nHướng dẫn thêm: ' + r.extra : '');
        } else {
          var ref = null;
          if (r.mode === 'ref') { if (!r.refUrl) throw new Error('Dán link YouTube tham khảo'); setStatus('⏳ Đang đọc video tham khảo…'); ref = await fetchRefTranscript(r.refUrl); }
          if (!r.idea.trim() && !ref) throw new Error('Nhập ý tưởng kịch bản');
          user = (ref ? 'VIDEO THAM KHẢO "' + (ref.title || '') + '" (học cách mở đầu, cấu trúc, nhịp kể, cách giữ chân; KHÔNG chép nội dung):\n' + ref.text.slice(0, 40000) + '\n\n' : '') +
            'Ý TƯỞNG / CHỦ ĐỀ: ' + (r.idea.trim() || '(cùng chủ đề với video tham khảo nhưng góc nhìn mới)') + '\n\nYÊU CẦU: Viết kịch bản video YouTube mới bằng ' + r.lang + ', dài khoảng ' + wTarget + ' từ (≈ ' + fmtTime(target) + ' khi đọc). Có hook mạnh trong 10 giây đầu, mạch kể cuốn hút, ví dụ cụ thể, kết bằng lời kêu gọi đăng ký/bình luận.' + (r.extra ? '\nHướng dẫn thêm: ' + r.extra : '');
          src = ref ? ref.text : r.idea;
        }
        p.scriptSrc = src;
        ST.rwTab = 'script'; render();
        var box = $s('stScript');
        p.script = (await runAI(r.mode === 'idea' || r.mode === 'ref' ? 'Viết kịch bản' : 'Viết lại kịch bản', sys, user, function (t) { if (box) { box.value = t; box.scrollTop = box.scrollHeight; } })).trim().replace(/^```\w*\n?|```$/g, '');
      }
      p.srt = buildSrt(p.script, target && r.mode !== 'none' ? Math.max(target * 0.6, words(p.script) / 2.5) : 0);
      touch(p, 'Đã có kịch bản'); render(); toast('Xong: ' + words(p.script) + ' từ');
    } catch (e) { toast(e.message, 7000); setStatus(); }
  }

  /* ---------- trang: SEO ---------- */
  function pageSeo(p) {
    var s = p.seo, tab = ST.seoTab;
    var body = !s ? '<div class="st-empty">Bấm "Bắt đầu tối ưu SEO". AI dùng kịch bản mới (hoặc lời thoại gốc) để gợi ý tiêu đề, từ khoá và tag.</div>' : tab === 'report' ? '<div class="st-out md">' + md(s.report || '') + '</div>' :
      '<h2 style="font-size:15px">Bảng tối ưu tiêu đề <span class="st-empty">(chọn một tiêu đề để dùng cho Thumbnail và Mô tả)</span></h2><table class="st-table"><tr><th>Chọn</th><th>Tiêu đề gợi ý</th><th>Lý do</th><th>Điểm SEO</th></tr>' +
      (s.titles || []).map(function (t, i) { var sc = +t.score || 0; return '<tr class="' + (p.chosenTitle === t.title ? 'on' : '') + '"><td><input type="radio" name="stTitle" data-title="' + i + '"' + (p.chosenTitle === t.title ? ' checked' : '') + '></td><td>' + esc(t.title) + ' <span class="st-empty">(' + t.title.length + ' ký tự)</span></td><td class="st-empty">' + esc(t.reason || '') + '</td><td class="st-score ' + (sc >= 90 ? 'hi' : 'mid') + '">' + sc + '/100</td></tr>'; }).join('') + '</table>' +
      '<h2 style="font-size:15px;margin-top:16px">Bảng kế hoạch từ khoá & thẻ tag<span class="sp"></span><button class="btn" data-act="kw-copy">Sao chép toàn bộ từ khoá</button></h2><table class="st-table"><tr><th>Phân loại</th><th>Từ khoá / Tag</th></tr>' +
      [['Từ khoá chính', s.keywords && s.keywords.main], ['Từ khoá phụ', s.keywords && s.keywords.secondary], ['Từ khoá dài (long-tail)', s.keywords && s.keywords.longtail]].map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + esc((r[1] || []).join(', ')) + '</td></tr>'; }).join('') + '</table>' +
      '<label class="f" style="margin-top:12px">Thẻ tag YouTube (' + (s.tags || []).join(',').length + '/500 ký tự)<textarea class="inp" id="stTags" rows="3">' + esc((s.tags || []).join(', ')) + '</textarea></label><div class="st-row" style="margin-top:6px"><button class="btn" data-act="tags-copy">Copy tag</button></div>';
    return '<h1>Tối ưu SEO YouTube</h1><div class="st-card"><div class="st-row"><button class="btn pri" data-act="seo" data-ai>' + (s ? '↻ Tối ưu lại' : 'Bắt đầu tối ưu SEO') + '</button><span class="st-empty">' + (p.chosenTitle ? 'Đã chọn: <b>' + esc(p.chosenTitle) + '</b>' : '') + '</span></div></div>' +
      '<div class="st-card"><div class="st-tabs">' + [['result', 'Kết quả tối ưu'], ['report', 'Báo cáo chi tiết']].map(function (t) { return '<button class="chip' + (tab === t[0] ? ' on' : '') + '" data-seotab="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' + body + '</div>';
  }
  async function doSeo(p) {
    var src = sourceText(p); if (!src) { toast('Chưa có kịch bản hay lời thoại'); return; }
    try {
      var t = await runAI('Tối ưu SEO', 'Bạn là chuyên gia SEO YouTube tại Việt Nam, hiểu thuật toán đề xuất và hành vi tìm kiếm. Chỉ trả về JSON hợp lệ.',
        'Nội dung video (kịch bản):\n' + src.slice(0, 40000) + '\n\nTiêu đề gốc (nếu có): ' + ((p.info && p.info.title) || '—') + '\nNgôn ngữ: ' + p.rewrite.lang +
        '\n\nTrả về đúng JSON:\n{"titles":[{"title":"...","score":0-100,"reason":"ngắn gọn"}] (8 tiêu đề, dưới 70 ký tự, gây tò mò nhưng không lừa đảo, có từ khoá chính), "keywords":{"main":["..."],"secondary":["..."],"longtail":["..."]}, "tags":["..."] (tổng dưới 480 ký tự), "report":"báo cáo Markdown: ý định tìm kiếm, đối thủ/ngách, gợi ý thumbnail, thời điểm đăng, cách tối ưu 30 giây đầu"}');
      var j = parseJsonLoose(t);
      j.titles = (j.titles || []).filter(function (x) { return x && x.title; }).sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
      p.seo = j; if (!p.chosenTitle && j.titles[0]) p.chosenTitle = j.titles[0].title;
      touch(p, 'Đã tối ưu SEO'); render();
    } catch (e) { toast(e.message, 7000); }
  }

  /* ---------- trang: Thumbnail ---------- */
  var THUMB_STYLES = [['webcomic', 'Truyện tranh 2D, viền đen đậm', 'simple 2D webcomic vector style with bold black outlines and clean flat colors'], ['realistic', 'Ảnh thật, kịch tính', 'photorealistic, cinematic dramatic lighting, high detail'], ['3d', 'Hoạt hình 3D', 'stylized 3D cartoon render, soft lighting, vibrant colors'], ['minimal', 'Tối giản, chữ lớn', 'minimal flat design, bold huge typography, two-color palette'], ['infographic', 'Đồ hoạ thông tin', 'clean infographic style with icons and badges']];
  function pageThumb(p) {
    var t = p.thumb, opts = function (arr, sel) { return arr.map(function (a) { return '<option value="' + a[0] + '"' + (a[0] === sel ? ' selected' : '') + '>' + a[1] + '</option>'; }).join(''); };
    return '<h1>Thumbnail</h1><div class="st-card"><h2>Ý tưởng thumbnail</h2>' +
      '<label class="f">Tiêu đề video<input class="inp" data-th="title" value="' + esc(p.chosenTitle || (p.info && p.info.title) || '') + '" placeholder="Chọn ở trang SEO hoặc nhập"></label>' +
      '<div class="st-row" style="margin-top:10px">Phong cách <select class="inp" data-th="style" style="width:auto">' + opts(THUMB_STYLES, t.style) + '</select> Khung <select class="inp" data-th="aspect" style="width:auto">' + opts([['16:9', '16:9 (video thường)'], ['9:16', '9:16 (Shorts)']], t.aspect) + '</select>' +
      ' Nhân vật <select class="inp" data-th="charId" style="width:auto">' + charOpts(t.charId, 'Không dùng') + '</select></div>' +
      '<label class="f" style="margin-top:10px">Ghi chú thêm<input class="inp" data-th="note" value="' + esc(t.note) + '" placeholder="Ví dụ: tông đỏ cam, có biểu cảm sốc, chữ vàng viền đen"></label>' +
      '<div class="st-row" style="margin-top:12px"><button class="btn pri" data-act="thumb" data-ai>✨ Tạo 3 ý tưởng thumbnail</button><span class="st-empty">AI viết prompt vẽ ảnh, bấm Copy + mở ChatGPT/Gemini để tạo ảnh.</span></div></div>' +
      (t.concepts ? t.concepts.map(function (c, i) { return '<div class="st-concept"><h3>Ý tưởng ' + (i + 1) + ': ' + esc(c.headline || '') + '</h3><div class="st-empty">' + esc(c.visual || '') + '</div><textarea class="inp st-text" style="min-height:110px;font-family:var(--mono);font-size:12px" data-cprompt="' + i + '">' + esc(c.prompt || '') + '</textarea>' +
        '<div class="st-row" style="margin-top:6px"><button class="btn pri" data-act="th-gpt" data-i="' + i + '">📋 Copy + mở ChatGPT</button><button class="btn pri" data-act="th-gem" data-i="' + i + '">📋 Copy + mở Gemini</button><button class="btn" data-act="th-copy" data-i="' + i + '">Copy</button></div></div>'; }).join('') : '');
  }
  async function doThumb(p) {
    var t = p.thumb, title = p.chosenTitle || (p.info && p.info.title) || ''; if (!title && !sourceText(p)) { toast('Nhập tiêu đề video'); return; }
    var st = THUMB_STYLES.find(function (s) { return s[0] === t.style; }), ch = CHARS.list.find(function (c) { return c.id === t.charId; });
    try {
      var txt = await runAI('Tạo ý tưởng thumbnail', 'Bạn là designer thumbnail YouTube có tỉ lệ click cao. Chỉ trả về JSON hợp lệ.',
        'Tiêu đề: ' + title + '\nNội dung tóm tắt: ' + sourceText(p).slice(0, 4000) + '\nPhong cách: ' + st[2] + '\nKhung: ' + t.aspect + (ch ? '\nNhân vật chính (người dùng sẽ đính kèm ảnh nhân vật): ' + ch.name + (ch.desc ? ' — ' + ch.desc : '') : '') + (t.note ? '\nGhi chú: ' + t.note : '') +
        '\n\nTrả về JSON: {"concepts":[{"headline":"chữ trên thumbnail tiếng Việt, 2–5 từ, gây tò mò","visual":"mô tả bố cục ngắn bằng tiếng Việt","prompt":"prompt TIẾNG ANH chi tiết cho AI tạo ảnh: bố cục, nhân vật/biểu cảm, màu, ánh sáng, vị trí và nội dung chữ tiếng Việt (ghi đúng chữ trong ngoặc kép), độ tương phản cao, ' + (ch ? 'use the attached character image as the main character, ' : '') + '--ar ' + t.aspect + '"}] (3 ý tưởng khác nhau)}');
      t.concepts = (parseJsonLoose(txt).concepts || []).slice(0, 3); touch(p); render();
    } catch (e) { toast(e.message, 7000); }
  }

  /* ---------- trang: Mô tả ---------- */
  function pageDesc(p) {
    var d = p.desc, blk = function (k, title, rows) { return '<div class="st-card"><h2>' + title + '<span class="sp"></span><button class="btn" data-act="d-copy" data-k="' + k + '">Copy</button></h2><textarea class="inp st-text" data-dk="' + k + '" style="min-height:' + rows + 'px">' + esc(d[k] || '') + '</textarea></div>'; };
    return '<h1>Mô tả & kênh truyền thông</h1><div class="st-card"><div class="st-row"><button class="btn pri" data-act="desc" data-ai>' + (d ? '↻ Sinh lại' : 'Sinh mô tả bài đăng') + '</button><span class="st-empty">Tiêu đề: ' + esc(p.chosenTitle || (p.info && p.info.title) || '(chưa chọn)') + ' · Thông tin liên hệ lấy ở ⚙️ Cài đặt</span></div></div>' +
      (d ? blk('description', '1. Mô tả video YouTube', 300) + blk('hashtags', '2. Hashtags (top 10 thịnh hành)', 60) + blk('pinned', '3. Bình luận ghim', 110) + blk('community', '4. Bài đăng cộng đồng', 140) : '');
  }
  async function doDesc(p) {
    var src = sourceText(p); if (!src) { toast('Chưa có kịch bản hay lời thoại'); return; }
    var c = ST.channel, kw = p.seo && p.seo.keywords ? [].concat(p.seo.keywords.main || [], p.seo.keywords.secondary || []).join(', ') : '';
    try {
      var t = await runAI('Sinh mô tả', 'Bạn là chuyên gia tối ưu kênh YouTube. Chỉ trả về JSON hợp lệ, nội dung tiếng Việt (trừ khi kịch bản bằng ngôn ngữ khác).',
        'Tiêu đề: ' + (p.chosenTitle || (p.info && p.info.title) || '') + '\nTừ khoá: ' + kw + '\nKênh: ' + (c.name || '') + '\nLiên hệ: email ' + (c.email || '—') + ', fanpage ' + (c.fanpage || '—') + (c.links ? ', khác: ' + c.links : '') +
        '\n\nNỘI DUNG CÓ MỐC THỜI GIAN:\n' + (chaptersSource(p) || src.slice(0, 20000)) +
        '\n\nTrả về JSON: {"description":"mô tả 150–300 từ: 2 câu đầu chứa từ khoá chính, tóm tắt giá trị, danh sách CHƯƠNG dạng 00:00 Tên chương (bắt đầu 00:00, 5–10 chương, theo đúng mốc thời gian nội dung), lời kêu gọi đăng ký, khối THÔNG TIN LIÊN HỆ & HỢP TÁC","hashtags":"10 hashtag cách nhau bằng dấu cách","pinned":"bình luận ghim gợi thảo luận, có câu hỏi","community":"bài đăng tab Cộng đồng giới thiệu video, có câu hỏi/bình chọn"}');
      p.desc = parseJsonLoose(t); touch(p, 'Hoàn tất'); render();
    } catch (e) { toast(e.message, 7000); }
  }

  /* ---------- trang: Cài đặt ---------- */
  function pageSettings() {
    var c = ST.channel;
    return '<h1>Cài đặt</h1><div class="st-card"><h2>AI dùng cho Studio</h2><div class="st-grid2">' +
      '<label class="f">Dịch vụ<select class="inp" id="stsProv"><option value="gemini"' + (AI.provider === 'gemini' ? ' selected' : '') + '>Gemini (miễn phí)</option><option value="openai"' + (AI.provider === 'openai' ? ' selected' : '') + '>ChatGPT (OpenAI)</option></select></label>' +
      '<label class="f">Model<input class="inp" id="stsModel" list="aiModels" value="' + esc(aiModel()) + '"></label>' +
      '<label class="f">API key ' + (AI.provider === 'gemini' ? '(Gemini, dùng chung với giọng đọc)' : '(OpenAI)') + '<input class="inp" type="password" id="stsKey" value="' + esc(aiKey()) + '"></label>' +
      '<label class="f">Gemini key (để Gemini nghe video YouTube)<input class="inp" type="password" id="stsGKey" value="' + esc(TTS.gKey) + '"></label></div>' +
      '<div class="st-empty">Lấy Gemini key miễn phí: aistudio.google.com/apikey. Gemini nghe video chỉ dùng được với video công khai và tốn lượt miễn phí.</div></div>' +
      '<div class="st-card"><h2>Thông tin kênh (dùng cho mô tả)</h2><div class="st-grid2">' +
      ['name|Tên kênh', 'email|Email liên hệ', 'fanpage|Fanpage', 'links|Link khác (TikTok, website…)', 'subLang|Ngôn ngữ phụ đề ưu tiên (vd: vi,en)'].map(function (x) { var k = x.split('|'); return '<label class="f">' + k[1] + '<input class="inp" data-ch="' + k[0] + '" value="' + esc(c[k[0]] || '') + '"></label>'; }).join('') + '</div></div>';
  }

  /* ---------- dựng video từ kịch bản ---------- */
  function videoDialog(p) {
    var old = $s('stVid'); if (old) old.remove();
    var v = ST.vid || (ST.vid = { kind: 'long', fmt: '9:16', charId: '', voice: 'Kore', music: 'ambient', theme: 'dark', style: 'motion' });
    var nChunks = chunkScript(p.script).length, nWords = words(p.script);
    var el = document.createElement('div'); el.className = 'modal'; el.id = 'stVid'; el.style.zIndex = 30;
    el.innerHTML = '<div class="anchor-panel" style="width:min(640px,94vw)"><div class="modal-head"><b>🎬 Dựng video từ kịch bản</b><span class="sp" style="flex:1"></span><button class="btn icon" data-v="close">✕</button></div><div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">' +
      '<div class="st-radio"><label><input type="radio" name="stVk" value="long"' + (v.kind === 'long' ? ' checked' : '') + '> <b>Video đầy đủ</b> (đọc hết kịch bản, phụ đề chạy theo giọng, nhân vật dẫn chuyện)</label>' +
      '<label><input type="radio" name="stVk" value="short"' + (v.kind === 'short' ? ' checked' : '') + '> <b>Video ngắn bằng AI</b> (≤ 60 giây, AI chọn ý hay và dựng hình minh hoạ)</label></div>' +
      '<div class="st-row">Khung <select class="inp" id="stVfmt" style="width:auto"><option value="9:16"' + (v.fmt === '9:16' ? ' selected' : '') + '>9:16 dọc</option><option value="16:9"' + (v.fmt === '16:9' ? ' selected' : '') + '>16:9 ngang</option></select>' +
      ' Nhân vật <select class="inp" id="stVchar" style="width:auto">' + charOpts(v.charId, 'Không') + '</select></div>' +
      '<div class="st-row">Giọng <select class="inp" id="stVvoice" style="width:auto">' + GEMINI_VOICES.slice(0, 8).map(function (g) { return '<option value="' + g[0] + '"' + (g[0] === v.voice ? ' selected' : '') + '>' + g[1] + '</option>'; }).join('') + '</select>' +
      ' Nhạc <select class="inp" id="stVmusic" style="width:auto">' + Object.keys(H2VMusic.PRESETS).map(function (k) { return '<option value="' + k + '"' + (k === v.music ? ' selected' : '') + '>' + H2VMusic.PRESETS[k].name + '</option>'; }).join('') + '<option value="none"' + (v.music === 'none' ? ' selected' : '') + '>Không nhạc</option></select>' +
      ' Nền <select class="inp" id="stVtheme" style="width:auto"><option value="dark"' + (v.theme === 'dark' ? ' selected' : '') + '>Tối</option><option value="light"' + (v.theme === 'light' ? ' selected' : '') + '>Sáng</option><option value="paper"' + (v.theme === 'paper' ? ' selected' : '') + '>Giấy</option></select></div>' +
      '<div class="st-empty">Kịch bản: ' + nWords + ' từ · ≈ ' + fmtTime(nWords / 2.5) + ' · cần ~' + nChunks + ' lượt tạo giọng. ' + (nChunks > 15 && TTS.provider === 'gemini' ? '⚠️ Gemini miễn phí giới hạn số lượt mỗi ngày: với video dài nên dùng Azure (500k ký tự/tháng) hoặc edge-tts trong bản app.' : '') + '</div>' +
      '<div class="st-row"><span class="sp" style="flex:1"></span><button class="btn pri" data-v="go">Dựng video</button></div></div></div>';
    document.body.appendChild(el);
    el.onclick = function (e) {
      var b = e.target.closest('[data-v]'); if (e.target === el || (b && b.dataset.v === 'close')) { el.remove(); return; }
      if (!b || b.dataset.v !== 'go') return;
      v.kind = (el.querySelector('[name=stVk]:checked') || {}).value || 'long'; v.fmt = $s('stVfmt').value; v.charId = $s('stVchar').value; v.voice = $s('stVvoice').value; v.music = $s('stVmusic').value; v.theme = $s('stVtheme').value;
      el.remove(); buildVideo(p, v);
    };
  }
  function chunkScript(script) { // gộp câu thành đoạn ≤ 320 ký tự (mỗi đoạn một lượt tạo giọng)
    var out = [], buf = '';
    (script || '').split(/\n\s*\n/).forEach(function (para) {
      sentences(para).forEach(function (s) { if (buf && (buf + ' ' + s).length > 320) { out.push(buf); buf = s; } else buf = buf ? buf + ' ' + s : s; });
      if (buf) { out.push(buf); buf = ''; }
    });
    return out;
  }
  function buildVideo(p, v) {
    if (v.kind === 'short') {
      AI.style = 'motion'; AI.versions = []; AI.editOpen = false; saveAiCfg();
      close(); setTab('ai');
      $('aiPrompt').value = 'Làm video ngắn ≤ 60 giây (khung ' + v.fmt + ') từ kịch bản dưới đây: chọn những ý hay nhất, viết lại lời thoại ngắn gọn, có hook ở 3 giây đầu và kết bằng lời kêu gọi xem video đầy đủ.' +
        ' Giọng "' + v.voice + '", nhạc ' + v.music + '.' + (v.charId ? ' Dùng nhân vật "' + v.charId + '" dẫn chuyện, talk: true.' : '') + (p.chosenTitle ? '\nTiêu đề: ' + p.chosenTitle : '') + '\n\nKỊCH BẢN:\n' + p.script.slice(0, 6000);
      aiSend(); return;
    }
    var code = longVideoCode(p, v);
    close(); loadCode(code);
    toast('Đã dựng video. App đang tạo giọng đọc cho từng đoạn, xong là xem trước và xuất được.', 6000);
  }
  function longVideoCode(p, v) {
    var W = v.fmt === '9:16' ? 1080 : 1920, H = v.fmt === '9:16' ? 1920 : 1080, vert = H > W;
    var chunks = chunkScript(p.script), est = 0.8, lines = chunks.map(function (c) { var s = est; est += c.length / 14 + 0.35; return [+s.toFixed(2), c]; });
    var ch = CHARS.list.find(function (c) { return c.id === v.charId; }), poseNames = ch ? ch.poses.map(function (x) { return x.name; }) : [];
    var th = { dark: ['#0f172a', '#1e293b', '#f8fafc', '#38bdf8', '#f472b6'], light: ['#f8fafc', '#e2e8f0', '#0f172a', '#2563eb', '#f97316'], paper: ['#fbf7ee', '#efe6d2', '#2b2b2b', '#c2410c', '#0f766e'] }[v.theme];
    var title = p.chosenTitle || (p.info && p.info.title) || p.name;
    var audio = { voice: v.voice, style: 'kể chuyện, truyền cảm, rõ ràng', chain: true, gap: 0.35, lines: lines, music: v.music === 'none' ? false : { preset: v.music, volume: 0.18 }, fit: true };
    var subTop = vert ? 1080 : 640, subFont = vert ? 66 : 56;
    return '<!DOCTYPE html>\n<html lang="vi">\n<head>\n<meta charset="utf-8">\n<meta name="h2v" content="width=' + W + ',height=' + H + ',fps=30,duration=' + Math.ceil(est + 2) + '">\n<title>' + esc(title) + '</title>\n' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@600;800&display=swap">\n<style>\n' +
      '  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }\n  body { font-family: "Be Vietnam Pro", system-ui, sans-serif; background: ' + th[0] + '; color: ' + th[2] + '; }\n' +
      '  .blob { position: absolute; border-radius: 50%; filter: blur(80px); opacity: .45; }\n' +
      '  #title { position: absolute; left: 70px; right: 70px; top: ' + (vert ? 200 : 90) + 'px; font-size: ' + (vert ? 64 : 54) + 'px; font-weight: 800; line-height: 1.2; text-align: center; }\n' +
      '  #sub { position: absolute; left: ' + (vert ? 70 : 160) + 'px; right: ' + (vert ? 70 : 160) + 'px; top: ' + subTop + 'px; text-align: center; font-size: ' + subFont + 'px; font-weight: 800; line-height: 1.3; }\n' +
      '  #sub span { background: ' + th[1] + '; box-decoration-break: clone; -webkit-box-decoration-break: clone; padding: 6px 18px; border-radius: 14px; }\n' +
      '  #sub b { color: ' + th[3] + '; }\n  #bar { position: absolute; left: 0; top: 0; height: 10px; background: linear-gradient(90deg,' + th[3] + ',' + th[4] + '); }\n' +
      '</style>\n</head>\n<body>\n  <div class="blob" id="b1" style="width:700px;height:700px;background:' + th[3] + '"></div>\n  <div class="blob" id="b2" style="width:600px;height:600px;background:' + th[4] + '"></div>\n' +
      '  <div id="bar"></div>\n  <div id="title">' + esc(title) + '</div>\n  <div id="sub"></div>\n' +
      '<script type="application/json" id="h2v-audio">\n' + JSON.stringify(audio, null, 1).replace(/<\//g, '<\\/') + '\n<\/script>\n<script>\n' +
      '  // Mốc giọng đọc thật do app chèn (H2V_VOICE); nếu chưa có thì dùng mốc ước lượng\n' +
      '  const AUDIO = JSON.parse(document.getElementById("h2v-audio").textContent);\n' +
      '  const TIMES = (window.H2V_VOICE && window.H2V_VOICE.length) ? window.H2V_VOICE : AUDIO.lines.map(([t, s]) => [t, t + s.length / 14, s]);\n' +
      '  const END = TIMES.length ? TIMES[TIMES.length - 1][1] + 1 : 5;\n' +
      '  // Chia mỗi đoạn thành các dòng phụ đề ngắn, thời gian theo độ dài chữ\n' +
      '  const SUBS = [];\n  TIMES.forEach(([a, b, text]) => {\n    const parts = []; let cur = [];\n    text.split(/\\s+/).forEach(w => { cur.push(w); if (cur.length >= ' + (vert ? 7 : 10) + ' || /[.!?…,;:]$/.test(w) && cur.length >= 4) { parts.push(cur.join(" ")); cur = []; } });\n    if (cur.length) parts.push(cur.join(" "));\n' +
      '    const total = parts.reduce((n, s) => n + s.length, 0); let t = a;\n    parts.forEach(s => { const d = (b - a) * s.length / total; SUBS.push([t, t + d, s]); t += d; });\n  });\n' +
      (ch ? '  H2V.character(' + JSON.stringify(ch.id) + ', { x: ' + (vert ? 540 : 1620) + ', y: ' + (vert ? 1820 : 1040) + ', height: ' + (vert ? 640 : 760) + ', poses: TIMES.map(([a], i) => [a, ' + JSON.stringify(poseNames) + '[i % ' + Math.max(1, poseNames.length) + ']]), enter: "bottom", motion: "breathe", talk: true });\n' : '') +
      '  const sub = document.getElementById("sub"), bar = document.getElementById("bar"), title = document.getElementById("title");\n' +
      '  const b1 = document.getElementById("b1"), b2 = document.getElementById("b2");\n' +
      '  window.h2vSeek = function (t) {\n' +
      '    b1.style.transform = `translate(${-200 + Math.sin(t * 0.21) * 260}px, ${-150 + Math.cos(t * 0.17) * 220}px)`;\n' +
      '    b2.style.transform = `translate(${' + (W - 400) + ' + Math.cos(t * 0.19) * 240}px, ${' + (H - 500) + ' + Math.sin(t * 0.23) * 260}px)`;\n' +
      '    bar.style.width = Math.min(100, t / END * 100) + "%";\n' +
      '    const k = Math.min(1, t / 0.6); title.style.opacity = k; title.style.transform = `translateY(${(1 - k) * 30}px)`;\n' +
      '    const s = SUBS.find(x => t >= x[0] && t < x[1]);\n' +
      '    const html = s ? "<span>" + s[2].replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]) + "</span>" : "";\n' +
      '    if (sub.innerHTML !== html) sub.innerHTML = html;\n' +
      '    const p = s ? Math.min(1, (t - s[0]) / 0.18) : 0; sub.style.opacity = p; sub.style.transform = `scale(${0.94 + 0.06 * p})`;\n' +
      '  };\n  window.h2vSeek(0);\n<\/script>\n</body>\n</html>';
  }

  /* ---------- sự kiện ---------- */
  function onInput(e) {
    var p = cur(); if (!p) return; var t = e.target;
    if (t.dataset.rw && t.type !== 'radio' && t.type !== 'checkbox') { p.rewrite[t.dataset.rw] = t.value; saveAll(); if (t.dataset.rw === 'dur') { var hint = t.nextElementSibling; if (hint) hint.textContent = '≈ ' + Math.round(durToSec(t.value) / 60 * 150) + ' từ'; } }
    if (t.id === 'stScript') { p.script = t.value; saveAll(); }
    if (t.id === 'stSrt') { p.srt = t.value; saveAll(); }
    if (t.dataset.th) { if (t.dataset.th === 'title') p.chosenTitle = t.value; else p.thumb[t.dataset.th] = t.value; saveAll(); }
    if (t.dataset.cprompt != null && p.thumb.concepts) { p.thumb.concepts[+t.dataset.cprompt].prompt = t.value; saveAll(); }
    if (t.dataset.dk && p.desc) { p.desc[t.dataset.dk] = t.value; saveAll(); }
    if (t.id === 'stTags' && p.seo) { p.seo.tags = t.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean); saveAll(); }
    if (t.dataset.ch) { ST.channel[t.dataset.ch] = t.value; saveAll(); }
  }
  function onChange(e) {
    var p = cur(), t = e.target;
    if (t.id === 'stTrFmt') { ST.trFmt = t.value; render(); return; }
    if (p && t.dataset.rw) { p.rewrite[t.dataset.rw] = t.type === 'checkbox' ? t.checked : t.value; saveAll(); if (t.dataset.rw === 'mode' || t.dataset.rw === 'level') render(); return; }
    if (p && t.dataset.th) { if (t.dataset.th === 'title') p.chosenTitle = t.value; else p.thumb[t.dataset.th] = t.value; saveAll(); return; }
    if (p && t.dataset.title != null && p.seo) { p.chosenTitle = p.seo.titles[+t.dataset.title].title; saveAll(); render(); return; }
    if (t.id === 'stsProv') { AI.provider = t.value; saveAiCfg(); syncAiUI(); render(); aiLoadModels(true); return; }
    if (t.id === 'stsModel') { if (AI.provider === 'gemini') AI.gModel = t.value.trim(); else AI.oModel = t.value.trim(); saveAiCfg(); syncAiUI(); setStatus(); return; }
    if (t.id === 'stsKey') { if (AI.provider === 'gemini') { TTS.gKey = t.value.trim(); saveTtsCfg(); syncTtsUI(); } else AI.oKey = t.value.trim(); saveAiCfg(); syncAiUI(); aiLoadModels(true); render(); return; }
    if (t.id === 'stsGKey') { TTS.gKey = t.value.trim(); saveTtsCfg(); syncTtsUI(); syncAiUI(); render(); return; }
  }
  function pickFile(accept, cb) { var i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = function () { var f = i.files[0]; if (f) f.text().then(function (t) { cb(t, f.name); }); }; i.click(); }
  function onClick(e) {
    var b = e.target.closest('[data-act],[data-rwtab],[data-seotab]'); if (!b) return;
    var p = cur(), a = b.dataset.act;
    if (b.dataset.rwtab) { ST.rwTab = b.dataset.rwtab; render(); return; }
    if (b.dataset.seotab) { ST.seoTab = b.dataset.seotab; render(); return; }
    if (a === 'new') { newProject(($s('stNewName').value || '').trim() || 'Dự án ' + (ST.projects.length + 1)); ST.page = 'analyze'; render(); return; }
    if (a === 'open') { ST.curId = b.dataset.id; ST.page = 'analyze'; saveAll(); render(); return; }
    if (a === 'del') { if (b.dataset.sure) { ST.projects = ST.projects.filter(function (x) { return x.id !== b.dataset.id; }); if (ST.curId === b.dataset.id) ST.curId = ST.projects[0] && ST.projects[0].id; saveAll(); render(); } else { b.dataset.sure = 1; b.textContent = 'Bấm lần nữa'; } return; }
    if (!p) return;
    switch (a) {
      case 'analyze': doAnalyze(p); break;
      case 'tr-gemini': doGemini(p); break;
      case 'tr-paste': ST.trEdit = true; render(); break;
      case 'tr-cancel': ST.trEdit = false; render(); break;
      case 'tr-file': pickFile('.txt,.srt,.vtt,.md,text/plain', function (t) { $s('stTrEdit').value = t; }); break;
      case 'tr-save': {
        var raw = $s('stTrEdit').value.trim(); if (!raw) return;
        var segs = /-->/.test(raw) ? parseSrt(raw) : parseTimedText(raw);
        if (!segs.length) segs = sentences(raw).map(function (s, i) { return { start: i * 3, dur: 3, text: s }; });
        p.transcript = { segments: segs, lang: null, auto: false, source: 'manual' }; ST.trEdit = false; touch(p, 'Đã phân tích'); render(); break;
      }
      case 'tr-copy': if (p.transcript) copy(transcriptText(p, ST.trFmt || 'plain')); break;
      case 'tr-txt': if (p.transcript) download(fileName(p.name) + '-loi-thoai.txt', transcriptText(p, ST.trFmt === 'srt' ? 'plain' : (ST.trFmt || 'plain'))); break;
      case 'tr-srt': if (p.transcript) download(fileName(p.name) + '.srt', transcriptText(p, 'srt')); break;
      case 'analysis': doAnalysis(p); break;
      case 'rw-file': pickFile('.txt,.srt,.vtt,.md,text/plain', function (t, name) { p.rewrite.fileText = /-->/.test(t) ? parseSrt(t).map(function (s) { return s.text; }).join(' ') : t; p.rewrite.fileName = name; saveAll(); render(); }); break;
      case 'rewrite': doRewrite(p); break;
      case 'srt-sync': { var s = $s('stScript'); if (s) p.script = s.value; p.srt = buildSrt(p.script, durToSec(p.rewrite.dur) ? Math.max(durToSec(p.rewrite.dur) * 0.6, words(p.script) / 2.5) : 0); ST.rwTab = 'srt'; touch(p); render(); toast('Đã tạo lại phụ đề theo kịch bản'); break; }
      case 'script-save': { var s2 = $s('stScript'); if (s2) p.script = s2.value; touch(p, 'Đã có kịch bản'); toast('Đã lưu kịch bản trong dự án'); break; }
      case 'script-copy': copy(p.script); break;
      case 'script-txt': download(fileName(p.name) + '-kich-ban.txt', p.script); break;
      case 'srt-copy': copy(p.srt); break;
      case 'srt-dl': download(fileName(p.name) + '-moi.srt', p.srt); break;
      case 'make-video': if (!p.script.trim()) { toast('Chưa có kịch bản'); break; } videoDialog(p); break;
      case 'seo': doSeo(p); break;
      case 'kw-copy': if (p.seo) copy([].concat(p.seo.keywords.main || [], p.seo.keywords.secondary || [], p.seo.keywords.longtail || []).join(', ')); break;
      case 'tags-copy': if (p.seo) copy((p.seo.tags || []).join(', ')); break;
      case 'thumb': doThumb(p); break;
      case 'th-gpt': case 'th-gem': case 'th-copy': {
        var txt = p.thumb.concepts[+b.dataset.i].prompt;
        (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(function () {}).then(function () {
          if (a !== 'th-copy') { window.open(a === 'th-gpt' ? 'https://chatgpt.com/' : 'https://gemini.google.com/app', '_blank', 'noopener'); toast('Đã copy prompt. Dán vào khung chat (Ctrl+V)' + (p.thumb.charId ? ' và đính kèm ảnh nhân vật' : '') + '.', 5000); } else toast('Đã copy');
        }); break;
      }
      case 'desc': doDesc(p); break;
      case 'd-copy': copy((p.desc || {})[b.dataset.k] || ''); break;
    }
  }

  function open() { $s('studio').classList.add('on'); render(); }
  function close() { $s('studio').classList.remove('on'); }
  function init() { shell(); loadAll().then(function () { if (!ST.curId && ST.projects[0]) ST.curId = ST.projects[0].id; }); }
  return { init: init, open: open, close: close, _test: { diffHtml: diffHtml, buildSrt: buildSrt, parseTimedText: parseTimedText, parseSrt: parseSrt, chunkScript: chunkScript, longVideoCode: longVideoCode, md: md, ST: ST } };
})();
