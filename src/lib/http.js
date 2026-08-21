export class ApiError extends Error {
  constructor(service, status, body) {
    super(`${service} API 오류 (${status}): ${String(body).slice(0, 800)}`);
    this.name = "ApiError";
    this.service = service;
    this.status = status;
    this.body = body;
  }
}

export async function jsonRequest(service, url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) throw new ApiError(service, response.status, text);
  return { response, body };
}

export function requireEnvironment(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`필수 GitHub Secret이 없습니다: ${missing.join(", ")}`);
  }
}
