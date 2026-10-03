# status=render 인 캐러셀 게시물의 카드를 그려 media/DATE/ 에 넣고 status 를 scheduled 로 바꾼다.
# GitHub Actions(insight-reels-cards.yml)에서 실행. 필요: Pillow
import json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import cards

ROOT = pathlib.Path(__file__).resolve().parents[1]
SITE = "https://bruceheo.com/insight-reels/media"
RAW = "https://raw.githubusercontent.com/bruceheo0114/bruce-heo/main/insight-reels/media"

done = 0
for f in sorted((ROOT / "posts").glob("????-??-??.json")):
    post = json.loads(f.read_text(encoding="utf-8"))
    if post.get("type") != "carousel" or post.get("status") != "render":
        continue
    date = post["date"]
    spec = ROOT / "posts" / f"{date}.cards.json"
    out = cards.render(str(spec), str(ROOT / "media" / date))
    names = [pathlib.Path(p).name for p in out]
    post.update(
        images=[f"{SITE}/{date}/{n}" for n in names],
        images_backup=[f"{RAW}/{date}/{n}" for n in names],
        qa_url=f"{SITE}/{date}/qa.jpg",
        status="scheduled",
    )
    f.write_text(json.dumps(post, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{date}: {len(names)}장 렌더링 → scheduled")
    done += 1
print(f"처리 {done}건")
