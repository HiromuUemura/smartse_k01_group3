import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getGoogleAuthUrl } from "../../../../lib/google";

// ビルド時の静的プリレンダリングを無効化（環境変数を参照するため）。
export const dynamic = "force-dynamic";

export async function GET() {
  const state = randomBytes(16).toString("hex");
  const authUrl = getGoogleAuthUrl(state);
  const response = NextResponse.redirect(authUrl);

  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60
  });

  return response;
}
