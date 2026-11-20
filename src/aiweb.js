/* 🌐 ChatGPT / Gemini nhúng trong app (chỉ bản .exe): đăng nhập một lần, app tự dán yêu cầu, tự gửi,
   tự chờ và lấy code / JSON / ảnh về. Không cần API key.
   Lưu ý: giao diện hai trang này thay đổi thường xuyên; nếu app không tự nhận được câu trả lời,
   bấm "📥 Lấy code từ trang" / "🖼 Lấy ảnh" trên khung. */
var H2VWeb = (function () {
  'use strict';
  var SITES = {
    chatgpt: { name: 'ChatGPT', home: 'https://chatgpt.com/' },
    gemini: { name: 'Gemini', home: 'https://gemini.google.com/app' }
  };
  var state = { site: 'chatgpt', views: {}, busy: false, keep: false };
  var chromeV = (navigator.userAgent.match(/Chrome\/([\d.]+)/) || [, '130.0.0.0'])[1];
  var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + chromeV + ' Safari/537.36';
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function available() { return !!window.h2vApp; }

  /* ---------- các hàm chạy BÊN TRONG trang ChatGPT / Gemini ---------- */
  function pageProbe(site) {
    function all(sels) { for (var i = 0; i < sels.length; i++) { var e = document.querySelectorAll(sels[i]); if (e.length) return Array.prototype.slice.call(e); } return []; }
    var msgs = site === 'chatgpt' ? all(['[data-message-author-role="assistant"]']) : all(['model-response', 'message-content', '.model-response-text', '[id^="model-response-message-content"]']);
    var last = msgs[msgs.length - 1] || null;
    var stopSel = site === 'chatgpt' ? '[data-testid="stop-button"], button[aria-label*="Stop" i], button[aria-label*="Dừng"]'
      : 'button[aria-label*="Stop" i], button[aria-label*="Dừng"], button[aria-label*="Ngừng"], .stop-icon, mat-icon[fonticon="stop"], [data-mat-icon-name="stop"]';
    var editor = document.querySelector(site === 'chatgpt' ? '#prompt-textarea, div.ProseMirror[contenteditable="true"]' : 'rich-textarea .ql-editor, div.ql-editor[contenteditable="true"], div[contenteditable="true"][role="textbox"]');
    var out = { count: msgs.length, busy: !!document.querySelector(stopSel), editor: !!editor, url: location.href, text: '', codes: [], imgs: [] };
    if (last) {
      out.text = last.innerText || '';
      var codeEls = last.querySelectorAll('pre code, code-block code, pre');
      var seen = [];
      Array.prototype.forEach.call(codeEls, function (el) {
        if (el.tagName === 'PRE' && el.querySelector('code')) return;
        var t = el.innerText || el.textContent || '';
        var k = t.search(/<!doctype html|<html[\s>]/i); if (k > 0) t = t.slice(k); // bỏ thanh tiêu đề "html · Copy code"
        if (t.trim() && seen.indexOf(t) < 0) seen.push(t);
      });
      out.codes = seen;
      var imgs = Array.prototype.slice.call(last.querySelectorAll('img'));
      if (site === 'chatgpt') { // ảnh do ChatGPT vẽ đôi khi nằm cạnh khung tin nhắn
        var turn = last.closest('article') || last.parentElement; if (turn) imgs = imgs.concat(Array.prototype.slice.call(turn.querySelectorAll('img')));
      }
      out.imgs = imgs.filter(function (i) { return i.complete && i.naturalWidth >= 256 && i.naturalHeight >= 256; })
        .map(function (i) { return { src: i.currentSrc || i.src, w: i.naturalWidth, h: i.naturalHeight }; });
    }
    out.login = !editor && (/login|auth|signin|accounts\.google/i.test(location.href) || !!document.querySelector('[data-testid="login-button"], a[href*="accounts.google.com/ServiceLogin"], a[href*="signin"]'));
    return out;
  }
  function pageFocus(site) {
    var e = document.querySelector(site === 'chatgpt' ? '#prompt-textarea, div.ProseMirror[contenteditable="true"]' : 'rich-textarea .ql-editor, div.ql-editor[contenteditable="true"], div[contenteditable="true"][role="textbox"]') || document.querySelector('textarea');
    if (!e) return false;
    e.focus();
    try { document.execCommand('selectAll', false, null); document.execCommand('delete', false, null); } catch (x) {}
    return true;
  }
  function pageEditorLen(site) {
    var e = document.querySelector(site === 'chatgpt' ? '#prompt-textarea, div.ProseMirror[contenteditable="true"]' : 'rich-textarea .ql-editor, div.ql-editor[contenteditable="true"], div[contenteditable="true"][role="textbox"]') || document.querySelector('textarea');
    var att = document.querySelectorAll('[data-testid*="attachment"], [class*="attachment"], uploader-file-preview').length;
    return e ? (e.value || e.innerText || '').length + att * 100000 : -1;
  }
  function pageSend(site) {
    var b = document.querySelector(site === 'chatgpt' ? '[data-testid="send-button"], #composer-submit-button, button[aria-label*="Send" i], button[aria-label*="Gửi"]'
      : 'button.send-button, button[aria-label*="Send" i], button[aria-label*="Gửi"]');
    if (b && !b.disabled && b.getAttribute('aria-disabled') !== 'true') { b.click(); return true; }
    return false;
  }
  async function pageFetchImage(src) {
    var r = await fetch(src, { credentials: 'include' }); var b = await r.blob();
    return await new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.readAsDataURL(b); });
  }
  function call(wv, fn, arg) { return wv.executeJavaScript('(' + fn.toString() + ')(' + JSON.stringify(arg) + ')', true); }

  /* ---------- khung nhúng ---------- */
  function panel() {
    var p = document.getElementById('aiwebPanel'); if (p) return p;
    var st = document.createElement('style');
    st.textContent = '#aiwebPanel{position:fixed;top:49px;right:0;bottom:0;width:min(760px,52vw);z-index:40;background:var(--panel);border-left:1px solid var(--line);box-shadow:-10px 0 30px rgba(0,0,0,.4);display:none;flex-direction:column}' +
      '#aiwebPanel.on{display:flex}#aiwebPanel .aw-head{display:flex;gap:6px;align-items:center;padding:8px 10px;border-bottom:1px solid var(--line);flex-wrap:wrap}' +
      '#aiwebPanel .aw-status{flex:1;min-width:160px;font-size:12px;color:var(--mute)}#aiwebPanel .aw-status.err{color:var(--err)}#aiwebPanel .aw-body{flex:1;position:relative}' +
      '#aiwebPanel webview{position:absolute;inset:0;width:100%;height:100%;display:none}#aiwebPanel webview.on{display:flex}';
    document.head.appendChild(st);
    p = document.createElement('div'); p.id = 'aiwebPanel';
    p.innerHTML = '<div class="aw-head"><button class="chip" data-aw="chatgpt">ChatGPT</button><button class="chip" data-aw="gemini">Gemini</button>' +
      '<span class="aw-status" id="awStatus">Đăng nhập một lần, app sẽ nhớ phiên.</span>' +
      '<button class="btn" data-awact="code" title="Lấy khối code dài nhất trong câu trả lời mới nhất">📥 Lấy code từ trang</button>' +
      '<button class="btn" data-awact="img" title="Lấy ảnh mới nhất trong câu trả lời">🖼 Lấy ảnh</button>' +
      '<button class="btn icon" data-awact="reload" title="Tải lại trang">↻</button><button class="btn icon" data-awact="hide" title="Ẩn khung">✕</button></div><div class="aw-body" id="awBody"></div>';
    document.body.appendChild(p);
    p.addEventListener('click', function (e) {
      var b = e.target.closest('[data-aw],[data-awact]'); if (!b) return;
      if (b.dataset.aw) { show(b.dataset.aw); return; }
      var a = b.dataset.awact, wv = view(state.site);
      if (a === 'hide') hide();
      if (a === 'reload') wv.reload();
      if (a === 'code') grabCode().then(function (c) { if (c) { loadCode(c); toast('Đã nạp code từ ' + SITES[state.site].name); } }).catch(function (err) { setStatus(err.message, true); });
      if (a === 'img') grabImage().then(function (d) { if (d && state.onManualImage) state.onManualImage(d); else if (d) saveDataUrl(d, 'anh-ai.png'); }).catch(function (err) { setStatus(err.message, true); });
    });
    return p;
  }
  function view(site) {
    if (state.views[site]) return state.views[site];
    var wv = document.createElement('webview');
    wv.setAttribute('partition', 'persist:aiweb');
    wv.setAttribute('useragent', UA);
    wv.setAttribute('allowpopups', '');
    wv.setAttribute('src', SITES[site].home);
    document.getElementById('awBody').appendChild(wv);
    wv.addEventListener('did-fail-load', function (e) { if (e.errorCode !== -3) setStatus('Không tải được ' + SITES[site].name + ' (' + e.errorDescription + '). Kiểm tra Internet rồi bấm ↻.', true); });
    state.views[site] = wv; return wv;
  }
  function setStatus(msg, err) { var s = document.getElementById('awStatus'); if (s) { s.textContent = msg; s.classList.toggle('err', !!err); } }
  function show(site) {
    panel().classList.add('on'); state.site = site || state.site;
    document.querySelectorAll('#aiwebPanel [data-aw]').forEach(function (b) { b.classList.toggle('on', b.dataset.aw === state.site); });
    var wv = view(state.site);
    Object.keys(state.views).forEach(function (k) { state.views[k].classList.toggle('on', k === state.site); });
    return wv;
  }
  function hide() { var p = document.getElementById('aiwebPanel'); if (p) p.classList.remove('on'); }
  function ready(wv) { // chờ webview gắn xong
    return new Promise(function (res) { try { wv.getURL(); res(); } catch (e) { wv.addEventListener('dom-ready', function h() { wv.removeEventListener('dom-ready', h); res(); }); } });
  }
  function saveDataUrl(d, name) { var a = document.createElement('a'); a.href = d; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  function dataUrlToFile(d, name) { var m = d.match(/^data:([^;]+);base64,(.*)$/); var bin = atob(m[2]), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new File([u], name, { type: m[1] }); }

  async function waitEditor(site, wv, signal, onProgress) {
    var t0 = Date.now(), told = false;
    for (;;) {
      if (signal && signal.aborted) throw new DOMException('Đã dừng', 'AbortError');
      var pr = null; try { pr = await call(wv, pageProbe, site); } catch (e) {}
      if (pr && pr.editor) return pr;
      if (Date.now() - t0 > 3000 && !told) { told = true; show(site); var m = 'Hãy đăng nhập ' + SITES[site].name + ' trong khung bên phải (chỉ một lần). App sẽ tự tiếp tục.'; setStatus(m, true); if (onProgress) onProgress('🔐 ' + m); }
      if (Date.now() - t0 > 10 * 60000) throw new Error('Chưa đăng nhập ' + SITES[site].name + ' (đã chờ 10 phút).');
      await sleep(1000);
    }
  }

  /** Gửi một yêu cầu và chờ câu trả lời. expect: 'text' | 'image'. autoSend=false: chỉ dán, chờ bạn tự đính kèm ảnh và bấm Gửi. */
  async function ask(site, prompt, opts) {
    opts = opts || {};
    if (!available()) throw new Error('Trang ChatGPT/Gemini nhúng chỉ có trong bản app (.exe).');
    if (state.busy) throw new Error('Khung ' + SITES[site].name + ' đang bận với yêu cầu khác.');
    state.busy = true;
    var wv = show(site), onP = opts.onProgress || function () {}, signal = opts.signal;
    try {
      await ready(wv);
      setStatus('Mở cuộc trò chuyện mới…');
      await wv.loadURL(SITES[site].home).catch(function () {});
      await sleep(1500);
      var pr = await waitEditor(site, wv, signal, onP);
      var n0 = pr.count;
      setStatus('Đang dán yêu cầu…');
      // Dán qua clipboard (giữ lại nội dung clipboard cũ của bạn)
      var oldClip = null; try { oldClip = await navigator.clipboard.readText(); } catch (e) {}
      await call(wv, pageFocus, site); wv.focus();
      var pasted = false;
      try { await navigator.clipboard.writeText(prompt); wv.paste(); await sleep(900); pasted = (await call(wv, pageEditorLen, site)) >= Math.min(prompt.length * 0.8, 2000); } catch (e) {}
      if (!pasted) { await call(wv, pageFocus, site); wv.insertText(prompt); await sleep(700); }
      if (oldClip != null) { try { await navigator.clipboard.writeText(oldClip); } catch (e) {} }
      if (opts.autoSend === false) {
        setStatus(opts.manualHint || 'Đã dán yêu cầu. Bấm Gửi trong khung khi sẵn sàng.', true); onP('✋ ' + (opts.manualHint || 'Đã dán yêu cầu, bấm Gửi trong khung.'));
      } else {
        var sent = false;
        for (var i = 0; i < 20 && !sent; i++) { sent = await call(wv, pageSend, site); if (!sent) await sleep(400); }
        if (!sent) { wv.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' }); wv.sendInputEvent({ type: 'char', keyCode: '\r' }); wv.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' }); }
      }
      setStatus(SITES[site].name + ' đang trả lời…');
      var t0 = Date.now(), lastSig = '', stable = 0, started = false, maxMs = (opts.timeoutMin || 8) * 60000;
      for (;;) {
        if (signal && signal.aborted) throw new DOMException('Đã dừng', 'AbortError');
        await sleep(1000);
        var p = null; try { p = await call(wv, pageProbe, site); } catch (e) { continue; }
        if (p.count > n0) started = true;
        if (!started) { if (Date.now() - t0 > (opts.autoSend === false ? 15 * 60000 : 90000)) throw new Error(SITES[site].name + ' chưa trả lời. Có thể trang đã đổi giao diện: bấm Gửi trong khung rồi dùng "📥 Lấy code từ trang".'); continue; }
        var sig = p.text.length + '|' + p.codes.join('').length + '|' + p.imgs.length;
        onP(assemble(p));
        setStatus(SITES[site].name + ' đang trả lời… ' + Math.round((Date.now() - t0) / 1000) + 's · ' + (p.text.length / 1000).toFixed(1) + 'k ký tự' + (p.imgs.length ? ' · ' + p.imgs.length + ' ảnh' : ''));
        if (sig === lastSig) stable++; else { stable = 0; lastSig = sig; }
        var doneText = p.text.trim() && !p.busy && stable >= (site === 'gemini' ? 4 : 3);
        if (opts.expect === 'image') {
          if (p.imgs.length && !p.busy && stable >= 3) {
            var best = p.imgs.slice().sort(function (a, b) { return b.w * b.h - a.w * a.h; })[0];
            setStatus('Đang tải ảnh về…');
            var data = await call(wv, pageFetchImage, best.src);
            setStatus('✓ Đã lấy ảnh từ ' + SITES[site].name); if (!state.keep) hide();
            return { image: data, text: p.text };
          }
          if (doneText && stable >= 8 && !p.imgs.length) throw new Error(SITES[site].name + ' không vẽ ảnh: ' + p.text.slice(0, 200));
        } else if (doneText) {
          setStatus('✓ Đã nhận câu trả lời từ ' + SITES[site].name); if (!state.keep) hide();
          return { text: assemble(p) };
        }
        if (Date.now() - t0 > maxMs) throw new Error('Quá thời gian chờ ' + SITES[site].name + '.');
      }
    } catch (e) {
      if (e.name !== 'AbortError') setStatus(e.message, true);
      throw e;
    } finally { state.busy = false; }
  }
  /** Ghép câu trả lời: phần chữ + các khối code có rào ``` để app đọc như API. */
  function assemble(p) {
    if (!p.codes.length) return p.text;
    var prose = p.text; p.codes.forEach(function (c) { prose = prose.split(c).join(''); });
    prose = prose.replace(/\n{3,}/g, '\n\n').trim();
    return prose + '\n\n' + p.codes.map(function (c) {
      var lang = /<!doctype html|<html[\s>]/i.test(c) ? 'html' : /^\s*[{[]/.test(c) ? 'json' : '';
      return '```' + lang + '\n' + c.replace(/\s+$/, '') + '\n```';
    }).join('\n\n');
  }
  async function grabCode() {
    var wv = view(state.site), p = await call(wv, pageProbe, state.site);
    var html = p.codes.filter(function (c) { return /<html|<!doctype/i.test(c); }).sort(function (a, b) { return b.length - a.length; })[0];
    if (!html) throw new Error('Không thấy code HTML trong câu trả lời mới nhất.');
    return html;
  }
  async function grabImage() {
    var wv = view(state.site), p = await call(wv, pageProbe, state.site);
    if (!p.imgs.length) throw new Error('Không thấy ảnh trong câu trả lời mới nhất.');
    var best = p.imgs.slice().sort(function (a, b) { return b.w * b.h - a.w * a.h; })[0];
    return call(wv, pageFetchImage, best.src);
  }
  return { available: available, ask: ask, show: show, hide: hide, grabCode: grabCode, grabImage: grabImage, dataUrlToFile: dataUrlToFile, saveDataUrl: saveDataUrl, state: state, SITES: SITES,
    _page: { probe: pageProbe, focus: pageFocus, send: pageSend, editorLen: pageEditorLen }, _assemble: assemble };
})();
