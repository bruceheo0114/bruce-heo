# 게시 전 선점: 같은 날 게시 실행이 둘 이상 돌아도(예약 실행 + 게시 시계 실행) 한 번만 올리게 한다.
# 오늘 posts 파일이 scheduled 면 status=publishing, claimed_by=<실행 ID> 로 바꿔 main 에 푸시한다.
# git push 는 하나만 성공하므로, 푸시에 실패하면 최신 main 을 다시 받아 상태부터 다시 본다.
#   claim   → GITHUB_OUTPUT 에 claimed=true|false
#   release → 게시에 실패했을 때 publishing 을 scheduled 로 되돌린다(다음 실행이 다시 시도)
# GitHub Actions(insight-reels-publish.yml)에서 실행. 표준 라이브러리만 사용.
import datetime, json, os, pathlib, re, subprocess, sys, time

ROOT = pathlib.Path(__file__).resolve().parents[1]
RUN_ID = os.environ.get("GITHUB_RUN_ID", "local")


def git(*args, check=True):
    return subprocess.run(["git", *args], check=check, capture_output=True, text=True)


def post_file():
    today = os.environ.get("POST_DATE") or (datetime.datetime.utcnow() + datetime.timedelta(hours=9)).strftime("%Y-%m-%d")
    slot = (os.environ.get("POST_SLOT") or "").strip()
    if slot and not re.fullmatch(r"[a-z]+", slot):
        sys.exit(f"POST_SLOT 은 영문 소문자만: {slot!r}")
    return ROOT / "posts" / (f"{today}.{slot}.json" if slot else f"{today}.json")


def output(claimed):
    with open(os.environ.get("GITHUB_OUTPUT", os.devnull), "a") as out:
        out.write(f"claimed={'true' if claimed else 'false'}\n")


def update(change, message):
    # change(post) 가 False 를 돌려주면 바꿀 게 없다는 뜻. 푸시가 밀리면 최신 main 에서 다시 판단한다.
    f = post_file()
    git("config", "user.name", "bruce-content-bot")
    git("config", "user.email", "bruce-content-bot@users.noreply.github.com")
    for attempt in range(6):
        git("fetch", "-q", "origin", "main")
        git("reset", "-q", "--hard", "origin/main")
        if not f.exists():
            print(f"{f.name}: 예약된 게시물 없음")
            return False
        post = json.loads(f.read_text(encoding="utf-8"))
        if change(post) is False:
            return False
        f.write_text(json.dumps(post, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        git("add", str(f))
        git("commit", "-q", "-m", message)
        if git("push", "-q", "origin", "HEAD:main", check=False).returncode == 0:
            return True
        print(f"푸시 밀림 — 최신 상태로 다시 확인 ({attempt + 1})")
        time.sleep(3 + attempt * 2)
    sys.exit("선점 푸시를 6번 실패했습니다")


def claim(post):
    if post.get("status") != "scheduled":
        print(f"status={post.get('status')} — 다른 실행이 이미 맡았거나 게시할 상태가 아님")
        return False
    post.update(status="publishing", claimed_by=RUN_ID,
                claimed_at=datetime.datetime.utcnow().isoformat() + "Z")


def release(post):
    if post.get("status") != "publishing" or post.get("claimed_by") != RUN_ID:
        return False
    post["status"] = "scheduled"
    post.pop("claimed_by", None)
    post.pop("claimed_at", None)


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "claim"
    if mode == "claim":
        ok = update(claim, f"chore: claim insight post ({RUN_ID})")
        print("선점 성공 — 이 실행이 게시한다" if ok else "선점 안 함 — 게시하지 않음")
        output(ok)
    elif mode == "release":
        print("게시 실패 — scheduled 로 되돌림" if update(release, "chore: release insight post claim") else "되돌릴 선점 없음")
    else:
        sys.exit(f"알 수 없는 모드: {mode}")
