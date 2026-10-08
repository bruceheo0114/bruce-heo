// 유튜브 썸네일(1280×720) 3안. 인스타그램 카드와 같은 색·폰트·BR. 마크.
// references.json의 "thumbnail": [{ "image": "R001", "copy": "로고를 가려도 안다", "layout": "split" }, ...] 를 따르고,
// 없으면 실제 자료 그림과 01_brief.md의 Thumbnail Copy로 자동으로 고른다.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readJson } from "../../lib/files.js";
import { readEpisodeFile } from "../episode.js";
import { findSection } from "../parse.js";
import { renderFrames } from "./frames.js";

const SIZE = { width: 1280, height: 720 };
// 채널 썸네일은 전면 이미지 + 왼쪽 어둡게 + 큰 흰 글씨(full)로 통일한다 (사용자 결정 2026-10-08). split·bar는 references.json에서 직접 고를 때만.
const DEFAULT_LAYOUT = "full";

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

function listItems(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").replace(/\*\*/g, "").trim())
    .filter(Boolean);
}

// 한 줄이 너무 길면 두 줄로 (가운데에 가까운 띄어쓰기에서)
export function splitCopy(copy) {
  const value = String(copy).trim();
  if (value.includes("/")) return value.split("/").map((part) => part.trim()).filter(Boolean);
  if (value.length <= 9) return [value];
  const words = value.split(" ");
  if (words.length < 2) return [value];
  let best = 1;
  let diff = Infinity;
  for (let index = 1; index < words.length; index += 1) {
    const gap = Math.abs(words.slice(0, index).join(" ").length - words.slice(index).join(" ").length);
    if (gap < diff) {
      diff = gap;
      best = index;
    }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

function thumbnailHtml({ layout, lines, pill, image, focus = "center" }) {
  const longest = Math.max(...lines.map((line) => line.length));
  const background = image ? `url('${image}') ${focus}/cover` : "#111";
  const mark = `<div class="mark">BR<span>.</span></div>`;
  const head = `<!doctype html><meta charset="utf-8"><style>__FONT__
*{box-sizing:border-box;margin:0}body{width:${SIZE.width}px;height:${SIZE.height}px;overflow:hidden;position:relative;font-family:P,sans-serif;word-break:keep-all}
.dot,.mark span{color:#65B98A}
.mark{position:absolute;width:84px;height:84px;border-radius:50%;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;font-size:31px;font-weight:900;letter-spacing:-.08em;box-shadow:0 0 0 3px rgba(255,255,255,.9)}
.pill{display:inline-block;border:4px solid #65B98A;border-radius:999px;padding:9px 22px 12px;font-size:26px;font-weight:800;line-height:1;letter-spacing:-.03em}`;
  if (layout === "split") {
    const size = longest > 9 ? 80 : 96;
    return `${head}
body{background:#F2F1ED}.img{position:absolute;right:0;top:0;width:47%;height:100%;background:${background}}
.copy{position:absolute;left:60px;top:58px;width:640px;height:604px;display:flex;flex-direction:column}
.pill{align-self:flex-start;color:#23744c}
h1{margin-top:auto;font-size:${size}px;font-weight:900;letter-spacing:-.055em;line-height:1.08;color:#111}
.mark{left:60px;bottom:58px;position:absolute}.copy h1{margin-bottom:120px}
</style><body><div class="img"></div><div class="copy"><span class="pill">${escapeHtml(pill)}</span><h1>${lines.map(escapeHtml).join("<br>")}<span class="dot">.</span></h1></div>${mark}</body>`;
  }
  if (layout === "full") {
    const size = longest > 10 ? 84 : 104;
    return `${head}
body{background:${background}}.shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.78) 0%,rgba(0,0,0,.45) 55%,rgba(0,0,0,.05) 100%)}
.copy{position:absolute;left:64px;top:60px;bottom:60px;width:860px;display:flex;flex-direction:column}
.pill{align-self:flex-start;color:#fff;background:rgba(17,17,17,.4)}
h1{margin-top:auto;font-size:${size}px;font-weight:900;letter-spacing:-.055em;line-height:1.06;color:#fff;text-shadow:0 6px 30px rgba(0,0,0,.4)}
.mark{right:56px;top:52px}
</style><body><div class="shade"></div><div class="copy"><span class="pill">${escapeHtml(pill)}</span><h1>${lines.map(escapeHtml).join("<br>")}<span class="dot">.</span></h1></div>${mark}</body>`;
  }
  const size = longest > 10 ? 70 : 84;
  return `${head}
body{background:${background}}.bar{position:absolute;left:0;bottom:64px;max-width:1000px;padding:26px 48px 30px 64px;background:#111;color:#fff}
h1{font-size:${size}px;font-weight:900;letter-spacing:-.055em;line-height:1.08}
.pill{position:absolute;left:64px;top:56px;color:#fff;background:rgba(17,17,17,.55)}
.mark{right:56px;top:52px}
</style><body><span class="pill">${escapeHtml(pill)}</span><div class="bar"><h1>${lines.map(escapeHtml).join("<br>")}<span class="dot">.</span></h1></div>${mark}</body>`;
}

async function imageDataUrl(file) {
  const ext = path.extname(file).slice(1).toLowerCase().replace("jpg", "jpeg");
  return `data:image/${ext};base64,${(await readFile(file)).toString("base64")}`;
}

/** 썸네일 3안을 outDir/thumbnail_1.png ~ thumbnail_3.png로 만든다. 첫 안은 thumbnail.png로도 저장한다. */
export async function renderThumbnails(episode, root, outDir, { pill = "브랜드 사례" } = {}) {
  const brief = (await readEpisodeFile(episode, "01_brief.md")) ?? "";
  const copies = listItems(findSection(brief, "Thumbnail Copy"));
  const referenceDir = path.join(root, "assets", "references", episode.status.episode);
  const references = await readJson(path.join(episode.dir, "references.json"), {});
  const credits = await readJson(path.join(referenceDir, "credits.json"), { items: [] });
  const excluded = new Set((references.exclude ?? []).map((name) => String(name).toUpperCase()));
  const usable = credits.items.filter((item) => !excluded.has(path.parse(item.file).name.toUpperCase()) && item.kind !== "scroll");
  const byName = new Map(usable.map((item) => [path.parse(item.file).name.toUpperCase(), item]));

  let plans = (references.thumbnail ?? []).slice(0, 3);
  if (!plans.length) {
    const images = [...usable.filter((item) => item.kind === "image"), ...usable.filter((item) => item.kind === "ai")];
    plans = [0, 1, 2].map((index) => ({ image: images[index] ? path.parse(images[index].file).name : null, copy: copies[index] }));
  }
  const jobs = [];
  for (const [index, plan] of plans.entries()) {
    const item = plan.image ? byName.get(String(plan.image).toUpperCase()) : null;
    const image = item ? await imageDataUrl(path.join(referenceDir, item.file)) : null;
    const copy = plan.copy || copies[index] || episode.status.article.title;
    jobs.push({
      file: `thumbnail_${index + 1}.png`,
      html: thumbnailHtml({ layout: plan.layout ?? DEFAULT_LAYOUT, lines: splitCopy(copy), pill: plan.pill ?? pill, image, focus: plan.focus }),
      viewport: SIZE,
    });
  }
  if (jobs.length) jobs.push({ ...jobs[0], file: "thumbnail.png" });
  await renderFrames(jobs, outDir);
  return jobs.slice(0, -1).map((job) => path.join(outDir, job.file));
}
