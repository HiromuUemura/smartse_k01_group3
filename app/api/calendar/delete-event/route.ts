import { NextRequest, NextResponse } from "next/server";
import { getValidAccessToken } from "../../../../lib/google";

// 登録したGoogleカレンダーのイベントを取り消す（削除する）エンドポイント。
// 誤登録のリカバリ用。eventId を受け取り、参加者にも更新通知を送って削除する。

type Body = { eventId?: string };

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  try {
    const body = (await request.json()) as Body;
    const eventId = body.eventId?.trim();
    if (!eventId) {
      return NextResponse.json({ error: "eventId が指定されていません。" }, { status: 400 });
    }

    const accessToken = await getValidAccessToken(response);
    const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
    );

    // 204 No Content が成功。既に削除済み(410/404)も成功扱いにする。
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      const errorText = await res.text();
      return NextResponse.json(
        { error: `Calendar API failed: ${res.status} ${errorText}` },
        { status: res.status }
      );
    }

    return NextResponse.json({ message: "予定を取り消しました。" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "取り消しに失敗しました" },
      { status: 500 }
    );
  }
}
