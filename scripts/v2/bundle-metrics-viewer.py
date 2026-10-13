"""VOC 지표 화면 → 앱 템플릿 묶기
────────────────────────────────────────────────────────────────
소스 lib/v2/viewer/metrics/(template.html · style.css · app.js)를 한 문서로 묶는다.
  출력 1  lib/v2/viewer/metrics.template.html   읽고 비교하기 위한 정본(완전한 HTML 문서)
  출력 2  lib/v2/viewer/metricsTemplate.ts       같은 내용을 문자열로 내보내는 모듈(라우트가 import)
데이터 자리 /*@@DATA@@*/ 는 남긴다. app/v2/metrics/route.ts 가 요청마다 DB 에서 계산한 지표 JSON 을 넣는다.

글꼴
  - 숫자: G마켓 산스. 숫자·기호만 서브셋해 base64 로 내장(우주 화면 묶기와 같은 방식, 같은 원본 파일).
  - 한글: Pretendard 자체 호스팅(public/fonts/Pretendard-*.woff2, 앱 globals.css 와 같은 파일). 외부 CDN 을 쓰지 않는다.
    임베드 경로에서도 받도록 middleware 가 /fonts/ 를 통과시킨다.

사용(저장소 루트에서):
  py -X utf8 scripts/v2/bundle-metrics-viewer.py [--gmarket <G마켓 폰트 폴더>]
────────────────────────────────────────────────────────────────
"""
import base64
import io
import json
import pathlib
import re
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "lib" / "v2" / "viewer" / "metrics"
OUT_DIR = ROOT / "lib" / "v2" / "viewer"
GMK_DEFAULT = pathlib.Path(r"C:\Users\MGRV\.claude\stay-hk\public\fonts")
NUM_RANGE = "U+0025, U+002B-002F, U+0030-0039, U+003A"
NUM_CHARS = set("%+,-./0123456789:")
MARKS = ("/*@@FONTS@@*/", "/*@@CSS@@*/", "/*@@DATA@@*/", "/*@@JS@@*/")
PRETENDARD = [(400, "Regular"), (500, "Medium"), (600, "SemiBold"), (700, "Bold")]


def arg(name, default):
    return pathlib.Path(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default


def read(p):
    return p.read_text(encoding="utf-8").replace("\r\n", "\n")


def fail(msg):
    sys.exit(f"[묶기 실패] {msg}")


def subset_b64(path, chars):
    font = TTFont(str(path), recalcTimestamp=False)
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.hinting = False
    opts.desubroutinize = True
    opts.layout_features = ["*"]
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=sorted({ord(c) for c in chars}))
    sub.subset(font)
    buf = io.BytesIO()
    font.flavor = "woff2"
    font.save(buf)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def fonts(gmk_dir):
    out = []
    for weight, fname in [("400 600", "GmarketSansMedium.woff"), ("700", "GmarketSansBold.woff")]:
        b64 = subset_b64(gmk_dir / fname, NUM_CHARS)
        out.append(
            f"@font-face{{font-family:'Gmarket Sans';font-weight:{weight};font-style:normal;font-display:swap;"
            f"unicode-range:{NUM_RANGE};src:url(data:font/woff2;base64,{b64}) format('woff2')}}"
        )
    for w, name in PRETENDARD:
        if not (ROOT / "public" / "fonts" / f"Pretendard-{name}.woff2").exists():
            fail(f"public/fonts/Pretendard-{name}.woff2 없음")
        out.append(
            f"@font-face{{font-family:'Pretendard';font-weight:{w};font-style:normal;font-display:swap;"
            f"src:url('/fonts/Pretendard-{name}.woff2') format('woff2')}}"
        )
    return "\n".join(out)


def main():
    gmk = arg("--gmarket", GMK_DEFAULT)
    tpl = read(SRC / "template.html")
    css = read(SRC / "style.css")
    js = read(SRC / "app.js")
    for m in MARKS:
        if tpl.count(m) != 1:
            fail(f"template.html 의 {m} 가 정확히 1곳이 아님")
    if "</script" in js.lower():
        fail("app.js 안에 </script 가 있음")
    page = tpl.replace("/*@@FONTS@@*/", fonts(gmk)).replace("/*@@CSS@@*/", css).replace("/*@@JS@@*/", js)
    if page.count("/*@@DATA@@*/") != 1:
        fail("데이터 자리가 정확히 1곳이 아님")
    urls = set(re.findall(r"https?://[^\s\"')<>]+", page))
    bad = sorted(u for u in urls if not u.startswith("http://www.w3.org/"))
    if bad:
        fail(f"외부 주소가 있음: {bad}")

    (OUT_DIR / "metrics.template.html").write_bytes(page.encode("utf-8"))
    lines = page.split("\n")
    ts = [
        "// 생성 파일 — 손으로 고치지 않는다.",
        "// 원본: lib/v2/viewer/metrics/(template.html · style.css · app.js). 다시 만들기: py -X utf8 scripts/v2/bundle-metrics-viewer.py",
        "export const METRICS_TEMPLATE: string = [",
    ]
    ts += ["  " + json.dumps(ln, ensure_ascii=False) + "," for ln in lines]
    ts += ["].join('\\n')", ""]
    (OUT_DIR / "metricsTemplate.ts").write_bytes("\n".join(ts).encode("utf-8"))
    print(json.dumps({"bytes": len(page.encode("utf-8")), "external_urls": sorted(urls)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
