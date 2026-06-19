import { NextRequest, NextResponse } from "next/server";
import { ALLOWED_MODELS, OPENAI_COOKIE_NAMES } from "../../../../lib/openai";

// GUIから入力された OpenAI APIキー（とモデル）を保存・削除するエンドポイント。
//
// 要グループ確認（セキュリティ）:
//   APIキーは httpOnly Cookie に保存し、サーバ側からのみ OpenAI 呼び出しに使う方針。
//   ブラウザのJSからは読めず、フォーム送信もHTMLフォーム経由なのでデモ用途では妥当。
//   ただし本番運用では「各自が自分のキーを入力する」前提か、サーバの環境変数/シークレット管理に
//   寄せるかをグループで決める。共有サーバに他人のキーを保存する形は避ける。

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();

  const response = NextResponse.redirect(new URL("/", request.url));

  if (!apiKey) {
    return NextResponse.json({ error: "APIキーが空です" }, { status: 400 });
  }

  response.cookies.set(OPENAI_COOKIE_NAMES.key, apiKey, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });

  if (model && (ALLOWED_MODELS as readonly string[]).includes(model)) {
    response.cookies.set(OPENAI_COOKIE_NAMES.model, model, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/"
    });
  }

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  for (const name of [OPENAI_COOKIE_NAMES.key, OPENAI_COOKIE_NAMES.model]) {
    response.cookies.set(name, "", { path: "/", expires: new Date(0) });
  }
  return response;
}
