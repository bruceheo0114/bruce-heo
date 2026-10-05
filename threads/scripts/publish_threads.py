# 오늘 날짜(KST)의 threads/posts/YYYY-MM-DD.json 을 @heo.boram 스레드에 올린다(본문 + 원문 링크 첫 댓글).
# GitHub Actions(threads-publish.yml)에서 실행. 표준 라이브러리만 사용.
# 필요: secrets THREADS_ACCESS_TOKEN (@heo.boram 장기 토큰, 60일)
import datetime, json, os, pathlib, sys, time, urllib.error, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
API = "https://graph.threads.net/v1.0"
TOKEN = os.environ.get("THREADS_ACCESS_TOKEN")


def call(method, path, **params):
    params["access_token"] = TOKEN
    data = urllib.parse.urlencode(params).encode()
    url = f"{API}/{path}"
    req = urllib.request.Request(f"{url}?{data.decode()}") if method == "GET" else urllib.request.Request(url, data=data, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"Threads API 오류 {e.code}: {e.read().decode()[:500]}")


def publish(text, **extra):
    # 컨테이너 생성 → 권장 대기(평균 30초) → 게시
    cid = call("POST", "me/threads", media_type="TEXT", text=text, **extra)["id"]
    time.sleep(30)
    return call("POST", "me/threads_publish", creation_id=cid)["id"]


if not TOKEN:
    sys.exit("THREADS_ACCESS_TOKEN 시크릿이 없습니다")

if os.environ.get("CHECK_ONLY") == "true":
    me = call("GET", "me", fields="id,username,name")
    print("토큰 정상:", json.dumps(me, ensure_ascii=False))
    sys.exit(0)

today = os.environ.get("POST_DATE") or (datetime.datetime.utcnow() + datetime.timedelta(hours=9)).strftime("%Y-%m-%d")
f = ROOT / "posts" / f"{today}.json"
if not f.exists():
    print(f"{today}: 예약된 스레드 없음")
    sys.exit(0)
post = json.loads(f.read_text(encoding="utf-8"))
if post.get("status") != "scheduled":
    print(f"{today}: status={post.get('status')} — 게시하지 않음")
    sys.exit(0)
if len(post["text"]) > 500:
    sys.exit(f"본문이 {len(post['text'])}자입니다(500자 제한)")

extra = {"topic_tag": post["topic_tag"]} if post.get("topic_tag") else {}
post_id = publish(post["text"], **extra)
link = call("GET", post_id, fields="permalink").get("permalink", "")
print("본문 게시:", link)
if post.get("reply_text"):  # 원문 링크는 본문이 아니라 첫 댓글로
    post["reply_id"] = publish(post["reply_text"], reply_to_id=post_id)
    print("댓글 게시:", post["reply_id"])
post.update(status="posted", media_id=post_id, permalink=link,
            posted_at=datetime.datetime.utcnow().isoformat() + "Z")
f.write_text(json.dumps(post, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"게시 완료: {link}")
