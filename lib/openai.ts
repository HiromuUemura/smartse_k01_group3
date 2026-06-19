import { cookies } from "next/headers";
import type { ExtractionResult } from "./types";
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from "./prompts";

// OpenAI 連携のヘルパー。
// 要グループ確認: 最初は GPT-5 nano / mini を使う方針。
//   - 既定モデル・利用可能なモデルIDは OpenAI のドキュメントで要確認（下の DEFAULT_MODEL / ALLOWED_MODELS）。
//   - Chat Completions API を使用。GPT-5 系で必要なパラメータ（max_completion_tokens 等）や
//     Responses API への移行が必要かは検証して調整する。

const OPENAI_KEY_COOKIE = "openai_api_key";
const OPENAI_MODEL_COOKIE = "openai_model";

// 要グループ確認: 実在するモデルIDか、nano/mini の正式名称かを OpenAI ドキュメントで確認する。
export const ALLOWED_MODELS = ["gpt-5-nano", "gpt-5-mini"] as const;
export type OpenAiModel = (typeof ALLOWED_MODELS)[number];
export const DEFAULT_MODEL: OpenAiModel = "gpt-5-nano";

export function getStoredOpenAiKey(): string | undefined {
  // GUIから保存されたキー（httpOnly Cookie）を優先し、無ければ環境変数を使う。
  const fromCookie = cookies().get(OPENAI_KEY_COOKIE)?.value;
  return fromCookie || process.env.OPENAI_API_KEY || undefined;
}

export function hasOpenAiKey(): boolean {
  return Boolean(getStoredOpenAiKey());
}

export function getStoredOpenAiModel(): OpenAiModel {
  const fromCookie = cookies().get(OPENAI_MODEL_COOKIE)?.value;
  if (fromCookie && (ALLOWED_MODELS as readonly string[]).includes(fromCookie)) {
    return fromCookie as OpenAiModel;
  }
  const fromEnv = process.env.OPENAI_MODEL;
  if (fromEnv && (ALLOWED_MODELS as readonly string[]).includes(fromEnv)) {
    return fromEnv as OpenAiModel;
  }
  return DEFAULT_MODEL;
}

export const OPENAI_COOKIE_NAMES = {
  key: OPENAI_KEY_COOKIE,
  model: OPENAI_MODEL_COOKIE
};

// OpenAI の Structured Outputs 用スキーマ。strict モードでは全プロパティを required にし、
// nullable は ["type", "null"] で表現する必要がある。
const EXTRACTION_JSON_SCHEMA = {
  name: "extraction_result",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      candidates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            date: { type: ["string", "null"] },
            startTime: { type: ["string", "null"] },
            endTime: { type: ["string", "null"] },
            location: { type: ["string", "null"] },
            items: { type: "array", items: { type: "string" } },
            deadline: { type: ["string", "null"] },
            notes: { type: ["string", "null"] },
            missingFields: { type: "array", items: { type: "string" } },
            confidence: { type: ["number", "null"] }
          },
          required: [
            "title",
            "date",
            "startTime",
            "endTime",
            "location",
            "items",
            "deadline",
            "notes",
            "missingFields",
            "confidence"
          ]
        }
      },
      warning: { type: ["string", "null"] }
    },
    required: ["candidates", "warning"]
  }
} as const;

export async function extractScheduleFromImage(
  imageDataUrl: string,
  apiKey: string,
  model: OpenAiModel
): Promise<ExtractionResult> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: EXTRACTION_USER_PROMPT },
            { type: "image_url", image_url: { url: imageDataUrl } }
          ]
        }
      ],
      response_format: { type: "json_schema", json_schema: EXTRACTION_JSON_SCHEMA }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI API returned no content");
  }

  const parsed = JSON.parse(content) as ExtractionResult;
  return parsed;
}
