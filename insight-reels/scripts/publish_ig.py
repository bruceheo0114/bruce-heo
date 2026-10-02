# 오늘 날짜(KST)의 posts/YYYY-MM-DD.json 을 인스타그램 릴스로 게시한다.
# GitHub Actions 에서 실행. 표준 라이브러리만 사용.
# 필요: secrets IG_USER_ID, IG_ACCESS_TOKEN / vars IG_MENTION(선택), IG_GRAPH_HOST(선택, 기본 graph.facebook.com)
import datetime, json, os, pathlib, sys, time, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
HOST = os.environ.get("IG_GRAPH_HOST") or "graph.facebook.com"
API = f"https://{HOST}/v23.0"
UID, TOKEN = os.environ.get("IG_USER_ID"), os.environ.get("IG_ACCESS_TOKEN")
MENTION = (os.environ.get("IG_MENTION") or "").strip().lstrip("@")


def call(method, path, **params):
    params["access_token"] = TOKEN
    data = urllib.parse.urlencode(params).encode()
    url = f"{API}/{path}"
    if method == "GET":
        req = urllib.request.Request(f"{url}?{data.decode()}")
    else:
        req = urllib.request.Request(url, data=data, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"Graph API 오류 {e.code}: {e.read().decode()[:500]}")


today = os.environ.get("POST_DATE") or (datetime.datetime.utcnow() + datetime.timedelta(hours=9)).strftime("%Y-%m-%d")
f = ROOT / "posts" / f"{today}.json"
if not f.exists():
    print(f"{today}: 예약된 게시물 없음")
    sys.exit(0)
post = json.loads(f.read_text(encoding="utf-8"))
if post.get("status") != "scheduled":
    print(f"{today}: status={post.get('status')} — 게시하지 않음")
    sys.exit(0)
if not (UID and TOKEN):
    sys.exit("IG_USER_ID / IG_ACCESS_TOKEN 시크릿이 없습니다")

caption = post["caption"]
if MENTION and f"@{MENTION}" not in caption:
    caption += f"\n\nby @{MENTION}"

params = dict(media_type="REELS", video_url=post["video_url"], caption=caption, share_to_feed="true")
if post.get("cover_url"):
    params["cover_url"] = post["cover_url"]
container = call("POST", f"{UID}/media", **params)["id"]

for _ in range(40):  # 최대 약 10분 대기
    st = call("GET", container, fields="status_code,status").get("status_code")
    if st == "FINISHED":
        break
    if st in ("ERROR", "EXPIRED"):
        sys.exit(f"컨테이너 처리 실패: {st}")
    time.sleep(15)
else:
    sys.exit("컨테이너 처리 시간 초과")

media_id = call("POST", f"{UID}/media_publish", creation_id=container)["id"]
link = call("GET", media_id, fields="permalink").get("permalink", "")
post.update(status="posted", media_id=media_id, permalink=link,
            posted_at=datetime.datetime.utcnow().isoformat() + "Z")
f.write_text(json.dumps(post, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"게시 완료: {link}")
