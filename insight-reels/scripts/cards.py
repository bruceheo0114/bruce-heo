# 브루스 인사이트 카드뉴스 합성기 v1 — Pillow 만 쓴다. GitHub Actions(insight-reels-cards.yml)에서 돈다. 크레딧 0.
# @bruce.insight 기존 캐러셀(2026-06-25 이후 「브루스 인사이트」 스타일)을 그대로 따른다.
# 사용: python3 cards.py posts/DATE.cards.json [출력폴더]  → card_01.jpg … (1080x1350, 4:5) + qa.jpg
#
# spec: {"slides": [ ... ]}   src 는 이미지 URL(힉스필드 결과) 또는 spec 기준 상대 경로
#   cover  : src, title, sub, pill(기본 "브루스 인사이트"), tone(dark|light)  — 전면 사진, 왼쪽 글
#   photo  : src, title, body, photo_h(사진 높이 비율, 기본 0.5), focus_y   — 위 사진 / 아래 아이보리 패널
#   text   : title, body                                                    — 사진 없는 아이보리 장, 큰 제목
#   compare: title, left{head, items[]}, right{head, items[]}, note          — 좌우 대비(예전 → 이제)
#   checks : title, items[{head, text}], note                               — 초록 체크 목록
#   close  : src, title, body                                               — 어두운 전면 사진, 마지막 질문
#   issue  : no, tag, title, body, point, source                            — 「이번 주 마케팅 이슈」 한 건(사진 없음)
# 제목: 줄바꿈은 \n, 끝 점(.)은 초록 점으로 그린다. 「**단어**」는 진초록 강조.
# body: 빈 줄(\n\n)로 문단을 나눈다.
import hashlib, json, os, re, sys, urllib.request
from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1350
IVORY, INK, BODY, MUTED = (243, 239, 232), (24, 24, 24), (68, 68, 68), (130, 130, 130)
GREEN, DEEP = (22, 192, 109), (24, 74, 52)
WHITE, CHAR = (255, 255, 255), (20, 22, 21)
M = 84  # 좌우 여백
CACHE = os.environ.get("CARDS_CACHE") or os.path.expanduser("~/.cache/bruce-cards")
FD = f"{CACHE}/fonts"
BASE = "."  # spec 파일 위치(상대 경로 src 기준)
_fc = {}


def font(w, size):
    path = f"{FD}/Pretendard-{w}.otf"
    if (path, size) not in _fc:
        _fc[(path, size)] = ImageFont.truetype(path, size)
    return _fc[(path, size)]


def fetch(url, path):
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
            f.write(r.read())
    return path


def fonts():
    os.makedirs(FD, exist_ok=True)
    base = "https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static/"
    for w in ("Regular", "Medium", "Bold", "ExtraBold"):
        fetch(f"{base}Pretendard-{w}.otf", f"{FD}/Pretendard-{w}.otf")


def source(src):
    if src.startswith("http"):
        os.makedirs(f"{CACHE}/img", exist_ok=True)
        return fetch(src, f"{CACHE}/img/{hashlib.md5(src.encode()).hexdigest()}{os.path.splitext(src)[1][:5]}")
    return os.path.join(BASE, src)


def fit(src, w, h, focus_y=0.5):
    im = Image.open(source(src)).convert("RGB")
    k = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    x = (im.width - w) // 2
    y = int((im.height - h) * focus_y)
    return im.crop((x, y, x + w, y + h))


def title(d, x, y, s, size, fill, accent=DEEP, lh=1.32):
    """여러 줄 제목. 마지막 마침표는 초록 점. **강조**는 accent 색."""
    f = font("Bold", size)
    lines = s.split("\n")
    for i, ln in enumerate(lines):
        last = i == len(lines) - 1
        dot = last and ln.endswith(".")
        if dot:
            ln = ln[:-1]
        cx = x
        for j, part in enumerate(re.split(r"\*\*", ln)):
            if part:
                d.text((cx, y), part, font=f, fill=accent if j % 2 else fill)
                cx += d.textlength(part, font=f)
        if dot:
            r = size * 0.11
            d.ellipse([cx + size * 0.08, y + size * 0.86 - r, cx + size * 0.08 + 2 * r, y + size * 0.86 + r], fill=GREEN)
        y += int(size * lh)
    return y


def body(d, x, y, s, size, fill, lh=1.62, gap=0.7, wt="Regular"):
    f = font(wt, size)
    for para in s.split("\n\n"):
        for ln in para.split("\n"):
            d.text((x, y), ln, font=f, fill=fill)
            y += int(size * lh)
        y += int(size * gap)
    return y


def logo(d, x, y, dark_bg):
    r = 30
    d.ellipse([x, y, x + 2 * r, y + 2 * r], fill=WHITE if dark_bg else CHAR)
    f = font("ExtraBold", 25)
    t = "BR"
    tw = d.textlength(t, font=f)
    d.text((x + r - tw / 2 - 3, y + r - 16), t, font=f, fill=CHAR if dark_bg else WHITE)
    d.ellipse([x + r + tw / 2 - 2, y + r + 3, x + r + tw / 2 + 5, y + r + 10], fill=GREEN)


def pill(d, x, y, s, solid):
    f = font("Bold", 26)
    tw = d.textlength(s, font=f)
    box = [x, y, x + tw + 44, y + 50]
    if solid:
        d.rounded_rectangle(box, 25, fill=GREEN)
        d.text((x + 22, y + 9), s, font=f, fill=WHITE)
    else:
        d.rounded_rectangle(box, 25, outline=GREEN, width=3)
        d.text((x + 22, y + 9), s, font=f, fill=(18, 150, 85))


def shade(im, side="left", color=(0, 0, 0), strength=0.88, reach=0.72):
    """사진 위 글자 쪽을 어둡게(또는 밝게) 덮는 그라데이션."""
    g = Image.new("L", (W, 1))
    for x in range(W):
        k = x / W if side == "left" else 1 - x / W
        a = max(0.0, 1 - k / reach)
        g.putpixel((x, 0), int(255 * strength * (a ** 0.9)))
    g = g.resize((W, H))
    return Image.composite(Image.new("RGB", (W, H), color), im, g)


def s_cover(s):
    dark = s.get("tone", "dark") == "dark"
    im = fit(s["src"], W, H, s.get("focus_y", 0.5))
    im = shade(im, color=(10, 10, 10) if dark else IVORY, strength=0.9 if dark else 0.95)
    d = ImageDraw.Draw(im)
    fg = WHITE if dark else INK
    pill(d, M, 330, s.get("pill", "브루스 인사이트"), solid=dark)
    y = title(d, M, 420, s["title"], 82, fg, accent=GREEN if dark else DEEP)
    d.line([M, y + 26, M + 56, y + 26], fill=GREEN, width=4)
    body(d, M, y + 66, s.get("sub", ""), 34, (225, 225, 225) if dark else BODY, lh=1.55)
    logo(d, M, H - 84 - 60, dark)
    return im


def panel_header(d, s, y, size=62):
    y = title(d, M, y, s["title"], size, INK)
    return y + 22


def s_photo(s):
    ph = int(H * s.get("photo_h", 0.5))
    im = Image.new("RGB", (W, H), IVORY)
    im.paste(fit(s["src"], W, ph, s.get("focus_y", 0.5)), (0, 0))
    d = ImageDraw.Draw(im)
    y = panel_header(d, s, ph + 70)
    body(d, M, y, s.get("body", ""), 31, BODY)
    logo(d, M, H - 60 - 60, False)
    return im


def s_text(s):
    im = Image.new("RGB", (W, H), IVORY)
    d = ImageDraw.Draw(im)
    # 오른쪽 아래 옅은 원 장식(기존 일관성 장의 선 그림 대신)
    d.ellipse([W - 470, H - 640, W + 230, H + 60], outline=(222, 216, 205), width=3)
    d.ellipse([W - 340, H - 510, W + 100, H - 70], outline=(230, 225, 215), width=2)
    y = title(d, M, 250, s["title"], 84, INK, lh=1.3)
    d.line([M, y + 30, M + 56, y + 30], fill=GREEN, width=4)
    body(d, M, y + 80, s.get("body", ""), 34, BODY, lh=1.6)
    logo(d, M, H - 60 - 60, False)
    return im


def s_compare(s):
    im = Image.new("RGB", (W, H), IVORY)
    d = ImageDraw.Draw(im)
    y = title(d, M, 180, s["title"], 72, INK) + 60
    cw, gap = (W - 2 * M - 36) // 2, 36
    top, fs = y, 36
    rows = max(sum(it.count("\n") + 1 for it in c["items"]) * 1.45 * fs + len(c["items"]) * 0.9 * fs
               for c in (s["left"], s["right"]))
    bh = int(130 + rows)
    for i, col in enumerate((s["left"], s["right"])):
        x = M + i * (cw + gap)
        on = i == 1
        box_fill = WHITE if on else (234, 229, 220)
        d.rounded_rectangle([x, top, x + cw, top + bh], 28, fill=box_fill,
                            outline=GREEN if on else None, width=3 if on else 0)
        d.text((x + 40, top + 44), col["head"], font=font("Bold", 38), fill=DEEP if on else MUTED)
        yy = top + 136
        for it in col["items"]:
            d.ellipse([x + 40, yy + 19, x + 53, yy + 32], fill=GREEN if on else (180, 175, 166))
            yy = body(d, x + 72, yy, it, fs, INK if on else (110, 110, 110), lh=1.45, gap=0.9,
                      wt="Medium" if on else "Regular")
    if s.get("note"):
        body(d, M, top + bh + 44, s["note"], 32, BODY)
    logo(d, M, H - 60 - 60, False)
    return im


def s_checks(s):
    im = Image.new("RGB", (W, H), IVORY)
    d = ImageDraw.Draw(im)
    y = title(d, M, 180, s["title"], 72, INK) + 40
    d.line([M, y, M + 56, y], fill=GREEN, width=4)
    y += 60
    for it in s["items"]:
        d.ellipse([M, y + 2, M + 46, y + 48], fill=DEEP)
        d.line([M + 12, y + 26, M + 20, y + 34, M + 35, y + 16], fill=WHITE, width=5, joint="curve")
        d.text((M + 70, y), it["head"], font=font("Bold", 36), fill=INK)
        y = body(d, M + 70, y + 58, it["text"], 29, BODY, lh=1.5, gap=1.2)
    if s.get("note"):
        body(d, M, y + 10, s["note"], 31, DEEP, wt="Medium")
    logo(d, M, H - 60 - 60, False)
    return im


def s_close(s):
    im = fit(s["src"], W, H, s.get("focus_y", 0.5))
    im = shade(im, color=(8, 9, 9), strength=0.92, reach=0.8)
    d = ImageDraw.Draw(im)
    y = title(d, M, 260, s["title"], 78, WHITE, accent=GREEN)
    body(d, M, y + 50, s.get("body", ""), 33, (222, 222, 222), lh=1.6)
    logo(d, M, H - 84 - 60, True)
    return im


def s_issue(s):
    im = Image.new("RGB", (W, H), IVORY)
    d = ImageDraw.Draw(im)
    d.text((M, 150), f"{int(s['no']):02d}", font=font("ExtraBold", 96), fill=GREEN)
    d.text((M + 150, 190), s.get("tag", ""), font=font("Medium", 30), fill=MUTED)
    y = title(d, M, 300, s["title"], 64, INK) + 30
    y = body(d, M, y, s.get("body", ""), 31, BODY, lh=1.6)
    if s.get("point"):
        lines = s["point"].split("\n")
        bh = 96 + int(len(lines) * 31 * 1.55)
        top = max(y + 10, H - 190 - bh)
        d.rounded_rectangle([M, top, W - M, top + bh], 24, fill=WHITE, outline=GREEN, width=3)
        d.text((M + 36, top + 30), "브루스의 한 줄", font=font("Bold", 28), fill=DEEP)
        body(d, M + 36, top + 78, s["point"], 31, INK, lh=1.55, wt="Medium")
    if s.get("source"):
        f = font("Regular", 24)
        d.text((W - M - d.textlength(s["source"], font=f), H - 60 - 44), s["source"], font=f, fill=MUTED)
    logo(d, M, H - 60 - 60, False)
    return im


KIND = dict(cover=s_cover, photo=s_photo, text=s_text, compare=s_compare, checks=s_checks, close=s_close, issue=s_issue)

def render(spec_path, out_dir="."):
    global BASE
    BASE = os.path.dirname(os.path.abspath(spec_path))
    spec = json.load(open(spec_path, encoding="utf-8"))
    if not 2 <= len(spec["slides"]) <= 10:
        sys.exit("캐러셀은 2~10장이어야 합니다")
    fonts()
    os.makedirs(out_dir, exist_ok=True)
    out = []
    for i, s in enumerate(spec["slides"], 1):
        p = os.path.join(out_dir, f"card_{i:02d}.jpg")
        KIND[s["kind"]](s).save(p, quality=92, subsampling=0)
        out.append(p)
    # QA 시트: 전 장을 한 장에(미리보기 메일용)
    th = [Image.open(p).resize((270, 338)) for p in out]
    rows = (len(th) + 3) // 4
    sheet = Image.new("RGB", (280 * 4 + 10, 348 * rows + 10), (90, 90, 90))
    for i, t in enumerate(th):
        sheet.paste(t, (10 + (i % 4) * 280, 10 + (i // 4) * 348))
    sheet.save(os.path.join(out_dir, "qa.jpg"), quality=85)
    return out


if __name__ == "__main__":
    print("\n".join(render(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else ".")))
