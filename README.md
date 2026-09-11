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

## 🎨 Khớp bố cục với bản CV gốc

Template được hiệu chỉnh bám theo file `Mai-The-Toan-TopCV.vn-010626.131333.pdf`.
Các giá trị dưới đây **đo từ bản gốc**, đừng đổi nếu không có lý do:

| Thông số | Giá trị | Ghi chú |
|---|---|---|
| Lề trang (`@page`) | `4mm 5mm 0mm 5mm` | Lề rộng hơn sẽ làm hẹp vùng chữ và đổi toàn bộ điểm ngắt dòng |
| Cỡ chữ body | `7.8pt` | Để 8.8pt thì giá trị cột SKILLS bị xuống dòng, lệch hẳn nhịp trang |
| Căn lề đoạn văn | `left` | Bản gốc căn trái, KHÔNG justify |
| Cỡ tên | `14.4pt` | |
| Phụ đề dưới tên | `9.6pt` | |
| Tiêu đề mục | `9.6pt` | Cùng cỡ với dòng "Backend Developer"; đừng để 10.5pt |
| Cột nhãn SKILLS | `200px` (≈51.5mm) | Đo từ bản gốc: giá trị bắt đầu ở 56.7mm tính từ mép trái |
| Cột ngày (`.item-header`) | `151.3mm 1fr` | Bản gốc căn **trái** cột ngày tại x≈156.5mm trên trang, KHÔNG đẩy sát lề phải |
| Tiêu đề giải thưởng | không in đậm | Education/project thì in đậm, riêng award thì không |
| Nhãn "Role:" | không in đậm | |
| Chữ đậm | face Bold thật (`font-weight: 700`) | Xem mục "Chữ đậm" bên dưới |
| Chữ nghiêng | `transform: skewX(-12deg)` | Bản gốc không nhúng face Italic |
| Lưới SKILLS | `margin-top: -5px` | Để hàng skill đầu tiên vừa đủ nằm lại cuối trang 1 |
| Khoảng cách trong header | tên `margin-bottom: 9.2px`, chức danh `13px`, header `45.3px` | Bản gốc giãn đều 4.78mm giữa tên–chức danh và chức danh–liên hệ, rồi 11.68mm trước mục đầu tiên. Đừng dồn hết vào `margin-bottom` của header |
| Icon liên hệ | `14px` | Khớp chiều cao glyph FontAwesome 10.5pt của bản gốc |
| Kẻ ngăn hàng SKILLS | `border-top` ở hàng SAU | Không dùng `border-bottom`: hàng cuối trang 1 sẽ sinh nét thừa mà bản gốc không có |

Sai số hiện tại so với bản gốc (đo vị trí 8 đường kẻ tiêu đề mục, raster 200dpi):
**cả 8 mốc lệch ≤ 0.2mm**, trong đó 5 mốc lệch đúng 0.0mm. Trang 1 kết thúc bằng
hàng "Programming Languages" và trang 2 bắt đầu bằng "Backend Development", đúng
như bản gốc.

Khối `@media screen` ở cuối `cv-style.css` ép khung xem trước trên dashboard về
đúng khổ A4 (210mm, vùng chữ 200mm). Không có nó thì preview giãn hết bề ngang
iframe và ngắt dòng khác hẳn file PDF. Khối này không ảnh hưởng bản in vì
Playwright xuất PDF ở chế độ print media.

### Chữ đậm — đã thử 3 cách, chọn cách ít dở nhất

Bản gốc chỉ nhúng một face `TimesNewRomanPSMT`, chữ đậm là do trình kết xuất tô
dày nét trên chính face đó. Không tái lập được trọn vẹn bằng CSS:

| Cách | Nét chữ | Bề rộng | ATS đọc được |
|---|---|---|---|
| `font-weight: 700` (đang dùng) | sắc gọn | rộng hơn 6.7% | có |
| `-webkit-text-stroke` | sắc gọn | khớp | **KHÔNG** |
| `text-shadow` | nhoè, có bóng đôi | khớp | có |

`-webkit-text-stroke` khiến Chromium xuất chữ đậm thành font **Type3** và vẽ hai
lần, text trích ra bị nhân đôi ký tự (`CCAARREEEERR OOBBJJEECCTTIIVVEE`) — hệ
thống ATS sẽ đọc CV thành rác. `text-shadow` khớp bề rộng nhưng rải mực thành
vệt mờ, nhìn nhạt hơn bản gốc dù cùng lượng mực. Face Bold thật giữ được nét sắc,
đổi lại rộng hơn 6.7% — đây là đánh đổi được chọn.

**Sau mỗi lần đổi CSS liên quan tới chữ đậm/nghiêng, phải kiểm tra lại text trích
xuất được:** `pdftotext output/Mai-The-Toan-CV.pdf -` — nếu thấy ký tự bị nhân đôi
thì cách làm đậm đó đang phá CV về mặt ATS, phải đổi cách khác.

### Còn khác bản gốc

Bản gốc để hàng skill đầu tiên tràn qua ranh giới trang: chữ ở cuối trang 1 còn
nét gạch chân rơi xuống đầu trang 2 (y = 2.26mm, phía trên cả lề trên). Chromium
coi hàng grid/table là khối không cắt được nên không tái tạo được. Cách hiện tại
bỏ hẳn nét đó thay vì sinh nét thừa ở đáy trang 1 — sai lệch còn lại đúng một
nét xám 1px.

**Cảnh báo khi sửa spacing:** vị trí đường kẻ SKILLS phải ở ≤ 286.5mm, nếu không
hàng "Programming Languages" bị đẩy sang trang 2 và lệch hẳn so với bản gốc. Chỉ
cần thêm 1px padding cho `.project-item` là đủ để tụt.

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
