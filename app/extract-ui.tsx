"use client";

import { useState } from "react";
import type {
  ExtractionResult,
  ReminderSetting,
  ScheduleAudience,
  ScheduleCandidate,
  ScheduleField
} from "../lib/types";

type Props = {
  hasKey: boolean;
  currentModel: string;
  isSignedIn: boolean;
};

type RecurrenceKey = "none" | "daily" | "weekly" | "monthly" | "yearly";

// 確認・編集UI用の状態。抽出結果を編集可能な形に持つ（issue #4 / #5 / #6）。
type EditState = {
  title: string;
  date: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  location: string;
  itemsText: string;
  deadline: string;
  notes: string;
  audience: ScheduleAudience;
  attendeesText: string;
  missingFields: ScheduleField[];
  // 通知（issue #12 / #13）。-1 = なし。分単位。
  notify1: number;
  notify2: number;
  recurrence: RecurrenceKey;
};

// 通知プルダウンの選択肢（Google カレンダー準拠）。値は「予定の何分前か」。-1 はなし。
const NOTIFY_OPTIONS: Array<{ label: string; value: number }> = [
  { label: "なし", value: -1 },
  { label: "イベントの予定時刻", value: 0 },
  { label: "5分前", value: 5 },
  { label: "10分前", value: 10 },
  { label: "15分前", value: 15 },
  { label: "30分前", value: 30 },
  { label: "1時間前", value: 60 },
  { label: "2時間前", value: 120 },
  { label: "1日前", value: 1440 },
  { label: "2日前", value: 2880 },
  { label: "1週間前", value: 10080 }
];

const RECURRENCE_OPTIONS: Array<{ label: string; value: RecurrenceKey }> = [
  { label: "なし", value: "none" },
  { label: "毎日", value: "daily" },
  { label: "毎週", value: "weekly" },
  { label: "毎月", value: "monthly" },
  { label: "毎年", value: "yearly" }
];

const FIELD_LABELS: Record<ScheduleField, string> = {
  title: "タイトル",
  date: "日付",
  startTime: "開始時刻",
  endTime: "終了時刻",
  location: "場所",
  items: "持ち物",
  deadline: "締切"
};

function toEditState(c: ScheduleCandidate): EditState {
  return {
    title: c.title ?? "",
    date: c.date ?? "",
    allDay: !c.startTime,
    startTime: c.startTime ?? "",
    endTime: c.endTime ?? "",
    location: c.location ?? "",
    itemsText: c.items.join(", "),
    deadline: c.deadline ?? "",
    notes: c.notes ?? "",
    audience: c.audience ?? "family",
    attendeesText: (c.attendees ?? []).join(", "),
    missingFields: c.missingFields ?? [],
    notify1: 1440, // 既定: 1日前
    notify2: -1, // 既定: なし
    recurrence: "none"
  };
}

export default function ExtractUi({ hasKey, currentModel, isSignedIn }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [usedModel, setUsedModel] = useState<string | null>(null);
  const [edits, setEdits] = useState<EditState[] | null>(null);
  const [calendarMessage, setCalendarMessage] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [creatingIndex, setCreatingIndex] = useState<number | null>(null);
  const [useMock, setUseMock] = useState(true);

  function updateEdit(index: number, patch: Partial<EditState>) {
    setEdits((prev) => (prev ? prev.map((e, i) => (i === index ? { ...e, ...patch } : e)) : prev));
  }

  async function onExtract(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setWarning(null);
    setUsedModel(null);
    setEdits(null);
    setCalendarMessage(null);
    setCalendarError(null);

    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("image") as HTMLInputElement;

    const body = new FormData();
    if (useMock) {
      body.append("mock", "true");
      if (fileInput?.files?.length) {
        body.append("image", fileInput.files[0]);
      }
    } else {
      if (!fileInput?.files?.length) {
        setError("画像を選択してください。");
        return;
      }
      body.append("image", fileInput.files[0]);
    }

    setLoading(true);
    try {
      const res = await fetch("/api/extract", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "抽出に失敗しました。");
        return;
      }
      const result = data.result as ExtractionResult;
      setUsedModel(data.model ?? null);
      setWarning(result.warning ?? null);
      setEdits(result.candidates.map(toEditState));
    } catch (err) {
      setError(err instanceof Error ? err.message : "通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  async function onCreateEvent(index: number) {
    const e = edits?.[index];
    if (!e) return;

    setCalendarMessage(null);
    setCalendarError(null);

    if (!e.date) {
      setCalendarError("日付を入力してください（カレンダー登録には日付が必須です）。");
      return;
    }

    const candidate: ScheduleCandidate = {
      title: e.title.trim() || "予定",
      date: e.date,
      startTime: e.allDay ? null : e.startTime || null,
      endTime: e.allDay ? null : e.endTime || null,
      location: e.location.trim() || null,
      items: e.itemsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      deadline: e.deadline || null,
      notes: e.notes.trim() || null,
      missingFields: [],
      audience: e.audience,
      // 手動で指定があれば優先。空ならサーバが対象(parent/family)から自動付与。
      attendees: e.attendeesText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    };

    // 通知＋予備の通知をまとめる（なし/重複は除外）。
    const minutes = [e.notify1, e.notify2].filter((m) => m >= 0);
    const reminders: ReminderSetting[] = Array.from(new Set(minutes)).map((m) => ({
      method: "popup",
      minutesBefore: m
    }));

    setCreatingIndex(index);
    try {
      const response = await fetch("/api/calendar/create-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate,
          reminders,
          recurrence: e.recurrence === "none" ? undefined : e.recurrence
        })
      });
      const data = (await response.json()) as { message?: string; htmlLink?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Google カレンダーへの登録に失敗しました。");
      }
      setCalendarMessage(
        data.htmlLink
          ? `${data.message ?? "Google カレンダーに登録しました。"} ${data.htmlLink}`
          : data.message ?? "Google カレンダーに登録しました。"
      );
    } catch (err) {
      setCalendarError(err instanceof Error ? err.message : "Google カレンダーへの登録に失敗しました。");
    } finally {
      setCreatingIndex(null);
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: 8,
    borderRadius: 8,
    border: "1px solid #dadce0",
    width: "100%",
    boxSizing: "border-box"
  };

  function fieldLabel(e: EditState, field: ScheduleField) {
    const needsCheck = e.missingFields.includes(field);
    return (
      <span>
        {FIELD_LABELS[field]}
        {needsCheck ? (
          <span style={{ color: "#c5221f", fontSize: "0.75rem", marginLeft: 6 }}>要確認</span>
        ) : null}
      </span>
    );
  }

  function notifySelect(index: number, key: "notify1" | "notify2", value: number) {
    return (
      <select
        style={inputStyle}
        value={value}
        onChange={(ev) => updateEdit(index, { [key]: Number(ev.target.value) } as Partial<EditState>)}
      >
        {NOTIFY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <section className="card" style={{ marginTop: 24 }}>
      <h2>プリント画像から予定を抽出（試作）</h2>

      {/* OpenAI APIキー入力フォーム（GUI入力） */}
      <h3>1. OpenAI APIキーの設定</h3>
      <p>
        現在のキー: <strong>{hasKey ? "設定済み" : "未設定"}</strong>
        {hasKey ? `（モデル: ${currentModel}）` : ""}
      </p>
      <form action="/api/settings/openai-key" method="post">
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 480 }}>
          <input
            type="password"
            name="apiKey"
            placeholder="sk-..."
            autoComplete="off"
            style={{ padding: 10, borderRadius: 8, border: "1px solid #dadce0" }}
          />
          <select
            name="model"
            defaultValue={currentModel}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #dadce0" }}
          >
            <option value="gpt-5-nano">gpt-5-nano（低コスト）</option>
            <option value="gpt-5-mini">gpt-5-mini（やや高精度）</option>
          </select>
          <button className="button" type="submit">
            キーを保存
          </button>
        </div>
      </form>
      <p style={{ fontSize: "0.85rem", color: "#5f6368" }}>
        ※ キーはサーバ側のhttpOnly Cookieに保存され、OpenAI呼び出しにのみ使用します。
        共有サーバでの扱いはグループで要確認。
      </p>

      {/* 画像アップロード＋抽出 */}
      <h3>2. 画像をアップロードして抽出</h3>
      <form onSubmit={onExtract}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <input type="file" name="image" accept="image/*" />
          <button className="button" type="submit" disabled={loading}>
            {loading ? "抽出中..." : "抽出する"}
          </button>
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <input type="checkbox" checked={useMock} onChange={(e) => setUseMock(e.target.checked)} />
          ダミーで実行（LLMを使わない・APIキー不要）
        </label>
      </form>
      {useMock ? (
        <p style={{ fontSize: "0.85rem", color: "#5f6368" }}>
          ※ ダミーモードでは画像内容は解析せず固定のサンプル結果を返します。
          画像は任意（指定するとファイル名のみ結果に反映）。
        </p>
      ) : null}

      {error ? <p style={{ color: "#c5221f" }}>エラー: {error}</p> : null}

      {/* 抽出結果の確認・編集 → カレンダー登録 */}
      {edits ? (
        <div>
          <h3>3. 内容を確認・修正して登録{usedModel ? ` (${usedModel})` : ""}</h3>
          {warning ? <p style={{ color: "#a15c00" }}>注意: {warning}</p> : null}
          {!isSignedIn ? (
            <p style={{ color: "#a15c00" }}>※ カレンダー登録には「Googleでログイン」が必要です。</p>
          ) : null}

          <div style={{ display: "grid", gap: 16 }}>
            {edits.map((e, index) => (
              <article
                key={index}
                style={{ border: "1px solid #dadce0", borderRadius: 12, padding: 16, background: "#fff" }}
              >
                {e.missingFields.length ? (
                  <p
                    style={{
                      margin: "0 0 12px",
                      padding: "8px 12px",
                      background: "#fce8e6",
                      color: "#c5221f",
                      borderRadius: 8,
                      fontSize: "0.9rem"
                    }}
                  >
                    確認が必要な項目: {e.missingFields.map((f) => FIELD_LABELS[f]).join("、")}
                    （AIが読み取れなかった項目です。入力してください）
                  </p>
                ) : null}

                <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "10px 12px", alignItems: "center" }}>
                  <label>{fieldLabel(e, "title")}</label>
                  <input style={inputStyle} value={e.title} onChange={(ev) => updateEdit(index, { title: ev.target.value })} />

                  <label>{fieldLabel(e, "date")}</label>
                  <input type="date" style={inputStyle} value={e.date} onChange={(ev) => updateEdit(index, { date: ev.target.value })} />

                  <label>終日</label>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={e.allDay}
                      onChange={(ev) => updateEdit(index, { allDay: ev.target.checked })}
                    />
                    終日の予定にする
                  </label>

                  {!e.allDay ? (
                    <>
                      <label>{fieldLabel(e, "startTime")}</label>
                      <input type="time" style={inputStyle} value={e.startTime} onChange={(ev) => updateEdit(index, { startTime: ev.target.value })} />

                      <label>{fieldLabel(e, "endTime")}</label>
                      <input type="time" style={inputStyle} value={e.endTime} onChange={(ev) => updateEdit(index, { endTime: ev.target.value })} />
                    </>
                  ) : null}

                  <label>{fieldLabel(e, "location")}</label>
                  <input style={inputStyle} value={e.location} onChange={(ev) => updateEdit(index, { location: ev.target.value })} />

                  <label>{fieldLabel(e, "items")}</label>
                  <input
                    style={inputStyle}
                    placeholder="カンマ区切り（例: 上履き, 筆記用具）"
                    value={e.itemsText}
                    onChange={(ev) => updateEdit(index, { itemsText: ev.target.value })}
                  />

                  <label>{fieldLabel(e, "deadline")}</label>
                  <input type="date" style={inputStyle} value={e.deadline} onChange={(ev) => updateEdit(index, { deadline: ev.target.value })} />

                  <label>繰り返し</label>
                  <select
                    style={inputStyle}
                    value={e.recurrence}
                    onChange={(ev) => updateEdit(index, { recurrence: ev.target.value as RecurrenceKey })}
                  >
                    {RECURRENCE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>

                  <label>対象</label>
                  <select
                    style={inputStyle}
                    value={e.audience}
                    onChange={(ev) => updateEdit(index, { audience: ev.target.value as ScheduleAudience })}
                  >
                    <option value="parent">parent（保護者のみ）</option>
                    <option value="family">family（家族全員）</option>
                  </select>

                  <label>出席者</label>
                  <input
                    style={inputStyle}
                    placeholder="カンマ区切り。空欄なら対象(parent/family)から自動設定"
                    value={e.attendeesText}
                    onChange={(ev) => updateEdit(index, { attendeesText: ev.target.value })}
                  />

                  <label>備考</label>
                  <input style={inputStyle} value={e.notes} onChange={(ev) => updateEdit(index, { notes: ev.target.value })} />

                  <label>通知</label>
                  {notifySelect(index, "notify1", e.notify1)}

                  <label>予備の通知</label>
                  {notifySelect(index, "notify2", e.notify2)}
                </div>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
                  <button
                    className="button"
                    type="button"
                    onClick={() => onCreateEvent(index)}
                    disabled={!isSignedIn || creatingIndex === index}
                  >
                    {creatingIndex === index ? "登録中..." : "Googleカレンダーに追加"}
                  </button>
                </div>
              </article>
            ))}
          </div>
          {calendarMessage ? <p style={{ color: "#137333" }}>{calendarMessage}</p> : null}
          {calendarError ? <p style={{ color: "#c5221f" }}>登録エラー: {calendarError}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
