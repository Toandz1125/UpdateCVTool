# UpdateCV - Công cụ Quản lý & Tự động Cập nhật CV Đa Nền tảng

> Quản lý CV theo triết lý **Single Source of Truth (SSoT)**: Một nguồn dữ liệu duy nhất (`data/resume.yaml`), giữ nguyên 100% các đầu mục lớn và phong cách hành văn, tự động biên dịch và phân phối sang **TopCV**, **GitHub**, và **LinkedIn**.

---

## 🎯 Mục tiêu & Nguyên tắc thiết kế

1. **Khóa cứng các đầu mục lớn (Section Headers)**:
   * **TopCV**: `CAREER OBJECTIVE`, `EDUCATION`, `RESEARCH & PUBLICATIONS`, `PROJECTS`, `SKILLS`, `HONORS & AWARDS`, `CERTIFICATES`, `HOBBIES`.
   * **GitHub Profile**: Header Banner, Typing SVG, Intro bullets, About Me, Socials, Tech Stack Badges, Featured YouTube Videos, Pinned Repos, Trophies, Quote, Snake.
2. **Cập nhật gia tăng (Incremental Update)**:
   * Khi bạn có dự án mới, chứng chỉ mới hay công nghệ mới, bạn **chỉ cần chèn data con** vào danh sách tương ứng trong `data/resume.yaml`.
   * Không bao giờ bị lệch layout hay phải căn chỉnh thủ công lại từ đầu.
3. **Giữ nguyên văn phong gốc**:
   * *TopCV*: Văn phong tiếng Anh kỹ thuật cô đọng, định lượng (metrics: 99.99% Accuracy, 500ms to 50ms, 178+ schedules, 1,000+ records) và action verbs mạnh mẽ (*Architected, Engineered, Implemented, Built*).
   * *GitHub*: Phong cách lập trình viên năng động, icon/badges phong phú, trực quan.

---

## 📁 Cấu trúc Thư mục Dự án

```
UpdateCV/
├── data/
│   └── resume.yaml              # NGUỒN DỮ LIỆU CV DUY NHẤT (Chỉ sửa file này!)
├── templates/
│   ├── topcv/
│   │   ├── cv-template.html     # Template HTML chuẩn A4 2 trang TopCV
│   │   └── cv-style.css         # CSS in ấn A4 chuẩn ATS
│   └── github/
│       └── profile-template.md  # Template README cho GitHub Profile
├── src/
│   ├── generator/
│   │   ├── generate-pdf.mjs     # Render HTML -> PDF qua Playwright (A4 2 trang)
│   │   └── generate-github-md.mjs # Render YAML -> GitHub README.md
│   ├── adapters/
│   │   ├── github-adapter.mjs   # Tự động commit Markdown & PDF vào repo GitHub
│   │   ├── topcv-adapter.mjs    # Mở Playwright upload PDF lên Quản lý CV TopCV
│   │   └── diff-helper.mjs      # Trích xuất data con mới vào Clipboard cho LinkedIn
│   └── cli.mjs                  # Trình điều khiển CLI chính
├── output/
│   ├── Mai-The-Toan-CV.pdf      # File PDF bản mới nhất sẵn sàng nộp
│   └── README.md                # File Markdown bản mới nhất
├── archive/
│   └── research-linkedin/       # Lưu trữ kết quả khảo sát mạng LinkedIn cũ
└── package.json
```

---

## 🚀 Hướng dẫn Sử dụng

### 1. Khi có thêm kinh nghiệm / dự án / kỹ năng mới
Mở file [data/resume.yaml](data/resume.yaml) và chỉ cần chèn thêm data con vào mục tương ứng:
```yaml
projects:
  - name: "Tên Dự Án Mới"
    subtitle: "MÔ TẢ NGẮN IN HOA"
    period: "06/2026 - Present"
    highlights:
      - "Thành tựu và số liệu định lượng (Metrics & Action Verbs)..."
    tech_stack: "Công nghệ sử dụng..."
    github: "https://github.com/..."
    pinned_on_github: true
```

### 2. Các lệnh thực thi

| Lệnh | Chức năng |
|---|---|
| `npm run ui` hoặc `npm start` | **Mở Giao diện Web Dashboard (`http://localhost:3000`)**: Quản lý, xem, sửa/xóa (có cảnh báo) và thêm mới trực quan bằng chuột & form. |
| `npm run build` | **Biên dịch tất cả**: Tạo file PDF A4 (`output/Mai-The-Toan-CV.pdf`) và GitHub `README.md`. |
| `npm run build:pdf` | Chỉ biên dịch file PDF A4 phục vụ in ấn / nộp CV. |
| `npm run build:github` | Chỉ biên dịch file `output/README.md` cho GitHub Profile. |
| `npm run sync:github` | Tự động copy `README.md` + `Mai-The-Toan-CV.pdf` vào repo GitHub và tạo commit. |
| `npm run sync:topcv` | Mở Playwright (giữ cookie phiên) để upload file PDF mới lên TopCV. |
| `npm run diff` | Kiểm tra data con mới, tự động **Copy vào Clipboard** và mở link cập nhật LinkedIn. |

---

## 🧪 Bộ kiểm thử

```bash
npm test
```

Chạy 230 ca, chia 5 nhóm:

| Nhóm | Nội dung |
|---|---|
| Hàm thuần | `validateResume` với mọi kiểu dữ liệu sai; `renderTemplate` với dữ liệu thiếu, null, số, chuỗi 20.000 ký tự, unicode, và các payload chèn mã |
| Dựng PDF | Dựng thật qua Playwright với 8 dạng dữ liệu; 10 dạng dữ liệu hỏng phải báo lỗi mà **không** ghi đè PDF cũ; kiểm tra DOM của bản xem trước không có thẻ `script`/`img`/`style` nào bị chèn |
| Server HTTP | MIME của từng loại file; 10 kiểu đường dẫn vượt thư mục; chặn `Host` lạ; 11 dạng payload sai cho `/api/save`; body quá 2MB; xoay vòng bản sao lưu; biên dịch hỏng phải khôi phục `resume.yaml` |
| Font & CLI | Dựng font, không dựng lại khi không cần, tất định về hình học chữ; thiếu `times.ttf`/thiếu script phải lùi về face Bold chứ không làm hỏng build; các lệnh CLI |
| Ca biên | Thiếu `resume.yaml`, thiếu thư mục `output/`, file có BOM/CRLF, ghi đồng thời 3 request, YAML chứa thẻ `!!js/function`, bom anchor |

Bộ kiểm thử **dựng một bản sao dự án trong thư mục tạm** rồi chạy trong đó, vì
nhiều ca phải ghi đè `data/resume.yaml` và `output/`. Dữ liệu thật không bị động
tới. Server kiểm thử chạy ở cổng 3100 (`UPDATECV_PORT`) nên mở được song song
với dashboard đang chạy ở cổng 3000.

---

## 🎨 Khớp bố cục với bản CV gốc

Template được hiệu chỉnh bám theo file `Mai-The-Toan-TopCV.vn-010626.131333.pdf`.
Các giá trị dưới đây **đo từ bản gốc**, đừng đổi nếu không có lý do:

| Thông số | Giá trị | Ghi chú |
|---|---|---|
| Lề trang (`@page`) | `2.3mm 5.29mm 0mm 5.29mm` | Đường kẻ ngang của bản gốc chạy từ 5.29mm đến 204.87mm |
| Thụt chữ so với đường kẻ | `.cv-container { padding: 0 4px }` | Bản gốc đặt chữ ở 6.40mm còn đường kẻ ở 5.29mm. Các phần tử mang đường kẻ được kéo ngược ra bằng `margin: 0 -4px; padding: 0 4px` |
| Độ dày kẻ đen tiêu đề mục | `1px` | **Không phải 2px.** Bản gốc đo được 0.26mm |
| Màu kẻ xám | `#eeeeee` | Không phải `#e0e0e0` — bản gốc đo được RGB 0.933 |
| Giãn dòng (`line-height`) | `1.43` | Để 1.34 thì chữ trong mục bị nén và phải bù bằng khoảng hở lớn giữa các khối — sai bố cục |
| Bước hàng SKILLS | `padding: 7.4px 0` | Bước hàng bản gốc 8.06mm |
| Cỡ chữ body | `7.8pt` (= 10.4px) | Trùng đúng giá trị `Tf` của bản gốc |
| Căn lề đoạn văn | `left` | Bản gốc căn trái, KHÔNG justify |
| Cỡ tên / phụ đề / tiêu đề mục | `14.4pt` / `9.6pt` / `9.6pt` | = 19.2px / 12.8px / 12.8px, trùng bản gốc |
| Cột nhãn SKILLS | `49.9mm` | Giá trị bắt đầu ở 56.3mm trên trang |
| Cột ngày | `149.5mm 1fr` | Bản gốc căn **trái** cột ngày tại x≈156.0mm, KHÔNG đẩy sát lề phải |
| Giãn chữ cột ngày | `word-spacing: 6px` | Bản gốc để khoảng trắng 2.61mm quanh dấu gạch nối, gấp ~3.8 lần dấu cách thường |
| Khoảng cách các mục liên hệ | `gap: 10px` | Icon SVG ở đây hẹp hơn glyph FontAwesome của bản gốc nên phải bớt 4px để cả hàng rộng đúng 126.3mm |
| Dấu chấm đầu dòng | `::before { content: "•"; left: -7.05px }` | **Không dùng marker mặc định**: Chromium vẽ hình tròn rộng 0.80mm đặt lệch trái 1.66mm. Bản gốc dùng đúng ký tự "•" của Times, rộng 0.68mm |
| Nhãn "Tech Stack:" / "Github:" | **không in đậm** | Bản gốc chỉ in đậm: tên, 8 tiêu đề mục, tên trường, tác giả đầu, 4 tên dự án, 4 dòng phụ dự án — đúng 19 chỗ, không hơn |
| Tiêu đề giải thưởng, nhãn "Role:" | không in đậm | |
| Chữ đậm | font Times tô đậm sẵn, dựng lúc build (0.024em, đậm hơn bản gốc ~8% theo yêu cầu) | **Không dùng face Bold thật** (rộng hơn ~6%), cũng không dùng `text-shadow`/`-webkit-text-stroke` (nhân bản text). Xem mục "Chữ đậm" bên dưới |
| Chữ nghiêng | `transform: skewX(-12deg)` + `width: fit-content` | Bản gốc không nhúng face Italic. **Bắt buộc có `width: fit-content`** — xem mục dưới |
| Lưới SKILLS | `margin-top: -8px`, `margin-bottom: 17px` | -8px để hàng skill đầu vừa đủ nằm lại trang 1 (ngưỡng đo được là -7px); 17px vì khoảng cách sau hàng cuối rộng hơn khoảng cách giữa hai hàng |
| Khoảng sau danh sách chứng chỉ | `.simple-list { margin-bottom: 17px }` | Cùng lý do với lưới SKILLS: `.simple-list-item` tự lo thì hụt 5px |
| Kẻ ngăn hàng SKILLS | phần tử `<i class="skill-sep">` trong hàng | **Không dùng `border`**: border của hàng mở đầu một trang mới bị Chromium bỏ qua, nên nét ở đầu trang 2 sẽ mất |
| `break-inside: avoid` | chỉ đặt cho `.skill-row + .skill-row` | Hàng CÓ nét ngăn phải đi liền khối, nếu không nét ngăn (cao 1px) lọt vừa chỗ trống cuối trang 1 và bị bỏ lại đó. Hàng ĐẦU thì ngược lại — phải cho phép tách để phần đệm dưới tràn sang trang 2 như bản gốc; buộc liền khối là cả hàng bị đẩy sang trang sau và trang 2 tụt xuống ~8mm |

### Bẫy: một phần tử tràn 3px làm co nhỏ CẢ trang

`.pub-title` dùng `transform: skewX(-12deg)`. Nếu khối rộng hết dòng, góc trên
bên phải của phần nghiêng vượt mép giấy ~3.16px. Chromium khi đó **thu nhỏ toàn
bộ trang 0.46% để vừa giấy** — mọi cỡ chữ bé đi 0.5%, mọi toạ độ lệch dần tới
gần 1mm ở cuối trang. Triệu chứng khó nhận ra vì không có lỗi nào được báo.

Cách phát hiện: mở `output/preview.html` bằng Playwright ở chế độ print rồi so
`document.documentElement.scrollWidth` với `clientWidth` — bằng nhau là sạch.
Cách chữa: `width: fit-content` cho phần tử có `transform`.

Sai số hiện tại (so từng dòng chữ, toạ độ lấy từ hộp bao ký tự trong PDF):

| | Lệch ngang trung bình | Lệch ngang lớn nhất | Lệch dọc trung bình | Lệch dọc lớn nhất |
|---|---|---|---|---|
| Cả 2 trang (62 dòng) | **0.02mm** | **0.27mm** | **0.38mm** | **0.86mm** |

Đo với `skills.tools` rút còn 1 dòng để loại ảnh hưởng của dữ liệu. Với dữ liệu
thật, `skills.tools` trong `data/resume.yaml` có thêm 7 mục (Windows Terminal,
PythonAnywhere, Firebase, Cloudflare, Google Cloud, Arduino, Canva) nên hàng
Tools xuống 2 dòng thay vì 1, đẩy HONORS/CERTIFICATES/HOBBIES xuống ~2.4mm. Đây
không phải lỗi template.

Trang 1 kết thúc bằng hàng "Programming Languages" và trang 2 bắt đầu bằng
"Backend Development", đúng như bản gốc.

**Cách tự kiểm tra sau khi sửa CSS:** so vị trí từng dòng giữa hai file PDF bằng
hộp bao ký tự (`FPDFText_GetCharBox`) chứ đừng chỉ nhìn vị trí đường kẻ tiêu đề
mục — đường kẻ có thể khớp trong khi chữ bên trong mục bị nén. Khi ước lượng
đường chân chữ, gom cụm đáy hộp bao rồi lấy cụm đông nhất; lấy trung bình sẽ bị
các chữ có nét thòng xuống (g, p, y) kéo lệch ±0.26mm và tạo ra lỗi giả.

Khung xem trước trên dashboard **nhúng thẳng `output/Mai-The-Toan-CV.pdf`**, không
phải `output/preview.html`. `preview.html` là một trang HTML liền mạch nên không
chia trang: nhìn vào không biết được nội dung rơi vào trang 1 hay trang 2. Nhúng
file PDF thì thấy đúng 2 trang A4, kèm số trang và cột ảnh thu nhỏ của trình xem
PDF. Đây cũng chính là file sẽ nộp đi nên không bao giờ lệch với bản thật.

`preview.html` vẫn được sinh ra để mở trực tiếp khi cần soi HTML/CSS. Khối
`@media screen` ở cuối `cv-style.css` phục vụ đúng lúc đó: nó ép khung về khổ A4
(210mm), kể cả 4px thụt chữ. Không có nó thì trang giãn hết bề ngang cửa sổ và
ngắt dòng khác hẳn file PDF.

### Chữ đậm — tự dựng font, không dùng face Bold

**Bản gốc làm thế nào:** nó vẽ phần nhìn thấy bằng **đường vector**, còn lớp
text thì đặt **trong suốt** (`ExtGState /G9` có `ca: 0`) chỉ để máy đọc. Kiểm
chứng: chữ "C" trong subset chữ đậm của bản gốc có bề rộng 1366, 37 điểm, bbox
`(74,-31,1295,1387)` — trùng từng con số với `times.ttf` Regular, và cả 7 subset
đều còn nguyên bảng hinting `cvt`/`fpgm`/`prep`. Tức là đường viền chưa hề bị
sửa; nó tô nét dày lúc vẽ vector. Nhờ vậy nét dày bao nhiêu tuỳ ý mà bề rộng
chữ vẫn y hệt Regular. Chromium không làm được kiểu đó, nên ta đẩy phần tô dày
vào chính file font.

`tools/build-faux-bold-font.py` đọc `C:\Windows\Fonts\times.ttf`, cắt còn các ký tự
CV dùng tới, rồi **nong đường viền** ra 0.020em: mỗi điểm bị đẩy ra xa theo pháp
tuyến phân giác của hai cạnh kề. Bảng `hmtx` giữ nguyên nên bề rộng chữ không
đổi. Kết quả là một file WOFF2 ~9KB.

Hai chi tiết phải làm đúng, nếu không sẽ hỏng ở cỡ màn hình:

* **Nong viền thật, đừng chồng nhiều bản sao lệch nhau.** Chồng bản sao cũng cho
  ra hình đúng và đo ở 600dpi vẫn khớp, nhưng bộ tô cộng dồn độ phủ ở pixel viền
  rồi bão hoà thành đen đặc: ở 96dpi chữ đậm hơn bản gốc **24-35%**, nhìn nhoè
  và vỡ. Nong viền thật thì 96dpi và 600dpi bám nhau.
* **Giữ chữ có dấu ở dạng composite.** Thành phần của nó đã được tô rồi, nên dấu
  mũ và dấu sắc của "ế" vẫn cách nhau đúng như thiết kế. Giải nén composite ra
  rồi mới tô thì hai dấu dính thành một cục đen.
* **Chặn gai nhọn** (`MIN_COS_HALF`): ở góc càng nhọn điểm phải dịch càng xa mới
  giữ được bề dày nét, không chặn thì đầu nhọn của A, V, W bắn ra thành gai.

Lệnh hinting bị bỏ vì toạ độ điểm đã đổi. Không mất mát gì: bản gốc cũng không
dùng hinting để hiển thị.

Độ đậm chỉnh bằng `DEFAULT_STRENGTH` trong script đó. `0.020` khớp đúng bản
gốc; **đang để `0.024`, đậm hơn bản gốc ~8% mực theo yêu cầu**. Từ `0.026` trở
lên thì ruột chữ O, B, E bắt đầu bị bít ở cỡ màn hình. Đổi xong chạy lại
`npm run build:font`. Bề rộng chữ không phụ thuộc giá trị này nên bố cục không
xê dịch dù chỉnh bao nhiêu.

| Cách | Nét chữ (600dpi) | Lượng mực (96dpi) | Bề rộng | Text trích xuất |
|---|---|---|---|---|
| **Nong viền 0.024em (đang dùng)** | **+6.0% … +6.4%** | **+7.4% … +9.8%** | **khớp** | **1 bản, sạch** |
| Nong viền 0.020em (bằng đúng bản gốc) | -1.3% … -2.6% | -0.3% … +1.8% | khớp | 1 bản, sạch |
| Chồng 16 bản sao 0.017em | -0.5% … +2.8% | **+24% … +35%** | khớp | 1 bản, sạch |
| `font-weight: 700` (face Bold thật) | -8% … -12% | — | rộng hơn ~6% | 1 bản, sạch |
| `text-shadow` 24 bản sao | khớp | — | khớp | **25 bản** |
| `-webkit-text-stroke` | -24% … -28% | — | khớp | **2 bản** |

Hai cách cuối đều khiến Chromium vẽ chữ nhiều lần. Mức thiệt hại tuỳ thư viện
đọc PDF: `pdfium` (Chrome), `poppler/pdftotext` và `PDFBox` có lọc trùng nên đọc
sạch, nhưng **`pypdf` và `pdfminer/pdfplumber` thì không** — đọc ra
`Mai Thế ToànMai Thế Toàn…` lặp 25 lần, hoặc `CCAARREEEERR OOBBJJEECCTTIIVVEE`.
Nhiều hệ thống lọc hồ sơ dùng đúng hai thư viện đó, nên không chấp nhận được.

**Quy trình build:** `generate-pdf.mjs` gọi `ensureFauxBoldFont()`; nếu dựng
được font thì nối thêm khối `@font-face` vào cuối `output/cv-style.css`, không
thì giữ nguyên `font-weight: 700` khai trong template. Bản build in rõ đang dùng
đường nào. Font chỉ dựng lại khi `resume.yaml` hoặc script đổi.

Cần `python` + `pip install fonttools brotli` và máy Windows có `times.ttf`.
Thiếu thứ nào cũng không làm hỏng build — chỉ là chữ đậm rơi về face Bold thật.
Dựng riêng bằng `npm run build:font`.

**Cách tự kiểm tra sau khi đổi tham số tô đậm:** phải đo lượng mực ở **cả 96dpi
lẫn 600dpi**. Chỉ đo ở độ phân giải in thì không phát hiện được lỗi bão hoà độ
phủ, mà đó lại đúng là thứ người dùng nhìn thấy trên màn hình.

**Sau mỗi lần đổi CSS liên quan tới chữ đậm/nghiêng, phải kiểm tra lại text trích
xuất được:** `pdftotext output/Mai-The-Toan-CV.pdf -` — nếu thấy ký tự bị nhân đôi
thì cách làm đậm đó đang phá CV về mặt ATS, phải đổi cách khác.

## 🔒 Lưu ý Kỹ thuật về Nền tảng

* **TopCV**: Hệ thống render PDF A4 chuẩn 2 trang không bị ngắt quãng giữa các dự án. Khi chạy `npm run sync:topcv`, phiên đăng nhập được lưu vĩnh viễn trong `.browser-profile/topcv` nên bạn không cần đăng nhập lại mỗi lần.
* **GitHub**: Hỗ trợ đồng bộ trực tiếp với repo `Toandz1125/Toandz1125`. File PDF cũng được sao chép vào repo để người xem có thể tải CV trực tiếp.
* **LinkedIn**: Do cơ chế bảo mật SDUI và Kasada/Arkose bot sensors của LinkedIn, công cụ sử dụng giải pháp **Safe Assistant (`npm run diff`)**: Tự động trích xuất nội dung chuẩn định dạng vào clipboard, bạn chỉ việc dán (`Ctrl+V`) vào ô form trên LinkedIn trong 5 giây, bảo đảm an toàn 100% cho tài khoản.

## 🛡️ An toàn dữ liệu & Dashboard

* Dashboard **chỉ nghe trên `127.0.0.1`**, không mở ra mạng LAN, và từ chối request có `Host` lạ (chặn DNS rebinding). Máy khác trong mạng không gọi được API.
* API **không đặt header CORS**: trang web bất kỳ bạn đang mở không thể đọc CV hay kích hoạt lệnh git.
* `/api/save` **kiểm tra cấu trúc dữ liệu trước khi ghi**. Gửi sai kiểu sẽ bị trả 400 và `resume.yaml` không hề bị đụng tới.
* Mỗi lần lưu tạo một bản sao trong `data/backups/`, **giữ 10 bản gần nhất**. Nếu bước biên dịch thất bại, `resume.yaml` được **tự động khôi phục** về bản trước đó.
* Mọi giá trị trong `resume.yaml` đều được escape trước khi nhúng vào HTML, nên ký tự `<`, `&` hay thẻ HTML trong dữ liệu không phá được layout.
* Commit message truyền cho git dưới dạng tham số (`execFileSync`), không qua shell.
