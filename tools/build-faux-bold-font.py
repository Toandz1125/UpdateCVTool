# -*- coding: utf-8 -*-
"""Dựng một face Times New Roman đã được tô dày nét sẵn, để tái lập đúng kiểu
chữ đậm của bản CV gốc.

Bản CV gốc (Mai-The-Toan-TopCV.vn-010626.131333.pdf) vẽ phần nhìn thấy bằng
đường vector, còn lớp text thì đặt trong suốt (ExtGState /G9 có ca=0) chỉ để
máy đọc. Nhờ vậy nó tô nét dày bao nhiêu cũng được mà bề rộng chữ vẫn y hệt
Times Regular. Chromium không làm được kiểu đó, nên ta đẩy phần tô dày vào
chính file font.

Dùng `font-weight: 700` thì Chromium lấy face Bold thật: rộng hơn bản gốc ~6%.
Dùng `text-shadow`/`-webkit-text-stroke` thì Chromium vẽ chữ nhiều lần, text
trích xuất bị nhân bản và hệ thống lọc hồ sơ đọc CV thành rác.

KHÔNG commit file WOFF2 sinh ra: Times New Roman đi kèm giấy phép Windows, phát
hành lại file font (kể cả bản đã sửa) là vi phạm. Nhúng một subset vào chính file
PDF thì được phép - bản gốc của TopCV cũng làm đúng như vậy.
"""
import math
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

# Nguồn font: bản Times New Roman đi kèm Windows
SRC_FONT = os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts', 'times.ttf')

# Bán kính nong viền, tính theo em - đây là núm chỉnh độ đậm, sửa xong nhớ chạy
# lại `npm run build:font`.
#   0.020 khớp đúng bản gốc (mực lệch +0.6% tên, +1.8% tiêu đề mục, ở 96dpi)
#   0.024 đang dùng: đậm hơn bản gốc ~8% mực, theo yêu cầu
#   0.026 trở lên: ruột chữ O, B, E bắt đầu bị bít ở cỡ màn hình
DEFAULT_STRENGTH = 0.024

# Chặn gai nhọn: ở góc càng nhọn thì điểm phải dịch càng xa mới giữ được bề dày
# nét. Không chặn thì đầu nhọn của A, V, W bắn ra thành gai dài.
MIN_COS_HALF = 0.35


def collect_chars(resume_path):
    """Gom tập ký tự cần giữ lại trong font.

    Lấy toàn bộ ký tự xuất hiện trong file dữ liệu CV, cộng thêm ASCII in được
    để phòng khi người dùng thêm nội dung mới mà chưa dựng lại font.

    :param resume_path: đường dẫn tới data/resume.yaml
    :return: set các ký tự
    """
    with open(resume_path, encoding='utf-8') as f:
        raw = f.read()
    chars = set(raw) | {chr(c) for c in range(0x20, 0x7F)}
    return {c for c in chars if c.isprintable()}


def signed_area(points):
    """Tính diện tích có dấu của một đường khép kín (ngược chiều kim đồng hồ là dương).

    :param points: danh sách toạ độ (x, y)
    :return: diện tích có dấu
    """
    total = 0.0
    n = len(points)
    for i in range(n):
        x0, y0 = points[i]
        x1, y1 = points[(i + 1) % n]
        total += x0 * y1 - x1 * y0
    return total / 2.0


def offset_contour(points, radius, direction):
    """Đẩy mọi điểm của một đường khép kín ra xa theo pháp tuyến phân giác.

    Đây là cách nong viền thật sự, khác hẳn với việc chồng nhiều bản sao lệch
    nhau. Chồng bản sao làm bộ tô cộng dồn độ phủ ở pixel viền rồi bão hoà
    thành đen đặc, nên ở cỡ màn hình chữ đậm hơn bản gốc tới 24-35% dù đo ở
    600dpi thì vẫn khớp; nó cũng làm dấu mũ và dấu sắc của chữ "ế" dính thành
    một cục đen.

    :param points: danh sách toạ độ (x, y) của đường
    :param radius: khoảng dịch, tính theo đơn vị font
    :param direction: +1 hoặc -1, chọn chiều pháp tuyến
    :return: danh sách toạ độ mới
    """
    n = len(points)
    result = []
    for i in range(n):
        p = points[i]
        # Bỏ qua các điểm trùng vị trí, nếu không hướng đi sẽ bằng 0
        prev = p
        k = 1
        while prev == p and k <= n:
            prev = points[(i - k) % n]
            k += 1
        nxt = p
        k = 1
        while nxt == p and k <= n:
            nxt = points[(i + k) % n]
            k += 1

        vin = (p[0] - prev[0], p[1] - prev[1])
        vout = (nxt[0] - p[0], nxt[1] - p[1])
        lin = math.hypot(*vin) or 1.0
        lout = math.hypot(*vout) or 1.0
        vin = (vin[0] / lin, vin[1] / lin)
        vout = (vout[0] / lout, vout[1] / lout)

        nin = (direction * vin[1], -direction * vin[0])
        nout = (direction * vout[1], -direction * vout[0])
        bx, by = nin[0] + nout[0], nin[1] + nout[1]
        length = math.hypot(bx, by)
        if length < 1e-9:
            # Quay đầu 180 độ: không có phân giác, lấy tạm pháp tuyến cạnh vào
            bx, by, length = nin[0], nin[1], 1.0
        bx, by = bx / length, by / length

        cos_half = max(bx * nin[0] + by * nin[1], MIN_COS_HALF)
        step = radius / cos_half
        result.append((p[0] + bx * step, p[1] + by * step))
    return result


def embolden(font, radius):
    """Tô dày mọi chữ đơn trong font.

    Chữ composite (chữ có dấu như ế, ồ) được giữ nguyên dạng composite: thành
    phần của nó đã được tô rồi, nên dấu mũ và dấu sắc vẫn cách nhau đúng như
    thiết kế thay vì dính vào nhau.

    :param font: đối tượng TTFont đã cắt subset
    :param radius: bán kính nong viền, tính theo đơn vị font
    """
    glyf = font['glyf']
    for name in font.getGlyphOrder():
        glyph = glyf[name]
        glyph.expand(glyf)
        if getattr(glyph, 'numberOfContours', 0) <= 0:
            continue
        coords = glyph.coordinates
        moved = []
        start = 0
        for end in glyph.endPtsOfContours:
            points = [tuple(coords[i]) for i in range(start, end + 1)]
            # Chọn chiều dịch sao cho diện tích có dấu GIẢM: viền ngoài (chiều
            # kim đồng hồ) nở ra, còn viền lỗ (ngược chiều) thì co lại.
            plus = offset_contour(points, radius, +1)
            minus = offset_contour(points, radius, -1)
            moved += plus if signed_area(plus) < signed_area(minus) else minus
            start = end + 1
        for i, (x, y) in enumerate(moved):
            coords[i] = (int(round(x)), int(round(y)))
        glyph.recalcBounds(glyf)


def build(out_path, chars, strength=DEFAULT_STRENGTH):
    """Dựng file font WOFF2 đã tô đậm và ghi ra đĩa.

    Bảng hmtx được giữ nguyên: bản gốc có bề rộng chữ y hệt face Regular, nên
    tô dày chỉ được làm dày nét chứ không được nới bước chữ.

    Lệnh hinting bị bỏ: toạ độ điểm đã đổi nên các lệnh cũ không còn đúng. Bản
    gốc cũng không dùng hinting để hiển thị vì phần nhìn thấy của nó là đường
    vector, không phải chữ.

    :param out_path: đường dẫn file .woff2 cần ghi
    :param chars: tập ký tự cần giữ
    :param strength: bán kính nong viền theo em
    :return: đường dẫn file đã ghi
    """
    font = TTFont(SRC_FONT)

    options = subset.Options(notdef_outline=True, recalc_bounds=True,
                             layout_features=[], hinting=False, glyph_names=False)
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=[ord(c) for c in chars])
    subsetter.subset(font)

    embolden(font, strength * font['head'].unitsPerEm)

    # Tổng kiểm không còn đúng sau khi sửa glyf; trình duyệt không kiểm tra giá
    # trị này nên đặt 0 thay vì tính lại.
    font['head'].checkSumAdjustment = 0
    font.flavor = 'woff2'
    font.save(out_path)
    return out_path


def main(argv):
    """Điểm vào dòng lệnh: dựng font rồi in đường dẫn và kích thước.

    :param argv: [đường dẫn .woff2 cần ghi, đường dẫn resume.yaml]
    :return: mã thoát (0 nếu thành công)
    """
    if len(argv) < 3:
        print('Cách dùng: build-faux-bold-font.py <out.woff2> <resume.yaml>', file=sys.stderr)
        return 2
    out_path, resume_path = argv[1], argv[2]
    if not os.path.exists(SRC_FONT):
        print(f'Không tìm thấy font nguồn: {SRC_FONT}', file=sys.stderr)
        return 1
    build(out_path, collect_chars(resume_path))
    print(f'{out_path}: {os.path.getsize(out_path)} bytes')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
