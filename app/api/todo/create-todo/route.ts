import { NextRequest, NextResponse } from "next/server";
import { getValidAccessToken } from "../../../../lib/google";
import type { ScheduleCandidate } from "../../../../lib/types";

type TodoRequestBody = { candidate: ScheduleCandidate };

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  try {
    const body = (await request.json()) as TodoRequestBody;
    const { candidate } = body;

    if (!candidate) {
      return NextResponse.json({ error: "Missing candidate data." }, { status: 400 });
    }
    if (!candidate.items || candidate.items.length === 0) {
      return NextResponse.json({ taskIds: [], count: 0 });
    }

    const accessToken = await getValidAccessToken(response);
    const tasklistId = process.env.GOOGLE_TASKLIST_ID ?? "@default";
    const dueDate = candidate.date ? `${candidate.date}T00:00:00.000Z` : undefined;

    const taskIds: string[] = [];
    for (const item of candidate.items) {
      const taskBody: Record<string, unknown> = {
        title: item,
        notes: `「${candidate.title}」の持ち物`
      };
      if (dueDate) taskBody.due = dueDate;

      const taskRes = await fetch(
        `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(tasklistId)}/tasks`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(taskBody)
        }
      );
      if (taskRes.ok) {
        const created = await taskRes.json();
        taskIds.push(created.id);
      }
    }

    return NextResponse.json({
      message: `Google Tasks に ${taskIds.length} 件のタスクを登録しました。`,
      taskIds,
      count: taskIds.length
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create tasks" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  try {
    const accessToken = await getValidAccessToken(response);
    const listsRes = await fetch(
      "https://tasks.googleapis.com/tasks/v1/users/@me/lists",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const listsData = await listsRes.json();
    return NextResponse.json({ lists: listsData.items ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get task lists" },
      { status: 500 }
    );
  }
}
