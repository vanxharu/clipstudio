# HTML → Video Studio

Biến code **HTML / CSS / JS** thành video **MP4**, kể cả hoạt ảnh CSS, JS (requestAnimationFrame, GSAP…), Canvas và WebGL/Three.js. Có thể thêm nhạc nền tự tạo (không bản quyền), file âm thanh riêng và giọng đọc TTS.

## Cách hoạt động

Tool không quay màn hình. Nó **đóng băng thời gian** của trang web: `performance.now`, `Date`, `setTimeout`, `requestAnimationFrame`, CSS animation và `<video>` đều bị điều khiển. Sau đó tool tua đúng từng khung hình (ví dụ 1/30 giây), chụp lại rồi ghép thành video. Nhờ vậy video luôn mượt đúng 30/60 fps, kể cả khi máy yếu.

Có 3 cách dùng:

| Cách | Cần cài gì | Ưu điểm |
|---|---|---|
| **Web app** (mở `public/index.html` hoặc bản artifact) | Không cần cài gì, chỉ cần Chrome/Edge | Soạn code, xem trước, xuất MP4 ngay trong trình duyệt |
| **Máy chủ local** (`npm start`) | Node.js, FFmpeg | Vẫn là web app đó nhưng thêm nút **Xuất HQ** (Chrome thật + FFmpeg, chính xác 100%) và **giọng đọc TTS** |
| **CLI** (`node render.js`) | Node.js, FFmpeg | Render hàng loạt, dùng trong script/tự động hoá |

## Cài đặt (cho máy chủ local và CLI)

> Dùng Windows? Xem mục **Bản Windows (.exe)** bên dưới: không cần cài các thứ này.

1. **Node.js 18+**: https://nodejs.org
2. **FFmpeg** (không bắt buộc: `npm install` đã kèm sẵn FFmpeg)
   - Windows: `winget install ffmpeg`
   - macOS: `brew install ffmpeg`
   - Ubuntu/Debian: `sudo apt install ffmpeg`
3. Trong thư mục này:
   ```bash
   npm install
   ```
   Tool dùng Chrome hoặc Edge có sẵn trên máy. Nếu máy không có, chạy thêm `npm i playwright && npx playwright install chromium`.
4. *(Tuỳ chọn, cho giọng đọc)* `pip install edge-tts`. Đây là giọng Microsoft Edge miễn phí, có tiếng Việt Hoài My (nữ) và Nam Minh (nam). Khi tạo giọng đọc cần có Internet.

Chạy:

```bash
npm start
# mở http://localhost:3210
```

## Dùng web app

**🤖 AI viết video (Gemini miễn phí hoặc ChatGPT):** mở tab **🤖 AI viết video** bên trái, dán API key (Gemini dùng chung key với giọng đọc), chọn phong cách (Bảng trắng, Chữ động, 3D Three.js, Biểu đồ, Tự do) rồi mô tả video. AI viết code đúng chuẩn của app. App tự nạp, tạo giọng đọc, nhạc và xem trước. Muốn sửa thì nhắn tiếp, ví dụ "chữ to hơn", "thêm cảnh cuối". Mỗi bản AI viết đều có nút **↩ Dùng lại bản này**.

**Cách nhanh nhất: dán code là xong.** Copy code (ví dụ ChatGPT viết theo `PROMPT-cho-AI.md`) rồi bấm **📋 Dán code**, hoặc nhấn Ctrl+V vào ô code. Nếu code có khối `<script type="application/json" id="h2v-audio">`, app sẽ tự đọc lời thoại, giọng, nhạc nền, tạo giọng đọc và khớp thời lượng. Lần đầu app hỏi Gemini API key (miễn phí, chỉ nhập một lần). Sau đó bấm **▶ Xuất video**.


1. Dán code vào tab **HTML** (có thể là cả một trang hoàn chỉnh), **CSS** hoặc **JS**. Bạn cũng có thể chọn **Mẫu có sẵn** hoặc **Mở file…**.
2. Chọn khung hình: 16:9, 9:16 (TikTok/Reels/Shorts), 1:1, 4:5, 4K… Sau đó chọn FPS và thời lượng.
3. Thêm âm thanh nếu muốn:
   - **Nhạc nền tự tạo**: 5 phong cách (Lo-fi, Ambient, Sôi động, Điện ảnh, Doanh nghiệp). Bấm 🎲 để đổi biến thể. Nhạc được tổng hợp mới hoàn toàn nên không vướng bản quyền.
   - **File audio**: mp3/wav/m4a của bạn, ví dụ nhạc tải từ Pixabay Music hoặc YouTube Audio Library.
   - **Giọng đọc (TTS)**: mở mục **🎙 Cài đặt giọng đọc** rồi chọn dịch vụ (xem bên dưới). Bạn có thể dán cả kịch bản dạng `[0.5s] câu…`, hoặc bấm **Lấy lời thoại từ code**, rồi bấm **Tạo giọng đọc cho tất cả**. Bấm **Khớp thời lượng** để video dài bằng giọng đọc.
   - Tuỳ chọn **Tự giảm nhạc khi có giọng đọc** sẽ hạ nhạc nền xuống lúc có người nói.
4. Bấm **Xuất MP4 (trong trình duyệt)** hoặc **Xuất HQ**.

### Hai chế độ xuất khác nhau thế nào?

- **Trong trình duyệt**: tool chụp DOM qua SVG rồi mã hoá bằng WebCodecs. Cách này nhanh và không cần cài gì. Hạn chế: một số thứ có thể hiển thị khác Chrome thật, như font từ trang khác không cho tải (CORS), `backdrop-filter`, iframe con hay ảnh bị chặn CORS. Canvas và WebGL thì được chụp trực tiếp nên luôn đúng. Trên Linux, Chrome thường không có bộ mã hoá AAC nên âm thanh sẽ là Opus (vẫn trong file MP4).
- **HQ**: tool chụp ảnh màn hình bằng Chrome thật rồi mã hoá bằng FFmpeg (H.264 + AAC). Hình giống hệt khi mở trang trên Chrome và tương thích với mọi nền tảng.

## Nhân vật bạn tự vẽ (🧑‍🎨 Nhân vật)

1. Bấm **🧑‍🎨 Nhân vật** → **＋ Nhân vật mới**, đặt tên và mô tả (để AI hiểu nhân vật).
2. Kéo thả các ảnh **PNG nền trong suốt**, mỗi ảnh một tư thế (vui, buồn, chỉ tay…). Tên file thành tên tư thế. App tự cắt viền trống và thu nhỏ ảnh.
3. **Nhép miệng:** vẽ hình miệng thành PNG riêng (có tô màu da để che miệng gốc) rồi bấm **👄 Đặt miệng** trên từng tư thế để chỉ chỗ đặt và chỉnh cỡ.
   - Đơn giản: 3 hình (đóng, hé, mở). Miệng mở theo độ lớn giọng.
   - Chính xác: 6–9 hình A–F (G, H, X tuỳ chọn) theo chuẩn Rhubarb Lip Sync. Bản .exe có sẵn Rhubarb nên tự nhận âm tiết. Chạy từ mã nguồn thì đặt Rhubarb vào `vendor/rhubarb/`.
4. Bấm **▶ Thử nhân vật trong video mẫu** để xem ngay. Hoặc nhắn tab AI, ví dụ "cho Mèo Cam giới thiệu quán cà phê". AI tự dùng đúng nhân vật và tư thế.
5. **Xuất…/Nhập…** để mang nhân vật sang máy khác (file `.h2v-char.json`).

Nhân vật được lưu trong app (IndexedDB) và dùng lại được cho mọi video. Trong code, nhân vật được gọi bằng `H2V.character('ten', {...})`, xem `PROMPT-cho-AI.md`.

## Giọng đọc ngay trên web (không cần cài gì)

| Dịch vụ | Miễn phí | Tiếng Việt | Cần gì |
|---|---|---|---|
| **Google Gemini TTS** (khuyên dùng) | Có gói miễn phí, giới hạn số lượt mỗi phút/ngày | Có, 30 giọng đọc đa ngôn ngữ | API key tạo tại https://aistudio.google.com/apikey, không cần thẻ |
| **Microsoft Azure Speech** | 500.000 ký tự/tháng (gói F0) | Hoài My (nữ), Nam Minh (nam) | Tài khoản Azure (cần thẻ để xác minh), tạo tài nguyên Speech gói Free F0, lấy Key + Region |
| **edge-tts** (máy chủ local) | Miễn phí, không cần key | Hoài My, Nam Minh | `npm start` + `pip install edge-tts` |

- Key được lưu trong trình duyệt của bạn (localStorage) và gửi thẳng tới Google/Microsoft, không qua máy chủ nào khác. Đừng chia sẻ máy hay trang khi đã nhập key.
- Gemini: ô **Phong cách** nhận mô tả như "hào hứng", "ấm áp, chậm rãi". Thanh tốc độ được đổi thành mô tả "nhanh"/"chậm rãi". Khi chạm giới hạn miễn phí, tool tự chờ rồi tạo tiếp.
- **Trang trên claude.ai không gọi được các API này** vì trang bị chặn kết nối ra ngoài. Hãy mở `public/index.html` trên máy (nhấp đúp là được), hoặc đưa file đó lên một trang web tĩnh miễn phí như GitHub Pages hay Netlify để dùng ở mọi nơi.

## Bản Windows (.exe) + tự cập nhật

Bản ứng dụng gói sẵn mọi thứ: giao diện, FFmpeg và máy chủ render. Nó render bằng **Microsoft Edge có sẵn trên Windows 10/11** (hoặc Chrome nếu máy có), nên **không cần cài Node, FFmpeg hay Python**. Gọi Gemini/Azure không bị chặn. Video được lưu thẳng vào thư mục bạn chọn. App tự kiểm tra và cài bản mới.

### Thiết lập lần đầu (một lần duy nhất)

1. Tạo tài khoản và một repository **công khai (Public)** trên https://github.com, ví dụ `html2video-studio`.
   App tự cập nhật bằng cách đọc mục Releases của repo. Repo riêng tư (Private) thì app không đọc được nếu không có token.
2. Đưa toàn bộ thư mục dự án lên repo, **giữ cả thư mục ẩn `.github`**:
   - Dễ nhất là dùng **GitHub Desktop**: File → Add local repository → chọn thư mục → Publish repository (bỏ tick "Keep this code private").
   - Hoặc dùng lệnh git: `git init && git add . && git commit -m "init" && git branch -M main && git remote add origin https://github.com/<tên>/<repo>.git && git push -u origin main`
3. Trên GitHub vào **Settings → Actions → General → Workflow permissions**, chọn **Read and write permissions** → Save.

### Phát hành một phiên bản

**Cách nhanh nhất:** sửa số `"version"` trong `package.json` lên cao hơn (ví dụ `1.0.0` → `1.0.1`) rồi đẩy lên nhánh `main`. GitHub sẽ tự build và phát hành. Nếu bản đó đã phát hành rồi, GitHub tự bỏ qua.

**Hoặc bấm tay:**
1. Vào tab **Actions** → **Build Windows app** → **Run workflow**.
2. Nhập phiên bản, ví dụ `1.0.0` (lần sau tăng lên `1.0.1`, `1.1.0`…), rồi bấm **Run workflow**.
3. Chờ khoảng 5–10 phút. Khi xong, mục **Releases** sẽ có file `HTML-Video-Studio-Setup-1.0.0.exe`. Đó là bộ cài để tải về và chia sẻ.

Muốn build thử mà không phát hành thì để trống ô phiên bản. File .exe nằm ở mục **Artifacts** của lần chạy đó.

### Cập nhật

- Sửa code, đẩy lên GitHub, rồi phát hành phiên bản **cao hơn** theo các bước trên.
- Các app đã cài sẽ tự kiểm tra bản mới khi mở, và sau đó cứ mỗi 4 giờ. Khi có bản mới, app tự tải về rồi hiện nút **"Khởi động lại để cập nhật"**. Nếu bạn không bấm, bản mới sẽ được cài khi đóng app. Bạn cũng có thể bấm **Kiểm tra cập nhật** ở góc trên.

### Lưu ý

- Bộ cài chưa có chữ ký số, nên lần đầu cài Windows SmartScreen sẽ báo "Windows protected your PC". Bấm **More info → Run anyway**. Muốn hết cảnh báo thì cần mua chứng chỉ ký mã (code signing).
- Một số phần mềm diệt virus có thể cảnh báo nhầm file .exe mới build. Nếu gặp, hãy thêm ngoại lệ.
- Giọng đọc edge-tts trong app vẫn cần cài Python + `pip install edge-tts`. Gemini và Azure thì dùng được ngay.
- Chạy thử app trên máy khi đang sửa code: `npm install` rồi `npm run app`.

## Dùng CLI

```bash
node render.js examples/02-social-9x16.html
node render.js intro.html --preset 9x16 -d 12 -o out.mp4
node render.js intro.html -a nhac.mp3@0:0.6 --tts "Xin chào các bạn" --voice vi-VN-NamMinhNeural --fit-audio
node render.js thu-muc-chua-nhieu-file/        # render hàng loạt
node render.js --help
```

`-a file.mp3@2.5:0.6` nghĩa là bắt đầu ở giây 2.5 với âm lượng 0.6.

## Mẹo viết HTML để render đẹp

- Khai báo cấu hình ngay trong file để tool tự áp dụng:
  `<meta name="h2v" content="width=1080,height=1920,fps=30,duration=10">`
- Thiết kế theo đúng kích thước khung hình. Trang được mở với viewport đúng bằng kích thước video.
- Cách chắc chắn nhất là định nghĩa `window.h2vSeek = (t) => { ... }`: hàm vẽ trạng thái tại giây `t`. Tool sẽ gọi hàm này ở mỗi khung hình (xem `examples/03-bieu-do.html`).
- Hoạt ảnh dùng `requestAnimationFrame` + `performance.now()`, CSS `@keyframes`/`transition`, GSAP, anime.js hay Three.js `Clock` đều tự chạy đúng, không cần sửa gì.
- Nếu cần số ngẫu nhiên, hãy dùng bộ sinh có seed để video giống nhau mỗi lần render (xem `examples/04-canvas-hat.html`).

## Cấu trúc

```
public/index.html   web app (đã đóng gói, mở trực tiếp được)
src/                mã nguồn web app: timeshim.js, capture.js, mp4mux.js, music.js, app.html
lib/core.js         lõi render HQ (Playwright + FFmpeg + edge-tts)
server.js           máy chủ local (cũng chạy bên trong bản .exe)
electron/           bản ứng dụng Windows: cửa sổ app, tự cập nhật
.github/workflows/  GitHub tự build bộ cài .exe và phát hành
build/              icon ứng dụng
render.js           CLI
examples/           5 mẫu: intro 16:9, video dọc 9:16, biểu đồ, canvas, Three.js
build.js            sửa src/ xong thì chạy `npm run build` để tạo lại public/index.html
```

Biến môi trường: `PORT` (mặc định 3210), `CHROME_PATH` (dùng Chrome có sẵn trên máy), `FFMPEG_PATH`.
