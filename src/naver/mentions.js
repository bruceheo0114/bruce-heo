import { cleanText, kstDate, parseNaverDate } from "./issues.js";

// 브루스 이름·브랜드·최근 글 제목이 남의 블로그·카페·뉴스에 언급된 것을 모은다(내 채널 글은 뺀다).
export const BRAND_QUERIES = [
  { query: "브루스 인사이트", must: /브루스\s?인사이트|bruce\.?insight/i },
  { query: "브루스매거진", must: /브루스\s?매거진/ },
  { query: "bruceheo", must: /bruceheo/i },
  { query: "맥락 설계자 브루스", must: /맥락\s?설계/ },
  // "허보람"은 동명이인이 많아 마케팅 맥락이 같이 있을 때만 남긴다.
  { query: "허보람 마케터", must: /허보람/, context: /마케터|마케팅|브루스|브런치|광고|캠페인|IMC|에이전시/ },
];
export const MENTION_TYPES = ["blog", "cafearticle", "news"];
const OWN = /brunch\.co\.kr\/@heoboram|bruceheo\.com|aiforwork\.kr|instagram\.com\/bruce\.insight|threads\.(net|com)\/@heo\.boram/i;

// 최근 글 제목은 앞 12자가 그대로 들어간 글만 언급으로 본다(검색 API 는 낱말 일부만 맞아도 돌려준다).
export function titleQueries(posts, limit = 4) {
  return posts.slice(0, limit).map((post) => {
    const core = cleanText(post.title).replace(/[?!.…]+$/, "").slice(0, 12);
    return { query: cleanText(post.title), must: new RegExp(core.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), post: post.id };
  });
}

export function pickMentions(items, { type, rule, since }) {
  const mentions = [];
  for (const item of items) {
    const link = item.originallink || item.link;
    const date = parseNaverDate(item.postdate ?? item.pubDate);
    if (!link || OWN.test(link) || OWN.test(item.bloggerlink ?? "") || !date || date < since) continue;
    const title = cleanText(item.title);
    const description = cleanText(item.description);
    const text = `${title} ${description}`;
    if (!rule.must.test(text) || (rule.context && !rule.context.test(text))) continue;
    mentions.push({
      type,
      query: rule.query,
      ...(rule.post ? { post: rule.post } : {}),
      title,
      description: description.slice(0, 140),
      by: cleanText(item.bloggername ?? item.cafename ?? ""),
      date: kstDate(date),
      url: link,
    });
  }
  return mentions;
}
