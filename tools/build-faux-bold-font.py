# -*- coding: utf-8 -*-
"""Dựng một face Times New Roman đã được tô dày nét sẵn, để tái lập đúng kiểu
chữ đậm của bản CV gốc.

Bản CV gốc (Mai-The-Toan-TopCV.vn-010626.131333.pdf) KHÔNG nhúng face Bold nào:
cả 7 subset trong đó đều là TimesNewRomanPSMT với StemV=61.03. Chữ đậm ở đó là
face Regular được trình kết xuất tô dày nét, nên vẫn giữ nguyên bề rộng chữ của
Regular. Dùng `font-weight: 700` thì Chromium lấy face Bold thật, rộng hơn ~6%
và nét lại mảnh hơn 8-12% so với bản gốc.

Script này đọc times.ttf của Windows, cắt bớt chỉ giữ các ký tự CV dùng tới, rồi
tô dày từng chữ, và ghi ra một file WOFF2 (~19KB) cho bản build nhúng vào.

KHÔNG commit file WOFF2 sinh ra: Times New Roman đi kèm giấy phép Windows, phát
hành lại file font (kể cả bản đã sửa) là vi phạm. Nhúng một subset vào chính file
PDF thì được phép - bản gốc của TopCV cũng làm đúng như vậy.
"""
import math
import os
import sys

from fontTools import subset
from fontTools.misc.transform import Offset
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

# Nguồn font: bản Times New Roman đi kèm Windows
SRC_FONT = os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts', 'times.ttf')

# Bán kính tô dày, tính theo em. 0.017 là giá trị đo khớp bản gốc: nét lệch
# +0.1% ở tiêu đề mục, -0.5% ở tên trường, +2.8% ở tên (đo trên ảnh 600dpi).
DEFAULT_STRENGTH = 0.017

# Số hướng tô quanh vòng tròn. 8 hướng để lại khía răng cưa thấy được ở cỡ chữ
# tên (19.2px); 16 hướng thì viền đã mượt mà file vẫn nhỏ.
DEFAULT_DIRECTIONS = 16


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


def embolden_glyph(glyph_set, name, offsets):
    """Tô dày một chữ bằng cách chồng nhiều bản sao đường viền lệch nhau.

    Quy tắc tô nonzero của TrueType làm cho hợp của các bản sao viền ngoài =
    viền được nong rộng ra, còn giao của các bản sao viền lỗ (ruột chữ o, p...)
    = lỗ bị co lại. Đúng bằng định nghĩa của tô đậm.

    Composite (chữ có dấu như ế, ồ) được trả về đường viền thật trước khi tô,
    nếu không phần dấu sẽ bị tô hai lần.

    :param glyph_set: glyphSet của TTFont, dùng để giải nén composite
    :param name: tên chữ trong font
    :param offsets: danh sách (dx, dy) tính theo đơn vị font
    :return: đối tượng glyph mới, hoặc None nếu chữ rỗng (dấu cách)
    """
    rec = DecomposingRecordingPen(glyph_set)
    glyph_set[name].draw(rec)
    if not rec.value:
        return None
    pen = TTGlyphPen(None)
    for dx, dy in offsets:
        rec.replay(TransformPen(pen, Offset(dx, dy)))
    return pen.glyph()


def build(out_path, chars, strength=DEFAULT_STRENGTH, directions=DEFAULT_DIRECTIONS):
    """Dựng file font WOFF2 đã tô đậm và ghi ra đĩa.

    Bảng hmtx được giữ nguyên: bản gốc có bề rộng chữ y hệt face Regular, nên
    tô dày chỉ được làm dày nét chứ không được nới bước chữ.

    :param out_path: đường dẫn file .woff2 cần ghi
    :param chars: tập ký tự cần giữ
    :param strength: bán kính tô dày theo em
    :param directions: số hướng tô quanh vòng tròn
    :return: đường dẫn file đã ghi
    """
    font = TTFont(SRC_FONT)

    options = subset.Options(notdef_outline=True, recalc_bounds=True,
                             layout_features=[], hinting=False, glyph_names=False)
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=[ord(c) for c in chars])
    subsetter.subset(font)

    upem = font['head'].unitsPerEm
    radius = strength * upem
    offsets = [(radius * math.cos(2 * math.pi * k / directions),
                radius * math.sin(2 * math.pi * k / directions))
               for k in range(directions)]

    glyf = font['glyf']
    glyph_set = font.getGlyphSet()
    for name in font.getGlyphOrder():
        glyph = embolden_glyph(glyph_set, name, offsets)
        if glyph is None:
            continue
        glyph.recalcBounds(glyf)
        glyf[name] = glyph

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
