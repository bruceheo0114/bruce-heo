# 오늘 날짜(KST)의 threads/posts/YYYY-MM-DD.json 을 @heo.boram 스레드에 올린다.
# 본문 → replies(댓글 타래, 각각 바로 앞 글에 이어 단다) → reply_text(원문 링크) 순서.
# 중간에 실패해도 올린 부분은 파일에 기록돼, 다시 실행하면 이어서 올린다(중복 게시 방지).
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
chain = [post["text"], *post.get("replies", [])]
if post.get("reply_text"):  # 원문 링크는 본문이 아니라 타래 마지막 댓글로
    chain.append(post["reply_text"])
for i, t in enumerate(chain):
    if len(t) > 500:
        sys.exit(f"{'본문' if i == 0 else f'댓글 {i}'}이 {len(t)}자입니다(500자 제한)")


def save():
    f.write_text(json.dumps(post, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if not post.get("media_id"):
    extra = {"topic_tag": post["topic_tag"]} if post.get("topic_tag") else {}
    post["media_id"] = publish(post["text"], **extra)
    post["permalink"] = call("GET", post["media_id"], fields="permalink").get("permalink", "")
    save()
    print("본문 게시:", post["permalink"])
else:
    print("본문은 이미 게시됨 — 남은 댓글부터 이어서:", post.get("permalink", ""))

ids = post.setdefault("reply_ids", [])
for t in chain[1 + len(ids):]:
    ids.append(publish(t, reply_to_id=ids[-1] if ids else post["media_id"]))
    save()
    print(f"댓글 {len(ids)}/{len(chain) - 1} 게시:", ids[-1])

post.update(status="posted", posted_at=datetime.datetime.utcnow().isoformat() + "Z")
save()
print(f"게시 완료: {post['permalink']}")
