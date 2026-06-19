import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, setTokenCookies } from "../../../../lib/google";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = cookies().get("google_oauth_state")?.value;

  if (!code) {
    return NextResponse.json({ error: "Missing authorization code" }, { status: 400 });
  }

  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 });
  }

  try {
    const tokenResponse = await exchangeCodeForTokens(code);
    const response = NextResponse.redirect(new URL("/", request.url));
    setTokenCookies(response, tokenResponse);
    response.cookies.set("google_oauth_state", "", { path: "/", expires: new Date(0) });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "OAuth callback failed" },
      { status: 500 }
    );
  }
}
