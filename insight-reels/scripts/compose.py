# 브루스 인사이트 릴스 합성기 v3 — Higgsfield sandbox(ffmpeg + Pillow)에서 실행한다. 크레딧을 쓰지 않는다.
# 레이아웃(1080x1920): 상단 제목 밴드 0-500 / 설명 패널 500-1310(4:3) / 자막 띠 1310-1420 / 하단 브랜드 밴드 1420-1920
# 사용: python3 compose.py spec.json  → out.mp4, cover.jpg
#
# visuals[] 공통: start, end, kind(image|phone|split|clip|card), xfade(다음 장면으로 넘어가는 전환, 선택)
#   image : src, focus_y, zoom(in|out), punch[{at, x, y}], spot{at, x, y, r}, labels[{at, text, x, y, dx, dy}]
#   phone : src, likes{to, at}            — 휴대폰 목업 안에 이미지, 하트 숫자 카운트업
#   split : left, right, ltext, rtext, at — 좌우 비교, at 이후 왼쪽 ✕ / 오른쪽 ✓
#   clip  : src, focus_y                  — 생성 영상
#   card  : 엔드카드
# 좌표 x, y 는 패널 기준 0~1. 시간 at 은 장면 시작 기준 초.
import json, math, os, re, subprocess, sys
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
PY, PH = 500, 810
SY, SH = 1310, 110
BY = SY + SH
BLUE, INK, GRAY, PANEL = (49, 130, 246), (25, 31, 40), (139, 149, 161), (249, 250, 251)
WHITE, SOFT, TEXT2, LINE = (255, 255, 255), (232, 243, 255), (78, 89, 104), (229, 232, 235)
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
    bg = Image.new("RGB", (W, H), WHITE)
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
    center_text(d, BY + 70, "Bruce.", font(FX, 150), BLUE)
    center_text(d, BY + 250, "맥락을 설계하는 마케터의 인사이트", font(FB, 34), TEXT2)
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
    return img


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


def render_frames(out, n, draw):
    p = subprocess.Popen(f"ffmpeg -y -v error -f rawvideo -pix_fmt rgb24 -s {W}x{PH} -r {FPS} -i - "
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
    elif kind == "clip":
        fy = v.get("focus_y", 0.5)
        vf = (f"scale={W}:-2,crop={W}:{PH}:0:'max(0,min(ih-{PH},ih*{fy}-{PH}/2))',setsar=1,"
              f"fps={FPS},tpad=stop_mode=clone:stop_duration={L}")
        sh(f'ffmpeg -y -v error -i "{v["src"]}" -t {L} -an -vf "{vf}" -r {FPS} -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p {out}')
    else:
        c = spec["card"]
        t1, t2 = txt(f"c{i}a", c["line1"]), txt(f"c{i}b", c["line2"])
        vf = (f"drawtext=expansion=none:fontfile={FX}:text='Bruce.':fontsize=120:fontcolor=0x3182F6:x=(w-tw)/2:y=230,"
              f"drawtext=expansion=none:fontfile={FB}:textfile={t1}:fontsize=50:fontcolor=0x191F28:x=(w-tw)/2:y=420,"
              f"drawtext=expansion=none:fontfile={FB}:textfile={t2}:fontsize=36:fontcolor=0x8B95A1:x=(w-tw)/2:y=500")
        sh(f'ffmpeg -y -v error -f lavfi -i color=c=0xF9FAFB:s={W}x{PH}:r={FPS} -t {L} -vf "{vf}" -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p {out}')
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
f = [f"[0:v][1:v]overlay=0:{PY}:shortest=1"]
for k, c in enumerate(spec["captions"]):
    en = f"enable='between(t,{c['start']},{c['end']})'"
    p = txt(f"cap{k}", c["text"].replace("\n", " "))
    f.append(f"drawtext=expansion=none:fontfile={FB}:textfile={p}:fontsize=50:fontcolor=white:"
             f"x=(w-tw)/2:y={SY + SH // 2}-th/2:{en}")
    if c.get("pop"):
        q = txt(f"pop{k}", c["pop"])
        f.append(f"drawtext=expansion=none:fontfile={FX}:textfile={q}:fontsize=92:fontcolor=white:"
                 f"borderw=9:bordercolor=black:x=(w-tw)/2:y={PY + PH // 2}-th/2:{en}")
sh(f'ffmpeg -y -v error -loop 1 -framerate {FPS} -i bg.png -i panel.mp4 -i "{spec["audio"]}" '
   f'-filter_complex "{",".join(f)}[v];[2:a]apad,atrim=0:{total}[a]" -map "[v]" -map "[a]" '
   f'-c:v libx264 -profile:v high -preset medium -crf 20 -pix_fmt yuv420p -r {FPS} '
   f'-c:a aac -b:a 192k -ar 48000 -movflags +faststart -t {total} out.mp4')
sh(f"ffmpeg -y -v error -ss {spec.get('cover_at', 0.8)} -i out.mp4 -frames:v 1 -q:v 2 cover.jpg")
print(sh("ffprobe -v error -show_entries format=duration:stream=codec_name,width,height -of compact out.mp4"))
