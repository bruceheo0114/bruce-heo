# 브런치 원문을 토큰 아끼게 읽는다(HTML 13만 자 → 본문 수천 자). 표준 라이브러리만 쓴다.
# 클라우드 루틴 환경은 brunch.co.kr 접속이 막혀 있으므로, GitHub Actions(brunch-cache.yml)가 매일
# 전체 글을 insight-reels/brunch_cache/ 에 저장해 두고 루틴은 그 캐시를 읽는다.
#   python3 brunch_text.py --list [N]   최신 글 N편(기본 10)의 번호·날짜·제목 (캐시 목록)
#   python3 brunch_text.py <글번호>      제목·부제·본문 텍스트 (캐시 → 없으면 직접 받기)
#   python3 brunch_text.py --refresh    전체 목록과 아직 없는 글을 캐시에 저장 (Actions 용)
import datetime, html, json, pathlib, re, sys, time, urllib.request

UA = {"User-Agent": "Mozilla/5.0"}
CACHE = pathlib.Path(__file__).resolve().parents[1] / "brunch_cache"
INDEX = CACHE / "index.json"
KST = datetime.timezone(datetime.timedelta(hours=9))


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def fetch_list():
    items, url = [], "https://api.brunch.co.kr/v1/article/@heoboram?listSize=20&status=home"
    while url:
        data = json.loads(get(url))["data"]
        for a in data["list"]:
            d = datetime.datetime.fromtimestamp(a["publishTime"] / 1000, KST)
            items.append({"no": a["no"], "date": f"{d:%Y-%m-%d}", "title": a["title"].strip()})
        url = data.get("nextUrl") if data.get("moreList") else None
    return items


def fetch_article(no):
    page = get(f"https://brunch.co.kr/@heoboram/{no}")
    meta = lambda k: (re.search(rf'<meta property="{k}" content="([^"]*)"', page) or [None, ""])[1]
    start = page.find('class="wrap_body')
    end = min([i for i in (page.find("wrap_body_info", start), page.find("keyword", start)) if i > 0] or [len(page)])
    body = page[start:end]
    body = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", body, flags=re.S)
    body = re.sub(r"<[^>]*$", "", body)  # 잘린 끝 태그 조각
    body = re.sub(r"<br\s*/?>|</p>|</h\d>|</li>|</blockquote>", "\n", body)
    body = html.unescape(re.sub(r"<[^>]+>", "", body))
    lines = [re.sub(r"\s+", " ", ln).strip() for ln in body.split("\n")]
    text = "\n".join(ln for ln in lines if ln and not ln.startswith(("class=", '"')))
    return f"# {html.unescape(meta('og:title'))}\n{html.unescape(meta('og:description'))}\n\n{text}\n"


def article(no):
    f = CACHE / f"{no}.txt"
    if f.exists():
        return f.read_text(encoding="utf-8")
    return fetch_article(no)  # 캐시에 없으면 직접(로컬·Actions 에서만 된다)


def refresh():
    CACHE.mkdir(exist_ok=True)
    items = fetch_list()
    INDEX.write_text(json.dumps(items, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    new = 0
    for it in items:
        f = CACHE / f"{it['no']}.txt"
        if not f.exists():
            f.write_text(fetch_article(it["no"]), encoding="utf-8")
            new += 1
            time.sleep(0.5)  # 브런치에 부담 주지 않게
    print(f"목록 {len(items)}편, 새로 저장 {new}편")


if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else "--list"
    if arg == "--refresh":
        refresh()
    elif arg == "--list":
        n = int(sys.argv[2]) if len(sys.argv) > 2 else 10
        items = json.loads(INDEX.read_text(encoding="utf-8")) if INDEX.exists() else fetch_list()
        for it in items[:n]:
            print(f"{it['no']}\t{it['date']}\t{it['title']}")
    else:
        print(article(arg), end="")
