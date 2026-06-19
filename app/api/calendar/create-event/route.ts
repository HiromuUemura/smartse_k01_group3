import { NextResponse } from "next/server";
import { getFamilyAttendees, getRequiredEnv, getValidAccessToken } from "../../../../lib/google";

export async function POST() {
  const response = NextResponse.json({ ok: true });

  try {
    const accessToken = await getValidAccessToken(response);
    const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const event = {
      summary: "APIテスト予定",
      description: "OCR Schedule Assistantから登録したテスト予定です。",
      start: {
        dateTime: start.toISOString(),
        timeZone: "Asia/Tokyo"
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: "Asia/Tokyo"
      },
      attendees: getFamilyAttendees()
    };

    const calendarResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(event)
      }
    );

    if (!calendarResponse.ok) {
      const errorText = await calendarResponse.text();
      return NextResponse.json(
        { error: `Calendar API failed: ${calendarResponse.status} ${errorText}` },
        { status: calendarResponse.status }
      );
    }

    const createdEvent = await calendarResponse.json();
    return NextResponse.json({
      message: "Googleカレンダーにテスト予定を作成しました。",
      eventId: createdEvent.id,
      htmlLink: createdEvent.htmlLink
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create event" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Use POST /api/calendar/create-event after signing in with Google.",
    requiredEnv: [
      getRequiredEnv("GOOGLE_CLIENT_ID") ? "GOOGLE_CLIENT_ID" : "",
      getRequiredEnv("GOOGLE_CLIENT_SECRET") ? "GOOGLE_CLIENT_SECRET" : ""
    ].filter(Boolean)
  });
}
