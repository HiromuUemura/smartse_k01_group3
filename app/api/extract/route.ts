import { NextRequest, NextResponse } from "next/server";
import {
  extractScheduleFromImage,
  getStoredOpenAiKey,
  getStoredOpenAiModel
} from "../../../lib/openai";
import { getMockExtractionResult } from "../../../lib/mock";

// 画像をアップロードして予定情報を抽出するエンドポイント。Phase A-2 / issue #9。
// multipart/form-data の "image" フィールドで画像を受け取り、ExtractionResult を返す。
// "mock" フィールドが "true" の場合は、LLMを使わずダミー結果を返す（疎通確認用）。

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("image");
    const useMock = String(formData.get("mock") ?? "") === "true";

    // ダミーモード: APIキー・画像なしでも動かせる（パイプライン疎通確認用）。
    if (useMock) {
      const fileName = file instanceof File ? file.name : undefined;
      return NextResponse.json({ model: "mock", result: getMockExtractionResult(fileName) });
    }

    const apiKey = getStoredOpenAiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI APIキーが設定されていません。画面からキーを入力してください。" },
        { status: 400 }
      );
    }

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "画像が選択されていません。" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const mediaType = file.type || "image/jpeg";
    const dataUrl = `data:${mediaType};base64,${bytes.toString("base64")}`;

    const model = getStoredOpenAiModel();
    const result = await extractScheduleFromImage(dataUrl, apiKey, model);

    return NextResponse.json({ model, result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "抽出に失敗しました" },
      { status: 500 }
    );
  }
}
