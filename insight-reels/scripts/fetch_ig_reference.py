# 참고용 인스타그램 공개 게시물(링크)의 이미지·캡션을 insight-reels/references/<shortcode>/ 에 저장한다.
# GitHub Actions 에서 실행(로그인 없이 보이는 embed 페이지만 쓴다). 사용: python3 fetch_ig_reference.py <url> [<url> ...]
import html, json, pathlib, re, sys, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1] / "references"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def main():
    for url in sys.argv[1:]:
        m = re.search(r"instagram\.com/(?:p|reel)/([A-Za-z0-9_-]+)", url)
        if not m:
            print("건너뜀:", url)
            continue
        code = m.group(1)
        out = ROOT / code
        out.mkdir(parents=True, exist_ok=True)
        page = get(f"https://www.instagram.com/p/{code}/embed/captioned/").decode("utf-8", "replace")
        (out / "embed.html").write_text(page)
        text = page.replace("\\/", "/").replace("\\u0026", "&")
        urls = []
        for u in re.findall(r'https://[^"\s\']+?\.(?:jpg|webp|heic)[^"\s\']*', text):
            u = html.unescape(u)
            if ("cdninstagram" in u or "fbcdn" in u) and "s150x150" not in u and "profile" not in u and u not in urls:
                urls.append(u)
        caption = re.search(r'class="Caption"[^>]*>(.*?)</div>', page, re.S)
        cap = re.sub(r"<[^>]+>", "\n", caption.group(1)) if caption else ""
        meta = {"url": url, "shortcode": code, "caption": html.unescape(re.sub(r"\n\s*\n+", "\n", cap)).strip(), "images": []}
        for i, u in enumerate(urls[:20], 1):
            try:
                data = get(u)
            except Exception as e:
                print("이미지 실패", u[:80], e)
                continue
            if len(data) < 8000:
                continue
            name = f"{i:02d}.jpg"
            (out / name).write_bytes(data)
            meta["images"].append({"file": name, "src": u.split("?")[0][-80:], "bytes": len(data)})
        (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")
        print(code, "이미지", len(meta["images"]), "캡션", len(meta["caption"]))


main()
