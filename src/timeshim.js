/* html2video time-shim: đóng băng thời gian của trang để chụp từng khung hình chính xác.
   Được chèn vào <head> trước mọi script của người dùng. */
(function () {
  if (window.__h2v) return;
  var RealDate = Date;
  var realSetTimeout = window.setTimeout.bind(window);
  var epoch = RealDate.now();
  var t = 0;                       // thời gian ảo (ms)
  var timers = new Map(), nextTimer = 1;
  var rafs = new Map(), nextRaf = 1;
  var seen = new WeakMap();        // animation -> thời điểm ảo lần đầu thấy

  // ---- Đồng hồ ----
  performance.now = function () { return t; };
  var FakeDate = function Date() {
    var a = Array.prototype.slice.call(arguments);
    if (!(this instanceof FakeDate)) return new RealDate(epoch + t).toString();
    var d = a.length ? new (Function.prototype.bind.apply(RealDate, [null].concat(a)))() : new RealDate(epoch + t);
    Object.setPrototypeOf(d, FakeDate.prototype);
    return d;
  };
  FakeDate.prototype = Object.create(RealDate.prototype);
  FakeDate.prototype.constructor = FakeDate;
  FakeDate.now = function () { return epoch + t; };
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  window.Date = FakeDate;

  // ---- Hẹn giờ ----
  window.setTimeout = function (fn, ms) {
    var args = Array.prototype.slice.call(arguments, 2);
    var id = nextTimer++;
    timers.set(id, { fn: fn, at: t + Math.max(0, +ms || 0), every: 0, args: args });
    return id;
  };
  window.setInterval = function (fn, ms) {
    var args = Array.prototype.slice.call(arguments, 2);
    var id = nextTimer++;
    var every = Math.max(1, +ms || 0);
    timers.set(id, { fn: fn, at: t + every, every: every, args: args });
    return id;
  };
  window.clearTimeout = window.clearInterval = function (id) { timers.delete(id); };
  window.requestAnimationFrame = function (cb) { var id = nextRaf++; rafs.set(id, cb); return id; };
  window.cancelAnimationFrame = function (id) { rafs.delete(id); };

  // ---- WebGL: giữ lại buffer để chụp được ----
  var origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, opts) {
    if (/webgl/.test(type)) opts = Object.assign({}, opts || {}, { preserveDrawingBuffer: true });
    return origGetContext.call(this, type, opts);
  };

  function runTimersUntil(target) {
    var guard = 0;
    while (guard++ < 100000) {
      var bestId = null, best = null;
      timers.forEach(function (v, k) { if (v.at <= target && (!best || v.at < best.at)) { best = v; bestId = k; } });
      if (!best) break;
      t = Math.max(t, best.at);
      if (best.every) best.at += best.every; else timers.delete(bestId);
      try { typeof best.fn === 'function' ? best.fn.apply(window, best.args) : (0, eval)(best.fn); }
      catch (e) { console.error(e); }
    }
  }

  function syncAnimations() {
    if (!document.getAnimations) return;
    document.getAnimations().forEach(function (a) {
      try {
        if (!seen.has(a)) seen.set(a, t);
        if (a.playState !== 'paused') a.pause();
        a.currentTime = t - seen.get(a);
      } catch (e) {}
    });
  }

  function syncMedia() {
    var ps = [];
    document.querySelectorAll('video,audio').forEach(function (m) {
      try {
        m.muted = true; if (!m.paused) m.pause();
        var target = (t / 1000) % (m.duration || Infinity);
        if (Math.abs(m.currentTime - target) > 0.001) {
          ps.push(new Promise(function (r) { m.addEventListener('seeked', r, { once: true }); realSetTimeout(r, 500); }));
          m.currentTime = target;
        }
      } catch (e) {}
    });
    return Promise.all(ps);
  }

  async function advance(ms) {
    if (ms < t) throw new Error('h2v: không thể lùi thời gian (' + ms + ' < ' + t + ')');
    runTimersUntil(ms);
    t = ms;
    var cbs = Array.from(rafs.values()); rafs.clear();
    cbs.forEach(function (cb) { try { cb(t); } catch (e) { console.error(e); } });
    if (typeof window.h2vSeek === 'function') { try { await window.h2vSeek(t / 1000); } catch (e) { console.error(e); } }
    syncAnimations();
    await syncMedia();
    return t;
  }

  window.__h2v = {
    advance: advance,
    now: function () { return t; },
    ready: function () {
      var imgs = Array.from(document.images).map(function (i) { return i.complete ? 0 : new Promise(function (r) { i.onload = i.onerror = r; }); });
      return Promise.all([document.fonts ? document.fonts.ready : 0].concat(imgs));
    }
  };
  syncAnimations();
})();
