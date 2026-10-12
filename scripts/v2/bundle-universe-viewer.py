"""VOC 우주 3D 화면 → 앱 템플릿 묶기
────────────────────────────────────────────────────────────────
에이전트 B 소스(template.html · style.css · js/*.js)를 한 문서로 묶어 저장소에 넣는다.
  출력 1  lib/v2/viewer/universe.template.html   읽고 비교하기 위한 정본(완전한 HTML 문서)
  출력 2  lib/v2/viewer/universeTemplate.ts       같은 내용을 문자열로 내보내는 모듈(라우트가 import —
                                                 서버 번들에 확실히 들어가게 fs 로 읽지 않는다)
데이터 자리 /*@@DATA@@*/ 는 남긴다. app/v2/universe/route.ts 가 요청마다 DB 에서 조립한 JSON 을 넣는다.

B 빌드(universe/build.py)와 다른 점
  - 한글 폰트: B 는 데이터에 쓰인 글자만 서브셋해 내장한다. 앱은 데이터가 요청마다 바뀌어 새 글자가 빠지므로
    Pretendard 공개 CDN 의 동적 서브셋 CSS(jsdelivr orioncactus/pretendard@v1.3.9, 글꼴 이름 'Pretendard')를 쓴다.
  - 숫자 폰트: G마켓 산스는 숫자·기호만 쓰므로 B 와 같이 그 글자만 서브셋해 base64 로 내장한다.
  - 문서 뼈대: doctype · html lang="ko" · head(charset · viewport · title) · body 를 여기서 붙인다.
    head 에 [hidden] 규칙을 넣는다 — B 화면은 아티팩트 뼈대가 주던 이 규칙에 기댄다(없으면 첫 화면에
    빈 패널과 「예시 데이터」 꼬리표가 보인다).
  - 줄바꿈은 LF 로 통일한다(B 소스는 CRLF).

사용(저장소 루트에서):
  py -X utf8 scripts/v2/bundle-universe-viewer.py [--src <B universe/src>] [--gmarket <G마켓 폰트 폴더>]
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
OUT_DIR = ROOT / "lib" / "v2" / "viewer"
SRC_DEFAULT = pathlib.Path(r"C:\Users\MGRV\.claude\Output\2026-10-12_voc-v2-build\universe\src")
GMK_DEFAULT = pathlib.Path(r"C:\Users\MGRV\.claude\stay-hk\public\fonts")

THREE_PREFIX = "https://cdn.jsdelivr.net/npm/three@0.160.0/"
PRETENDARD_CSS = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css"
HIDDEN_RULE = "[hidden]:not([hidden=until-found i]){display:none!important}"
NUM_RANGE = "U+0025, U+002B-002F, U+0030-0039, U+003A"
NUM_CHARS = set("%+,-./0123456789:")
MARKS = ("/*@@FONTS@@*/", "/*@@CSS@@*/", "/*@@DATA@@*/", "/*@@JS@@*/")


def arg(name, default):
    return pathlib.Path(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default


def read(p):
    return p.read_text(encoding="utf-8").replace("\r\n", "\n")


def subset_b64(path, chars):
    font = TTFont(str(path), recalcTimestamp=False)  # 다시 묶어도 같은 바이트(시각 갱신 없음)
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
    return base64.b64encode(buf.getvalue()).decode("ascii"), len(buf.getvalue())


def gmarket_faces(gmk_dir):
    faces, total = [], 0
    for weight, fname in [("400 600", "GmarketSansMedium.woff"), ("700", "GmarketSansBold.woff")]:
        b64, n = subset_b64(gmk_dir / fname, NUM_CHARS)
        total += n
        faces.append(
            f"@font-face{{font-family:'Gmarket Sans';font-weight:{weight};font-style:normal;font-display:swap;"
            f"unicode-range:{NUM_RANGE};src:url(data:font/woff2;base64,{b64}) format('woff2')}}"
        )
    return "\n".join(faces), total


def fail(msg):
    sys.exit(f"[묶기 실패] {msg}")


def main():
    src = arg("--src", SRC_DEFAULT)
    gmk = arg("--gmarket", GMK_DEFAULT)
    tpl = read(src / "template.html")
    css = read(src / "style.css")
    js_files = sorted((src / "js").glob("*.js"))
    if not js_files:
        fail(f"{src / 'js'} 에 js 파일 없음")
    js = "\n".join(read(p) for p in js_files)

    for m in MARKS:
        if tpl.count(m) != 1:
            fail(f"template.html 의 {m} 가 정확히 1곳이 아님")
    for bad in (r"<!doctype", r"<html[\s>]", r"<head[\s>]", r"<body[\s>]"):
        if re.search(bad, tpl + css + js, re.I):
            fail(f"B 소스에 문서 뼈대 태그가 있음: {bad}")

    # B 템플릿 = <title> 한 줄 + head 에 갈 것(설명·style·importmap) + <div id="app"> 부터 body
    title_m = re.search(r"<title>.*?</title>\s*", tpl, re.S)
    if not title_m:
        fail("template.html 에 <title> 없음")
    tpl = tpl[: title_m.start()] + tpl[title_m.end():]
    cut = tpl.find('<div id="app"')
    if cut < 0:
        fail('template.html 에 <div id="app"> 없음')
    head_part, body_part = tpl[:cut].strip(), tpl[cut:].strip()
    if "/*@@DATA@@*/" not in body_part or "/*@@JS@@*/" not in body_part:
        fail("데이터·스크립트 자리가 body 쪽에 없음")

    faces, font_bytes = gmarket_faces(gmk)
    head_part = head_part.replace("/*@@FONTS@@*/", faces).replace("/*@@CSS@@*/", css)
    body_part = body_part.replace("/*@@JS@@*/", js)

    page = (
        "<!doctype html>\n"
        '<html lang="ko">\n'
        "<head>\n"
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        "<title>VOC 우주</title>\n"
        '<meta name="theme-color" content="#02030a">\n'
        '<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>\n'
        f'<link rel="stylesheet" href="{PRETENDARD_CSS}">\n'
        f"<style>{HIDDEN_RULE}</style>\n"
        f"{head_part}\n"
        "</head>\n"
        "<body>\n"
        f"{body_part}\n"
        "</body>\n"
        "</html>\n"
    )

    # ── 점검 ──
    if page.count("/*@@DATA@@*/") != 1:
        fail("결과 문서의 데이터 자리가 정확히 1곳이 아님")
    for m in ("/*@@FONTS@@*/", "/*@@CSS@@*/", "/*@@JS@@*/"):
        if m in page:
            fail(f"치환되지 않은 자리 {m}")
    for tag, n in (("<!doctype", 1), ("<title>", 1), ("<head>", 1), ("<body>", 1)):
        if page.lower().count(tag) != n:
            fail(f"{tag} 개수 {page.lower().count(tag)} ≠ {n}")
    if re.search(r"@font-face\{[^}]*Pretendard", page):
        fail("Pretendard 를 내장하면 안 됨(CDN 동적 서브셋을 쓴다)")
    urls = set(re.findall(r"https?://[^\s\"')<>]+", page))
    allowed = (THREE_PREFIX, PRETENDARD_CSS, "https://cdn.jsdelivr.net", "http://www.w3.org/")
    bad_urls = sorted(u for u in urls if not any(u == a or u.startswith(a) for a in allowed))
    if bad_urls:
        fail(f"허용되지 않은 외부 주소: {bad_urls}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    html_path = OUT_DIR / "universe.template.html"
    html_path.write_bytes(page.encode("utf-8"))

    lines = page.split("\n")
    ts = [
        "// 생성 파일 — 손으로 고치지 않는다.",
        "// 원본: lib/v2/viewer/universe.template.html. 다시 만들기: py -X utf8 scripts/v2/bundle-universe-viewer.py",
        "// 라우트(app/v2/universe/route.ts)가 fs 로 읽지 않고 import 하도록 문자열로 내보낸다(서버 번들에 확실히 포함).",
        "export const UNIVERSE_TEMPLATE: string = [",
    ]
    ts += ["  " + json.dumps(ln, ensure_ascii=False) + "," for ln in lines]
    ts += ["].join('\\n')", ""]
    ts_path = OUT_DIR / "universeTemplate.ts"
    ts_path.write_bytes("\n".join(ts).encode("utf-8"))

    print(json.dumps({
        "src": str(src),
        "js_files": [p.name for p in js_files],
        "template_bytes": len(page.encode("utf-8")),
        "gmarket_font_bytes": font_bytes,
        "module_bytes": ts_path.stat().st_size,
        "external_urls": sorted(urls),
    }, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
