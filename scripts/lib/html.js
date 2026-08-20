export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * `<!-- name:start ... --> ... <!-- name:end -->` 사이를 새 내용으로 갈아끼웁니다.
 * 마커를 못 찾으면 예외를 던져 조용한 실패를 막습니다.
 */
export function replaceBetweenMarkers(source, name, replacement) {
  const start = new RegExp(`<!--\\s*${name}:start[^>]*-->`);
  const end = new RegExp(`<!--\\s*${name}:end\\s*-->`);
  const startMatch = source.match(start);
  const endMatch = source.match(end);
  if (!startMatch || !endMatch) {
    throw new Error(`'${name}' 마커를 찾지 못했습니다.`);
  }
  const from = startMatch.index + startMatch[0].length;
  const to = endMatch.index;
  if (to < from) throw new Error(`'${name}' 마커 순서가 뒤바뀌었습니다.`);
  return source.slice(0, from) + replacement + source.slice(to);
}
