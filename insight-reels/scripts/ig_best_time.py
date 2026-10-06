# @bruce.insight 팔로워 접속 시간대와 최근 게시물 반응을 출력한다(읽기 전용). Actions 에서 수동 실행.
import json, os, urllib.parse, urllib.request
from collections import defaultdict

HOST = os.environ.get("IG_GRAPH_HOST") or "graph.instagram.com"
API = f"https://{HOST}/{os.environ.get('IG_API_VERSION') or 'v25.0'}"
UID, TOKEN = os.environ["IG_USER_ID"], os.environ["IG_ACCESS_TOKEN"]


def get(path, **params):
    params["access_token"] = TOKEN
    try:
        with urllib.request.urlopen(f"{API}/{path}?{urllib.parse.urlencode(params)}", timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {"error": e.read().decode()[:400]}


print("== online_followers (lifetime)")
print(json.dumps(get(f"{UID}/insights", metric="online_followers", period="lifetime"), ensure_ascii=False)[:3000])

print("== recent media")
media = get(f"{UID}/media", fields="id,timestamp,media_type,like_count,comments_count", limit=30)
by_hour = defaultdict(list)
for m in media.get("data", []):
    ins = get(f"{m['id']}/insights", metric="reach,views,saved,shares")
    vals = {d["name"]: d["values"][0]["value"] for d in ins.get("data", [])} if "data" in ins else ins
    print(m["timestamp"], m["media_type"], "likes", m.get("like_count"), "comments", m.get("comments_count"), vals)
