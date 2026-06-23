import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

const ACCESS_TOKEN_COOKIE = "google_access_token";
const REFRESH_TOKEN_COOKIE = "google_refresh_token";
const TOKEN_EXPIRES_AT_COOKIE = "google_token_expires_at";
const PARENT_ATTENDEES_ENV = "PARENT_ATTENDEES";
const FAMILY_ATTENDEES_ENV = "FAMILY_ATTENDEES";

export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export function getGoogleAuthUrl(state: string): string {
  const clientId = getRequiredEnv("GOOGLE_CLIENT_ID");
  const redirectUri = getRequiredEnv("GOOGLE_REDIRECT_URI");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
};

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  const clientId = getRequiredEnv("GOOGLE_CLIENT_ID");
  const clientSecret = getRequiredEnv("GOOGLE_CLIENT_SECRET");
  const redirectUri = getRequiredEnv("GOOGLE_REDIRECT_URI");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const clientId = getRequiredEnv("GOOGLE_CLIENT_ID");
  const clientSecret = getRequiredEnv("GOOGLE_CLIENT_SECRET");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

export function setTokenCookies(response: NextResponse, tokenResponse: GoogleTokenResponse): void {
  const expiresAt = Date.now() + tokenResponse.expires_in * 1000;

  response.cookies.set(ACCESS_TOKEN_COOKIE, tokenResponse.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });

  response.cookies.set(TOKEN_EXPIRES_AT_COOKIE, String(expiresAt), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });

  if (tokenResponse.refresh_token) {
    response.cookies.set(REFRESH_TOKEN_COOKIE, tokenResponse.refresh_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/"
    });
  }
}

export function clearTokenCookies(response: NextResponse): void {
  for (const name of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, TOKEN_EXPIRES_AT_COOKIE]) {
    response.cookies.set(name, "", { path: "/", expires: new Date(0) });
  }
}

export async function getValidAccessToken(response: NextResponse): Promise<string> {
  const cookieStore = cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
  const expiresAt = Number(cookieStore.get(TOKEN_EXPIRES_AT_COOKIE)?.value ?? "0");

  if (!accessToken) {
    throw new Error("Not authenticated. Please sign in with Google first.");
  }

  // Refresh one minute before expiry.
  if (Date.now() < expiresAt - 60_000) {
    return accessToken;
  }

  if (!refreshToken) {
    throw new Error("Access token expired and no refresh token is available. Please sign in again.");
  }

  const refreshed = await refreshAccessToken(refreshToken);
  setTokenCookies(response, refreshed);
  return refreshed.access_token;
}

export function resolveAttendeeEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

export function resolveAttendeesForAudience(audience: "parent" | "family"): Array<{ email: string }> {
  const primaryEnv = audience === "parent" ? PARENT_ATTENDEES_ENV : FAMILY_ATTENDEES_ENV;
  const fallbackEnv = audience === "parent" ? FAMILY_ATTENDEES_ENV : PARENT_ATTENDEES_ENV;
  const emails = resolveAttendeeEmails(process.env[primaryEnv]);
  const fallbackEmails = resolveAttendeeEmails(process.env[fallbackEnv]);
  const finalEmails = emails.length > 0 ? emails : fallbackEmails;

  return finalEmails.map((email) => ({ email }));
}

export function resolveAttendeeEmailsForAudience(audience: "parent" | "family"): string[] {
  return resolveAttendeesForAudience(audience).map((attendee) => attendee.email);
}

export function getFamilyAttendees(): Array<{ email: string }> {
  return resolveAttendeesForAudience("family");
}

export function getParentAttendees(): Array<{ email: string }> {
  return resolveAttendeesForAudience("parent");
}
