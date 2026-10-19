"""게시 시계: GitHub 예약(cron)이 몇 시간씩 밀리거나 빠지는 문제를 피한다.

한 실행이 최대 약 5시간 40분 동안 깨어 있으면서 정해진 KST 시각이 되면 해당 워크플로를
workflow_dispatch 로 바로 시작하고, 끝나기 전에 자기 자신을 다시 시작해 시계를 이어 간다.
각 게시 워크플로는 이미 posted 면 아무것도 하지 않으므로 같은 시각이 두 번 실행돼도 안전하다.
"""
import datetime as dt
import os
import subprocess
import sys
import time

KST = dt.timezone(dt.timedelta(hours=9))
REPO = os.environ.get("GITHUB_REPOSITORY", "bruceheo0114/bruce-heo")
RUN_BUDGET = dt.timedelta(minutes=int(os.environ.get("CLOCK_BUDGET_MINUTES", "340")))
CATCH_UP = dt.timedelta(minutes=20)  # 시계가 이어지는 사이에 놓친 시각을 다시 잡는 폭

# (KST 시, 분, 요일(월=0) 또는 None=매일, 워크플로 파일, 날짜를 post_date 로 넘길지[, 더 넘길 입력])
SLOTS = [
    # 리멤버는 자동화하지 않는다. LinkedIn 뉴스레터는 목요일 Claude 루틴이 원고를 메일로 보낸다(발행은 직접).
    (7, 0, None, "insight-reels-publish.yml", True),  # 월 업계 트렌드 카드뉴스, 화~일 릴스(2026-10-20부터)
    (7, 17, None, "brunch-cache.yml", False),
    (7, 30, None, "linkedin-publish.yml", False),  # LinkedIn 피드 글. 예약은 화요일 07:30 뿐이라 다른 날은 할 일 없이 끝난다(실패 재시도용으로 매일 돈다).
    (8, 0, None, "brunch-weekly.yml", False),
    (12, 30, None, "threads-publish.yml", True),
    (12, 30, {2, 4}, "insight-reels-publish.yml", True, (("post_slot", "noon"),)),  # 수·금 카드뉴스(posts/DATE.noon.json)
    (20, 7, {0, 1, 2, 3, 4, 5}, "naver-reels.yml", False),  # 21:13 릴스 루틴 전에 시의성 훅 재료(다음 날이 월요일인 일요일은 쉼)
    (20, 9, {0, 2, 5}, "naver-youtube.yml", False),  # 월·수·토 21:13 유튜브 루틴 전에 제목·도입부 검색 훅 재료
]

# 한 번만 도는 예약. 브런치 예약 발행 직후 홈페이지 갱신(일일 자동화)과 원문 백업을 앞당긴다.
# (KST 시각, 워크플로 파일, 날짜를 post_date 로 넘길지). 지난 항목은 지워도 된다.
ONE_OFF = [
    (dt.datetime(2026, 10, 16, 6, 5, tzinfo=KST), "brunch-weekly.yml", False),  # 브런치 226 06:00 예약 발행
    (dt.datetime(2026, 10, 16, 6, 20, tzinfo=KST), "brunch-archive.yml", False),
]


def occurrences(start, end):
    day = start.date()
    while day <= end.date():
        for hour, minute, weekdays, workflow, with_date, *extra in SLOTS:
            at = dt.datetime(day.year, day.month, day.day, hour, minute, tzinfo=KST)
            if start < at <= end and (weekdays is None or at.weekday() in weekdays):
                yield at, workflow, with_date, tuple(extra[0]) if extra else ()
        day += dt.timedelta(days=1)
    for at, workflow, with_date in ONE_OFF:
        if start < at <= end:
            yield at, workflow, with_date, ()


def dispatch(workflow, fields=()):
    command = ["gh", "workflow", "run", workflow, "-R", REPO, "--ref", "main"]
    for key, value in fields:
        command += ["-f", f"{key}={value}"]
    for attempt in range(4):
        if subprocess.run(command).returncode == 0:
            print(f"{dt.datetime.now(KST):%m-%d %H:%M:%S} KST 시작: {workflow} {dict(fields)}", flush=True)
            return True
        time.sleep(10 * (attempt + 1))
    print(f"::error::{workflow} 시작 실패", flush=True)
    return False


def main():
    started = dt.datetime.now(KST)
    deadline = started + RUN_BUDGET
    planned = sorted(occurrences(started - CATCH_UP, deadline))
    print("이번 실행 예정:", [f"{at:%m-%d %H:%M} {wf}" for at, wf, _, _ in planned] or "없음", flush=True)

    failed = False
    for at, workflow, with_date, extra in planned:
        wait = (at - dt.datetime.now(KST)).total_seconds()
        if wait > 0:
            time.sleep(wait)
        fields = ([("post_date", at.strftime("%Y-%m-%d"))] if with_date else []) + list(extra)
        failed |= not dispatch(workflow, fields)

    wait = (deadline - dt.datetime.now(KST)).total_seconds()
    if wait > 0:
        time.sleep(wait)
    if os.environ.get("CLOCK_NO_CHAIN") != "1":
        failed |= not dispatch("publish-clock.yml")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
