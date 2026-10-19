// 움직이는 도식 장면(스토리보드 MOTION: trend|count|quote|timeline|compare).
// 카드 HTML에 CSS 애니메이션을 넣고, renderFrames가 window.__seek(t)로 시간을 멈춰 가며 프레임을 찍는다.
// 각 카드는 { html, seconds(움직임이 끝나는 시각), sfx: [{ name, at }] } 를 돌려준다. 효과음 이름 = bruce-youtube/channel/sfx/<name>.mp3
import { chrome, cleanLines, COLORS, escapeHtml, page, revealTimes } from "./frames.js";

const EASE = "cubic-bezier(.2,.8,.2,1)";
export const TREND_CREDIT = "네이버 데이터랩 검색어 트렌드";

// "약 3,000만 명" → { prefix: "약 ", value: 3000, decimals: 0, suffix: "만 명" }
export function parseCount(line) {
  const match = String(line ?? "").match(/^(.*?)(\d[\d,]*(?:\.\d+)?)(.*)$/);
  if (!match) return null;
  const raw = match[2].replace(/,/g, "");
  return { prefix: match[1], value: Number(raw), decimals: raw.includes(".") ? raw.split(".")[1].length : 0, comma: match[2].includes(","), suffix: match[3] };
}

function countCard(scene, chapter) {
  const lines = cleanLines(scene.fields.ON_SCREEN_TEXT);
  const count = parseCount(lines[0]);
  if (!count) return null;
  const start = 0.3;
  const duration = 1.4;
  const caption = lines.slice(1, 3);
  const html = page(
    `.wrap{position:absolute;left:150px;right:150px;top:140px;bottom:200px;display:flex;flex-direction:column;justify-content:center}
     .num{font-size:${(count.prefix + count.suffix).length > 6 ? 170 : 220}px;font-weight:900;letter-spacing:-.06em;line-height:1;font-variant-numeric:tabular-nums}
     .num .v{color:${COLORS.green}}
     .num .fix{font-size:.5em;letter-spacing:-.04em}
     .cap{margin-top:44px;font-size:56px;font-weight:800;letter-spacing:-.04em;line-height:1.25;color:#3b3b37}
     .bar{margin-top:36px;height:10px;width:640px;border-radius:5px;background:rgba(17,17,17,.08);overflow:hidden}
     .bar i{display:block;height:100%;background:${COLORS.mint};transform-origin:left;animation:grow ${duration}s ${EASE} ${start}s both}
     @keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}`,
    `${chrome({ chapter })}<div class="wrap">
       <div class="num rv">${count.prefix ? `<span class="fix">${escapeHtml(count.prefix)}</span>` : ""}<span class="v" data-count="${count.value}" data-dec="${count.decimals}" data-comma="${count.comma ? 1 : 0}" data-start="${start}" data-dur="${duration}">${escapeHtml(lines[0].match(/\d[\d,]*(?:\.\d+)?/)[0])}</span>${count.suffix ? `<span class="fix">${escapeHtml(count.suffix)}</span>` : ""}</div>
       <div class="bar"><i></i></div>
       ${caption.map((line, index) => `<div class="cap rv" style="--i:${index + 4}">${escapeHtml(line)}</div>`).join("")}
     </div>`,
  );
  return { html, seconds: Math.max(start + duration, 0.48 + (caption.length + 3) * 0.12) + 0.2, sfx: [{ name: "tick", at: start }, { name: "ding", at: start + duration - 0.05 }] };
}

function quoteCard(scene, chapter) {
  const lines = cleanLines(scene.fields.ON_SCREEN_TEXT);
  if (!lines.length) return null;
  const by = /^[—–]/.test(lines.at(-1)) && lines.length > 1 ? lines.pop().replace(/^[—–]\s*/, "") : "";
  const words = lines.slice(0, 3).map((line) => line.split(/\s+/));
  const total = words.flat().length;
  const step = Math.min(0.09, 1.4 / Math.max(total, 1));
  let index = 0;
  const longest = Math.max(...lines.map((line) => line.length));
  const html = page(
    `.mark{position:absolute;left:130px;top:150px;font-size:300px;line-height:1;font-weight:900;color:${COLORS.mint};opacity:.9}
     .q{position:absolute;left:200px;right:200px;top:150px;bottom:210px;display:flex;flex-direction:column;justify-content:center}
     h1{font-size:${longest > 22 ? 68 : 88}px;line-height:1.3;font-weight:800;letter-spacing:-.045em}
     h1 .w{margin-right:.24em}
     .by{margin-top:40px;font-size:38px;font-weight:700;color:#77776f}`,
    `${chrome({ chapter })}<div class="mark pop">“</div><div class="q"><h1>${words
      .map((line) => line.map((word) => `<span class="w rv" style="--i:0;--d:${(0.25 + step * index++).toFixed(2)}s">${escapeHtml(word)}</span>`).join(""))
      .join("<br>")}</h1>${by ? `<div class="by rv" style="--d:${(0.4 + step * total).toFixed(2)}s">— ${escapeHtml(by)}</div>` : ""}</div>`,
  );
  return { html, seconds: 0.25 + step * total + (by ? 0.8 : 0.6), sfx: [{ name: "page", at: 0.05 }] };
}

// "2019 · 문구", "2019: 문구", "2019년 문구" → { label, text }
export function timelineSteps(lines) {
  return lines.slice(0, 5).map((line) => {
    const match = line.match(/^(.+?)\s*(?:·|:|：|\||—|-)\s+(.+)$/) ?? line.match(/^(\S+)\s+(.+)$/);
    return match ? { label: match[1].trim(), text: match[2].trim() } : { label: "", text: line };
  });
}

function timelineCard(scene, chapter, speech) {
  const lines = cleanLines(scene.fields.ON_SCREEN_TEXT);
  const title = lines.length > 2 && !timelineSteps([lines[0]])[0].label.match(/\d/) ? lines.shift() : "";
  const steps = timelineSteps(lines);
  if (steps.length < 2) return null;
  const gap = 0.45;
  const paced = revealTimes(steps.map((step) => `${step.label} ${step.text}`), speech);
  const at = (index) => paced?.[index] ?? 0.5 + index * gap;
  const width = 1520;
  const html = page(
    `.ttl{position:absolute;left:200px;top:170px;font-size:56px;font-weight:900;letter-spacing:-.045em}
     .line{position:absolute;left:200px;width:${width}px;top:520px;height:6px;border-radius:3px;background:${COLORS.ink};transform-origin:left;
       animation:grow ${(paced ? Math.max(0.6, at(steps.length - 1) - 0.1) : steps.length * gap).toFixed(2)}s linear .3s both}
     @keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
     .step{position:absolute;top:0;width:${Math.floor(width / steps.length)}px;transform:translateX(-50%);text-align:center}
     .dot{position:absolute;top:505px;left:50%;width:36px;height:36px;margin-left:-18px;border-radius:50%;background:${COLORS.mint};box-shadow:0 0 0 8px ${COLORS.ivory}}
     .label{position:absolute;left:0;right:0;top:400px;font-size:52px;font-weight:900;color:${COLORS.green};letter-spacing:-.04em}
     .text{position:absolute;left:12px;right:12px;top:590px;font-size:${steps.length > 4 ? 34 : 40}px;font-weight:700;line-height:1.3;letter-spacing:-.04em}
     .step.last .dot{background:${COLORS.ink}}`,
    `${chrome({ chapter })}${title ? `<div class="ttl rv">${escapeHtml(title)}</div>` : ""}<div class="line"></div>${steps
      .map((step, index) => {
        const left = 200 + (width / steps.length) * (index + 0.5);
        const delay = `--d:${at(index).toFixed(2)}s`;
        return `<div class="step${index === steps.length - 1 ? " last" : ""}" style="left:${left}px"><div class="dot pop" style="${delay}"></div>` +
          `<div class="label rv" style="${delay}">${escapeHtml(step.label)}</div><div class="text rv" style="--i:1;${delay}">${escapeHtml(step.text)}</div></div>`;
      })
      .join("")}`,
  );
  return { html, seconds: at(steps.length - 1) + 0.8, sfx: steps.map((_, index) => ({ name: "pop", at: at(index) })) };
}

// 첫 줄 "A vs B"(또는 "A | B") = 머리, 다음 줄들 "왼쪽 | 오른쪽"
export function compareRows(lines) {
  const split = (line) => line.split(/\s*(?:\||vs\.?|VS|↔)\s*/).map((part) => part.trim()).filter(Boolean);
  const rows = lines.map(split).filter((parts) => parts.length === 2);
  return rows.length ? { head: rows[0], rows: rows.slice(1, 5) } : null;
}

function compareCard(scene, chapter, speech) {
  const table = compareRows(cleanLines(scene.fields.ON_SCREEN_TEXT));
  if (!table) return null;
  const big = !table.rows.length;
  const paced = revealTimes(table.rows.map((row) => row.join(" ")), speech);
  const rowStyle = (index, side) => (paced ? `--i:0;--d:${Math.max(0.9, paced[index] + side * 0.15).toFixed(2)}s` : `--i:${index};--d:${(0.9 + side * 0.15).toFixed(2)}s`);
  const html = page(
    `.cmp{position:absolute;left:180px;right:180px;top:150px;bottom:210px;display:flex;gap:56px;align-items:stretch}
     .col{flex:1;border-radius:32px;padding:56px 60px;display:flex;flex-direction:column;justify-content:center;gap:34px}
     .col.a{background:#fff;border:4px solid ${COLORS.ink};animation:fromLeft .6s ${EASE} .1s both}
     .col.b{background:${COLORS.ink};color:#fff;animation:fromRight .6s ${EASE} .45s both}
     @keyframes fromLeft{from{opacity:0;transform:translateX(-80px)}to{opacity:1;transform:none}}
     @keyframes fromRight{from{opacity:0;transform:translateX(80px)}to{opacity:1;transform:none}}
     .head{font-size:${big ? 96 : 72}px;font-weight:900;letter-spacing:-.05em;line-height:1.15${big ? ";text-align:center" : ""}}
     .col.b .head{color:${COLORS.mint}}
     .item{font-size:50px;font-weight:700;letter-spacing:-.04em;line-height:1.3;padding-top:24px;border-top:2px solid rgba(127,127,127,.25)}
     .vs{position:absolute;left:50%;top:50%;translate:-50% -50%;width:110px;height:110px;border-radius:50%;background:${COLORS.mint};color:#fff;
       display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:900;z-index:2}`,
    `${chrome({ chapter })}<div class="cmp">${table.head
      .map((head, side) => `<div class="col ${side ? "b" : "a"}"><div class="head">${escapeHtml(head)}</div>${table.rows
        .map((row, index) => `<div class="item rv" style="${rowStyle(index, side)}">${escapeHtml(row[side])}</div>`)
        .join("")}</div>`)
      .join("")}<div class="vs pop" style="--d:.8s">VS</div></div>`,
  );
  return { html, seconds: paced ? Math.max(1.6, paced.at(-1) + 0.9) : 1.0 + table.rows.length * 0.12 + 0.6, sfx: [{ name: "whoosh", at: 0.05 }, { name: "whoosh", at: 0.4 }] };
}

// 주간 평균 검색량 → 0~100으로 다시 맞춘 꺾은선. 여러 이름이면 같은 눈금.
export function trendSeries(trend, names = []) {
  const series = trend?.series ?? {};
  const wanted = (names.length ? names : Object.keys(series).slice(0, 1)).filter((name) => series[name]?.length >= 3).slice(0, 3);
  if (!wanted.length) return null;
  const max = Math.max(...wanted.flatMap((name) => series[name].map((point) => point.ratio)), 1e-9);
  return wanted.map((name) => ({ name, points: series[name].map((point) => ({ period: point.period, value: (point.ratio / max) * 100 })) }));
}

function trendCard(scene, chapter, trend) {
  const names = String(scene.motion?.arg ?? "").split(/[,·]/).map((name) => name.trim()).filter(Boolean);
  const lines = trendSeries(trend, names);
  if (!lines) return null;
  const title = cleanLines(scene.fields.ON_SCREEN_TEXT)[0] ?? `‘${lines[0].name}’ 검색량`;
  const box = { left: 200, top: 370, width: 1520, height: 450 };
  const count = lines[0].points.length;
  const x = (index) => box.left + (box.width * index) / (count - 1);
  const y = (value) => box.top + box.height - (box.height * value) / 100;
  const colors = [COLORS.green, COLORS.ink, "#9a9a92"];
  const draw = 1.6;
  const paths = lines.map((line, lineIndex) => {
    const d = line.points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
    const area = lineIndex ? "" : `<path class="area" d="${d} L${x(count - 1)},${box.top + box.height} L${x(0)},${box.top + box.height} Z" fill="${COLORS.mint}" opacity=".18"/>`;
    return `${area}<path class="ln" d="${d}" pathLength="1" fill="none" stroke="${colors[lineIndex]}" stroke-width="${lineIndex ? 6 : 9}" stroke-linecap="round" stroke-linejoin="round" style="--d:${(0.3 + lineIndex * 0.2).toFixed(1)}s"/>`;
  });
  const top = lines[0].points.reduce((best, point, index) => (point.value > lines[0].points[best].value ? index : best), 0);
  const end = lines[0].points.at(-1);
  const short = (period) => period.slice(5).replace("-", ".");
  const weekLabel = (period) => `${Number(period.slice(5, 7))}월 ${Number(period.slice(8, 10))}일`;
  const legend = lines.length > 1 ? lines.map((line, index) => `<span><i style="background:${colors[index]}"></i>${escapeHtml(line.name)}</span>`).join("") : "";
  const html = page(
    `.ttl{position:absolute;left:200px;top:140px;font-size:64px;font-weight:900;letter-spacing:-.05em}
     .sub{position:absolute;left:200px;top:226px;font-size:30px;font-weight:600;color:#77776f}
     svg{position:absolute;inset:0}
     .ln{stroke-dasharray:1;stroke-dashoffset:1;animation:draw ${draw}s ${EASE} both;animation-delay:var(--d)}
     @keyframes draw{to{stroke-dashoffset:0}}
     .area{animation:fade .8s ease ${(0.3 + draw * 0.7).toFixed(2)}s both}
     @keyframes fade{from{opacity:0}}
     .axis{font-size:26px;fill:#77776f;font-weight:600}
     .peak{position:absolute;translate:-50% -100%;padding:10px 18px;border-radius:12px;background:${COLORS.ink};color:#fff;font-size:30px;font-weight:800;white-space:nowrap}
     .legend{position:absolute;right:200px;top:236px;display:flex;gap:28px;font-size:30px;font-weight:700}
     .legend i{display:inline-block;width:28px;height:8px;border-radius:4px;margin-right:10px;vertical-align:middle}`,
    `${chrome({ chapter, credit: TREND_CREDIT })}<div class="ttl rv">${escapeHtml(title)}</div>
     <div class="sub rv" style="--i:1">검색량(상대값) · 최근 90일 · 주 단위</div>${legend ? `<div class="legend rv" style="--i:2">${legend}</div>` : ""}
     <svg width="1920" height="1080"><line x1="${box.left}" y1="${box.top + box.height}" x2="${box.left + box.width}" y2="${box.top + box.height}" stroke="rgba(17,17,17,.2)" stroke-width="2"/>
       ${paths.join("")}
       <text class="axis" x="${box.left}" y="${box.top + box.height + 46}">${short(lines[0].points[0].period)}</text>
       <text class="axis" x="${box.left + box.width}" y="${box.top + box.height + 46}" text-anchor="end">${short(end.period)}</text></svg>
     <div class="peak pop" style="left:${x(top)}px;top:${y(lines[0].points[top].value) - 22}px;--d:${(0.3 + draw * (top / (count - 1))).toFixed(2)}s">가장 높았던 주 · ${weekLabel(lines[0].points[top].period)}</div>`,
  );
  return { html, seconds: 0.3 + draw + 0.6, sfx: [{ name: "chart", at: 0.25 }], credit: TREND_CREDIT };
}

export function motionCard(scene, { chapter, trend, speech } = {}) {
  switch (scene.motion?.type) {
    case "count":
      return countCard(scene, chapter);
    case "quote":
      return quoteCard(scene, chapter);
    case "timeline":
      return timelineCard(scene, chapter, speech);
    case "compare":
      return compareCard(scene, chapter, speech);
    case "trend":
      return trendCard(scene, chapter, trend);
    default:
      return null;
  }
}

// 페이지 안에서 시간을 멈춰 그 순간을 그리는 함수(renderFrames가 setContent 뒤에 넣는다)
export const SEEK_SCRIPT = `window.__seek = (t) => {
  for (const animation of document.getAnimations()) { animation.pause(); animation.currentTime = t * 1000; }
  for (const el of document.querySelectorAll("[data-count]")) {
    const p = Math.min(1, Math.max(0, (t - Number(el.dataset.start || 0)) / Number(el.dataset.dur || 1)));
    const eased = 1 - Math.pow(1 - p, 3);
    const value = Number(el.dataset.count) * eased;
    const dec = Number(el.dataset.dec || 0);
    el.textContent = el.dataset.comma === "1" ? value.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : value.toFixed(dec);
  }
};`;
