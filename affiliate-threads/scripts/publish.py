"""Independent, text-only Coupang affiliate publisher; Python standard library."""
import argparse
import datetime as dt
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
API = "https://graph.threads.com/v1.0"
DISCLOSURE = "[광고] 이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다."
EXCLUDED = {"heo.boram", "bruce.insight", "work_bruce"}
KST = dt.timezone(dt.timedelta(hours=9))


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def check_account(config, profile):
    expected = config.get("username", "").lstrip("@").lower()
    actual = profile.get("username", "").lstrip("@").lower()
    user_id = str(config.get("user_id", ""))
    if not expected or expected in EXCLUDED or config.get("channel") != "threads_only":
        raise ValueError("쿠팡 전용 Threads 계정 설정이 필요합니다.")
    if not user_id.isdigit():
        raise ValueError("새 Threads 계정의 user_id를 먼저 등록하세요.")
    if actual != expected or str(profile.get("id", "")) != user_id:
        raise ValueError("토큰의 계정이 쿠팡 전용 username/user_id와 다릅니다. 게시 중단.")


def text_length(text):
    # Conservatively count symbols/emoji as UTF-8 bytes, ordinary Korean as characters.
    return sum(len(c.encode("utf-8")) if unicodedata.category(c) == "So"
               or ord(c) > 0xFFFF or c in "\u200d\ufe0f" else 1 for c in text)


def compose(post):
    body = post.get("body", "").strip()
    link = post.get("affiliate_url", "").strip()
    if not body or not post.get("source_url") or not post.get("verified_at"):
        raise ValueError("본문·상품 확인 출처·확인 시각이 필요합니다.")
    url = urllib.parse.urlsplit(link)
    if url.scheme != "https" or url.hostname != "link.coupang.com" or not url.path.startswith("/a/"):
        raise ValueError("쿠팡 파트너스에서 발급한 https://link.coupang.com/a/... 링크가 필요합니다.")
    if url.username or url.password or re.search(r"https?://|www\.", body, re.I):
        raise ValueError("본문에는 별도 URL을 넣지 마세요. 제휴 링크는 affiliate_url 한 곳에 둡니다.")
    if "제공받을 수" in body or "지급받을 수" in body:
        raise ValueError("불확정적인 대가성 표시를 사용하지 마세요.")
    text = f"{DISCLOSURE}\n\n{body}\n\n{link}"
    if text_length(text) > 500:
        raise ValueError("광고 표시·본문·링크를 합쳐 Threads 500자 한도를 넘었습니다.")
    return text


class Threads:
    def __init__(self, token):
        if not token:
            raise ValueError("COUPANG_THREADS_ACCESS_TOKEN 시크릿이 필요합니다.")
        self.token = token

    def call(self, method, path, **params):
        params["access_token"] = self.token
        encoded = urllib.parse.urlencode(params).encode()
        url = f"{API}/{path}"
        request = urllib.request.Request(url + "?" + encoded.decode()) if method == "GET" else urllib.request.Request(url, data=encoded, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            # Do not print raw API responses or exception URLs containing credentials.
            raise RuntimeError(f"Threads API HTTP {error.code}; 토큰·권한·게시 상태를 확인하세요.") from None
        except Exception:
            raise RuntimeError("Threads API 통신 결과를 확정할 수 없습니다. 자동 재게시하지 않습니다.") from None


def save_state(path, state):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(path)
    if os.environ.get("COUPANG_GIT_CHECKPOINT") == "true":
        # Persist the intent BEFORE each external mutation. If a runner dies, the
        # next run stops at the persisted in-flight state instead of duplicating it.
        repo = ROOT.parent
        relative = path.relative_to(repo).as_posix()
        subprocess.run(["git", "add", "--", relative], cwd=repo, check=True)
        diff = subprocess.run(["git", "diff", "--cached", "--quiet", "--", relative], cwd=repo)
        if diff.returncode == 1:
            subprocess.run(["git", "commit", "-m", "chore: checkpoint affiliate thread", "--", relative], cwd=repo, check=True)
            subprocess.run(["git", "push", "origin", "HEAD:main"], cwd=repo, check=True)
        elif diff.returncode:
            raise RuntimeError("게시 상태 체크포인트를 저장하지 못했습니다.")


def publish(config, post, state_path, client, save=save_state, sleep=time.sleep):
    if not config.get("enabled") or os.environ.get("COUPANG_THREADS_ENABLED") != "true":
        raise ValueError("계정 연결과 가입 완료 후 두 활성화 설정을 켜야 게시할 수 있습니다.")
    if post.get("status") != "scheduled":
        raise ValueError("status=scheduled인 원고만 게시할 수 있습니다.")
    text = compose(post)
    profile = client.call("GET", "me", fields="id,username")
    check_account(config, profile)
    identity = str(profile["id"])
    digest = hashlib.sha256((identity + "\n" + text).encode()).hexdigest()
    state = read_json(state_path) if state_path.exists() else {}
    if state and state.get("digest") != digest:
        raise ValueError("체크포인트 원고·계정이 변경됐습니다. 수동 확인이 필요합니다.")
    if state.get("stage") == "posted":
        print("이미 게시된 원고입니다. 추가 게시 없음.")
        return state
    if state.get("stage") in {"creating", "publishing", "needs_review"}:
        raise ValueError("직전 실행 결과가 불확실합니다. Threads에서 확인 후 상태를 수동 복구하세요.")
    if not state:
        state = {"digest": digest, "user_id": identity, "stage": "creating"}
        save(state_path, state)
        try:
            state["container_id"] = client.call("POST", f"{identity}/threads", media_type="TEXT", text=text)["id"]
        except Exception:
            state["stage"] = "needs_review"
            save(state_path, state)
            raise
        state["stage"] = "container"
        save(state_path, state)
    if state.get("stage") != "container" or not state.get("container_id"):
        raise ValueError("알 수 없는 게시 상태입니다. 수동 확인이 필요합니다.")
    sleep(30)
    state["stage"] = "publishing"
    save(state_path, state)
    try:
        state["media_id"] = client.call("POST", f"{identity}/threads_publish", creation_id=state["container_id"])["id"]
    except Exception:
        state["stage"] = "needs_review"
        save(state_path, state)
        raise
    state.update(stage="posted", posted_at=dt.datetime.now(dt.timezone.utc).isoformat())
    save(state_path, state)
    print("쿠팡 전용 Threads 게시 완료:", state["media_id"])
    return state


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["validate", "check", "dry-run", "publish"], default="dry-run")
    parser.add_argument("--date", default=dt.datetime.now(KST).strftime("%Y-%m-%d"))
    args = parser.parse_args()
    config = read_json(ROOT / "config.json")
    if args.mode == "check":
        client = Threads(os.environ.get("COUPANG_THREADS_ACCESS_TOKEN"))
        profile = client.call("GET", "me", fields="id,username")
        check_account(config, profile)
        print("쿠팡 전용 계정 일치 확인:", profile["username"], profile["id"])
        return
    if args.mode == "validate":
        files = list((ROOT / "posts").glob("????-??-??.json"))
        for path in files:
            post = read_json(path)
            if post.get("status") == "scheduled":
                compose(post)
        print(f"원고 검사 완료: {len(files)}개 파일")
        return
    dt.date.fromisoformat(args.date)
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.date):
        raise ValueError("YYYY-MM-DD 형식만 사용할 수 있습니다.")
    path = ROOT / "posts" / f"{args.date}.json"
    if not path.exists():
        print("이 날짜의 원고 없음. 게시 없음.")
        return
    post = read_json(path)
    if post.get("status") != "scheduled":
        print("예약 승인된 원고 아님. 게시 없음.")
        return
    text = compose(post)
    if args.mode == "dry-run":
        print(text)
        print(f"\n검사 길이: {text_length(text)}/500, API 호출 없음")
        return
    client = Threads(os.environ.get("COUPANG_THREADS_ACCESS_TOKEN"))
    publish(config, post, ROOT / "state" / f"{args.date}.json", client)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
