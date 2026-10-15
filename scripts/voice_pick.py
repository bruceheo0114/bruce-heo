# 복제 목소리 테이크 고르기 + 음량 맞추기 (EP005 5차에서 만듦 — eleven_v4 챕터마다 2테이크)
# usage: python3 scripts/voice_pick.py --out <폴더> [--name EP005_] [--lufs -23] CH01_a.mp3 CH01_b.mp3 CH02_a.mp3 ...
#   파일 이름의 '_' 앞(CH01)이 같은 것끼리 비교해, 음높이가 크게 튀는 비율(중앙값 ±7반음 밖)이 가장 적은 테이크를 고른다.
#   고른 테이크를 --lufs 로 맞춰 <out>/<name><CH01>.mp3 로 저장하고, 옆의 .words.json 도 같은 이름으로 복사한다.
#   음높이 중앙값이 챕터끼리 1.5반음 넘게 다르면 경고한다(사람이 듣고 판단).
import argparse, collections, os, re, shutil, subprocess, sys
import numpy as np


def stats(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], capture_output=True).stdout
    x = np.frombuffer(raw, np.int16).astype(float) / 32768
    ps = []
    for k in range(0, len(x) - 640, 320):
        w = x[k:k + 640] * np.hanning(640)
        if np.sqrt((w ** 2).mean()) < 0.01:
            continue
        ac = np.correlate(w, w, "full")[639:]
        p = 53 + np.argmax(ac[53:228])
        if ac[p] > 0.4 * ac[0]:
            ps.append(16000 / p)
    ps = np.array(ps)
    st = 12 * np.log2(ps / np.median(ps))
    log = subprocess.run(["ffmpeg", "-hide_banner", "-i", path, "-af", "silencedetect=n=-40dB:d=0.15,ebur128", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    pauses = [float(v) for v in re.findall(r"silence_duration: ([\d.]+)", log)]
    lufs = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", log)[-1])
    return {"f0": float(np.median(ps)), "jumpy": float((np.abs(st) > 7).mean() * 100), "pauses": len(pauses),
            "pause_mean": float(np.mean(pauses)) if pauses else 0.0, "lufs": lufs, "seconds": len(x) / 16000}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--name", default="")
    ap.add_argument("--lufs", type=float, default=-23.0)
    ap.add_argument("takes", nargs="+")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    groups = collections.OrderedDict()
    for t in a.takes:
        groups.setdefault(os.path.basename(t).split("_")[0], []).append(t)
    chosen = {}
    for ch, takes in groups.items():
        rows = [(t, stats(t)) for t in takes]
        for t, s in rows:
            print(f"{os.path.basename(t):14s} {s['seconds']:6.1f}s f0 {s['f0']:4.0f}Hz 튐 {s['jumpy']:4.1f}% 쉼 {s['pauses']:2d}곳 평균 {s['pause_mean']:.2f}s {s['lufs']:.1f} LUFS")
        best, s = min(rows, key=lambda r: r[1]["jumpy"])
        chosen[ch] = s["f0"]
        dst = os.path.join(a.out, f"{a.name}{ch}.mp3")
        gain = a.lufs - s["lufs"]
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", best, "-af", f"volume={gain:.2f}dB", "-c:a", "libmp3lame", "-b:a", "192k", dst], check=True)
        words = re.sub(r"\.[^.]+$", ".words.json", best)
        if os.path.exists(words):
            shutil.copy(words, re.sub(r"\.mp3$", ".words.json", dst))
        print(f"→ {ch}: {os.path.basename(best)} ({gain:+.1f}dB) → {dst}")
    if len(chosen) > 1:
        lo, hi = min(chosen.values()), max(chosen.values())
        spread = 12 * np.log2(hi / lo)
        print(f"챕터 음높이 차 {spread:.1f}반음" + (" — 1.5반음 초과: 높은 챕터를 한 번 더 생성하거나 듣고 판단" if spread > 1.5 else ""))


if __name__ == "__main__":
    sys.exit(main())
