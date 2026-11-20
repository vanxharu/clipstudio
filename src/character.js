/* H2V.character: đưa nhân vật bạn tự vẽ (thư viện trong app) vào video.
   App tự chèn: window.H2V_CHARS (ảnh tư thế + hình miệng) và window.H2V_LIPSYNC (dữ liệu nhép miệng).

   H2V.character('ten', {
     x: 540, y: 1500,            // vị trí CHÂN nhân vật (px, giữa-dưới)
     height: 700,                // chiều cao nhân vật (px)
     poses: [[0, 'chao'], [5, 'chi-tay']],   // [giây, tư thế]
     start: 0, end: 20,          // xuất hiện / biến mất (giây)
     enter: 'pop',               // pop | left | right | bottom | fade | none
     exit: 'fade',               // như enter
     motion: 'breathe',          // breathe | bounce | none
     move: [[0, 540, 1500], [8, 300, 1500]],  // di chuyển [giây, x, y]
     flip: false,                // lật ngang
     talk: true,                 // nhép miệng theo giọng đọc: true | false | [[từ, đến], ...]
     z: 5
   });                                                                       */
(function () {
  if (window.H2V && window.H2V.character) return;
  var LIB = window.H2V_CHARS || {};
  var LIP = window.H2V_LIPSYNC || null;
  var clamp = function (v) { return Math.max(0, Math.min(1, v)); };
  var easeOut = function (v) { v = clamp(v); return 1 - Math.pow(1 - v, 3); };
  var easeIO = function (v) { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  var backOut = function (v) { v = clamp(v); var c = 1.70158; return 1 + (c + 1) * Math.pow(v - 1, 3) + c * Math.pow(v - 1, 2); };

  function cueAt(t) {
    if (!LIP) return 'X';
    if (LIP.cues && LIP.cues.length) {
      var lo = 0, hi = LIP.cues.length - 1;
      while (lo <= hi) { var mid = (lo + hi) >> 1, c = LIP.cues[mid]; if (t < c[0]) hi = mid - 1; else if (t >= c[1]) lo = mid + 1; else return c[2]; }
      return 'X';
    }
    var lv = levelAt(t);
    return lv < 0.12 ? 'X' : lv < 0.3 ? 'B' : lv < 0.55 ? 'C' : 'D';
  }
  function levelAt(t) {
    if (!LIP || !LIP.level) return 0;
    var i = Math.floor(t * (LIP.fps || 60)); return LIP.level[i] || 0;
  }
  var SIMPLE = { X: 'closed', A: 'closed', B: 'half', C: 'half', D: 'open', E: 'half', F: 'half', G: 'half', H: 'half' };
  function mouthSrc(ch, v) {
    var m = ch.mouths || {};
    return m[v] || m[SIMPLE[v]] || (v === 'X' ? m.A : null) || m.closed || null;
  }
  function inRanges(t, r) { if (r === true) return true; if (!r) return false; for (var i = 0; i < r.length; i++) if (t >= r[i][0] && t < r[i][1]) return true; return false; }
  function lerpPath(path, t) {
    if (!path || !path.length) return null;
    if (t <= path[0][0]) return [path[0][1], path[0][2]];
    for (var i = 0; i < path.length - 1; i++) {
      var a = path[i], b = path[i + 1];
      if (t < b[0]) { var k = easeIO((t - a[0]) / Math.max(0.001, b[0] - a[0])); return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
    }
    var l = path[path.length - 1]; return [l[1], l[2]];
  }

  var actors = [];
  function frame(now) {
    var t = now / 1000;   // thời gian tính từ lúc mở trang (app điều khiển khi xuất video)
    for (var i = 0; i < actors.length; i++) actors[i](t);
    requestAnimationFrame(frame);
  }

  function character(id, o) {
    o = o || {};
    var ch = LIB[id];
    var H = o.height || 600, x0 = o.x != null ? o.x : innerWidth / 2, y0 = o.y != null ? o.y : innerHeight - 100;
    var root = document.createElement('div');
    root.className = 'h2v-char h2v-char-' + id;
    root.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;transform-origin:50% 100%;z-index:' + (o.z != null ? o.z : 5);
    (o.parent || document.body).appendChild(root);
    if (!ch) {
      root.innerHTML = '<div style="width:' + (H * 0.5) + 'px;height:' + H + 'px;border:4px dashed #e63946;border-radius:16px;display:grid;place-items:center;font:700 28px sans-serif;color:#e63946;background:rgba(255,255,255,.7);text-align:center">Chưa có nhân vật<br>"' + id + '"</div>';
      root.style.width = (H * 0.5) + 'px';
    }
    var poses = {}, names = ch ? Object.keys(ch.poses || {}) : [];
    names.forEach(function (n) {
      var p = ch.poses[n], w = H * (p.w / p.h);
      var box = document.createElement('div');
      box.style.cssText = 'position:absolute;left:50%;bottom:0;width:' + w + 'px;height:' + H + 'px;margin-left:' + (-w / 2) + 'px;opacity:0';
      var img = document.createElement('img'); img.src = p.src; img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
      box.appendChild(img);
      var mouth = null;
      if (p.mouth) {
        mouth = document.createElement('img');
        var mw = p.mouth.w * w;
        mouth.style.cssText = 'position:absolute;width:' + mw + 'px;left:' + (p.mouth.x * w - mw / 2) + 'px;top:' + (p.mouth.y * H) + 'px;transform:translateY(-50%);display:none';
        box.appendChild(mouth);
      }
      root.appendChild(box);
      poses[n] = { box: box, mouth: mouth, w: w };
    });
    var timeline = (o.poses || [[0, names[0]]]).slice().sort(function (a, b) { return a[0] - b[0]; });
    var start = o.start != null ? o.start : 0, end = o.end != null ? o.end : 1e9;
    var enter = o.enter || 'pop', exit = o.exit || 'fade', motion = o.motion || 'breathe';
    var talk = o.talk === undefined ? true : o.talk;
    var lastMouth = {};

    function poseAt(t) {
      var cur = timeline[0], prev = null;
      for (var i = 0; i < timeline.length; i++) if (timeline[i][0] <= t) { prev = i > 0 ? timeline[i - 1] : null; cur = timeline[i]; }
      return { cur: cur[1], since: t - cur[0], prev: prev && prev[1] };
    }
    function update(t) {
      if (t < start || t >= end) { root.style.display = 'none'; return; }
      root.style.display = '';
      var pos = lerpPath(o.move, t) || [x0, y0];
      var tx = 0, ty = 0, sc = 1, sx = 1, sy = 1, op = 1;
      var e = t - start, xOut = end - t;
      var off = Math.max(innerWidth, innerHeight) * 0.6;
      if (e < 0.6) {
        var k = enter === 'pop' ? backOut(e / 0.5) : easeOut(e / 0.6);
        if (enter === 'pop') { sc = Math.max(0.001, k); }
        else if (enter === 'left') tx = -off * (1 - k);
        else if (enter === 'right') tx = off * (1 - k);
        else if (enter === 'bottom') ty = H * 1.2 * (1 - k);
        else if (enter === 'fade') op = k;
      }
      if (end < 1e8 && xOut < 0.5) {
        var q = 1 - clamp(xOut / 0.5);
        if (exit === 'pop') sc *= 1 - easeIO(q);
        else if (exit === 'left') tx -= off * easeIO(q);
        else if (exit === 'right') tx += off * easeIO(q);
        else if (exit === 'bottom') ty += H * 1.2 * easeIO(q);
        else if (exit === 'fade') op *= 1 - q;
      }
      if (motion === 'breathe') { sy *= 1 + 0.012 * Math.sin(t * 2.4); sx *= 1 - 0.006 * Math.sin(t * 2.4); }
      else if (motion === 'bounce') ty -= Math.abs(Math.sin(t * 4.2)) * H * 0.025;
      // Đổi tư thế: nảy nhẹ + chuyển mờ
      var ps = poseAt(t), sw = clamp(ps.since / 0.16);
      if (ps.prev && ps.since < 0.3) { var b = Math.sin(clamp(ps.since / 0.3) * Math.PI); sy *= 1 - 0.04 * b; sx *= 1 + 0.03 * b; }
      var speaking = talk && inRanges(t, talk);
      var lv = speaking ? levelAt(t) : 0;
      if (speaking) ty -= lv * H * 0.006;
      for (var n in poses) {
        var P = poses[n], a = n === ps.cur ? (ps.prev && ps.prev !== ps.cur ? sw : 1) : (n === ps.prev && ps.since < 0.16 ? 1 - sw : 0);
        P.box.style.opacity = a;
        if (P.mouth) {
          if (a > 0 && speaking) {
            var src = mouthSrc(ch, cueAt(t));
            if (src) { if (lastMouth[n] !== src) { P.mouth.src = src; lastMouth[n] = src; } P.mouth.style.display = ''; }
            else P.mouth.style.display = 'none';
          } else P.mouth.style.display = 'none';
        }
      }
      var w = (poses[ps.cur] && poses[ps.cur].w) || H * 0.5;
      root.style.width = w + 'px'; root.style.height = H + 'px';
      root.style.opacity = op;
      root.style.transform = 'translate(' + (pos[0] - w / 2 + tx) + 'px,' + (pos[1] - H + ty) + 'px) scale(' + (sc * sx * (o.flip ? -1 : 1)) + ',' + (sc * sy) + ')';
    }
    actors.push(update);
    if (actors.length === 1) requestAnimationFrame(frame);
    update(performance.now() / 1000);
    return { el: root, update: update };
  }

  window.H2V = window.H2V || {};
  window.H2V.character = character;
  window.H2V.characters = Object.keys(LIB);
  window.H2V.mouthAt = cueAt;
  window.H2V.voiceLevel = levelAt;
})();
