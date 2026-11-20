/* Chụp trạng thái hiện tại của một document (trong iframe) thành canvas,
   qua SVG <foreignObject>. Dùng cho chế độ render ngay trong trình duyệt. */
var H2VCapture = (function () {
  var urlCache = new Map();

  function blobToDataURL(b) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsDataURL(b); });
  }
  async function toDataURL(url) {
    if (!url || /^data:/.test(url)) return url;
    if (urlCache.has(url)) return urlCache.get(url);
    var p = fetch(url).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(blobToDataURL).catch(function () { return url; });
    urlCache.set(url, p);
    return p;
  }
  async function inlineCssUrls(css, base) {
    var re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g, m, jobs = [];
    while ((m = re.exec(css))) {
      var raw = m[2];
      if (/^(data:|#)/.test(raw)) continue;
      var abs; try { abs = new URL(raw, base).href; } catch (e) { continue; }
      jobs.push([m[0], abs]);
    }
    for (var i = 0; i < jobs.length; i++) {
      var d = await toDataURL(jobs[i][1]);
      css = css.split(jobs[i][0]).join('url("' + d + '")');
    }
    // @import (ví dụ Google Fonts) -> tải và nhúng
    var imp = /@import\s+(?:url\()?['"]?([^'")\s;]+)['"]?\)?[^;]*;/g, im, imports = [];
    while ((im = imp.exec(css))) imports.push([im[0], im[1]]);
    for (var j = 0; j < imports.length; j++) {
      var txt = await fetchText(new URL(imports[j][1], base).href);
      css = css.split(imports[j][0]).join(txt ? await inlineCssUrls(txt, imports[j][1]) : '');
    }
    return css;
  }
  var textCache = new Map();
  function fetchText(url) {
    if (!textCache.has(url)) textCache.set(url, fetch(url).then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; }));
    return textCache.get(url);
  }
  var linkCssCache = new Map();
  async function linkCss(link) {
    var href = link.href;
    if (linkCssCache.has(href)) return linkCssCache.get(href);
    var css = '';
    try { css = Array.from(link.sheet.cssRules).map(function (r) { return r.cssText; }).join('\n'); }
    catch (e) { css = await fetchText(href); }
    css = await inlineCssUrls(css, href);
    linkCssCache.set(href, css);
    return css;
  }

  function kebab(p) { return p.indexOf('--') === 0 ? p : p.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }); }
  var SKIP = { offset: 1, easing: 1, composite: 1, computedOffset: 1 };
  function animatedProps(anims) {
    var props = new Set();
    anims.forEach(function (a) {
      if (a.transitionProperty) props.add(a.transitionProperty);
      try { (a.effect.getKeyframes() || []).forEach(function (k) { Object.keys(k).forEach(function (p) { if (!SKIP[p]) props.add(kebab(p)); }); }); } catch (e) {}
    });
    return props;
  }

  async function serialize(doc, w, h) {
    var win = doc.defaultView;
    var src = doc.documentElement;
    var clone = src.cloneNode(true);
    var a = [], b = [];
    var wa = doc.createTreeWalker(src, NodeFilter.SHOW_ELEMENT), wb = doc.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT);
    var na = wa.currentNode, nb = wb.currentNode;
    while (na && nb) { a.push(na); b.push(nb); na = wa.nextNode(); nb = wb.nextNode(); }

    var pseudoRules = [], removals = [], idn = 0;
    var animsByEl = new Map(), pseudoAnims = [];
    (doc.getAnimations ? doc.getAnimations() : []).forEach(function (an) {
      var tgt = an.effect && an.effect.target; if (!tgt) return;
      if (an.effect.pseudoElement) { pseudoAnims.push(an); return; }
      if (!animsByEl.has(tgt)) animsByEl.set(tgt, []);
      animsByEl.get(tgt).push(an);
    });
    var pseudoByEl = new Map();
    pseudoAnims.forEach(function (an) {
      var k = an.effect.target; if (!pseudoByEl.has(k)) pseudoByEl.set(k, []); pseudoByEl.get(k).push(an);
    });

    for (var i = 0; i < a.length; i++) {
      var o = a[i], c = b[i], tag = o.tagName.toLowerCase();
      if (tag === 'script' || tag === 'noscript') { removals.push(c); continue; }
      if (tag === 'link' && /stylesheet/i.test(o.rel)) {
        var st = doc.createElement('style'); st.textContent = await linkCss(o);
        removals.push([c, st]); continue;
      }
      if (tag === 'style') { c.textContent = await inlineCssUrls(o.textContent, doc.baseURI); continue; }
      if (tag === 'canvas') {
        var img = doc.createElement('img');
        try { img.src = o.toDataURL('image/png'); } catch (e) {}
        Array.from(o.attributes).forEach(function (at) { if (at.name !== 'width' && at.name !== 'height') img.setAttribute(at.name, at.value); });
        var cs = win.getComputedStyle(o);
        img.style.width = cs.width; img.style.height = cs.height; img.style.display = cs.display === 'inline' ? 'inline-block' : cs.display;
        removals.push([c, img]); continue;
      }
      if (tag === 'img' && o.currentSrc) { c.setAttribute('src', await toDataURL(o.currentSrc)); c.removeAttribute('srcset'); }
      if (tag === 'image' && o.href && o.href.baseVal) { c.setAttribute('href', await toDataURL(new URL(o.href.baseVal, doc.baseURI).href)); }
      if (tag === 'video') {
        var vc = doc.createElement('canvas'); vc.width = o.videoWidth || 1; vc.height = o.videoHeight || 1;
        try { vc.getContext('2d').drawImage(o, 0, 0); var vi = doc.createElement('img'); vi.src = vc.toDataURL(); vi.setAttribute('style', o.getAttribute('style') || ''); vi.className = o.className; var vcs = win.getComputedStyle(o); vi.style.width = vcs.width; vi.style.height = vcs.height; vi.style.objectFit = vcs.objectFit; removals.push([c, vi]); } catch (e) {}
        continue;
      }
      if (tag === 'input' || tag === 'textarea') { c.setAttribute('value', o.value); if (tag === 'textarea') c.textContent = o.value; }
      var ans = animsByEl.get(o);
      if (ans) {
        var cs2 = win.getComputedStyle(o);
        animatedProps(ans).forEach(function (p) { var v = cs2.getPropertyValue(p); if (v) c.style.setProperty(p, v, 'important'); });
      }
      var pans = pseudoByEl.get(o);
      if (pans) {
        var id = 'h' + (idn++); c.setAttribute('data-h2v', id);
        pans.forEach(function (an) {
          var pe = an.effect.pseudoElement, pcs = win.getComputedStyle(o, pe), decl = [];
          animatedProps([an]).forEach(function (p) { decl.push(p + ':' + pcs.getPropertyValue(p) + ' !important'); });
          pseudoRules.push('[data-h2v="' + id + '"]' + pe + '{' + decl.join(';') + '}');
        });
      }
    }
    removals.forEach(function (r) { if (Array.isArray(r)) r[0].replaceWith(r[1]); else r.remove(); });

    var head = clone.querySelector('head') || clone;
    var freeze = doc.createElement('style');
    freeze.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}' + pseudoRules.join('');
    head.appendChild(freeze);
    // Giữ vị trí cuộn
    var body = clone.querySelector('body');
    if (body && (win.scrollX || win.scrollY)) body.style.transform = 'translate(' + (-win.scrollX) + 'px,' + (-win.scrollY) + 'px)';
    clone.style.width = w + 'px'; clone.style.height = h + 'px'; clone.style.overflow = 'hidden';

    var xml = new XMLSerializer().serializeToString(clone);
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '"><foreignObject x="0" y="0" width="100%" height="100%">' + xml + '</foreignObject></svg>';
  }

  function loadImage(src) {
    return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { rej(new Error('Không vẽ được khung hình (SVG lỗi)')); }; i.src = src; });
  }

  function pickMode(doc, w, h, mode) {
    if (mode === 'dom') return { mode: 'dom' };
    var best = null;
    doc.querySelectorAll('canvas').forEach(function (c) {
      var r = c.getBoundingClientRect();
      if (r.width * r.height >= 0.95 * w * h && (!best || r.width * r.height > best.r.width * best.r.height)) best = { c: c, r: r };
    });
    if (mode === 'canvas') {
      if (!best) { var cs = doc.querySelector('canvas'); if (cs) best = { c: cs, r: cs.getBoundingClientRect() }; }
      return best ? { mode: 'canvas', canvas: best.c } : { mode: 'dom' };
    }
    // auto: canvas toàn màn hình và không có chữ phủ lên -> chụp canvas trực tiếp (nhanh hơn)
    if (best && !(doc.body && doc.body.innerText.trim())) return { mode: 'canvas', canvas: best.c };
    return { mode: 'dom' };
  }

  async function captureFrame(doc, ctx, w, h, mode) {
    var m = pickMode(doc, w, h, mode || 'auto');
    ctx.save();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    if (m.mode === 'canvas') {
      ctx.drawImage(m.canvas, 0, 0, w, h);
    } else {
      var svg = await serialize(doc, w, h);
      var img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
      ctx.drawImage(img, 0, 0, w, h);
    }
    ctx.restore();
    return m.mode;
  }
  return { captureFrame: captureFrame, clearCache: function () { urlCache.clear(); textCache.clear(); linkCssCache.clear(); } };
})();
