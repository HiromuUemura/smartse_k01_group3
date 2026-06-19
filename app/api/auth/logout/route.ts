import { NextRequest, NextResponse } from "next/server";
import { clearTokenCookies } from "../../../../lib/google";

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.url));
  clearTokenCookies(response);
  return response;
}
