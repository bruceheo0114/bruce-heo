# 브루스 인사이트 릴스 합성기 v3 — Higgsfield sandbox(ffmpeg + Pillow)에서 실행한다. 크레딧을 쓰지 않는다.
# 레이아웃(1080x1920): 상단 제목 밴드 0-500 / 설명 패널 500-1310(4:3) / 자막 띠 1310-1420 / 하단 브랜드 밴드 1420-1920
# 사용: python3 compose.py spec.json  → out.mp4, cover.jpg
#
# visuals[] 공통: start, end, kind(image|phone|split|clip|card), xfade(다음 장면으로 넘어가는 전환, 선택)
#   image : src, focus_y, zoom(in|out), punch[{at, x, y}], spot{at, x, y, r}, labels[{at, text, x, y, dx, dy}]
#   phone : src, likes{to, at}            — 휴대폰 목업 안에 이미지, 하트 숫자 카운트업
#   split : left, right, ltext, rtext, at — 좌우 비교, at 이후 왼쪽 ✕ / 오른쪽 ✓
#   clip  : src, focus_y, labels          — 생성 영상(Grok Lite 5초, 16:9·9:16 모두 패널을 꽉 채워 자른다). 라벨 좌표는 패널 기준
#   card  : 엔드카드
#   움직이는 도식(2026-10-19, 유튜브 MOTION과 같은 종류 — 사진 없이 패널에 그린다, 크레딧 0):
#   count   : to("46,000"), prefix, suffix, text — 숫자가 0부터 올라간다(tick·ding)
#   trend   : title, series{이름: [{period, ratio}]} (insight-reels/trends/<D>.json 그 글의 series 를 그대로) — 네이버 검색량 꺾은선(chart)
#   timeline: title(선택), steps[{label, text}] 2~4개 — 점이 차례로 찍힌다(pop)
#   compare : head[A, B], rows[[왼, 오]...] 0~3개 — 두 칸이 양옆에서 들어온다(whoosh)
#   quote   : text, by(선택) — 낱말이 차례로 나타난다(page)
#   scroll  : src(세로로 긴 그림: 기사·페이지 전체 캡처) — 위에서 아래로 훑는다(scroll)
# 좌표 x, y 는 패널 기준 0~1. 시간 at 은 장면 시작 기준 초.
# 소리(2026-10-15, 유튜브 EP005 5차 방식): 내레이션은 -14 LUFS로 맞춘다. spec 에 bgm(채널 BGM 파일/주소)이 있으면
#   bgm_start 초부터 영상 길이만큼 깔고(-27 LUFS 기준 bgm_gain dB, 기본 -12), 말할 때 사이드체인으로 줄인다. 처음 0.8초·끝 1.5초 페이드.
# 효과음(2026-10-19): 유튜브 채널 효과음(bruce-youtube/channel/sfx)을 장면 전환(xfade)·라벨·펀치·하트 숫자·비교·움직이는 도식에 자동으로 작게 깐다.
#   sfx_base(효과음 폴더 주소, 기본 main 브랜치 raw 주소), sfx(추가 [{name, at(영상 기준 초)}]), "sfx": false 면 끈다.
# 낱말 강조 자막(2026-10-19): 말한 낱말부터 흰색, 아직 말하지 않은 낱말은 회색. words(faster-whisper 단어 [{word, start, end}])가 있으면
#   그 시각에, 없으면 글자 수 비율로. "karaoke": false 면 예전처럼 한 줄 통째로.
import json, math, os, re, subprocess, sys, urllib.request
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
PY, PH = 500, 810
SY, SH = 1310, 110
BY = SY + SH
# 색은 홈페이지(bruceheo.com, assets/site.css :root)와 같은 토큰을 쓴다(사용자 결정 2026-10-13).
# BLUE 이름은 예전 코드 호환용 — 값은 홈페이지 --accent(진초록).
BLUE, INK, GRAY, PANEL = (35, 116, 76), (17, 17, 17), (115, 115, 110), (251, 250, 247)
WHITE, SOFT, TEXT2, LINE = (255, 255, 255), (233, 231, 225), (58, 58, 55), (227, 225, 218)
BG, MINT = (242, 241, 237), (101, 185, 138)
XF = 0.4  # 전환 길이(초)
FD = "/home/user/fonts"
FB, FX = f"{FD}/Pretendard-Bold.otf", f"{FD}/Pretendard-ExtraBold.otf"
_fc = {}


def font(path, size):
    if (path, size) not in _fc:
        _fc[(path, size)] = ImageFont.truetype(path, size)
    return _fc[(path, size)]


def sh(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if r.returncode:
        print(r.stderr[-3000:])
        sys.exit(r.returncode)
    return r.stdout


def fonts():
    os.makedirs(FD, exist_ok=True)
    base = "https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static/"
    for f in ("Pretendard-Bold.otf", "Pretendard-ExtraBold.otf"):
        if not os.path.exists(f"{FD}/{f}"):
            sh(f"curl -sfL -o {FD}/{f} {base}{f}")


def txt(name, s):
    p = f"t_{name}.txt"
    open(p, "w", encoding="utf-8").write(s)
    return p


def ease(t, at, dur=0.35):
    x = min(max((t - at) / dur, 0), 1)
    return 1 - (1 - x) ** 3


def vgrad(w, h, top, bottom):
    g = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(g)
    for y in range(h):
        k = y / max(h - 1, 1)
        d.line([(0, y), (w, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * k) for i in range(3)))
    return g


def center_text(d, y, s, f, fill):
    d.text(((W - d.textlength(s, font=f)) / 2, y), s, font=f, fill=fill)


# ---------- 배경(제목·자막띠·브랜드 밴드) — bruceheo.com 색 토큰 ----------
def background(spec):
    bg = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(bg)
    # 상단: 흰 바탕 + 시리즈 라벨 + 제목(가운데 정렬)
    center_text(d, 52, spec.get("series", "브루스 인사이트  |  맥락을 설계하는 일"), font(FB, 32), GRAY)
    lines = spec["title"].split("\n")[:2]
    for i, ln in enumerate(lines):
        center_text(d, 300 - len(lines) * 50 + i * 100, ln, font(FX, 76), INK)
    # 자막 띠
    d.rectangle([0, SY, W, SY + SH], fill=INK)
    # 하단: 연파랑 밴드 + 워드마크
    d.rectangle([0, BY, W, H], fill=SOFT)
    # 홈페이지 내비게이션과 같은 브랜드: 검은 원 BR. 마크(민트 점) + Bruce Heo
    r, mf, nf = 62, font(FX, 52), font(FX, 64)
    name = "Bruce Heo"
    total = 2 * r + 28 + d.textlength(name, font=nf)
    x0, cy = (W - total) / 2, BY + 150
    d.ellipse([x0, cy - r, x0 + 2 * r, cy + r], fill=INK)
    bw = d.textlength("BR", font=mf)
    d.text((x0 + r - bw / 2 - 7, cy - 34), "BR", font=mf, fill=WHITE)
    d.ellipse([x0 + r + bw / 2 - 4, cy + 8, x0 + r + bw / 2 + 10, cy + 22], fill=MINT)
    d.text((x0 + 2 * r + 28, cy - 42), name, font=nf, fill=INK)
    center_text(d, BY + 260, "맥락을 설계하는 마케터의 인사이트", font(FB, 34), TEXT2)
    bg.save("bg.png")


# ---------- 패널 소재 ----------
def cover(src, w, h, fy=0.5):
    im = Image.open(src).convert("RGB")
    s = max(w / im.width, h / im.height)
    im = im.resize((math.ceil(im.width * s), math.ceil(im.height * s)), Image.LANCZOS)
    x = (im.width - w) // 2
    y = int(min(max(im.height * fy - h / 2, 0), im.height - h))
    return im.crop((x, y, x + w, y + h))


def pill(d, cx, cy, text, k, fill=(255, 255, 255), color=BLUE, size=40):
    if k <= 0:
        return
    f = font(FB, int(size * (0.7 + 0.3 * k)))
    tw = d.textlength(text, font=f)
    pw, ph = tw + 44, f.size + 26
    cx = min(max(cx, pw / 2 + 24), W - pw / 2 - 24)   # 패널 밖으로 잘리지 않게
    cy = min(max(cy, ph / 2 + 24), PH - ph / 2 - 24)
    d.rounded_rectangle([cx - pw / 2, cy - ph / 2, cx + pw / 2, cy + ph / 2], radius=ph / 2, fill=fill)
    d.text((cx - tw / 2, cy - f.size / 2 - 4), text, font=f, fill=color)


def heart(d, cx, cy, r, fill):
    d.ellipse([cx - r, cy - r * 0.8, cx, cy + r * 0.2], fill=fill)
    d.ellipse([cx, cy - r * 0.8, cx + r, cy + r * 0.2], fill=fill)
    d.polygon([(cx - r * 0.98, cy - 0.15 * r), (cx + r * 0.98, cy - 0.15 * r), (cx, cy + r)], fill=fill)


def count_text(to, k):
    m = re.match(r"([\d.]+)(.*)", to)
    if not m:
        return to
    num, unit = float(m.group(1)), m.group(2)
    v = num * k
    return (f"{v:.0f}" if num >= 10 or k >= 1 else f"{v:.1f}") + unit


def frame_image(base, t, v):
    # 느린 줌 + 펀치인: 패널 좌표 (cx, cy) 를 중심으로 z 배 확대한 영역을 잘라낸다
    L = v["_len"]
    slow = 1 + 0.06 * (t / L) if v.get("zoom", "in") == "in" else 1.06 - 0.06 * (t / L)
    z, cx, cy = slow, 0.5, 0.5
    for p in v.get("punch", []):
        k = ease(t, p["at"], 0.18)
        z *= 1 + 0.18 * k
        cx += (p.get("x", 0.5) - cx) * k
        cy += (p.get("y", 0.5) - cy) * k
    BW, BH = base.size
    cw, ch = BW / z, BH / z
    left = min(max(cx * BW - cw / 2, 0), BW - cw)
    top = min(max(cy * BH - ch / 2, 0), BH - ch)
    img = base.resize((W, PH), Image.BILINEAR, box=(left, top, left + cw, top + ch))
    to_frame = lambda x, y: ((x * BW - left) / cw * W, (y * BH - top) / ch * PH)

    sp = v.get("spot")
    if sp:
        k = ease(t, sp["at"], 0.4)
        if k > 0:
            sx, sy = to_frame(sp["x"], sp["y"])
            r = sp.get("r", 0.2) * W * z
            mask = Image.new("L", (W, PH), int(160 * k))
            ImageDraw.Draw(mask).ellipse([sx - r, sy - r, sx + r, sy + r], fill=0)
            img = Image.composite(Image.new("RGB", (W, PH), (0, 0, 0)), img, mask.filter(ImageFilter.GaussianBlur(18)))
            ImageDraw.Draw(img).ellipse([sx - r, sy - r, sx + r, sy + r], outline=(255, 255, 255), width=int(5 * k) or 1)
    draw_labels(img, t, v, to_frame)
    return img


def draw_labels(img, t, v, to_frame):
    d = ImageDraw.Draw(img)
    for lb in v.get("labels", []):
        k = ease(t, lb["at"], 0.3)
        if k <= 0:
            continue
        ax, ay = to_frame(lb["x"], lb["y"])
        px, py = ax + lb.get("dx", 0) * W, ay + lb.get("dy", -0.16) * PH
        d.line([(ax, ay), (ax + (px - ax) * k, ay + (py - ay) * k)], fill=(255, 255, 255), width=4)
        d.ellipse([ax - 10, ay - 10, ax + 10, ay + 10], fill=BLUE, outline=(255, 255, 255), width=4)
        hl = lb.get("hl")
        pill(d, px, py, lb["text"], k, fill=BLUE if hl else (255, 255, 255), color=(255, 255, 255) if hl else BLUE)


def frame_phone(base, t, v):
    img = Image.new("RGB", (W, PH))
    img.paste(vgrad(W, PH, WHITE, SOFT), (0, 0))
    d = ImageDraw.Draw(img)
    pw, ph = 380, 740
    x0, y0 = (W - pw) // 2, (PH - ph) // 2 + int(30 * (1 - ease(t, 0, 0.5)))
    d.rounded_rectangle([x0 - 14, y0 - 14, x0 + pw + 14, y0 + ph + 14], radius=58, fill=(20, 22, 28))
    sw, shh = pw, ph
    s = 1 + 0.05 * t / v["_len"]
    scr = base.resize((int(sw * s), int(shh * s)), Image.BILINEAR)
    scr = scr.crop(((scr.width - sw) // 2, (scr.height - shh) // 2, (scr.width - sw) // 2 + sw, (scr.height - shh) // 2 + shh))
    m = Image.new("L", (sw, shh), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, sw, shh], radius=46, fill=255)
    img.paste(scr, (x0, y0), m)
    d.rounded_rectangle([x0 + pw / 2 - 60, y0 + 14, x0 + pw / 2 + 60, y0 + 40], radius=13, fill=(20, 22, 28))
    lk = v.get("likes")
    if lk:
        k = ease(t, lk.get("at", 0.2), 1.2)
        hx, hy = x0 + pw + 120, y0 + ph * 0.55
        heart(d, hx, hy, 46 * (1 + 0.15 * math.sin(min(t * 9, math.pi))), (255, 72, 102))
        cnt = count_text(lk["to"], k)
        f = font(FX, 64)
        d.text((hx - d.textlength(cnt, font=f) / 2, hy + 62), cnt, font=f, fill=INK)
    return img


def frame_split(bases, t, v):
    img = Image.new("RGB", (W, PH))
    k = ease(t, v.get("at", 1.0), 0.4)
    L, R = bases
    lft = ImageEnhance.Brightness(ImageEnhance.Color(L).enhance(1 - 0.9 * k)).enhance(1 - 0.35 * k)
    img.paste(lft, (0, 0))
    img.paste(R, (W // 2, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([W // 2 - 4, 0, W // 2 + 4, PH], fill=(255, 255, 255))
    pill(d, W * 0.25, 70, v["ltext"], 1, fill=(255, 255, 255), color=GRAY if k > 0.5 else INK)
    pill(d, W * 0.75, 70, v["rtext"], 1, fill=BLUE if k > 0.5 else (255, 255, 255), color=(255, 255, 255) if k > 0.5 else INK)
    if k > 0:
        c, r = (W * 0.25, PH * 0.55), 90 * k
        d.line([(c[0] - r, c[1] - r), (c[0] + r, c[1] + r)], fill=(255, 255, 255), width=16)
        d.line([(c[0] - r, c[1] + r), (c[0] + r, c[1] - r)], fill=(255, 255, 255), width=16)
        c2 = (W * 0.75, PH * 0.55)
        d.ellipse([c2[0] - 95 * k, c2[1] - 95 * k, c2[0] + 95 * k, c2[1] + 95 * k], fill=BLUE)
        d.line([(c2[0] - 45 * k, c2[1]), (c2[0] - 10 * k, c2[1] + 35 * k), (c2[0] + 50 * k, c2[1] - 35 * k)], fill=(255, 255, 255), width=16, joint="curve")
        d.rectangle([W // 2 + 4, 0, W - 1, PH - 1], outline=BLUE, width=int(10 * k) or 1)
    return img


# ---------- 움직이는 도식 ----------
def wrap(d, text, f, maxw):
    lines, cur = [], ""
    for word in str(text).split():
        nxt = f"{cur} {word}".strip()
        if cur and d.textlength(nxt, font=f) > maxw:
            lines.append(cur)
            cur = word
        else:
            cur = nxt
    return lines + ([cur] if cur else [])


def rise(img, t, at, draw_fn):
    # at 초부터 0.5초 동안 아래에서 떠오르며 나타나는 요소: 투명 레이어에 그려 겹친다
    k = ease(t, at, 0.5)
    if k <= 0:
        return
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(layer), int(28 * (1 - k)))
    if k < 1:
        layer.putalpha(layer.getchannel("A").point(lambda a: int(a * k)))
    img.paste(layer, (0, 0), layer)


def parse_count(s):
    m = re.search(r"\d[\d,]*(?:\.\d+)?", str(s))
    if not m:
        return None
    raw = m.group(0).replace(",", "")
    return float(raw), (len(raw.split(".")[1]) if "." in raw else 0), "," in m.group(0)


def frame_count(t, v):
    img = Image.new("RGB", (W, PH), PANEL)
    num, dec, comma = v["_num"]
    k = ease(t, 0.3, 1.4)
    val = num * k
    s = f"{val:,.{dec}f}" if comma else f"{val:.{dec}f}"
    d = ImageDraw.Draw(img)
    fn, fu = font(FX, 190), font(FX, 88)
    pre, suf = v.get("prefix", ""), v.get("suffix", "")
    final = f"{num:,.{dec}f}" if comma else f"{num:.{dec}f}"   # 가운데 정렬은 마지막 숫자 폭 기준(흔들리지 않게)
    total = d.textlength(pre, font=fu) + d.textlength(final, font=fn) + d.textlength(suf, font=fu)
    x, base = (W - total) / 2, 330
    if pre:
        d.text((x, base - 88), pre, font=fu, fill=INK)
        x += d.textlength(pre, font=fu)
    d.text((x, base - 190), s, font=fn, fill=BLUE)
    x += d.textlength(final, font=fn)
    if suf:
        d.text((x, base - 88), suf, font=fu, fill=INK)
    d.rounded_rectangle([W / 2 - 320, 380, W / 2 + 320, 392], radius=6, fill=LINE)
    if k > 0:
        d.rounded_rectangle([W / 2 - 320, 380, W / 2 - 320 + 640 * k, 392], radius=6, fill=MINT)
    for i, ln in enumerate(wrap(d, v.get("text", ""), font(FB, 54), 900)[:2]):
        rise(img, t, 0.9 + i * 0.12, lambda dd, dy, ln=ln, i=i: dd.text(((W - dd.textlength(ln, font=font(FB, 54))) / 2, 450 + i * 74 + dy), ln, font=font(FB, 54), fill=TEXT2))
    return img


def trend_lines(v):
    series = v.get("series") or {}
    names = [n for n in (v.get("names") or list(series)[:2]) if len(series.get(n) or []) >= 3][:2]
    if not names:
        return []
    mx = max(max(p["ratio"] for p in series[n]) for n in names) or 1
    return [(n, [p["ratio"] / mx * 100 for p in series[n]], [p["period"] for p in series[n]]) for n in names]


def frame_trend(t, v):
    S = 2   # 두 배 크기로 그려 줄여서 선을 매끄럽게
    img = Image.new("RGB", (W * S, PH * S), PANEL)
    d = ImageDraw.Draw(img)
    lines = v["_lines"]
    d.text((70 * S, 50 * S), v.get("title", f"‘{lines[0][0]}’ 검색량"), font=font(FX, 60 * S), fill=INK)
    d.text((70 * S, 132 * S), "네이버 검색량(상대값) · 최근 30일", font=font(FB, 30 * S), fill=GRAY)
    x0, x1, y0, y1 = 70 * S, (W - 70) * S, 230 * S, 700 * S
    d.line([(x0, y1), (x1, y1)], fill=LINE, width=3 * S)
    k = ease(t, 0.3, 1.6)
    colors = [BLUE, INK]
    for li, (name, vals, periods) in reversed(list(enumerate(lines))):
        n = len(vals)
        pts = [(x0 + (x1 - x0) * i / (n - 1), y1 - (y1 - y0) * val / 100) for i, val in enumerate(vals)]
        upto = k * (n - 1)
        whole = int(upto)
        shown = pts[: whole + 1]
        if whole < n - 1:
            a, b = pts[whole], pts[whole + 1]
            f = upto - whole
            shown.append((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f))
        if li == 0 and len(shown) > 1:
            area = Image.new("L", img.size, 0)
            ImageDraw.Draw(area).polygon(shown + [(shown[-1][0], y1), (x0, y1)], fill=60)
            img.paste(Image.new("RGB", img.size, MINT), (0, 0), area)
            d = ImageDraw.Draw(img)
        if len(shown) > 1:
            d.line(shown, fill=colors[li], width=(10 if li == 0 else 6) * S, joint="curve")
    name, vals, periods = lines[0]
    lab = lambda p: f"{int(p[5:7])}.{int(p[8:10])}"
    d.text((x0, y1 + 16 * S), lab(periods[0]), font=font(FB, 28 * S), fill=GRAY)
    end = lab(periods[-1])
    d.text((x1 - d.textlength(end, font=font(FB, 28 * S)), y1 + 16 * S), end, font=font(FB, 28 * S), fill=GRAY)
    if len(lines) > 1:   # 범례는 아래 날짜 사이 가운데(최고점 표시와 겹치지 않게)
        fl = font(FB, 30 * S)
        widths = [d.textlength(nm, font=fl) + 44 * S for nm, _, _ in lines]
        lx = (W * S - sum(widths) - 30 * S * (len(lines) - 1)) / 2
        for li, (nm, _, _) in enumerate(lines):
            d.rounded_rectangle([lx, y1 + 32 * S, lx + 32 * S, y1 + 40 * S], radius=4 * S, fill=colors[li])
            d.text((lx + 44 * S, y1 + 16 * S), nm, font=fl, fill=colors[li])
            lx += widths[li] + 30 * S
    img = img.resize((W, PH), Image.LANCZOS)
    top = max(range(len(vals)), key=lambda i: vals[i])
    if k >= top / max(len(vals) - 1, 1):
        d2 = ImageDraw.Draw(img)
        px, py = 70 + (W - 140) * top / (len(vals) - 1), 700 - 470 * vals[top] / 100
        pill(d2, px, py - 46, f"최고 {int(periods[top][5:7])}월 {int(periods[top][8:10])}일", ease(t, 0.3 + 1.6 * top / max(len(vals) - 1, 1), 0.3), fill=INK, color=WHITE, size=32)
    d2 = ImageDraw.Draw(img)
    cr = "출처 · 네이버 데이터랩"
    d2.text((W - 40 - d2.textlength(cr, font=font(FB, 24)), PH - 44), cr, font=font(FB, 24), fill=GRAY)
    return img


def frame_timeline(t, v):
    img = Image.new("RGB", (W, PH), PANEL)
    d = ImageDraw.Draw(img)
    steps = v["steps"][:4]
    n = len(steps)
    if v.get("title"):
        rise(img, t, 0, lambda dd, dy: dd.text((70, 60 + dy), v["title"], font=font(FX, 56), fill=INK))
    y = 400
    k = ease(t, 0.3, 0.45 * n)
    d.line([(70, y), (70 + (W - 140) * k, y)], fill=INK, width=6)
    for i, st in enumerate(steps):
        at = 0.5 + i * 0.45
        cx = 70 + (W - 140) * (i + 0.5) / n
        kk = ease(t, at, 0.3)
        if kk > 0:
            r = 20 * min(kk * 1.15, 1.0)
            d.ellipse([cx - r, y - r, cx + r, y + r], fill=INK if i == n - 1 else MINT, outline=PANEL, width=6)
        fl = font(FX, 54)
        rise(img, t, at, lambda dd, dy, st=st, cx=cx, fl=fl: dd.text((cx - dd.textlength(st["label"], font=fl) / 2, y - 110 + dy), st["label"], font=fl, fill=BLUE))
        ft = font(FB, 38 if n > 3 else 42)
        for j, ln in enumerate(wrap(d, st.get("text", ""), ft, (W - 140) / n - 16)[:3]):
            rise(img, t, at + 0.12, lambda dd, dy, ln=ln, j=j, cx=cx, ft=ft: dd.text((cx - dd.textlength(ln, font=ft) / 2, y + 50 + j * 52 + dy), ln, font=ft, fill=INK))
    return img


def frame_compare(t, v):
    img = Image.new("RGB", (W, PH), PANEL)
    head, rows = v["head"], v.get("rows", [])[:3]
    cw, top, bot = (W - 70 * 2 - 40) / 2, 60, PH - 60
    for side in (0, 1):
        k = ease(t, 0.1 + 0.35 * side, 0.6)
        if k <= 0:
            continue
        layer = Image.new("RGBA", (W, PH), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        x = 70 + side * (cw + 40) + (1 - k) * (-80 if side == 0 else 80)
        if side == 0:
            d.rounded_rectangle([x, top, x + cw, bot], radius=36, fill=WHITE, outline=INK, width=5)
        else:
            d.rounded_rectangle([x, top, x + cw, bot], radius=36, fill=INK)
        big = not rows
        fh = font(FX, 76 if big else 60)
        hl = wrap(d, head[side], fh, cw - 60)[:2]
        hy = (top + bot) / 2 - len(hl) * 45 if big else top + 50
        for j, ln in enumerate(hl):
            d.text((x + (cw - d.textlength(ln, font=fh)) / 2 if big else x + 36, hy + j * (fh.size + 10)), ln, font=fh, fill=(MINT if side else INK))
        fr = font(FB, 42)
        ry = top + 60 + len(hl) * (fh.size + 10) + 20
        for i, row in enumerate(rows):
            kk = ease(t, 0.9 + side * 0.15 + i * 0.12, 0.4)
            if kk <= 0:
                continue
            d.line([(x + 36, ry), (x + cw - 36, ry)], fill=(LINE if side == 0 else (60, 60, 58)), width=2)
            for j, ln in enumerate(wrap(d, row[side], fr, cw - 72)[:2]):
                d.text((x + 36, ry + 22 + j * 52 + (1 - kk) * 20), ln, font=fr, fill=(WHITE if side else INK))
            ry += 22 + 52 * min(2, len(wrap(d, row[side], fr, cw - 72))) + 20
        layer.putalpha(layer.getchannel("A").point(lambda a: int(a * k)))
        img.paste(layer, (0, 0), layer)
    k = ease(t, 0.8, 0.35)
    if k > 0:
        d = ImageDraw.Draw(img)
        r = 62 * k
        cx, cy = W / 2, (top + bot) / 2
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=MINT)
        f = font(FX, int(40 * k) or 1)
        d.text((cx - d.textlength("VS", font=f) / 2, cy - f.size / 2 - 4), "VS", font=f, fill=WHITE)
    return img


def frame_quote(t, v):
    img = Image.new("RGB", (W, PH), PANEL)
    d = ImageDraw.Draw(img)
    k = ease(t, 0, 0.4)
    d.text((60, 30 - 20 * (1 - k)), "“", font=font(FX, 260), fill=tuple(int(PANEL[i] + (MINT[i] - PANEL[i]) * k) for i in range(3)))
    fq = font(FX, 64 if len(v["text"]) <= 30 else 54)
    lines = wrap(d, v["text"], fq, W - 200)[:4]
    words = [(j, w) for j, ln in enumerate(lines) for w in ln.split()]
    step = min(0.09, 1.4 / max(len(words), 1))
    y0 = PH / 2 - len(lines) * (fq.size + 22) / 2
    xs = {}
    for idx, (j, w) in enumerate(words):
        x = xs.get(j, 100)
        rise(img, t, 0.25 + step * idx, lambda dd, dy, w=w, x=x, j=j: dd.text((x, y0 + j * (fq.size + 22) + dy), w, font=fq, fill=INK))
        xs[j] = x + d.textlength(w + " ", font=fq)
    if v.get("by"):
        rise(img, t, 0.4 + step * len(words), lambda dd, dy: dd.text((100, y0 + len(lines) * (fq.size + 22) + 20 + dy), f"— {v['by']}", font=font(FB, 38), fill=GRAY))
    return img


def frame_scroll(base, t, v):
    # 세로로 긴 그림을 패널 폭에 맞춰 위→아래로(앞뒤 0.4초는 멈춤, 가운데는 부드럽게)
    L = v["_len"]
    x = min(max((t - 0.4) / max(L - 0.8, 0.1), 0), 1)
    k = x * x * (3 - 2 * x)
    top = (base.height - PH) * k
    return base.crop((0, int(top), W, int(top) + PH))


def render_frames(out, n, draw, size=(W, PH)):
    p = subprocess.Popen(f"ffmpeg -y -v error -f rawvideo -pix_fmt rgb24 -s {size[0]}x{size[1]} -r {FPS} -i - "
                         f"-r {FPS} -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p {out}",
                         shell=True, stdin=subprocess.PIPE)
    for k in range(n):
        p.stdin.write(draw(k / FPS).tobytes())
    p.stdin.close()
    if p.wait():
        sys.exit(f"{out} 렌더 실패")


def segment(i, v, L):
    out = f"seg{i:02d}.mp4"
    v["_len"] = L
    n = int(round(L * FPS))
    kind = v["kind"]
    if kind == "image":
        base = cover(v["src"], int(W * 1.5), int(PH * 1.5), v.get("focus_y", 0.5))
        render_frames(out, n, lambda t: frame_image(base, t, v))
    elif kind == "phone":
        base = cover(v["src"], 380, 740, v.get("focus_y", 0.5))
        render_frames(out, n, lambda t: frame_phone(base, t, v))
    elif kind == "split":
        bases = (cover(v["left"], W // 2, PH, v.get("lfy", 0.5)), cover(v["right"], W // 2, PH, v.get("rfy", 0.5)))
        render_frames(out, n, lambda t: frame_split(bases, t, v))
    elif kind == "count":
        v["_num"] = parse_count(v["to"]) or (0.0, 0, False)
        render_frames(out, n, lambda t: frame_count(t, v))
    elif kind == "trend" and trend_lines(v):
        v["_lines"] = trend_lines(v)
        render_frames(out, n, lambda t: frame_trend(t, v))
    elif kind == "timeline":
        render_frames(out, n, lambda t: frame_timeline(t, v))
    elif kind == "compare":
        render_frames(out, n, lambda t: frame_compare(t, v))
    elif kind == "quote":
        render_frames(out, n, lambda t: frame_quote(t, v))
    elif kind == "scroll":
        im = Image.open(v["src"]).convert("RGB")
        base = im.resize((W, max(PH, round(im.height * W / im.width))), Image.LANCZOS)
        render_frames(out, n, lambda t: frame_scroll(base, t, v))
    elif kind == "trend":   # 검색량 자료가 없으면 제목만 큰 글씨로
        v["text"] = v.get("title", "")
        render_frames(out, n, lambda t: frame_quote(t, {"text": v["text"]}))
    elif kind == "clip":
        fy = v.get("focus_y", 0.5)
        dur = float(subprocess.run(f'ffprobe -v error -show_entries format=duration -of csv=p=0 "{v["src"]}"',
                                   shell=True, capture_output=True, text=True).stdout or 0)
        slow = f"setpts=PTS*{L / dur:.4f}," if dur and L > dur else ""   # 장면이 클립보다 길면 멈추지 않게 천천히 늘인다
        vf = (f"{slow}scale={W}:{PH}:force_original_aspect_ratio=increase,crop={W}:{PH}:(iw-{W})/2:'(ih-{PH})*{fy}',setsar=1,"
              f"fps={FPS},tpad=stop_mode=clone:stop_duration={L}")
        if not v.get("labels"):
            sh(f'ffmpeg -y -v error -i "{v["src"]}" -t {L} -an -vf "{vf}" -r {FPS} -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p {out}')
        else:
            # 클립에도 라벨(좌표는 패널 기준 0~1): 프레임을 받아 라벨을 그린 뒤 다시 인코딩
            raw = subprocess.run(f'ffmpeg -v error -i "{v["src"]}" -t {L} -an -vf "{vf}" -r {FPS} -f rawvideo -pix_fmt rgb24 -',
                                 shell=True, capture_output=True).stdout
            size = W * PH * 3
            frames = [raw[k:k + size] for k in range(0, len(raw) - size + 1, size)][:n]

            def draw_clip(t):
                img = Image.frombytes("RGB", (W, PH), frames[min(int(round(t * FPS)), len(frames) - 1)])
                draw_labels(img, t, v, lambda x, y: (x * W, y * PH))
                return img
            render_frames(out, n, draw_clip)
    else:
        c = spec["card"]
        t1, t2 = txt(f"c{i}a", c["line1"]), txt(f"c{i}b", c["line2"])
        # 엔드카드도 홈페이지 토큰: 카드 배경(#FBFAF7) + 검은 BR. 원(민트 점) + 원문 안내
        im = Image.new("RGB", (W, PH), PANEL)
        d = ImageDraw.Draw(im)
        r, mf = 80, font(FX, 66)
        cx, cy = W // 2, 250
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=INK)
        bw = d.textlength("BR", font=mf)
        d.text((cx - bw / 2 - 8, cy - 42), "BR", font=mf, fill=WHITE)
        d.ellipse([cx + bw / 2 - 4, cy + 12, cx + bw / 2 + 13, cy + 29], fill=MINT)
        center_text(d, 400, c["line1"], font(FB, 50), INK)
        center_text(d, 480, c["line2"], font(FB, 36), GRAY)
        im.save(f"card{i}.png")
        sh(f'ffmpeg -y -v error -loop 1 -i card{i}.png -t {L} -r {FPS} -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p {out}')
    return out


spec = json.load(open(sys.argv[1], encoding="utf-8"))
fonts()
background(spec)
vis = spec["visuals"]
segs = []
for i, v in enumerate(vis):
    d = v["end"] - v["start"]
    tr = vis[i].get("xfade") if i < len(vis) - 1 else None
    segs.append(segment(i, v, d + (XF if tr else 0)))

# 장면 전환(xfade) 체인 — 각 장면은 전환 길이만큼 길게 렌더했으므로 타임라인은 그대로 유지된다
inputs = " ".join(f"-i {s}" for s in segs)
chain, prev = [], "[0:v]"
for i in range(1, len(segs)):
    tr = vis[i - 1].get("xfade")
    lab = f"[x{i}]"
    if tr:
        chain.append(f"{prev}[{i}:v]xfade=transition={tr}:duration={XF}:offset={vis[i]['start']}{lab}")
    else:
        chain.append(f"{prev}[{i}:v]concat=n=2:v=1:a=0{lab}")
    prev = lab
sh(f'ffmpeg -y -v error {inputs} -filter_complex "{";".join(chain)}" -map "{prev}" -r {FPS} -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p panel.mp4')

total = vis[-1]["end"]

# ---------- 효과음 자리 (유튜브 compose.js SFX_LEVELS 와 같은 크기) ----------
SFX_LEVELS = {"whoosh": 0.3, "pop": 0.22, "tick": 0.25, "ding": 0.3, "chart": 0.25, "riser": 0.25, "page": 0.35, "scroll": 0.3, "impact": 0.3}
SFX_BASE = "https://raw.githubusercontent.com/bruceheo0114/bruce-heo/main/bruce-youtube/channel/sfx/"


def sfx_events(spec):
    ev = []
    vis = spec["visuals"]
    for i, v in enumerate(vis):
        s0, kind = v["start"], v["kind"]
        if i and vis[i - 1].get("xfade"):
            ev.append(("whoosh", s0))
        ev += [("pop", s0 + lb["at"]) for lb in v.get("labels", [])]
        ev += [("impact", s0 + p["at"]) for p in v.get("punch", [])]
        if kind == "phone" and v.get("likes"):
            at = v["likes"].get("at", 0.2)
            ev += [("tick", s0 + at), ("ding", s0 + at + 1.15)]
        if kind == "split":
            ev.append(("ding", s0 + v.get("at", 1.0)))
        if kind == "count":
            ev += [("tick", s0 + 0.3), ("ding", s0 + 1.65)]
        if kind == "trend":
            ev.append(("chart", s0 + 0.25))
        if kind == "timeline":
            ev += [("pop", s0 + 0.5 + k * 0.45) for k in range(len(v.get("steps", [])[:4]))]
        if kind == "compare":
            ev += [("whoosh", s0 + 0.1), ("whoosh", s0 + 0.45)]
        if kind == "quote":
            ev.append(("page", s0 + 0.05))
        if kind == "scroll":
            ev.append(("scroll", s0 + 0.1))
    ev += [(x["name"], x["at"]) for x in spec.get("sfx") or [] if isinstance(x, dict)]
    ev = sorted((n, round(t, 3)) for n, t in ev if 0 <= t < total - 0.2)
    ev.sort(key=lambda e: e[1])
    kept = []
    for n, t in ev:   # 같은 소리가 0.3초 안에 겹치면 하나만
        if not any(k == n and t - kt < 0.3 for k, kt in kept):
            kept.append((n, t))
    return kept


def sfx_file(name):
    base = spec.get("sfx_base") or SFX_BASE
    if not base.startswith("http"):
        path = os.path.join(base, f"{name}.mp3")
        return path if os.path.exists(path) else None
    path = f"sfx_{name}.mp3"
    if not os.path.exists(path):
        try:
            urllib.request.urlretrieve(base.rstrip("/") + f"/{name}.mp3", path)
        except Exception as e:
            print(f"효과음 {name} 받기 실패: {e}")
            return None
    return path


# ---------- 낱말 강조 자막 띠(1080x110) ----------
def norm(s):
    return re.sub(r"[^가-힣A-Za-z0-9]", "", str(s))


def word_times(c, words):
    # 자막 줄 낱말마다 밝아지는 시각(줄 시작 기준). 받아쓰기 낱말의 글자 위치 비율 → 시각으로 맞춰 숫자 표기가 달라도 어긋나지 않는다.
    shown = c["text"].replace("\n", " ").split()
    span = (c["end"] - c["start"]) * 0.92
    ws = [w for w in (words or []) if c["start"] - 0.05 <= w["start"] < c["end"]]
    pts = [(0.0, 0.0)]
    if ws:
        lens = [len(norm(w.get("word", w.get("text", "")))) or 1 for w in ws]
        tot, acc = sum(lens), 0
        for w, ln in zip(ws, lens):
            pts.append((acc / tot, max(0.0, w["start"] - c["start"])))
            acc += ln
    pts.append((1.0, span))
    pts.sort()

    def at(fr):
        for (f0, t0), (f1, t1) in zip(pts, pts[1:]):
            if fr <= f1:
                return t0 if f1 == f0 else t0 + (t1 - t0) * (fr - f0) / (f1 - f0)
        return span
    total_len = max(len(" ".join(shown)), 1)
    out, off = [], 0
    for w in shown:
        out.append((w, at(off / total_len)))
        off += len(w) + 1
    return out


def caption_strip():
    caps = spec["captions"]
    timed = [word_times(c, spec.get("words")) for c in caps]
    f = font(FB, 50)
    cache = {}

    def draw(t):
        idx = next((k for k, c in enumerate(caps) if c["start"] <= t < c["end"]), None)
        if idx is None:
            key = None
        else:
            rel = t - caps[idx]["start"]
            key = (idx, sum(1 for _, wt in timed[idx] if rel >= wt))
        if key not in cache:
            im = Image.new("RGB", (W, SH), INK)
            if key:
                d = ImageDraw.Draw(im)
                ws = timed[key[0]]
                line = " ".join(w for w, _ in ws)
                x = (W - d.textlength(line, font=f)) / 2
                for j, (w, _) in enumerate(ws):
                    d.text((x, SH / 2 - 34), w, font=f, fill=WHITE if j < key[1] else (150, 150, 145))
                    x += d.textlength(w + " ", font=f)
            cache[key] = im
        return cache[key]
    render_frames("cap.mp4", int(math.ceil(total * FPS)), draw, size=(W, SH))


karaoke = spec.get("karaoke", True)
f = [f"[0:v][1:v]overlay=0:{PY}:shortest=1"]
for k, c in enumerate(spec["captions"]):
    en = f"enable='between(t,{c['start']},{c['end']})'"
    if not karaoke:
        p = txt(f"cap{k}", c["text"].replace("\n", " "))
        f.append(f"drawtext=expansion=none:fontfile={FB}:textfile={p}:fontsize=50:fontcolor=white:"
                 f"x=(w-tw)/2:y={SY + SH // 2}-th/2:{en}")
    if c.get("pop"):
        q = txt(f"pop{k}", c["pop"])
        f.append(f"drawtext=expansion=none:fontfile={FX}:textfile={q}:fontsize=92:fontcolor=white:"
                 f"borderw=9:bordercolor=black:x=(w-tw)/2:y={PY + PH // 2}-th/2:{en}")
inputs = f'-loop 1 -framerate {FPS} -i bg.png -i panel.mp4 -i "{spec["audio"]}"'
n_in = 3
voice = (f"[2:a]aformat=sample_rates=48000:channel_layouts=stereo,loudnorm=I=-14:TP=-1.5:LRA=11,"
         f"apad,atrim=0:{total},asetpts=N/SR/TB")
if spec.get("bgm"):
    inputs += f' -ss {spec.get("bgm_start", 0)} -i "{spec["bgm"]}"'
    audio = (f"{voice},asplit=2[va][vk];"
             f"[{n_in}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:{total},asetpts=N/SR/TB,"
             f"volume={spec.get('bgm_gain', -12)}dB,afade=t=in:d=0.8,afade=t=out:st={max(0, total - 1.5)}:d=1.5[bg];"
             f"[bg][vk]sidechaincompress=threshold=0.02:ratio=6:attack=20:release=400[bd];"
             f"[va][bd]amix=inputs=2:duration=first:normalize=0[a0]")
    n_in += 1
else:
    audio = f"{voice}[a0]"
vchain = ",".join(f)
if karaoke:
    caption_strip()
    inputs += " -i cap.mp4"
    vchain += f"[pv];[pv][{n_in}:v]overlay=0:{SY}:shortest=0"
    n_in += 1
events = sfx_events(spec) if spec.get("sfx") is not False else []
names = []
for n, _ in events:
    if n not in names and sfx_file(n):
        names.append(n)
events = [e for e in events if e[0] in names]
if events:
    for n in names:
        inputs += f' -i "{sfx_file(n)}"'
    parts, labels = [], []
    for j, n in enumerate(names):
        mine = [e for e in events if e[0] == n]
        parts.append(f"[{n_in + j}:a]aformat=sample_rates=48000:channel_layouts=stereo,asplit={len(mine)}" + "".join(f"[{n}{i}]" for i in range(len(mine))))
        for i, (_, t) in enumerate(mine):
            parts.append(f"[{n}{i}]adelay={int(t * 1000)}:all=1,volume={SFX_LEVELS.get(n, 0.3)}[o{n}{i}]")
            labels.append(f"[o{n}{i}]")
    audio += ";" + ";".join(parts) + f";[a0]{''.join(labels)}amix=inputs={len(labels) + 1}:normalize=0:duration=first,alimiter=limit=0.9:level=false[a]"
    print("효과음", len(events), {n: sum(1 for e in events if e[0] == n) for n in names})
else:
    audio += ";[a0]anull[a]"
sh(f'ffmpeg -y -v error {inputs} '
   f'-filter_complex "{vchain}[v];{audio}" -map "[v]" -map "[a]" '
   f'-c:v libx264 -profile:v high -preset medium -crf 20 -pix_fmt yuv420p -r {FPS} '
   f'-c:a aac -b:a 192k -ar 48000 -movflags +faststart -t {total} out.mp4')
# 표지(cover.jpg) — 유튜브 썸네일·카드뉴스 표지와 같은 스타일(사용자 결정 2026-10-11, 10/20 편부터):
# 첫 장면 사진 전면 + 왼쪽·아래 그늘 + 아주 큰 흰 제목. 프로필 격자(4:5)에서 잘리지 않게 글자는 가운데 4:5 안에 둔다.
def thumb_cover(spec):
    src = next((v.get("src") or v.get("left") for v in spec["visuals"] if v.get("src") or v.get("left")), None)
    if not src or spec.get("cover_mode") == "frame":
        sh(f"ffmpeg -y -v error -ss {spec.get('cover_at', 0.8)} -i out.mp4 -frames:v 1 -q:v 2 cover.jpg")
        return
    im = cover(src, W, H, spec["visuals"][0].get("focus_y", 0.5))
    shade = Image.new("L", (W, H))
    sd = ImageDraw.Draw(shade)
    for x in range(W):
        sd.line([(x, 0), (x, H)], fill=int(205 * max(0.0, 1 - x / (W * 0.95)) ** 0.9))
    low = Image.new("L", (W, H))
    ld = ImageDraw.Draw(low)
    for y in range(H):
        ld.line([(0, y), (W, y)], fill=int(170 * max(0.0, (y / H - 0.4) / 0.6) ** 1.2))
    black = Image.new("RGB", (W, H), (0, 0, 0))
    im = Image.composite(black, im, shade)
    im = Image.composite(black, im, low)
    d = ImageDraw.Draw(im)
    top, bottom = (H - W * 5 // 4) // 2, (H + W * 5 // 4) // 2   # 가운데 4:5 영역
    f = font(FB, 30)
    label = "브루스 인사이트"
    tw = d.textlength(label, font=f)
    d.rounded_rectangle([72, top + 72, 72 + tw + 44, top + 72 + 54], radius=27, outline=(101, 185, 138), width=4)
    d.text((94, top + 80), label, font=f, fill=(255, 255, 255))
    lines = spec["title"].split("\n")[:3]
    size = 112 if max(len(x) for x in lines) <= 8 else 92
    tf = font(FX, size)
    y = bottom - 110 - int(size * 1.08) * len(lines)
    for ln in lines:
        d.text((72, y), ln, font=tf, fill=(255, 255, 255))
        y += int(size * 1.08)
    im.save("cover.jpg", quality=92)


thumb_cover(spec)
print(sh("ffprobe -v error -show_entries format=duration:stream=codec_name,width,height -of compact out.mp4"))
