import OpenAI from "openai";

/** 주입된 클라이언트가 없을 때만 키를 요구한다. */
export function resolveClient(options, purpose) {
  if (options.client) return options.client;
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error(`OPENAI_API_KEY가 없어 ${purpose}을 중단했습니다.`);
  return new OpenAI({ apiKey });
}
