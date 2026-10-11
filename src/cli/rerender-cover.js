// 이미 만든 브런치 카드뉴스를 새 표지 스타일로 다시 그린다(2026-10-11 유튜브 썸네일 스타일 표지).
// 사용:
//   node src/cli/rerender-cover.js options <id...>         → content/<id>/cover-options/ 에 원문 이미지별 표지 시안(img0.jpg …)과 none.jpg
//   node src/cli/rerender-cover.js apply <id>=<N|none> ... → 표지에 원문 이미지 N(또는 없음)을 쓰고 카드 전체를 다시 그린다
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { renderCards } from "../lib/card-renderer.js";
import { writeJson } from "../lib/files.js";

const [mode, ...targets] = process.argv.slice(2);
const imageUrl = (image) => (typeof image === "string" ? image : image?.url);

async function load(id) {
  const dir = path.join("content", id);
  const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
  const source = JSON.parse(await readFile(path.join(dir, "source.json"), "utf8"));
  return { dir, manifest, images: (source.images ?? []).map(imageUrl).filter(Boolean) };
}

if (mode === "options") {
  for (const id of targets) {
    const { dir, manifest, images } = await load(id);
    const out = path.join(dir, "cover-options");
    await rm(out, { recursive: true, force: true });
    await mkdir(out, { recursive: true });
    const { rename } = await import("node:fs/promises");
    for (const [index, url] of [...images.map((u, i) => [i, u]), ["none", null]]) {
      const tmp = path.join(out, `tmp-${index}`);
      const cover = { ...manifest.cards[0], imageUrl: url ?? undefined };
      if (!url) delete cover.imageUrl;
      await renderCards({ ...manifest, cards: [cover, manifest.cards[1]] }, tmp).catch((error) => console.log(id, index, error.message));
      await rename(path.join(tmp, "cards", "01.jpg"), path.join(out, `${index === "none" ? "none" : `img${index}`}.jpg`)).catch(() => {});
      await rm(tmp, { recursive: true, force: true });
    }
    console.log(id, `시안 ${images.length + 1}개`);
  }
} else if (mode === "apply") {
  for (const target of targets) {
    const [id, choice] = target.split("=");
    const { dir, manifest, images } = await load(id);
    const cover = { ...manifest.cards[0] };
    if (choice === "none" || choice === undefined) delete cover.imageUrl;
    else cover.imageUrl = images[Number(choice)];
    const next = { ...manifest, cards: [cover, ...manifest.cards.slice(1)] };
    await renderCards(next, dir);
    await writeJson(path.join(dir, "manifest.json"), next);
    await rm(path.join(dir, "cover-options"), { recursive: true, force: true });
    console.log(id, "표지 다시 그림", choice);
  }
} else {
  console.log("사용: rerender-cover.js options <id...> | apply <id>=<N|none> ...");
  process.exitCode = 1;
}
