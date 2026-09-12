# -*- coding: utf-8 -*-
"""So hai file font: chi bao KHAC khi hinh hoc chu hoac be rong chu khac nhau.
WOFF2 nen brotli nen so byte la vo nghia - doi mot dau thoi gian trong bang head
cung lam lech gan het luong nen."""
import sys
from fontTools.ttLib import TTFont

def dac_trung(path):
    """Trich toa do moi chu va bang be rong, bo qua dau thoi gian."""
    f = TTFont(path)
    glyf, hmtx = f['glyf'], f['hmtx']
    out = []
    for name in f.getGlyphOrder():
        g = glyf[name]
        g.expand(glyf)
        out.append((name, hmtx[name],
                    tuple(map(tuple, getattr(g, 'coordinates', []))),
                    tuple(getattr(g, 'endPtsOfContours', []) or []),
                    tuple(getattr(g, 'flags', []) or [])))
    return out

a, b = dac_trung(sys.argv[1]), dac_trung(sys.argv[2])
if a == b:
    print('GIONG')
else:
    khac = [x[0] for x, y in zip(a, b) if x != y]
    print(f'KHAC: {len(khac)} chu, vd {khac[:5]}')
