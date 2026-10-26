# 첫 책 릴스 spec 생성기 — 힉스필드 샌드박스에서 compose.py 와 같은 폴더에서 실행한다.
# python3 build_spec.py reels.json R1  → R1/spec.json
# reels.json: 편마다 script(줄바꿈 = 자막 한 줄), title, bgm_start, scenes(이미지 3장 + 표지), motion(도식 1개), labels
import difflib, json, re, sys

HEAD = sys.argv[3] if len(sys.argv) > 3 else "main"
RAW = f"https://raw.githubusercontent.com/bruceheo0114/bruce-heo/{HEAD}"
# 자막은 아라비아 숫자(대본은 한글로 읽히게 썼다)
NUM = [("이백 편", "200편"), ("십일 년", "11년"), ("스무 개", "20개"), ("이십사 시간", "24시간"),
       ("삼백만", "300만"), ("천 개", "1,000개")]


def norm(s):
    return re.sub(r"[^0-9A-Za-z가-힣]", "", s)


def char_times(script, words):
    """대본 글자마다 말한 시각을 붙인다(받아쓰기 글자열과 맞춘다)."""
    wchars, wt = [], []
    for w in words:
        c = norm(w["word"])
        for i, ch in enumerate(c):
            wchars.append(ch)
            wt.append(w["start"] + (w["end"] - w["start"]) * i / max(len(c), 1))
    sc = norm(script)
    times = [None] * len(sc)
    for a, b, n in difflib.SequenceMatcher(None, sc, "".join(wchars), autojunk=False).get_matching_blocks():
        for k in range(n):
            times[a + k] = wt[b + k]
    # 비는 곳은 앞뒤로 채운다
    last = 0.0
    for i in range(len(times)):
        if times[i] is None:
            nxt = next((t for t in times[i:] if t is not None), last)
            times[i] = last if nxt is None else (last + nxt) / 2
        last = times[i]
    return times


def captions(script, words, end_all):
    lines = [l.strip() for l in script.split("\n") if l.strip()]
    times = char_times(script, words)
    pieces = []
    for ln in lines:
        if len(ln) > 22:  # 긴 줄은 가운데 띄어쓰기에서 둘로
            mid = len(ln) // 2
            sp = min((i for i, c in enumerate(ln) if c == " "), key=lambda i: abs(i - mid))
            pieces += [ln[:sp].strip(), ln[sp:].strip()]
        else:
            pieces.append(ln)
    caps, pos = [], 0
    for p in pieces:
        n = len(norm(p))
        st = times[pos] if pos < len(times) else end_all
        pos += n
        caps.append({"start": round(max(st - 0.05, 0), 2), "text": p})
    caps[0]["start"] = 0.0
    for i, c in enumerate(caps):
        c["end"] = round((caps[i + 1]["start"] - 0.06) if i + 1 < len(caps) else end_all, 2)
        for a, b in NUM:
            c["text"] = c["text"].replace(a, b)
        c["text"] = c["text"].rstrip(".")
    return caps


def build(cfg, words, dur):
    caps = captions(cfg["script"], words, dur)
    ends = [c["end"] for c in caps]

    def cut(t0, upto, minimum=2.5):  # t0 뒤로 upto 초 안에서 끝나는 마지막 자막 끝
        ok = [e for e in ends if t0 + minimum <= e <= t0 + upto]
        return ok[-1] if ok else min((e for e in ends if e > t0 + minimum), default=dur)

    sc = cfg["scenes"]
    t1 = cut(0, 3.6, 1.8)        # 표지 장면 3초 안팎
    t2 = cut(t1, 5.0, 3.0)       # 클립 5초 이하
    t3 = cut(t2, 7.0, 4.0)       # 도식
    t4 = cut(t3, 7.5, 4.0)       # 장면 3
    t5 = cut(t4, 6.0, 3.0) if dur - t4 > 9 else t4  # 표지 앞 장면(클립 첫 프레임 사진)
    vis = [
        {"kind": "image", "src": sc[0], "start": 0, "end": t1, "focus_y": 0.5, "xfade": "slideleft",
         "punch": [{"at": 0.6, "x": 0.5, "y": 0.5}],
         "labels": [{"at": 0.7, "text": cfg["labels"][0], "x": 0.5, "y": 0.5, "dy": -0.28, "hl": True}]},
        {"kind": "clip", "src": "clip.mp4", "start": t1, "end": t2, "focus_y": 0.5, "xfade": "fade",
         "labels": [{"at": 0.9, "text": cfg["labels"][1], "x": 0.5, "y": 0.55, "dy": -0.3, "hl": True}]},
        dict(cfg["motion"], start=t2, end=t3, xfade="slideup"),
        {"kind": "image", "src": sc[2], "start": t3, "end": t4, "focus_y": 0.5, "zoom": "in", "xfade": "fade",
         "spot": {"at": 1.6, "x": 0.5, "y": 0.5, "r": 0.22},
         "labels": [{"at": 1.8, "text": cfg["labels"][2], "x": 0.5, "y": 0.5, "dy": 0.28, "hl": True}]},
        {"kind": "image", "src": sc[1], "start": t4, "end": t5, "focus_y": 0.5, "zoom": "out", "xfade": "slideleft"},
        {"kind": "image", "src": "../img/cover.jpg", "start": t5, "end": dur, "focus_y": 0.42, "xfade": "fadeblack",
         "punch": [{"at": 0.8, "x": 0.5, "y": 0.45}]},
        {"kind": "card", "start": dur, "end": round(dur + 2.0, 2)},
    ]
    vis = [v for v in vis if v["end"] > v["start"]]
    return {
        "audio": "v.mp3",
        "series": "브루스 인사이트  |  첫 책 이야기",
        "title": cfg["title"],
        "card": {"line1": "지금 판매 중", "line2": "YES24 · 교보문고 (프로필 링크)"},
        "visuals": vis,
        "bgm": f"{RAW}/bruce-youtube/channel/bgm/bgm.mp3",
        "bgm_start": cfg["bgm_start"],
        "sfx_base": f"{RAW}/bruce-youtube/channel/sfx/",
        "captions": caps,
        "words": words,
    }


if __name__ == "__main__":
    cfgs = json.load(open(sys.argv[1]))
    r = sys.argv[2]
    words = json.load(open(f"{r}/words.json"))
    import subprocess
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f"{r}/v.mp3"],
                               capture_output=True, text=True).stdout.strip())
    spec = build(cfgs[r], words, round(dur, 2))
    json.dump(spec, open(f"{r}/spec.json", "w"), ensure_ascii=False, indent=1)
    print(r, dur, [(v["kind"], v["start"], v["end"]) for v in spec["visuals"]])
    for c in spec["captions"]:
        print(f'  {c["start"]:5.2f}-{c["end"]:5.2f} {c["text"]}')
