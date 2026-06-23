"use client";

import { useState } from "react";
import type { ExtractionResult, ScheduleCandidate } from "../lib/types";

type Props = {
  hasKey: boolean;
  currentModel: string;
  isSignedIn: boolean;
};

export default function ExtractUi({ hasKey, currentModel, isSignedIn }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [usedModel, setUsedModel] = useState<string | null>(null);
  const [calendarMessage, setCalendarMessage] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [creatingIndex, setCreatingIndex] = useState<number | null>(null);
  const [useMock, setUseMock] = useState(true);

  async function onExtract(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setUsedModel(null);
    setCalendarMessage(null);
    setCalendarError(null);

    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("image") as HTMLInputElement;

    const body = new FormData();
    if (useMock) {
      body.append("mock", "true");
      // ダミーモードでは画像は任意（あれば結果にファイル名を反映）。
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
      setResult(data.result);
      setUsedModel(data.model ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  async function onCreateEvent(candidate: ScheduleCandidate, index: number) {
    setCalendarMessage(null);
    setCalendarError(null);
    setCreatingIndex(index);

    try {
      const response = await fetch("/api/calendar/create-event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ candidate })
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
          <input
            type="checkbox"
            checked={useMock}
            onChange={(e) => setUseMock(e.target.checked)}
          />
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

      {result ? (
        <div>
          <h3>抽出結果{usedModel ? ` (${usedModel})` : ""}</h3>
          {result.warning ? <p style={{ color: "#a15c00" }}>注意: {result.warning}</p> : null}
          <div style={{ display: "grid", gap: 16 }}>
            {result.candidates.map((candidate, index) => (
              <article
                key={`${candidate.title}-${index}`}
                style={{
                  border: "1px solid #dadce0",
                  borderRadius: 12,
                  padding: 16,
                  background: "#fff"
                }}
              >
                <h4 style={{ marginTop: 0 }}>{candidate.title}</h4>
                <dl style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "8px 12px" }}>
                  <dt>日付</dt>
                  <dd>{candidate.date ?? "未確定"}</dd>
                  <dt>時間</dt>
                  <dd>
                    {candidate.startTime && candidate.endTime
                      ? `${candidate.startTime} - ${candidate.endTime}`
                      : "未確定"}
                  </dd>
                  <dt>場所</dt>
                  <dd>{candidate.location ?? "なし"}</dd>
                  <dt>対象</dt>
                  <dd>{candidate.audience === "family" ? "family" : "parent"}</dd>
                  <dt>参加者</dt>
                  <dd>{candidate.attendees?.length ? candidate.attendees.join(", ") : "未設定"}</dd>
                  <dt>持ち物</dt>
                  <dd>{candidate.items.length ? candidate.items.join(", ") : "なし"}</dd>
                  <dt>不足項目</dt>
                  <dd>{candidate.missingFields.length ? candidate.missingFields.join(", ") : "なし"}</dd>
                </dl>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
                  <button
                    className="button"
                    type="button"
                    onClick={() => onCreateEvent(candidate, index)}
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
