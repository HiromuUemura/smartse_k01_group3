import { NextRequest, NextResponse } from "next/server";
import {
  getValidAccessToken,
  resolveAttendeeEmailsForAudience
} from "../../../../lib/google";
import type { ReminderSetting, ScheduleAudience, ScheduleCandidate } from "../../../../lib/types";

type CalendarRequestBody = {
  candidate?: ScheduleCandidate;
  schedule?: ScheduleCandidate;
  /** 通知（リマインド）設定。issue #12, #13。 */
  reminders?: ReminderSetting[];
};

// リマインド設定を Google Calendar の reminders 形式に変換する。issue #12, #13。
function buildReminders(reminders?: ReminderSetting[]): Record<string, unknown> | undefined {
  if (!Array.isArray(reminders) || reminders.length === 0) {
    return undefined;
  }
  const overrides = reminders
    .filter((r) => typeof r.minutesBefore === "number" && r.minutesBefore >= 0)
    .map((r) => ({ method: r.method === "email" ? "email" : "popup", minutes: r.minutesBefore }));
  if (overrides.length === 0) {
    return undefined;
  }
  return { useDefault: false, overrides };
}

function addOneDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function addMinutesToTime(time: string, minutes: number): string {
  const [hours, mins] = time.split(":").map(Number);
  const totalMinutes = hours * 60 + mins + minutes;
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const nextHours = Math.floor(wrapped / 60).toString().padStart(2, "0");
  const nextMinutes = (wrapped % 60).toString().padStart(2, "0");
  return `${nextHours}:${nextMinutes}`;
}

function buildAttendees(audience: ScheduleAudience, attendees?: string[]): Array<{ email: string }> {
  const emails =
    attendees && attendees.length > 0 ? attendees : resolveAttendeeEmailsForAudience(audience);
  return emails.map((email) => ({ email }));
}

function buildCalendarEvent(candidate: ScheduleCandidate) {
  if (!candidate.date) {
    throw new Error("The extracted schedule is missing a date.");
  }

  const summary = candidate.title.trim() || "OCR Schedule";
  const descriptionParts = [
    "Imported from OCR Schedule Assistant.",
    candidate.notes ? `Notes: ${candidate.notes}` : null,
    candidate.items.length ? `Items: ${candidate.items.join(", ")}` : null,
    `Audience: ${candidate.audience}`
  ].filter(Boolean);

  const event: Record<string, unknown> = {
    summary,
    description: descriptionParts.join("\n")
  };

  if (candidate.startTime) {
    const endTime = candidate.endTime ?? addMinutesToTime(candidate.startTime, 60);
    event.start = {
      dateTime: `${candidate.date}T${candidate.startTime}:00`,
      timeZone: "Asia/Tokyo"
    };
    event.end = {
      dateTime: `${candidate.date}T${endTime}:00`,
      timeZone: "Asia/Tokyo"
    };
  } else {
    event.start = { date: candidate.date };
    event.end = { date: addOneDay(candidate.date) };
  }

  return event;
}

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });

  try {
    // 先に入力検証（認証状態に関係なく明確なエラーを返す）。
    const body = (await request.json()) as CalendarRequestBody;
    const candidate = body.candidate ?? body.schedule;

    if (!candidate) {
      return NextResponse.json({ error: "Missing schedule data." }, { status: 400 });
    }

    if (!candidate.date) {
      return NextResponse.json(
        { error: "日付が未確定です。確認画面で日付を入力してから登録してください。" },
        { status: 400 }
      );
    }

    if (!candidate.audience) {
      candidate.audience = "family";
    }

    const accessToken = await getValidAccessToken(response);
    const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

    const event = buildCalendarEvent(candidate);
    const attendees = buildAttendees(candidate.audience, candidate.attendees);
    if (attendees.length > 0) {
      event.attendees = attendees;
    }

    const reminders = buildReminders(body.reminders);
    if (reminders) {
      event.reminders = reminders;
    }

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
      message: "Google Calendar に予定を登録しました。",
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
    message: "POST a schedule candidate to create a calendar event.",
    requiredEnv: [
      process.env.GOOGLE_CLIENT_ID ? "GOOGLE_CLIENT_ID" : "",
      process.env.GOOGLE_CLIENT_SECRET ? "GOOGLE_CLIENT_SECRET" : "",
      process.env.PARENT_ATTENDEES ? "PARENT_ATTENDEES" : "",
      process.env.FAMILY_ATTENDEES ? "FAMILY_ATTENDEES" : ""
    ].filter(Boolean)
  });
}
