// Ghép src/* + examples/* thành một file duy nhất public/index.html
// Chạy: node build.js
const fs = require('fs');
const path = require('path');
const R = p => fs.readFileSync(path.join(__dirname, p), 'utf8');
const safe = s => JSON.stringify(s).replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--');

const exDir = path.join(__dirname, 'examples');
const examples = fs.readdirSync(exDir).filter(f => f.endsWith('.html')).sort().map(f => {
  const html = fs.readFileSync(path.join(exDir, f), 'utf8');
  const title = (html.match(/<title>([^<]*)<\/title>/i) || [, f])[1];
  return { name: title, file: f, html };
});

let app = R('src/app.html');
const libs = ['src/mp4mux.js', 'src/capture.js', 'src/music.js', 'src/studio.js', 'src/skill.js']
  .map(f => '<script>\n' + R(f).replace(/<\/script/gi, '<\\/script') + '\n</script>').join('\n');
app = app.replace('<!--@@LIBS@@-->', () => libs)
  .replace('/*@@SHIM@@*/""', () => safe(R('src/timeshim.js')))
  .replace('/*@@EXAMPLES@@*/[]', () => safe(examples));

fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'public/index.html'), app);
console.log('Đã tạo public/index.html (' + (app.length / 1024).toFixed(0) + ' KB, ' + examples.length + ' mẫu)');
