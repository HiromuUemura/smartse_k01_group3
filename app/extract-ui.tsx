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

// 確認・編集UI用の状態。抽出結果を編集可能な形に持つ（issue #4 / #5 / #6）。
type EditState = {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  itemsText: string;
  deadline: string;
  notes: string;
  audience: ScheduleAudience;
  missingFields: ScheduleField[];
  // リマインド（issue #12 事前 / #13 当日）
  reminderDayBefore: boolean;
  reminderHourBefore: boolean;
};

function toEditState(c: ScheduleCandidate): EditState {
  return {
    title: c.title ?? "",
    date: c.date ?? "",
    startTime: c.startTime ?? "",
    endTime: c.endTime ?? "",
    location: c.location ?? "",
    itemsText: c.items.join(", "),
    deadline: c.deadline ?? "",
    notes: c.notes ?? "",
    audience: c.audience ?? "family",
    missingFields: c.missingFields ?? [],
    reminderDayBefore: true,
    reminderHourBefore: false
  };
}

const FIELD_LABELS: Record<ScheduleField, string> = {
  title: "タイトル",
  date: "日付",
  startTime: "開始時刻",
  endTime: "終了時刻",
  location: "場所",
  items: "持ち物",
  deadline: "締切"
};

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
      startTime: e.startTime || null,
      endTime: e.endTime || null,
      location: e.location.trim() || null,
      items: e.itemsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      deadline: e.deadline || null,
      notes: e.notes.trim() || null,
      missingFields: [],
      audience: e.audience
    };

    const reminders: ReminderSetting[] = [];
    if (e.reminderDayBefore) reminders.push({ method: "popup", minutesBefore: 1440 });
    if (e.reminderHourBefore) reminders.push({ method: "popup", minutesBefore: 60 });

    setCreatingIndex(index);
    try {
      const response = await fetch("/api/calendar/create-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate, reminders })
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
            <p style={{ color: "#a15c00" }}>
              ※ カレンダー登録には「Googleでログイン」が必要です。
            </p>
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

                  <label>{fieldLabel(e, "startTime")}</label>
                  <input type="time" style={inputStyle} value={e.startTime} onChange={(ev) => updateEdit(index, { startTime: ev.target.value })} />

                  <label>{fieldLabel(e, "endTime")}</label>
                  <input type="time" style={inputStyle} value={e.endTime} onChange={(ev) => updateEdit(index, { endTime: ev.target.value })} />

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

                  <label>対象</label>
                  <select
                    style={inputStyle}
                    value={e.audience}
                    onChange={(ev) => updateEdit(index, { audience: ev.target.value as ScheduleAudience })}
                  >
                    <option value="parent">parent（保護者のみ）</option>
                    <option value="family">family（家族全員）</option>
                  </select>

                  <label>備考</label>
                  <input style={inputStyle} value={e.notes} onChange={(ev) => updateEdit(index, { notes: ev.target.value })} />
                </div>

                {/* リマインド設定（issue #12 / #13） */}
                <fieldset style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px" }}>
                  <legend style={{ fontSize: "0.85rem", color: "#5f6368" }}>リマインド</legend>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 16 }}>
                    <input
                      type="checkbox"
                      checked={e.reminderDayBefore}
                      onChange={(ev) => updateEdit(index, { reminderDayBefore: ev.target.checked })}
                    />
                    前日に通知（24時間前）
                  </label>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={e.reminderHourBefore}
                      onChange={(ev) => updateEdit(index, { reminderHourBefore: ev.target.checked })}
                    />
                    当日（1時間前）に通知
                  </label>
                </fieldset>

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
