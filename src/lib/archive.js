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

export function formatKoreanDate(value) {
  const { year, month, day } = toSeoulDateParts(value);
  return `${year}. ${month}. ${day}.`;
}

// 저장소에 내려받은 이미지가 있으면 그 주소를, 없으면 브런치 이미지 주소를 쓴다.
function imagePath(articleId, src, local, absolute = false) {
  if (!local) return src;
  return `${absolute ? SITE : ""}/writing/${articleId}/${local}`;
}

// 브런치 썸네일 주소(…?fname=…/image/abc.jpg)에서 원본 파일 이름을 뽑아 저장 파일 이름으로 쓴다.
export function localImageName(url) {
  const value = String(url);
  const original = value.includes("fname=") ? decodeURIComponent(value.split("fname=").pop()) : value.split("?")[0];
  const base = original.split("/").pop().replace(/[^A-Za-z0-9._-]/g, "_");
  if (/\.(jpe?g|png|gif|webp)$/i.test(base)) return base;
  return `${base || "image"}.${value.match(/\.f(png|gif|webp)\//)?.[1] ?? "jpg"}`;
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
:root{--bg:#fff;--bg-soft:#F9FAFB;--border:#F2F4F6;--border-strong:#E5E8EB;--text:#191F28;--text-2:#4E5968;--text-3:#8B95A1;--accent:#3182F6;--accent-strong:#1B64DA;--column:720px}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{background:var(--bg);color:var(--text);font-family:'Pretendard Variable',Pretendard,-apple-system,BlinkMacSystemFont,system-ui,Roboto,'Helvetica Neue','Segoe UI',sans-serif;line-height:1.6;word-break:keep-all;overflow-wrap:break-word}
a{color:inherit;text-decoration:none}
.top{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--border)}
.top__in{max-width:var(--column);margin:0 auto;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;font-size:14px}
.top__brand{font-weight:800;letter-spacing:-.01em}
.top__nav{display:flex;gap:18px;color:var(--text-2);font-weight:600}
.top__nav a:hover{color:var(--accent)}
main{max-width:var(--column);margin:0 auto;padding:56px 20px 96px}
.eyebrow{display:inline-block;font-size:13px;font-weight:700;color:var(--accent);margin-bottom:14px}
h1{font-size:clamp(28px,5vw,40px);line-height:1.3;letter-spacing:-.03em;font-weight:800}
.subtitle{margin-top:14px;font-size:clamp(17px,2.4vw,20px);color:var(--text-2);line-height:1.5}
.meta{margin-top:20px;font-size:14px;color:var(--text-3)}
.cover{margin:36px 0 8px;border-radius:20px;overflow:hidden;background:var(--bg-soft)}
.cover img{display:block;width:100%;height:auto}
.article{margin-top:40px;font-size:17.5px;line-height:1.9;color:#333D4B}
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
.list-head p{margin-top:14px;color:var(--text-2);font-size:16px}
.year{margin-top:48px;font-size:14px;font-weight:800;color:var(--text-3);letter-spacing:.04em}
.posts{margin-top:12px;border-top:1px solid var(--border-strong)}
.post{display:grid;grid-template-columns:96px 1fr;gap:16px;padding:20px 4px;border-bottom:1px solid var(--border)}
.post:hover .post__title{color:var(--accent)}
.post__date{font-size:14px;color:var(--text-3);padding-top:2px;font-variant-numeric:tabular-nums}
.post__title{font-size:17px;font-weight:700;line-height:1.45;letter-spacing:-.01em;transition:color .15s}
.post__sub{margin-top:4px;font-size:14px;color:var(--text-3);line-height:1.5}
footer{border-top:1px solid var(--border);padding:28px 20px;text-align:center;font-size:13px;color:var(--text-3)}
@media (max-width:560px){main{padding:40px 16px 72px}.top__in{padding:12px 16px}.article{font-size:16.5px}.post{grid-template-columns:1fr;gap:4px}.pager{grid-template-columns:1fr}.pager .next{grid-column:1}}
`;

function layout({ title, description, url, image, canonical, jsonLd = null, body }) {
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
<meta name="twitter:card" content="summary_large_image">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replaceAll("<", "\\u003c")}</script>` : ""}
<link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>${STYLE}</style>
</head>
<body>
<header class="top"><div class="top__in"><a class="top__brand" href="/">브루스 허</a><nav class="top__nav"><a href="/writing/">글 목록</a><a href="${CONFIG.profileUrl}" target="_blank" rel="noopener">브런치</a></nav></div></header>
${body}
<footer>© 브루스 허 · 브런치 <a href="${CONFIG.profileUrl}" target="_blank" rel="noopener">@${CONFIG.profileId}</a></footer>
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

export function renderArticlePage(article, { newer = null, older = null } = {}) {
  const description = article.subtitle || article.excerpt.slice(0, 120);
  const ogImage = article.coverImage ? imagePath(article.id, article.coverImage, article.coverLocal, true) : null;
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
<p class="meta">브루스 · <time datetime="${escapeHtml(article.publishedAt)}">${formatKoreanDate(article.publishedAt)}</time></p>
${cover}
<div class="article">
${article.blocks.map((block) => blockHtml(block, article.id)).join("\n")}
</div>
</article>
<p class="source">이 글은 브런치에도 발행했습니다. 댓글과 구독은 <a href="${escapeHtml(article.canonicalUrl)}" target="_blank" rel="noopener">브런치 원문</a>에서 할 수 있습니다.</p>
${pager ? `<nav class="pager">${pager}</nav>` : ""}
</main>`;
  return layout({
    title: `${article.title} · 브루스 허`,
    description,
    url: articleUrl(article.id),
    image: ogImage ?? `${SITE}/en/og.png`,
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
      author: { "@type": "Person", name: "허보람", alternateName: "Bruce Heo", url: `${SITE}/` },
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

export function renderArchiveIndex(articles) {
  const sorted = sortArticles(articles);
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
    return `<a class="post" href="/writing/${article.id}/"><div class="post__date">${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}</div><div><div class="post__title">${escapeHtml(article.title)}</div>${article.subtitle ? `<div class="post__sub">${escapeHtml(article.subtitle)}</div>` : ""}</div></a>`;
  })
  .join("\n")}
</div>`)
    .join("\n");
  const body = `<main>
<div class="list-head">
<span class="eyebrow">Writing</span>
<h1>브랜드는 왜<br>그렇게 움직였을까</h1>
<p>브런치에 쓴 글 ${sorted.length}편을 원문 그대로 모아 두었습니다.</p>
</div>
${sections}
</main>`;
  return layout({
    title: "Writing · 브루스 허",
    description: "브랜드가 기억되는 방식, 소비가 움직이는 이유, AI 이후의 마케팅에 대해 쓴 브루스 허의 글 모음.",
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
    { loc: `${SITE}/en/` },
    { loc: `${SITE}/writing/`, lastmod: sortArticles(articles)[0]?.publishedAt },
    ...sortArticles(articles).map((article) => ({ loc: articleUrl(article.id), lastmod: article.publishedAt })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(({ loc, lastmod }) => `  <url><loc>${escapeHtml(loc)}</loc>${lastmod ? `<lastmod>${seoulDate(lastmod)}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`;
}
