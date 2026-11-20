/* 🧩 Bộ skill cho ChatGPT (Project, bản miễn phí) và Gemini (Gem): hướng dẫn chính + 5 file kiến thức.
   Dùng các biến của app: AI_RULES, AI_STYLES, EXAMPLES. */
var H2VSkill = (function () {
  'use strict';

  function mainInstructions() {
    return [
      'Bạn là "Video Studio": chuyên viết code VIDEO bằng một file HTML/CSS/JS cho app HTML Video Studio. Người dùng dán code bạn viết vào app, app tự tạo giọng đọc, nhạc nền và xuất MP4.',
      '',
      'LUÔN ĐỌC CÁC FILE KIẾN THỨC trước khi viết:',
      '- 1-quy-tac-va-phong-cach.md: quy tắc kỹ thuật đầy đủ, 5 phong cách, cách làm video dài.',
      '- 2-mau-bang-trang.md, 3-mau-chu-dong.md, 4-mau-3d.md, 5-mau-bieu-do.md: file mẫu chạy đúng chuẩn. Viết theo đúng cấu trúc của mẫu cùng phong cách.',
      '',
      'CÁCH LÀM VIỆC',
      '1. Người dùng mô tả video (chủ đề, phong cách, độ dài, khung). Thiếu thông tin thì TỰ CHỌN hợp lý, không hỏi lại: khung dọc 1080×1920, 30–60 giây, phong cách hợp nội dung, giọng nữ Kore, nhạc lofi.',
      '2. Viết lời thoại tiếng Việt tự nhiên, chia cảnh khớp lời thoại, hình minh hoạ đúng nội dung từng câu.',
      '3. Khi người dùng yêu cầu sửa: sửa trên file gần nhất, giữ nguyên phần không được yêu cầu đổi, trả lại TOÀN BỘ file.',
      '4. Nhân vật, con vật, đồ vật: tự vẽ bằng SVG/CSS/Canvas ngay trong file (không dùng ảnh ngoài).',
      '5. Video dài hơn 60 giây: bắt buộc làm theo mục "Video dài" trong file 1 ("chain": true, cảnh bám theo window.H2V_VOICE) để hình luôn khớp giọng đọc.',
      '',
      AI_RULES.replace(/^Bạn là[^\n]*\n\n/, ''),
      '',
      'TỰ KIỂM TRA TRƯỚC KHI TRẢ LỜI: có thẻ meta h2v; duration > câu thoại cuối + 1s; khối h2v-audio là JSON hợp lệ; không dùng Math.random() không seed, không click/hover, không fetch; code đầy đủ từ <!DOCTYPE html> đến </html>.'
    ].join('\n');
  }

  function rulesFile() {
    return [
      '# Quy tắc và phong cách cho HTML Video Studio',
      '',
      '## Quy tắc kỹ thuật (bắt buộc)',
      '',
      AI_RULES.replace(/\\`/g, '`'),
      '',
      '## Video dài (trên 60 giây, ví dụ kể chuyện 5–10 phút)',
      '',
      '- Trong khối h2v-audio thêm `"chain": true`: app đọc từng câu nối tiếp nhau theo độ dài giọng thật (mốc giây trong lines chỉ là ước lượng), cách nhau `"gap": 0.35` giây.',
      '- Mỗi câu thoại 1–3 câu văn, dưới 300 ký tự. Duration trong meta để dư; app tự chỉnh theo giọng thật khi có `"fit": true`.',
      '- Hình phải bám theo mốc giọng THẬT: app chèn `window.H2V_VOICE = [[bắt_đầu, kết_thúc, "câu"], ...]` (giây). Đọc mảng này để biết câu nào đang đọc, nếu chưa có thì tự ước lượng (~14 ký tự/giây):',
      '',
      '```js',
      "const AUDIO = JSON.parse(document.getElementById('h2v-audio').textContent);",
      'const TIMES = (window.H2V_VOICE && window.H2V_VOICE.length) ? window.H2V_VOICE : (function () { let t = 0.5; return AUDIO.lines.map(([, s]) => { const a = t; t += s.length / 14 + 0.35; return [a, t - 0.35, s]; }); })();',
      'function lineAt(t) { let i = 0; while (i + 1 < TIMES.length && TIMES[i + 1][0] <= t) i++; return i; }',
      '// trong h2vSeek(t): const i = lineAt(t); vẽ cảnh theo i, phụ đề = TIMES[i][2]',
      '```',
      '',
      '- Cảnh gắn với chỉ số câu (cảnh 1 = câu 0–3, cảnh 2 = câu 4–8…), không gắn với giây cố định, để hình luôn khớp lời.',
      '',
      '## 5 phong cách',
      ''
    ].concat(AI_STYLES.map(function (s) {
      var file = { whiteboard: '2-mau-bang-trang.md', motion: '3-mau-chu-dong.md', '3d': '4-mau-3d.md', chart: '5-mau-bieu-do.md' }[s.id];
      return '### ' + s.name + '\n\n' + (s.guide ? s.guide : 'Tự chọn phong cách đẹp, hiện đại, hợp nội dung.') + (file ? '\n\nFile mẫu: ' + file : '') + '\n';
    })).join('\n');
  }

  function exampleFile(prefix, title) {
    var ex = (typeof EXAMPLES !== 'undefined' ? EXAMPLES : []).find(function (e) { return e.file && e.file.indexOf(prefix) === 0; });
    if (!ex) return '# ' + title + '\n\n(Chưa có file mẫu)\n';
    return '# File mẫu: ' + title + '\n\nFile chạy đúng chuẩn của app. Khi làm video phong cách này, giữ cấu trúc và bộ máy chuyển động, chỉ thay nội dung, cảnh và khối h2v-audio.\n\n```html\n' + ex.html + '\n```\n';
  }

  function files() {
    return [
      { name: 'huong-dan-chinh.txt', text: mainInstructions(), main: true },
      { name: '1-quy-tac-va-phong-cach.md', text: rulesFile() },
      { name: '2-mau-bang-trang.md', text: exampleFile('06-', 'Bảng trắng vẽ tay') },
      { name: '3-mau-chu-dong.md', text: exampleFile('02-', 'Chữ động') },
      { name: '4-mau-3d.md', text: exampleFile('05-', '3D Three.js') },
      { name: '5-mau-bieu-do.md', text: exampleFile('03-', 'Biểu đồ') }
    ];
  }

  /* ---- zip không nén (đủ cho vài file chữ) ---- */
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(list) {
    var enc = new TextEncoder(), parts = [], central = [], off = 0;
    list.forEach(function (f) {
      var name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    });
    var csize = central.reduce(function (s, a) { return s + a.length; }, 0);
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, list.length, true); e.setUint16(10, list.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]), { type: 'application/zip' });
  }
  function download(name, blob) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000); }
  function downloadAll() { download('bo-skill-video-studio.zip', zip(files())); }
  function downloadOne(name) { var f = files().find(function (x) { return x.name === name; }); if (f) download(f.name, new Blob([f.text], { type: 'text/plain;charset=utf-8' })); }
  return { files: files, mainInstructions: mainInstructions, downloadAll: downloadAll, downloadOne: downloadOne, _zip: zip };
})();
