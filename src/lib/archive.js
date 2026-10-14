// 브런치 원문을 bruceheo.com/writing/ 에서 그대로 읽을 수 있게 백업한다.
// 브런치 글 HTML → 블록 JSON(data/archive/{id}.json) → 정적 페이지(writing/{id}/index.html).
import * as cheerio from "cheerio";
import { CONFIG } from "../config.js";
import { BrunchStructureError, canonicalUrl } from "./brunch.js";
import { escapeHtml } from "./homepage.js";
import { toSeoulDateParts } from "./time.js";

const SITE = "https://bruceheo.com";
const INLINE_TAGS = { b: "strong", strong: "strong", i: "em", em: "em", u: "u", s: "s", strike: "s", del: "s", sup: "sup", sub: "sub" };
const LIST_TAGS = new Set(["ul", "ol", "li"]);
const TEXT_TAGS = new Set(["h2", "h3", "h4", "blockquote"]);

function compact(value) {
  return String(value ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

function httpsUrl(value) {
  if (!value) return null;
  const url = String(value).startsWith("//") ? `https:${value}` : String(value);
  if (!/^https?:\/\//.test(url)) return null;
  return url.replace(/^http:\/\/(t1\.daumcdn\.net|t1\.kakaocdn\.net|img1\.kakaocdn\.net)/, "https://$1");
}

function dataApp($, node) {
  try {
    return JSON.parse($(node).attr("data-app") ?? "{}");
  } catch {
    return {};
  }
}

// 브런치의 span 중첩·글꼴 스타일은 버리고 굵게·기울임·밑줄·링크·목록만 남긴다.
function inlineHtml($, node) {
  return $(node)
    .contents()
    .toArray()
    .map((child) => {
      if (child.type === "text") return escapeHtml(child.data.replace(/ /g, " "));
      if (child.type !== "tag") return "";
      const tag = child.tagName.toLowerCase();
      const inner = inlineHtml($, child);
      if (tag === "br") return "<br>";
      if (INLINE_TAGS[tag]) return inner.trim() ? `<${INLINE_TAGS[tag]}>${inner}</${INLINE_TAGS[tag]}>` : inner;
      if (LIST_TAGS.has(tag)) return `<${tag}>${inner}</${tag}>`;
      if (tag === "a") {
        const href = httpsUrl($(child).attr("href"));
        return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${inner}</a>` : inner;
      }
      if (tag === "script" || tag === "style") return "";
      return inner;
    })
    .join("");
}

function isBlank(html) {
  return !html.replace(/<br>/g, "").replace(/<\/?[a-z]+>/g, "").trim();
}

function parseBlock($, node) {
  const element = $(node);
  const className = element.attr("class") ?? "";
  const type = className.match(/item_type_(\w+)/)?.[1] ?? "text";
  const app = dataApp($, node);

  if (type === "img") {
    const fromApp = (app.images ?? []).map((image) => ({
      src: httpsUrl(image.url),
      width: Number(image.width) || null,
      height: Number(image.height) || null,
    }));
    const rendered = element.find("img").toArray().map((img) => httpsUrl($(img).attr("src") ?? $(img).attr("data-src")));
    const images = (rendered.length ? rendered : fromApp.map((image) => image.src))
      .map((src, index) => src && { src, width: fromApp[index]?.width ?? null, height: fromApp[index]?.height ?? null })
      .filter(Boolean);
    if (!images.length) return null;
    return { type: "image", images, caption: compact(app.caption ?? element.find(".text_caption").first().text()) };
  }

  if (type === "video") {
    const youtubeId = app.sourceType === "Youtube" || /youtube\.com|youtu\.be/.test(app.url ?? "") ? app.id : null;
    const url = httpsUrl(app.url) ?? httpsUrl(element.find("iframe").attr("src"));
    if (!youtubeId && !url) return null;
    return { type: "video", youtubeId: youtubeId ?? null, url, thumbnail: httpsUrl(app.thumbnail), caption: compact(app.caption) };
  }

  if (type === "hr") return { type: "hr" };

  if (type === "opengraph") {
    const url = httpsUrl(app.url ?? element.find("a").attr("href"));
    if (!url) return null;
    return { type: "link", url, title: compact(app.title ?? element.find("strong, .tit_og").first().text()) || url, description: compact(app.description ?? "") };
  }

  const tag = node.tagName.toLowerCase();
  const html = inlineHtml($, node).trim();
  if (isBlank(html)) return null;
  const textTag = type === "quotation" ? "blockquote" : TEXT_TAGS.has(tag) ? tag : "p";
  return { type: "text", tag: textTag, html };
}

export function parseArchiveArticle(html, articleId) {
  const $ = cheerio.load(html);
  const meta = (name) => compact($(`meta[property="${name}"]`).attr("content") ?? $(`meta[name="${name}"]`).attr("content"));
  const view = $("#ArticleView").length ? $("#ArticleView") : $(".wrap_body").first();
  const blocks = view
    .find(".wrap_item")
    .toArray()
    .filter((node) => !$(node).parents(".wrap_item").length)
    .map((node) => parseBlock($, node))
    .filter(Boolean);

  const title = compact(meta("og:title") || $(".cover_title").first().text()).replace(/^\d+화\s+/, "");
  const publishedAt = meta("article:published_time");
  if (!title || !publishedAt || !blocks.some((block) => block.type === "text")) {
    throw new BrunchStructureError(
      `브런치 글 ${articleId} 본문을 백업용으로 해석하지 못했습니다 (title=${Boolean(title)}, date=${Boolean(publishedAt)}, blocks=${blocks.length}).`,
    );
  }
  return {
    id: String(articleId),
    canonicalUrl: canonicalUrl(articleId),
    title,
    subtitle: compact($(".cover_sub_title").first().text()),
    publishedAt: new Date(publishedAt).toISOString(),
    coverImage: httpsUrl(meta("og:image")),
    excerpt: meta("og:description"),
    blocks,
  };
}

// 사이트 전체에서 같은 인물로 읽히도록 저자 정보를 한 곳에서 쓴다.
export const AUTHOR = {
  "@type": "Person",
  name: "허보람",
  alternateName: ["브루스", "브루스 허", "마케터 브루스", "Bruce Heo"],
  url: "https://bruceheo.com/",
};
const AUTHOR_LABEL = "허보람(브루스)";

// 함께 읽을 글: 같은 주제에서 발행일이 가까운 글을 고르고, 모자라면 전체에서 가까운 글로 채운다.
export function relatedArticles(article, all, meta = {}, count = 3) {
  const category = meta.posts?.[article.id]?.category;
  const others = all.filter((other) => other.id !== article.id);
  const distance = (other) => Math.abs(new Date(other.publishedAt) - new Date(article.publishedAt));
  const sameTopic = category ? others.filter((other) => meta.posts?.[other.id]?.category === category).sort((a, b) => distance(a) - distance(b)) : [];
  const picked = sameTopic.slice(0, count);
  for (const other of [...others].sort((a, b) => distance(a) - distance(b))) {
    if (picked.length >= count) break;
    if (!picked.includes(other)) picked.push(other);
  }
  return picked;
}

function categoryLabel(meta, id) {
  const key = meta.posts?.[id]?.category;
  return meta.categories?.find((item) => item.key === key)?.label ?? "";
}

export function formatKoreanDate(value) {
  const { year, month, day } = toSeoulDateParts(value);
  return `${year}. ${month}. ${day}.`;
}

// 저장소에 내려받은 이미지가 있으면 그 주소를, 없으면 브런치 이미지 주소를 쓴다.
function imagePath(articleId, src, local, absolute = false) {
  if (!local) return src;
  return `${absolute ? SITE : ""}/writing/${articleId}/${local}`;
}

// 브런치 썸네일 주소(…?fname=…/image/abc.jpg)에서 원본 파일 이름을 뽑는다. 용량을 줄이려고 모두 WebP 로 저장한다.
export function localImageName(url) {
  const value = String(url);
  const original = value.includes("fname=") ? decodeURIComponent(value.split("fname=").pop()) : value.split("?")[0];
  const base = original.split("/").pop().replace(/\.(jpe?g|png|gif|webp)$/i, "").replace(/[^A-Za-z0-9_-]/g, "_");
  return `${base || "image"}.webp`;
}

// 내려받을 이미지 목록: 본문 이미지와 커버. local 을 채우면 JSON 에 그대로 남는다.
export function imageSlots(article) {
  const slots = article.blocks
    .filter((block) => block.type === "image")
    .flatMap((block) => block.images)
    .map((image) => ({ url: image.src, get: () => image.local, set: (local) => { image.local = local; } }));
  if (article.coverImage) {
    slots.push({ url: article.coverImage, get: () => article.coverLocal, set: (local) => { article.coverLocal = local; } });
  }
  return slots;
}

function blockHtml(block, articleId) {
  if (block.type === "text") return `<${block.tag}>${block.html}</${block.tag}>`;
  if (block.type === "hr") return "<hr>";
  if (block.type === "image") {
    const images = block.images
      .map((image) => {
        const size = image.width && image.height ? ` width="${image.width}" height="${image.height}"` : "";
        return `<img src="${escapeHtml(imagePath(articleId, image.src, image.local))}" alt="${escapeHtml(block.caption)}"${size} loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
      })
      .join("");
    const caption = block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : "";
    return `<figure class="${block.images.length > 1 ? "gallery" : ""}">${images}${caption}</figure>`;
  }
  if (block.type === "video") {
    const caption = block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : "";
    if (block.youtubeId) {
      return `<figure class="video"><iframe src="https://www.youtube-nocookie.com/embed/${escapeHtml(block.youtubeId)}" title="${escapeHtml(block.caption || "YouTube 영상")}" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>${caption}</figure>`;
    }
    return `<p><a href="${escapeHtml(block.url)}" target="_blank" rel="noopener">영상 보기</a></p>`;
  }
  if (block.type === "link") {
    return `<a class="og-link" href="${escapeHtml(block.url)}" target="_blank" rel="noopener"><strong>${escapeHtml(block.title)}</strong>${block.description ? `<span>${escapeHtml(block.description)}</span>` : ""}</a>`;
  }
  return "";
}

const STYLE = `
:root{--bg:#F2F1ED;--bg-soft:#E9E7E1;--border:#E3E1DA;--border-strong:#D6D3CB;--text:#111;--text-2:#3A3A37;--text-3:#73736E;--accent:#23744C;--accent-strong:#1A5A3A;--mint:#65B98A;--column:720px}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{background:var(--bg);color:var(--text);font-family:'Pretendard Variable',Pretendard,-apple-system,BlinkMacSystemFont,system-ui,Roboto,'Helvetica Neue','Segoe UI',sans-serif;line-height:1.6;word-break:keep-all;overflow-wrap:break-word}
a{color:inherit;text-decoration:none}
.top{position:sticky;top:0;z-index:5;background:rgba(242,241,237,.9);backdrop-filter:blur(12px);border-bottom:1px solid var(--border)}
.top__in{max-width:var(--column);margin:0 auto;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;font-size:14px}
.top__brand{display:inline-flex;align-items:center;gap:9px;font-weight:800;letter-spacing:-.01em}
.brand-mark{width:30px;height:30px;border-radius:50%;background:#111;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:900;letter-spacing:-.09em}
.brand-mark i{font-style:normal;color:var(--mint)}
.top__nav{display:flex;gap:18px;color:var(--text-2);font-weight:600}
.top__nav a:hover{color:var(--accent)}
main{max-width:var(--column);margin:0 auto;padding:56px 20px 96px}
.eyebrow{display:inline-block;font-size:13px;font-weight:800;color:var(--accent);margin-bottom:16px;border:2px solid var(--mint);border-radius:999px;padding:4px 12px 5px}
h1{font-size:clamp(28px,5vw,40px);line-height:1.3;letter-spacing:-.035em;font-weight:900}
.subtitle{margin-top:14px;font-size:clamp(17px,2.4vw,20px);color:var(--text-2);line-height:1.5}
.meta{margin-top:20px;font-size:14px;color:var(--text-3)}
.cover{margin:36px 0 8px;border-radius:20px;overflow:hidden;background:var(--bg-soft)}
.cover img{display:block;width:100%;height:auto}
.article{margin-top:40px;font-size:17.5px;line-height:1.9;color:#2A2A27}
.article p{margin:0 0 1.35em}
.article h2,.article h3,.article h4{color:var(--text);line-height:1.45;letter-spacing:-.02em;margin:2em 0 .8em}
.article h2{font-size:24px}.article h3{font-size:21px}.article h4{font-size:19px}
.article strong{color:var(--text);font-weight:700}
.article a{color:var(--accent);text-decoration:underline;text-underline-offset:3px}
.article blockquote{margin:1.8em 0;padding:4px 0 4px 20px;border-left:3px solid var(--text);color:var(--text);font-weight:600}
.article ul,.article ol{margin:0 0 1.35em 1.4em}
.article hr{border:0;height:1px;background:var(--border-strong);margin:2.6em auto;width:40%}
.article figure{margin:2.2em 0}
.article figure img{display:block;width:100%;height:auto;border-radius:12px;background:var(--bg-soft)}
.article figure.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}
.article figure.gallery figcaption{grid-column:1/-1}
.article figcaption{margin-top:10px;font-size:13.5px;line-height:1.6;color:var(--text-3);text-align:center}
.article .video iframe{display:block;width:100%;aspect-ratio:16/9;border:0;border-radius:12px;background:#000}
.og-link{display:block;margin:1.8em 0;padding:16px 18px;border:1px solid var(--border-strong);border-radius:12px;text-decoration:none!important;color:var(--text)!important}
.og-link span{display:block;margin-top:4px;font-size:14px;color:var(--text-3)}
.source{margin-top:56px;padding:20px 22px;border-radius:16px;background:var(--bg-soft);font-size:14.5px;color:var(--text-2);line-height:1.7}
.source a{color:var(--accent);font-weight:700}
.pager{margin-top:28px;display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pager a{display:block;padding:16px 18px;border:1px solid var(--border-strong);border-radius:14px;transition:border-color .15s}
.pager a:hover{border-color:var(--accent)}
.pager small{display:block;font-size:12px;color:var(--text-3);margin-bottom:4px}
.pager span{font-size:15px;font-weight:700;line-height:1.45}
.pager .next{text-align:right;grid-column:2}
.list-head p{margin-top:14px;color:var(--text-2);font-size:16px;line-height:1.7}
.meta a{color:var(--text-2);font-weight:600;text-decoration:underline;text-underline-offset:3px;text-decoration-color:var(--border-strong)}
.insight{margin-top:48px;padding:22px 24px;border-radius:16px;background:var(--bg-card,#FBFAF7);border:1.5px solid var(--mint)}
.insight h2,.related h2{font-size:14px;font-weight:800;color:var(--accent);letter-spacing:.01em;margin-bottom:10px}
.insight p{font-size:16.5px;line-height:1.8;color:var(--text)}
.related{margin-top:48px}
.related__list{display:grid;gap:10px}
.related__item{display:grid;grid-template-columns:1fr 96px;gap:14px;align-items:center;padding:14px 16px;border:1px solid var(--border-strong);border-radius:14px;transition:border-color .15s}
.related__item:hover{border-color:var(--accent)}
.related__item small{display:block;font-size:12px;font-weight:700;color:var(--accent);margin-bottom:4px}
.related__item span{font-size:15.5px;font-weight:700;line-height:1.45}
.related__item img{width:96px;aspect-ratio:16/10;object-fit:cover;border-radius:8px;background:var(--bg-soft)}
.author-card{margin-top:40px;display:flex;gap:16px;align-items:flex-start;padding:22px 24px;border-radius:16px;background:var(--bg-soft)}
.author-card .brand-mark{width:44px;height:44px;font-size:16px;flex:none}
.author-card strong{display:block;font-size:16px;font-weight:800;margin-bottom:4px}
.author-card p{font-size:14.5px;line-height:1.7;color:var(--text-2)}
.author-card nav{margin-top:10px;display:flex;flex-wrap:wrap;gap:6px 14px;font-size:14px;font-weight:700}
.author-card nav a{color:var(--accent)}
.picks{margin-top:40px}
.picks h2{font-size:14px;font-weight:800;color:var(--accent);margin-bottom:12px}
.picks__grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.pick{display:block;border-radius:14px;overflow:hidden;background:var(--bg-card,#FBFAF7);border:1px solid var(--border);transition:border-color .15s}
.pick:hover{border-color:var(--mint)}
.pick img{width:100%;aspect-ratio:16/10;object-fit:cover;display:block;background:var(--bg-soft)}
.pick span{display:block;padding:12px 14px 14px;font-size:15px;font-weight:700;line-height:1.45}
.filters{margin-top:44px;display:flex;flex-wrap:wrap;gap:8px}
.filters button{font:inherit;font-size:14px;font-weight:700;padding:8px 14px;border-radius:999px;border:1.5px solid var(--border-strong);background:transparent;color:var(--text-2);cursor:pointer}
.filters button[aria-pressed="true"]{border-color:var(--text);background:var(--text);color:#fff}
.filters button:focus-visible,.post:focus-visible,.pick:focus-visible,.related__item:focus-visible{outline:3px solid var(--mint);outline-offset:2px}
.post__cat{display:inline-block;margin-top:6px;font-size:12px;font-weight:700;color:var(--accent)}
.post[hidden],.year[hidden],.posts[hidden]{display:none}
.toc{margin:32px 0 0;padding:18px 22px;border-radius:14px;background:var(--bg-soft)}
.toc ol{margin:0 0 0 1.2em;display:grid;gap:6px;font-size:15px;font-weight:600}
.toc a:hover{color:var(--accent)}
.article .steps li{margin-bottom:.8em}
.cases{display:grid;gap:12px;margin:8px 0 8px}
.case-card{display:grid;grid-template-columns:160px 1fr;gap:18px;align-items:center;padding:14px;border:1px solid var(--border-strong);border-radius:16px;background:var(--bg-card,#FBFAF7);transition:border-color .15s}
.case-card:hover{border-color:var(--mint)}
.case-card img{width:160px;aspect-ratio:16/10;object-fit:cover;border-radius:10px}
.case-card strong{display:block;font-size:16.5px;line-height:1.45;margin-bottom:6px}
.case-card p{font-size:14.5px;line-height:1.7;color:var(--text-2)}
.case-card:focus-visible,.toc a:focus-visible{outline:3px solid var(--mint);outline-offset:2px}
.year{margin-top:48px;font-size:14px;font-weight:800;color:var(--text-3);letter-spacing:.04em}
.posts{margin-top:12px;border-top:1px solid var(--border-strong)}
.post{display:grid;grid-template-columns:96px 1fr 132px;gap:18px;align-items:center;padding:18px 4px;border-bottom:1px solid var(--border)}
.post__thumb{width:132px;aspect-ratio:16/10;border-radius:10px;overflow:hidden;background:var(--bg-soft)}
.post__thumb img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .25s}
.post:hover .post__thumb img{transform:scale(1.04)}
.post:hover .post__title{color:var(--accent)}
.post__date{font-size:14px;color:var(--text-3);padding-top:2px;font-variant-numeric:tabular-nums}
.post__title{font-size:17px;font-weight:700;line-height:1.45;letter-spacing:-.01em;transition:color .15s}
.post__sub{margin-top:4px;font-size:14px;color:var(--text-3);line-height:1.5}
footer{border-top:1px solid var(--border);padding:28px 20px;text-align:center;font-size:13px;color:var(--text-3)}
@media (max-width:560px){main{padding:40px 16px 72px}.top__in{padding:12px 16px}.article{font-size:16.5px}.post{grid-template-columns:1fr 96px;gap:4px 14px}.post__date{grid-column:1}.post__body{grid-column:1}.post__thumb{grid-column:2;grid-row:1/span 2;width:96px}.pager{grid-template-columns:1fr}.picks__grid{grid-template-columns:1fr}.pick{display:grid;grid-template-columns:110px 1fr;align-items:center}.case-card{grid-template-columns:1fr}.case-card img{width:100%}.pick img{height:100%}.author-card{padding:18px}.pager .next{grid-column:1}}
`;

function layout({ title, description, url, image, imageSize = null, canonical, jsonLd = null, body }) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="article">
<meta property="og:locale" content="ko_KR">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:image" content="${escapeHtml(image)}">
${imageSize ? `<meta property="og:image:width" content="${imageSize[0]}">\n<meta property="og:image:height" content="${imageSize[1]}">\n` : ""}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${escapeHtml(image)}">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replaceAll("<", "\\u003c")}</script>` : ""}
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${CONFIG.gaMeasurementId}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${CONFIG.gaMeasurementId}');
</script>
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>${STYLE}</style>
</head>
<body>
<header class="top"><div class="top__in"><a class="top__brand" href="/"><span class="brand-mark">BR<i>.</i></span>허보람(브루스)</a><nav class="top__nav"><a href="/writing/">글</a><a href="/context/">맥락과 마케팅</a><a href="/#about">소개</a></nav></div></header>
${body}
<footer>© 허보람(브루스) · 브런치 <a href="${CONFIG.profileUrl}" target="_blank" rel="noopener">@${CONFIG.profileId}</a> · 방문 통계를 위해 Google 애널리틱스를 사용합니다.</footer>
</body>
</html>
`;
}

// 같은 원본을 가리키는 썸네일 URL끼리 비교하려고 파일 이름만 쓴다.
function imageKey(url) {
  return String(url).split("/").pop();
}

function articleUrl(id) {
  return `${SITE}/writing/${id}/`;
}

function relatedHtml(items, meta) {
  if (!items.length) return "";
  return `<section class="related" aria-labelledby="related-title">
<h2 id="related-title">함께 읽으면 좋은 글</h2>
<div class="related__list">
${items
  .map((item) => {
    const thumb = item.coverImage ? `<img src="${escapeHtml(imagePath(item.id, item.coverImage, item.coverLocal))}" alt="" loading="lazy" decoding="async">` : "";
    const label = categoryLabel(meta, item.id);
    return `<a class="related__item" href="/writing/${item.id}/"><div>${label ? `<small>${escapeHtml(label)}</small>` : ""}<span>${escapeHtml(item.title)}</span></div>${thumb}</a>`;
  })
  .join("\n")}
</div>
</section>`;
}

const AUTHOR_CARD = `<aside class="author-card" aria-label="저자 소개">
<span class="brand-mark">BR<i>.</i></span>
<div>
<strong>${AUTHOR_LABEL}</strong>
<p>브랜드와 소비자의 맥락을 읽고, 마케팅의 판단을 기록하는 통합 커뮤니케이션 마케터.</p>
<nav><a href="/writing/">다른 글 읽기</a><a href="/context/">맥락과 마케팅</a><a href="/career/">경력 보기</a></nav>
</div>
</aside>`;

export function renderArticlePage(article, { newer = null, older = null, all = [], meta = {} } = {}) {
  const description = article.subtitle || article.excerpt.slice(0, 120);
  const ogImage = article.shareImage
    ? `${SITE}/writing/${article.id}/${article.shareImage}`
    : article.coverImage ? imagePath(article.id, article.coverImage, article.coverLocal, true) : null;
  const coverKey = article.coverImage && imageKey(article.coverImage);
  const coverInBody = article.blocks.some((block) => block.type === "image" && block.images.some((image) => imageKey(image.src) === coverKey));
  const cover = coverKey && !coverInBody
    ? `<div class="cover"><img src="${escapeHtml(imagePath(article.id, article.coverImage, article.coverLocal))}" alt="" referrerpolicy="no-referrer"></div>`
    : "";
  const pager = [
    older ? `<a class="prev" href="/writing/${older.id}/"><small>← 이전 글</small><span>${escapeHtml(older.title)}</span></a>` : "",
    newer ? `<a class="next" href="/writing/${newer.id}/"><small>다음 글 →</small><span>${escapeHtml(newer.title)}</span></a>` : "",
  ].join("");
  const body = `<main>
<article>
<a class="eyebrow" href="/writing/">Writing</a>
<h1>${escapeHtml(article.title)}</h1>
${article.subtitle ? `<p class="subtitle">${escapeHtml(article.subtitle)}</p>` : ""}
<p class="meta"><a href="/#about">${AUTHOR_LABEL}</a> · <time datetime="${escapeHtml(article.publishedAt)}">${formatKoreanDate(article.publishedAt)}</time></p>
${cover}
<div class="article">
${article.blocks.map((block) => blockHtml(block, article.id)).join("\n")}
</div>
</article>
${meta.posts?.[article.id]?.insight ? `<section class="insight" aria-labelledby="insight-title"><h2 id="insight-title">이 글을 맥락으로 읽으면</h2><p>${escapeHtml(meta.posts[article.id].insight)}</p></section>` : ""}
${relatedHtml(relatedArticles(article, all, meta), meta)}
${AUTHOR_CARD}
<p class="source">이 글은 브런치에도 발행했습니다. 댓글과 구독은 <a href="${escapeHtml(article.canonicalUrl)}" target="_blank" rel="noopener">브런치 원문</a>에서 할 수 있습니다.</p>
${pager ? `<nav class="pager">${pager}</nav>` : ""}
</main>`;
  return layout({
    title: `${article.title} | 마케터 허보람(브루스)`,
    description,
    url: articleUrl(article.id),
    image: ogImage ?? `${SITE}/en/og.png`,
    imageSize: article.shareImage ? [1200, 630] : null,
    canonical: articleUrl(article.id),
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: article.title,
      description,
      datePublished: article.publishedAt,
      image: ogImage ?? undefined,
      url: articleUrl(article.id),
      mainEntityOfPage: articleUrl(article.id),
      inLanguage: "ko",
      author: AUTHOR,
      sameAs: article.canonicalUrl,
    },
    body,
  });
}

export function sortArticles(articles) {
  return [...articles].sort(
    (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt) || Number(b.id) - Number(a.id),
  );
}

export function renderArchiveIndex(articles, meta = {}) {
  const sorted = sortArticles(articles);
  const byId = new Map(sorted.map((article) => [article.id, article]));
  const picks = (meta.picks ?? []).map((id) => byId.get(id)).filter(Boolean);
  const categories = meta.categories ?? [];
  const years = [];
  for (const article of sorted) {
    const { year } = toSeoulDateParts(article.publishedAt);
    if (years.at(-1)?.year !== year) years.push({ year, items: [] });
    years.at(-1).items.push(article);
  }
  const sections = years
    .map(({ year, items }) => `<h2 class="year">${year}</h2>
<div class="posts">
${items
  .map((article) => {
    const { month, day } = toSeoulDateParts(article.publishedAt);
    const thumb = article.coverImage
      ? `<div class="post__thumb"><img src="${escapeHtml(imagePath(article.id, article.coverImage, article.coverLocal))}" alt="" loading="lazy" decoding="async"></div>`
      : "";
    const category = meta.posts?.[article.id]?.category ?? "";
    const label = categoryLabel(meta, article.id);
    return `<a class="post" href="/writing/${article.id}/" data-category="${escapeHtml(category)}"><div class="post__date">${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}</div><div class="post__body"><div class="post__title">${escapeHtml(article.title)}</div>${article.subtitle ? `<div class="post__sub">${escapeHtml(article.subtitle)}</div>` : ""}${label ? `<span class="post__cat">${escapeHtml(label)}</span>` : ""}</div>${thumb}</a>`;
  })
  .join("\n")}
</div>`)
    .join("\n");
  const body = `<main>
<div class="list-head">
<span class="eyebrow">Writing</span>
<h1>브랜드는 왜<br>그렇게 움직였을까</h1>
<p>브랜드의 선택과 소비자의 반응을 맥락으로 해석한 글들입니다. 화제가 된 캠페인부터 마케터의 판단과 AI 시대의 일하는 방식까지 기록합니다. 지금 ${sorted.length}편을 원문 그대로 모아 두었습니다.</p>
</div>
${picks.length ? `<section class="picks" aria-labelledby="picks-title"><h2 id="picks-title">먼저 읽을 글</h2><div class="picks__grid">
${picks.map((article) => `<a class="pick" href="/writing/${article.id}/">${article.coverImage ? `<img src="${escapeHtml(imagePath(article.id, article.coverImage, article.coverLocal))}" alt="" loading="lazy" decoding="async">` : ""}<span>${escapeHtml(article.title)}</span></a>`).join("\n")}
</div></section>` : ""}
${categories.length ? `<div class="filters" role="group" aria-label="주제별로 보기"><button type="button" data-filter="" aria-pressed="true">전체</button>${categories.map((item) => `<button type="button" data-filter="${escapeHtml(item.key)}" aria-pressed="false">${escapeHtml(item.label)}</button>`).join("")}</div>` : ""}
${sections}
</main>
<script>
// 주제 필터: 글 링크는 처음부터 HTML 에 모두 있고, 버튼은 보이는 글만 바꾼다.
(function () {
  var buttons = document.querySelectorAll(".filters button");
  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      var key = button.getAttribute("data-filter");
      buttons.forEach(function (b) { b.setAttribute("aria-pressed", String(b === button)); });
      document.querySelectorAll(".posts").forEach(function (list) {
        var shown = 0;
        list.querySelectorAll(".post").forEach(function (post) {
          var match = !key || post.getAttribute("data-category") === key;
          post.hidden = !match;
          if (match) shown++;
        });
        list.hidden = shown === 0;
        list.previousElementSibling.hidden = shown === 0;
      });
    });
  });
})();
</script>`;
  return layout({
    title: "브랜드는 왜 그렇게 움직였을까 · 글 | 마케터 허보람(브루스)",
    description: "마케터 허보람(브루스)이 브랜드의 선택과 소비자의 반응을 맥락으로 해석한 칼럼 모음. 브랜드·캠페인, 소비자·문화, 마케터의 판단, AI와 일하는 법.",
    url: `${SITE}/writing/`,
    image: `${SITE}/en/og.png`,
    canonical: `${SITE}/writing/`,
    body,
  });
}

function seoulDate(value) {
  const { year, month, day } = toSeoulDateParts(value);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// 검색엔진이 /writing/ 글을 찾도록 사이트 전체 sitemap 을 만든다.
export function renderSitemap(articles) {
  const urls = [
    { loc: `${SITE}/` },
    { loc: `${SITE}/context/` },
    { loc: `${SITE}/en/` },
    { loc: `${SITE}/career/` },
    { loc: `${SITE}/work/` },
    { loc: `${SITE}/talks/` },
    { loc: `${SITE}/en/career/` },
    { loc: `${SITE}/en/work/` },
    { loc: `${SITE}/en/talks/` },
    { loc: `${SITE}/writing/`, lastmod: sortArticles(articles)[0]?.publishedAt },
    ...sortArticles(articles).map((article) => ({ loc: articleUrl(article.id), lastmod: article.publishedAt })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(({ loc, lastmod }) => `  <url><loc>${escapeHtml(loc)}</loc>${lastmod ? `<lastmod>${seoulDate(lastmod)}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`;
}

// /context/ — '마케팅에서 맥락은 왜 중요한가'를 설명하는 대표 페이지. 사례 카드는 실제 백업 글에서 가져온다.
export function renderContextPage(articles, meta = {}) {
  const byId = new Map(articles.map((article) => [article.id, article]));
  const post = (id) => byId.get(id);
  const link = (id, text) => (post(id) ? `<a href="/writing/${id}/">${escapeHtml(text ?? post(id).title)}</a>` : escapeHtml(text ?? ""));
  const cases = (meta.contextCases ?? [])
    .map((id) => post(id))
    .filter(Boolean)
    .map((article) => {
      const thumb = article.coverImage ? `<img src="${escapeHtml(imagePath(article.id, article.coverImage, article.coverLocal))}" alt="" loading="lazy" decoding="async">` : "";
      const insight = meta.posts?.[article.id]?.insight ?? article.subtitle ?? "";
      return `<a class="case-card" href="/writing/${article.id}/">${thumb}<div><strong>${escapeHtml(article.title)}</strong><p>${escapeHtml(insight)}</p></div></a>`;
    })
    .join("\n");
  const series = ["215", "216", "217", "218", "219"].filter((id) => post(id));
  const url = `${SITE}/context/`;
  const description = "소비자는 왜 같은 메시지에도 다르게 반응할까요? 마케터 허보람(브루스)이 브랜드·소비자·시대의 맥락을 읽고 마케팅 판단으로 연결하는 방법을 사례와 함께 설명합니다.";
  const body = `<main>
<article>
<a class="eyebrow" href="/context/">Context</a>
<h1>마케팅에서 맥락은<br>왜 중요한가</h1>
<p class="subtitle">소비자는 메시지만으로 움직이지 않는다. 메시지가 놓인 상황과 경험, 사회적·문화적 맥락 속에서 의미를 해석하고 선택한다. 그래서 마케팅은 무엇을 말할지뿐 아니라, <strong>누구에게 어떤 순간에 어떤 의미로 들릴지</strong>를 판단하는 일이다.</p>
<p class="meta"><a href="/#about">${AUTHOR_LABEL}</a> · 브랜드 커뮤니케이션·IMC 실무에서 정리한 관점</p>
<nav class="toc" aria-label="목차"><ol>
<li><a href="#what">마케팅에서 ‘맥락’이란 무엇인가</a></li>
<li><a href="#why">왜 중요한가</a></li>
<li><a href="#how">어떻게 맥락을 읽고 설계할까</a></li>
<li><a href="#cases">글로 보는 맥락</a></li>
<li><a href="#limits">맥락만으로 모든 것을 설명할 수는 없다</a></li>
<li><a href="#more">더 읽기</a></li>
</ol></nav>
<div class="article">
<h2 id="what">1. 마케팅에서 ‘맥락’이란 무엇인가</h2>
<p>여기서 말하는 맥락은 메시지 바깥에서 그 메시지의 의미를 바꾸는 조건들이다. 실무에서는 네 가지로 나눠 보면 판단이 쉬워진다.</p>
<ul>
<li><strong>소비자의 맥락</strong> — 그 사람이 지금 어떤 상황에 있고, 무엇을 궁금해하며, 어떤 감정으로 제품을 떠올리는가.</li>
<li><strong>브랜드의 맥락</strong> — 브랜드가 그동안 쌓아온 약속과 말투, 사람들이 이미 알고 있는 이미지. 무엇을 해도 자연스럽고 무엇을 하면 어색한지가 여기서 정해진다.</li>
<li><strong>시대·문화의 맥락</strong> — 사회가 그리워하는 것, 지금 통하는 정서와 유머, 커뮤니티마다 다른 문법.</li>
<li><strong>접점·상황의 맥락</strong> — 메시지를 만나는 채널과 순간. 같은 말도 광고에서, 친한 크리에이터의 브이로그에서, 구매 직전의 검색 결과에서 다르게 들린다.</li>
</ul>
<h2 id="why">2. 왜 중요한가</h2>
<p>같은 메시지가 다른 상황에서 전혀 다르게 해석되기 때문이다. 좋은 의도를 담은 캠페인도 대중이 살고 있는 사회의 맥락을 읽지 못하면 지나쳐진다. 반대로 오래된 노래 한 곡이 한 나라의 향수를 정확히 건드리면, 무대 하나가 두 나라에서 화제가 된다(${link("110", "뉴진스 하니의 ‘푸른 산호초’")}).</p>
<p>브랜드 안에서도 마찬가지다. 같은 밈이라도 그동안 자기 말투를 쌓아온 브랜드가 쓰면 ‘그 브랜드답다’고 느끼고, 그렇지 않은 브랜드가 쓰면 ‘갑자기 왜 저러나’ 싶어진다(${link("216", "밈은 터졌는데 브랜드는 남지 않았을 때")}). 메시지의 내용보다 그 메시지를 받아들일 맥락이 먼저 준비되어 있는지가 결과를 가른다.</p>
<p>AI가 답을 대신 찾아 주는 환경에서도 이 점은 더 중요해진다. 사람들은 ‘내 상황에서 무엇을 써야 하는지’를 묻고, AI는 그 상황에 맞는 정보를 찾아 답한다. 제품의 핵심 소구점만이 아니라 제품이 필요한 구체적인 순간이 콘텐츠로 쌓여 있어야 선택지에 오른다(${link("186", "AI에게 선택을 받으려면 맥락을 지배해야 해요")}).</p>
<h2 id="how">3. 어떻게 맥락을 읽고 설계할까</h2>
<p>실무에서는 아래 네 단계로 정리해 보고 있다. 정해진 이론이라기보다, 캠페인을 준비하며 반복해서 쓰는 작업 가설에 가깝다.</p>
<ol class="steps">
<li><strong>발견</strong> — 소비자가 실제로 어떤 질문을 하고 있는지, 검색 결과와 후기에는 어떤 답이 비어 있는지 먼저 본다(${link("217", "후기의 양보다 구매 여정을 설계하는 일")}).</li>
<li><strong>해석</strong> — 그 질문이 왜 생겼는지, 이 브랜드가 어디까지 움직여도 자연스러운지 판단한다. 지켜야 할 것, 지금의 언어로 번역할 것, 실험해도 되는 것을 나누는 단계다(${link("215", "제안서에서 새로움의 경계를 판단하는 법")}).</li>
<li><strong>설계</strong> — 메시지가 놓일 장면과 사람, 채널의 순서를 정한다. 누가 가장 자기답게 이 말을 할 수 있고, 그 관심을 검색·후기·상세 페이지가 어떻게 이어받을지까지 함께 정한다(${link("218", "사람을 고르는 일이 아니라 전환의 맥락을 고르는 일")}).</li>
<li><strong>검증</strong> — 조회수에서 멈추지 않고 브랜드 검색, 상세 페이지 진입, 다음 콘텐츠의 반응처럼 브랜드로 이동한 흔적을 본다. 무엇이 아직 소비자에게 도착하지 않았는지 확인하고, 핵심 약속은 반복하면서 장면을 넓힌다(${link("219", "반복은 아이디어의 부족이 아니라 브랜드 자산의 조건")}).</li>
</ol>
<h2 id="cases">4. 글로 보는 맥락</h2>
<p>아래 글들은 각각 다른 사례에서 같은 질문을 다룬다. 이 메시지는 누구에게, 어떤 순간에, 어떤 의미로 들렸는가.</p>
</div>
<div class="cases">
${cases}
</div>
<div class="article">
<h2 id="limits">5. 맥락만으로 모든 것을 설명할 수는 없다</h2>
<p>맥락은 마케팅을 설명하는 유용한 렌즈이지만 유일한 원인은 아니다. 제품의 경쟁력, 가격, 유통, 미디어 집행 규모와 타이밍이 결과를 좌우하는 경우도 많다. 화제가 된 캠페인을 맥락 하나로 설명하면 이야기는 깔끔해지지만, 실제 성과의 원인을 놓칠 수 있다.</p>
<p>그래서 이 관점은 ‘맥락이 전부’라는 주장이 아니라, 같은 예산과 같은 제품으로도 결과가 달라지는 이유를 찾기 위한 질문에 가깝다. 사례를 볼 때도 확인 가능한 사실과 해석을 구분하려고 한다.</p>
<h2 id="more">6. 더 읽기</h2>
<p>이 관점을 실무의 질문으로 풀어 쓴 연재가 있다. 브런치북 《맥락을 설계하는 일》에도 관련 글을 묶어 두었다.</p>
<ol class="series">
${series.map((id) => `<li>${link(id)}</li>`).join("\n")}
</ol>
<p><a href="/writing/">전체 글 보기</a> · <a href="${CONFIG.profileUrl}" target="_blank" rel="noopener">브런치에서 구독하기</a></p>
</div>
</article>
${AUTHOR_CARD}
</main>`;
  return layout({
    title: "마케팅에서 맥락이 중요한 이유 | 마케터 허보람(브루스)",
    description,
    url,
    image: `${SITE}/en/og.png`,
    canonical: url,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "마케팅에서 맥락은 왜 중요한가",
      description,
      url,
      mainEntityOfPage: url,
      inLanguage: "ko",
      author: AUTHOR,
      about: ["마케팅", "브랜드 커뮤니케이션", "통합 마케팅 커뮤니케이션(IMC)", "맥락"],
    },
    body,
  });
}
