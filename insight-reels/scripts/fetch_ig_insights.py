# @bruce.insight 인스타 계정·게시물 성과 + 유튜브 공개 지표를 insight-reels/metrics/YYYY-MM-DD.json 으로 저장한다(KST 날짜).
# 유튜브는 인증 없이 보이는 숫자만(채널 RSS의 영상별 조회·좋아요, 채널 페이지의 구독자 수). CTR·유지율은 YouTube Studio 에서만 보인다.
# GitHub Actions 에서 실행. 표준 라이브러리만 사용. 필요: secrets IG_USER_ID, IG_ACCESS_TOKEN
# 토큰에 instagram_business_manage_insights 권한이 없으면 지표 자리에 오류 메시지가 남는다.
import datetime, json, os, pathlib, re, urllib.error, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
HOST = os.environ.get("IG_GRAPH_HOST") or "graph.instagram.com"
API = f"https://{HOST}/{os.environ.get('IG_API_VERSION') or 'v25.0'}"
UID, TOKEN = os.environ.get("IG_USER_ID"), os.environ.get("IG_ACCESS_TOKEN")
YT_CHANNEL = os.environ.get("YT_CHANNEL_ID") or "UCCRzzl43nHs5bwfJzqupylw"
MEDIA_METRICS = ["reach", "views", "likes", "comments", "saved", "shares", "total_interactions", "follows", "profile_visits", "ig_reels_avg_watch_time"]


def get(path, **params):
    params["access_token"] = TOKEN
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {"error": f"{e.code}: {e.read().decode()[:300]}"}


def values(res):
    return {m["name"]: (m.get("values") or [{}])[0].get("value", m.get("total_value", {}).get("value")) for m in res.get("data", [])}


def media_insights(mid):
    # 게시물 종류마다 지원 지표가 달라 하나씩 묻는다(지원 안 하는 지표는 건너뜀)
    out = {}
    for m in MEDIA_METRICS:
        res = get(f"{mid}/insights", metric=m)
        if "error" not in res:
            out.update(values(res))
    return out


def fetch_text(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept-Language": "ko-KR,ko;q=0.9"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")


def youtube():
    out = {"channel_id": YT_CHANNEL, "videos": []}
    try:
        feed = fetch_text(f"https://www.youtube.com/feeds/videos.xml?channel_id={YT_CHANNEL}")
        for entry in re.findall(r"<entry>(.*?)</entry>", feed, re.S):
            pick = lambda pat: (re.search(pat, entry, re.S) or [None, None])[1]
            out["videos"].append({"id": pick(r"<yt:videoId>(.*?)</yt:videoId>"), "title": pick(r"<title>(.*?)</title>"),
                                  "published": pick(r"<published>(.*?)</published>"),
                                  "views": int(pick(r'views="(\d+)"') or 0), "likes": int(pick(r'starRating count="(\d+)"') or 0)})
    except Exception as e:  # 유튜브가 막혀도 인스타 기록은 남긴다
        out["error"] = f"rss: {e}"
    try:
        page = fetch_text(f"https://www.youtube.com/channel/{YT_CHANNEL}")
        m = re.search(r'"subscriberCountText".{0,200}?"(?:simpleText|content)":"([^"]+)"', page) or re.search(r'구독자\s*([0-9.,천만]+명)', page)
        out["subscribers_text"] = m.group(1) if m else None
    except Exception as e:
        out["subscribers_error"] = str(e)
    return out


def main():
    if not (UID and TOKEN):
        raise SystemExit("IG_USER_ID / IG_ACCESS_TOKEN 시크릿이 없습니다")
    account = get(UID, fields="username,followers_count,follows_count,media_count")
    acct_ins = get(f"{UID}/insights", metric="reach,views,profile_views,follows_and_unfollows,accounts_engaged,total_interactions",
                   period="day", metric_type="total_value",
                   since=int((datetime.datetime.now() - datetime.timedelta(days=7)).timestamp()), until=int(datetime.datetime.now().timestamp()))
    media = get(f"{UID}/media", fields="id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count", limit=50)
    posts = []
    for m in media.get("data", []):
        posts.append({"timestamp": m.get("timestamp"), "type": m.get("media_product_type") or m.get("media_type"),
                      "permalink": m.get("permalink"), "first_line": (m.get("caption") or "").split("\n")[0][:60],
                      "like_count": m.get("like_count"), "comments_count": m.get("comments_count"),
                      "insights": media_insights(m["id"])})
    today = (datetime.datetime.utcnow() + datetime.timedelta(hours=9)).date().isoformat()
    data = {"fetched_at": datetime.datetime.utcnow().isoformat() + "Z", "account": account,
            "account_last_7d": values(acct_ins) if "error" not in acct_ins else acct_ins,
            "media_error": media.get("error"), "posts": posts, "youtube": youtube()}
    path = ROOT / "metrics" / f"{today}.json"
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(data, ensure_ascii=False, indent=2))


main()
