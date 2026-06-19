import type { ExtractionResult } from "./types";

// LLMを使わずに動作確認するためのダミー抽出結果。
// 画像の内容は解析せず、固定のサンプルを返す（パイプラインの疎通確認用）。
export function getMockExtractionResult(fileName?: string): ExtractionResult {
  return {
    candidates: [
      {
        title: "授業参観",
        date: "2026-06-25",
        startTime: "13:30",
        endTime: "15:00",
        location: "体育館",
        items: ["上履き", "筆記用具"],
        deadline: null,
        notes: `ダミーデータです（LLM未使用）${fileName ? ` / 入力ファイル: ${fileName}` : ""}`,
        missingFields: [],
        confidence: 0.5
      },
      {
        title: "プリント提出",
        date: null,
        startTime: null,
        endTime: null,
        location: null,
        items: [],
        deadline: "2026-06-30",
        notes: "ダミーデータです（LLM未使用）。日付・時刻が読み取れない例。",
        missingFields: ["date", "startTime"]
      }
    ],
    warning: "これはダミー応答です。実際の画像内容は解析していません。"
  };
}
