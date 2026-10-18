# 오늘 날짜(KST)의 posts/YYYY-MM-DD.json 을 인스타그램에 게시한다. type 이 carousel 이면 캐러셀, 아니면 릴스.
# GitHub Actions 에서 실행. 표준 라이브러리만 사용.
# 필요: secrets IG_USER_ID, IG_ACCESS_TOKEN / vars IG_MENTION(선택), IG_GRAPH_HOST(선택), IG_AI_LABEL(선택)
# 기본은 Instagram 로그인 방식(graph.instagram.com) — 페이스북 페이지 연결 없이 게시 가능.
# 페이스북 로그인 방식 토큰이면 IG_GRAPH_HOST=graph.facebook.com 으로 바꾼다.
import datetime, json, os, pathlib, re, sys, time, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
HOST = os.environ.get("IG_GRAPH_HOST") or "graph.instagram.com"
API = f"https://{HOST}/{os.environ.get('IG_API_VERSION') or 'v25.0'}"
AI_LABEL = (os.environ.get("IG_AI_LABEL") or "true").lower() != "false"
UID, TOKEN = os.environ.get("IG_USER_ID"), os.environ.get("IG_ACCESS_TOKEN")
MENTION = (os.environ.get("IG_MENTION") or "").strip().lstrip("@")


def call(method, path, soft=False, **params):
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
        msg = f"Graph API 오류 {e.code}: {e.read().decode()[:500]}"
        if soft:
            print(msg)
            return None
        sys.exit(msg)


if os.environ.get("CHECK_ONLY") == "true":  # 게시 없이 토큰·계정만 확인
    if not (UID and TOKEN):
        sys.exit("IG_USER_ID / IG_ACCESS_TOKEN 시크릿이 없습니다")
    me = call("GET", "me", fields="user_id,username,account_type")
    lim = call("GET", f"{UID}/content_publishing_limit", fields="quota_usage,config")
    print("토큰 정상:", json.dumps(me, ensure_ascii=False))
    print("게시 한도:", json.dumps(lim, ensure_ascii=False))
    sys.exit(0)

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

KIND = post.get("type", "reel")


def sign(caption):
    # 글쓴이 서명형: "원문은…" 줄 바로 위(없으면 해시태그 줄 위, 그것도 없으면 맨 끝)에 서명 한 줄
    if not MENTION or f"@{MENTION}" in caption:
        return caption
    who = "글" if KIND == "carousel" else "글·목소리"  # 카드뉴스엔 클론 음성이 없다
    line = f"✍️ {who} 마케터 브루스 @{MENTION}"
    rows = caption.split("\n")
    for i, r in enumerate(rows):
        if re.match(r"^\W*원문은", r):  # "원문은…" 과 "🔍 원문은…" 모두
            return "\n".join(rows[:i] + [line] + rows[i:])
    for i, r in enumerate(rows):
        if r.startswith("#"):
            return "\n".join(rows[:i] + [line, ""] + rows[i:])
    return caption + "\n\n" + line


caption = sign(post["caption"])

def alive(url):
    # 힉스필드 CDN 링크가 사라졌으면 저장소 사본(bruceheo.com)으로 대체한다
    try:
        with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=30) as r:
            return r.status == 200
    except Exception:
        return False


def reel_container():
    video = post["video_url"] if alive(post["video_url"]) else post.get("video_backup_url")
    if not video:
        sys.exit("영상 URL 이 모두 죽었습니다")
    print("영상:", video)
    params = dict(media_type="REELS", video_url=video, caption=caption, share_to_feed="true")
    cover = post.get("cover_url") if post.get("cover_url") and alive(post["cover_url"]) else post.get("cover_backup_url")
    if cover:
        params["cover_url"] = cover
    if AI_LABEL:
        params["is_ai_generated"] = "true"  # AI 이미지·클론 음성 사용 자기 표시
    return call("POST", f"{UID}/media", **params)["id"]


def carousel_container():
    # 장마다 is_carousel_item 컨테이너 → CAROUSEL 컨테이너(children 은 쉼표로 이은 ID, 2~10장)
    imgs, backs = post.get("images") or [], post.get("images_backup") or []
    if not 2 <= len(imgs) <= 10:
        sys.exit(f"캐러셀 이미지가 {len(imgs)}장입니다(2~10장 필요)")
    kids = []
    for i, url in enumerate(imgs):
        if not alive(url) and i < len(backs):
            url = backs[i]  # Pages 배포가 늦으면 raw.githubusercontent 사본
        kids.append(call("POST", f"{UID}/media", image_url=url, is_carousel_item="true")["id"])
    print(f"카드 {len(kids)}장 컨테이너 생성")
    params = dict(media_type="CAROUSEL", children=",".join(kids), caption=caption)
    if AI_LABEL:  # 캐러셀에서 이 필드를 거부하면 표시 없이 다시 만든다
        made = call("POST", f"{UID}/media", soft=True, is_ai_generated="true", **params)
        if made:
            return made["id"]
        print("is_ai_generated 없이 재시도")
    return call("POST", f"{UID}/media", **params)["id"]


container = carousel_container() if KIND == "carousel" else reel_container()

for _ in range(10):  # Meta 권장: 1분에 한 번, 최대 약 10분
    st = call("GET", container, fields="status_code,status").get("status_code")
    if st == "FINISHED":
        break
    if st in ("ERROR", "EXPIRED"):
        sys.exit(f"컨테이너 처리 실패: {st}")
    time.sleep(60)
else:
    sys.exit("컨테이너 처리 시간 초과")

media_id = call("POST", f"{UID}/media_publish", creation_id=container)["id"]
link = call("GET", media_id, fields="permalink").get("permalink", "")
post.update(status="posted", media_id=media_id, permalink=link,
            posted_at=datetime.datetime.utcnow().isoformat() + "Z")
f.write_text(json.dumps(post, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"게시 완료: {link}")
