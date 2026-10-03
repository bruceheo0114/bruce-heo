# 브런치 원문을 토큰 아끼게 읽는다(HTML 13만 자 → 본문 수천 자). 표준 라이브러리만 쓴다.
#   python3 brunch_text.py --list [N]   최신 글 N편(기본 10)의 번호·날짜·제목
#   python3 brunch_text.py <글번호>      제목·부제·본문 텍스트
import datetime, html, json, re, sys, urllib.request

UA = {"User-Agent": "Mozilla/5.0"}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def recent(n):
    data = json.loads(get(f"https://api.brunch.co.kr/v1/article/@heoboram?listSize={n}&status=home"))
    for a in data["data"]["list"]:
        d = datetime.datetime.fromtimestamp(a["publishTime"] / 1000, datetime.timezone(datetime.timedelta(hours=9)))
        print(f'{a["no"]}\t{d:%Y-%m-%d}\t{a["title"].strip()}')


def article(no):
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
    print(f"# {html.unescape(meta('og:title'))}\n{html.unescape(meta('og:description'))}\n\n{text}")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--list":
        recent(int(sys.argv[2]) if len(sys.argv) > 2 else 10)
    else:
        article(sys.argv[1])
