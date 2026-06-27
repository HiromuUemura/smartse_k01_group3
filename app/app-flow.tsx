"use client";

import { useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { ReminderSetting, ScheduleAudience, ScheduleCandidate, ScheduleField } from "../lib/types";

// Claude Design handoff「学校だよりカレンダー登録.dc.html」をNext.jsに実装。
// 5画面フロー: login → upload → extracting → confirm → done。実APIに配線。

type Props = {
  isSignedIn: boolean;
  hasKey: boolean;
  currentModel: string;
  parentAttendees: string[];
  familyAttendees: string[];
};

type RecurrenceKey = "none" | "daily" | "weekly" | "monthly" | "yearly";

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
  notify1: number;
  notify2: number;
  recurrence: RecurrenceKey;
};

type Screen = "login" | "upload" | "extracting" | "confirm" | "done";
type Layout = "form" | "split" | "compact";

const A = "#1a73e8";
const GREEN = "#188038";
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const FLABEL: Record<ScheduleField, string> = {
  title: "タイトル",
  date: "日付",
  startTime: "開始時刻",
  endTime: "終了時刻",
  location: "場所",
  items: "持ち物",
  deadline: "締切"
};
const NOTIFY = [
  { v: -1, l: "なし" },
  { v: 0, l: "予定時刻" },
  { v: 10, l: "10分前" },
  { v: 30, l: "30分前" },
  { v: 60, l: "1時間前" },
  { v: 1440, l: "1日前" },
  { v: 2880, l: "2日前" },
  { v: 10080, l: "1週間前" }
];
const SAMPLES = [
  { id: "jugyo", src: "/samples/jugyo-sankan.jpg", title: "授業参観について", sub: "御船が丘小学校" },
  { id: "bukatsu", src: "/samples/bukatsu-hogosha.jpg", title: "部活動保護者会の案内", sub: "豊四季中学校" },
  { id: "natsu", src: "/samples/natsu-tanshuku.jpg", title: "夏季休業の短縮", sub: "お知らせ" },
  { id: "natsuyasumi", src: "/samples/natsuyasumi.jpg", title: "夏休みの過ごし方", sub: "保護者向け" }
];
const EXTRACT_LABELS = [
  "画像を解析しています",
  "予定情報を抽出しています",
  "参加者（保護者/家族）を判定しています",
  "内容を整えています"
];

function toEditState(c: ScheduleCandidate): EditState {
  return {
    title: c.title ?? "",
    date: c.date ?? "",
    allDay: !c.startTime,
    startTime: c.startTime ?? "",
    endTime: c.endTime ?? "",
    location: c.location ?? "",
    itemsText: (c.items ?? []).join(", "),
    deadline: c.deadline ?? "",
    notes: c.notes ?? "",
    audience: c.audience ?? "family",
    attendeesText: (c.attendees ?? []).join(", "),
    missingFields: c.missingFields ?? [],
    notify1: 1440,
    notify2: 60,
    recurrence: "none"
  };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function AppFlow({ isSignedIn, hasKey, currentModel, parentAttendees, familyAttendees }: Props) {
  const [screen, setScreen] = useState<Screen>(isSignedIn ? "upload" : "login");
  const [useMock, setUseMock] = useState(true);
  const [selectedSample, setSelectedSample] = useState<string | null>(null);
  const [fileThumb, setFileThumb] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [extractStep, setExtractStep] = useState(0);
  const [edits, setEdits] = useState<EditState[] | null>(null);
  const [layout, setLayout] = useState<Layout>("form");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [expandedIdx, setExpandedIdx] = useState(0);
  const [registered, setRegistered] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [usedModel, setUsedModel] = useState<string | null>(null);
  const [regError, setRegError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showKeyPanel, setShowKeyPanel] = useState(false);
  const fileRef = useRef<File | null>(null);

  function reset(toScreen: Screen) {
    setSelectedSample(null);
    setFileThumb(null);
    setFileName(null);
    fileRef.current = null;
    setEdits(null);
    setRegistered([]);
    setError(null);
    setWarning(null);
    setRegError(null);
    setScreen(toScreen);
  }

  function readFile(f: File) {
    fileRef.current = f;
    setFileThumb(URL.createObjectURL(f));
    setFileName(f.name);
    setSelectedSample("__upload");
  }

  function pickSample(id: string, src: string, title: string) {
    fileRef.current = null;
    setSelectedSample(id);
    setFileThumb(src);
    setFileName(title);
  }

  const hasInput = !!fileThumb;

  function updateField(i: number, key: keyof EditState, value: EditState[keyof EditState]) {
    setEdits((prev) =>
      prev
        ? prev.map((e, idx) => {
            if (idx !== i) return e;
            const ne = { ...e, [key]: value } as EditState;
            const mkey = (key === "itemsText" ? "items" : key) as ScheduleField;
            const filled = value !== "" && value != null && value !== false;
            if (filled && ne.missingFields.includes(mkey)) {
              ne.missingFields = ne.missingFields.filter((f) => f !== mkey);
            }
            return ne;
          })
        : prev
    );
  }

  function resolved(e: EditState): string[] {
    const manual = e.attendeesText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (manual.length) return manual;
    return e.audience === "parent" ? parentAttendees : familyAttendees;
  }

  function fmtDate(d: string): string | null {
    if (!d) return null;
    const p = d.split("-").map(Number);
    const dt = new Date(p[0], p[1] - 1, p[2]);
    return `${p[1]}月${p[2]}日(${WEEK[dt.getDay()]})`;
  }

  function notifyLabel(v: number): string {
    const o = NOTIFY.find((x) => x.v === Number(v));
    return o ? o.l : "なし";
  }

  async function runExtract() {
    setError(null);
    setExtractStep(0);

    const body = new FormData();
    if (useMock) {
      body.append("mock", "true");
      if (selectedSample && selectedSample !== "__upload") body.append("sample", selectedSample);
      if (fileRef.current) body.append("image", fileRef.current);
      else if (fileName) body.append("image", new File([], fileName));
    } else {
      let f = fileRef.current;
      if (!f && selectedSample && selectedSample !== "__upload") {
        try {
          const sample = SAMPLES.find((s) => s.id === selectedSample);
          if (sample) {
            const blob = await (await fetch(sample.src)).blob();
            f = new File([blob], `${selectedSample}.jpg`, { type: blob.type || "image/jpeg" });
          }
        } catch {
          /* fall through to validation below */
        }
      }
      if (!f) {
        setError("画像を選択してください（実抽出には画像が必要です）。");
        return;
      }
      body.append("image", f);
    }

    setScreen("extracting");
    const timer = setInterval(() => setExtractStep((s) => Math.min(s + 1, 3)), 700);
    try {
      const [res] = await Promise.all([fetch("/api/extract", { method: "POST", body }), delay(2000)]);
      const data = await res.json();
      clearInterval(timer);
      if (!res.ok) {
        setError(data?.error ?? "抽出に失敗しました。");
        setScreen("upload");
        return;
      }
      setUsedModel(data.model ?? null);
      setWarning(data.result?.warning ?? null);
      setEdits((data.result?.candidates ?? []).map(toEditState));
      setRegistered([]);
      setSelectedIdx(0);
      setExpandedIdx(0);
      setLayout("form");
      setScreen("confirm");
    } catch (err) {
      clearInterval(timer);
      setError(err instanceof Error ? err.message : "通信エラーが発生しました。");
      setScreen("upload");
    }
  }

  async function registerRow(i: number): Promise<boolean> {
    const e = edits?.[i];
    if (!e || !e.date) return false;
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
      attendees: e.attendeesText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    };
    const minutes = [e.notify1, e.notify2].filter((m) => m >= 0);
    const reminders: ReminderSetting[] = Array.from(new Set(minutes)).map((m) => ({
      method: "popup",
      minutesBefore: m
    }));
    const res = await fetch("/api/calendar/create-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidate, reminders, recurrence: e.recurrence === "none" ? undefined : e.recurrence })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error ?? "登録に失敗しました。");
    }
    return true;
  }

  async function registerOne(i: number) {
    setRegError(null);
    setBusy(true);
    try {
      await registerRow(i);
      setRegistered((prev) => (prev.includes(i) ? prev : [...prev, i]));
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "登録に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  async function finishAll() {
    if (!edits) return;
    setRegError(null);
    setBusy(true);
    const done: number[] = [...registered];
    try {
      for (let i = 0; i < edits.length; i++) {
        if (!edits[i].date || done.includes(i)) continue;
        try {
          await registerRow(i);
          done.push(i);
        } catch (err) {
          setRegError(err instanceof Error ? err.message : "一部の予定の登録に失敗しました。");
        }
      }
      setRegistered(done);
      if (done.length > 0) setScreen("done");
    } finally {
      setBusy(false);
    }
  }

  // ---------- styles ----------
  const INP: CSSProperties = {
    padding: "9px 11px",
    border: "1px solid #dadce0",
    borderRadius: 8,
    width: "100%",
    fontSize: 14,
    color: "#202124",
    background: "#fff",
    outline: "none",
    boxSizing: "border-box"
  };
  const RING: CSSProperties = { ...INP, border: "1.5px solid #d93025", background: "#fff7f7" };
  const SEL: CSSProperties = { ...INP, cursor: "pointer", appearance: "auto" };
  const fieldStyle = (e: EditState, key: ScheduleField) => (e.missingFields.includes(key) ? RING : INP);
  const seg = (active: boolean, color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 14px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    border: active ? `1px solid ${color}` : "1px solid #dadce0",
    background: active ? color + "14" : "#fff",
    color: active ? color : "#5f6368"
  });
  const audChip = (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    fontSize: 11,
    fontWeight: 700,
    color,
    background: color + "16",
    padding: "3px 10px",
    borderRadius: 999,
    flexShrink: 0,
    letterSpacing: ".02em"
  });
  const primaryBtn: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "11px 22px",
    borderRadius: 999,
    background: A,
    color: "#fff",
    fontWeight: 600,
    fontSize: 14,
    border: "none",
    cursor: "pointer",
    boxShadow: "0 1px 2px rgba(60,64,67,.3)"
  };
  const disabledBtn: CSSProperties = { ...primaryBtn, background: "#dadce0", cursor: "not-allowed", boxShadow: "none" };
  const ghostBtn: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 16px",
    borderRadius: 999,
    border: `1px solid ${A}`,
    background: "#fff",
    color: A,
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer"
  };
  const tab = (active: boolean): CSSProperties => ({
    padding: "7px 14px",
    borderRadius: 8,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    border: "none",
    background: active ? "#fff" : "transparent",
    color: active ? A : "#5f6368",
    boxShadow: active ? "0 1px 2px rgba(60,64,67,.18)" : "none"
  });
  const labelStyle: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: "#5f6368" };
  const reqBadge: CSSProperties = {
    fontSize: 9.5,
    fontWeight: 700,
    color: "#d93025",
    background: "#fce8e6",
    padding: "1px 6px",
    borderRadius: 4
  };

  const rows = edits ?? [];
  const stepIndex = screen === "upload" || screen === "extracting" ? 0 : screen === "confirm" ? 1 : 2;
  const attention = rows.filter((e) => e.missingFields.length > 0).length;
  const validCount = rows.filter((e) => e.date).length;

  // ---------- editable fields block (shared by form / split / compact-expanded) ----------
  function CalIcon() {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="3" width="12" height="11" rx="2" stroke="#9aa0a6" strokeWidth="1.3" />
        <line x1="2" y1="6.4" x2="14" y2="6.4" stroke="#9aa0a6" strokeWidth="1.3" />
      </svg>
    );
  }

  function Field({
    label,
    need,
    children
  }: {
    label: string;
    need?: boolean;
    children: React.ReactNode;
  }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
          {label}
          {need ? <span style={reqBadge}>要確認</span> : null}
        </label>
        {children}
      </div>
    );
  }

  function AudiencePicker({ e, i }: { e: EditState; i: number }) {
    return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" onClick={() => updateField(i, "audience", "parent")} style={seg(e.audience === "parent", A)}>
          保護者のみ
        </button>
        <button type="button" onClick={() => updateField(i, "audience", "family")} style={seg(e.audience === "family", GREEN)}>
          家族全員
        </button>
        <span style={{ fontSize: 11.5, color: "#80868b" }}>→ {resolved(e).join(", ") || "（.env未設定）"}</span>
      </div>
    );
  }

  function NotifyPair({ e, i }: { e: EditState; i: number }) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="通知">
          <select value={e.notify1} onChange={(ev) => updateField(i, "notify1", Number(ev.target.value))} style={SEL}>
            {NOTIFY.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="予備の通知">
          <select value={e.notify2} onChange={(ev) => updateField(i, "notify2", Number(ev.target.value))} style={SEL}>
            {NOTIFY.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
          </select>
        </Field>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f6f8fb", color: "#202124", WebkitFontSmoothing: "antialiased" }}>
      {/* ===== Header ===== */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          gap: 18,
          padding: "0 22px",
          height: 60,
          background: "rgba(255,255,255,.88)",
          backdropFilter: "saturate(180%) blur(10px)",
          borderBottom: "1px solid #e8eaed"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 11, flexShrink: 0 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: A,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 1px 3px rgba(60,64,67,.35)"
            }}
          >
            <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="3" width="12" height="11" rx="2.2" stroke="#fff" strokeWidth="1.5" />
              <line x1="2.4" y1="6.4" x2="13.6" y2="6.4" stroke="#fff" strokeWidth="1.5" />
              <line x1="5" y1="1.6" x2="5" y2="4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="11" y1="1.6" x2="11" y2="4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
            <strong style={{ fontSize: 14, fontWeight: 700, letterSpacing: ".01em" }}>学校だより → カレンダー</strong>
            <span style={{ fontSize: 10.5, color: "#80868b", letterSpacing: ".02em" }}>OCR Schedule Assistant</span>
          </div>
        </div>

        {isSignedIn && screen !== "login" ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minWidth: 0, overflow: "hidden" }}>
            {["アップロード", "確認・編集", "登録完了"].map((label, i) => {
              const done = i < stepIndex;
              const current = i === stepIndex;
              const active = i <= stepIndex;
              return (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      background: active ? A : "#e8eaed",
                      color: active ? "#fff" : "#9aa0a6"
                    }}
                  >
                    {done ? "✓" : i + 1}
                  </div>
                  <span style={{ fontSize: 12.5, fontWeight: current ? 700 : 500, color: active ? "#202124" : "#9aa0a6", whiteSpace: "nowrap" }}>
                    {label}
                  </span>
                  {i < 2 ? (
                    <span style={{ display: "inline-block", width: 22, height: 2, borderRadius: 2, background: i < stepIndex ? A : "#e8eaed" }} />
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        <div style={{ marginLeft: "auto", flexShrink: 0 }}>
          {isSignedIn ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px 4px 4px", border: "1px solid #e8eaed", borderRadius: 999 }}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg,#9aa0a6,#5f6368)",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700
                  }}
                >
                  保
                </div>
                <span style={{ fontSize: 12, color: "#3c4043", fontWeight: 500 }}>ログイン済み</span>
              </div>
              <a href="/api/auth/logout" style={{ color: "#5f6368", fontSize: 12, padding: "6px 8px", borderRadius: 6, textDecoration: "none" }}>
                ログアウト
              </a>
            </div>
          ) : null}
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "34px 22px 80px" }}>
        {/* ===== LOGIN ===== */}
        {screen === "login" ? (
          <div style={{ maxWidth: 440, margin: "48px auto 0", animation: "om-up .4s ease both" }}>
            <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 20, padding: "40px 36px", boxShadow: "0 10px 40px rgba(60,64,67,.08)", textAlign: "center" }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 18,
                  background: A,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 22px",
                  boxShadow: `0 6px 18px ${A}40`
                }}
              >
                <svg width="32" height="32" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="3" width="12" height="11" rx="2.2" stroke="#fff" strokeWidth="1.4" />
                  <line x1="2.4" y1="6.4" x2="13.6" y2="6.4" stroke="#fff" strokeWidth="1.4" />
                  <line x1="5" y1="1.6" x2="5" y2="4" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
                  <line x1="11" y1="1.6" x2="11" y2="4" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </div>
              <h1 style={{ margin: "0 0 8px", fontSize: 23, fontWeight: 700, letterSpacing: ".01em" }}>
                学校だよりを、
                <br />
                そのままカレンダーへ
              </h1>
              <p style={{ margin: "0 0 28px", fontSize: 13.5, lineHeight: 1.8, color: "#5f6368" }}>
                プリントやメールの画像から予定を読み取り、
                <br />
                必要な参加者を付けて Google カレンダーに登録します。
              </p>
              <a href="/api/auth/google" style={{ ...primaryBtn, width: "100%", padding: "13px 22px", fontSize: 15, textDecoration: "none", boxSizing: "border-box" }}>
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                    fontSize: 12,
                    color: A
                  }}
                >
                  G
                </span>
                Google でログイン
              </a>
              <p style={{ margin: "20px 0 0", fontSize: 11, color: "#9aa0a6", lineHeight: 1.7 }}>
                Calendar API（calendar.events）へのアクセスを
                <br />
                許可します。画像は抽出後に破棄されます。
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, marginTop: 22 }}>
              <span style={{ fontSize: 11, color: "#9aa0a6" }}>画像から抽出</span>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#dadce0" }} />
              <span style={{ fontSize: 11, color: "#9aa0a6" }}>参加者を自動付与</span>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#dadce0" }} />
              <span style={{ fontSize: 11, color: "#9aa0a6" }}>リマインド設定</span>
            </div>
          </div>
        ) : null}

        {/* ===== UPLOAD ===== */}
        {screen === "upload" ? (
          <div style={{ maxWidth: 720, margin: "0 auto", animation: "om-up .4s ease both" }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>画像をアップロード</h2>
            <p style={{ margin: "0 0 22px", fontSize: 13, color: "#5f6368", lineHeight: 1.7 }}>
              学校のお便り・プリント・連絡メールのスクリーンショットを読み込みます。
            </p>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (!dragOver) setDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files && e.dataTransfer.files[0];
                if (f) readFile(f);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 168,
                padding: 26,
                borderRadius: 16,
                border: `2px dashed ${dragOver ? A : "#cdd3da"}`,
                background: dragOver ? A + "0d" : "#fbfcfe",
                transition: "all .15s"
              }}
            >
              {!hasInput ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 54, height: 54, borderRadius: "50%", background: A + "16", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M12 16V4M12 4l-4 4M12 4l4 4" stroke={A} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" stroke={A} strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#3c4043" }}>ここに画像をドラッグ＆ドロップ</div>
                    <div style={{ fontSize: 12, color: "#80868b", marginTop: 4 }}>または下のサンプルから選択</div>
                  </div>
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "9px 18px",
                      border: `1px solid ${A}`,
                      color: A,
                      borderRadius: 999,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      background: "#fff"
                    }}
                  >
                    ファイルを選択
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files && e.target.files[0];
                        if (f) readFile(f);
                      }}
                      style={{ display: "none" }}
                    />
                  </label>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 18, width: "100%", textAlign: "left" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fileThumb!}
                    alt=""
                    style={{ width: 96, height: 124, objectFit: "cover", borderRadius: 10, border: "1px solid #e8eaed", background: "#fff", flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#188038",
                        background: "#e6f4ea",
                        padding: "3px 9px",
                        borderRadius: 999,
                        marginBottom: 8
                      }}
                    >
                      ✓ 読み込み完了
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#3c4043", wordBreak: "break-all", lineHeight: 1.5 }}>{fileName}</div>
                    <button
                      type="button"
                      onClick={() => {
                        fileRef.current = null;
                        setSelectedSample(null);
                        setFileThumb(null);
                        setFileName(null);
                      }}
                      style={{ marginTop: 8, background: "none", border: "none", color: "#5f6368", fontSize: 12, cursor: "pointer", padding: 0, textDecoration: "underline" }}
                    >
                      別の画像を選ぶ
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#5f6368", marginBottom: 10 }}>サンプルのお便りで試す</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12 }}>
                {SAMPLES.map((sm) => (
                  <button
                    key={sm.id}
                    type="button"
                    onClick={() => pickSample(sm.id, sm.src, sm.title)}
                    style={{
                      padding: 0,
                      border: `2px solid ${selectedSample === sm.id ? A : "#e8eaed"}`,
                      borderRadius: 12,
                      overflow: "hidden",
                      cursor: "pointer",
                      background: "#fff",
                      boxShadow: selectedSample === sm.id ? `0 4px 14px ${A}33` : "0 1px 3px rgba(60,64,67,.06)"
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={sm.src} alt="" style={{ width: "100%", height: 118, objectFit: "cover", objectPosition: "top", display: "block" }} />
                    <div style={{ padding: "9px 10px", textAlign: "left" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#3c4043", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {sm.title}
                      </div>
                      <div style={{ fontSize: 10.5, color: "#9aa0a6", marginTop: 2 }}>{sm.sub}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 22, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14, paddingTop: 20, borderTop: "1px solid #eceef1" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 9, fontSize: 13, color: "#3c4043", cursor: "pointer" }}>
                <input type="checkbox" checked={useMock} onChange={(e) => setUseMock(e.target.checked)} style={{ width: 16, height: 16, accentColor: A, cursor: "pointer" }} />
                ダミーで実行（LLM・APIキー不要）
              </label>
              <button
                type="button"
                onClick={runExtract}
                disabled={!(hasInput || useMock)}
                style={hasInput || useMock ? primaryBtn : disabledBtn}
              >
                予定を抽出する
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            {useMock ? (
              <p style={{ margin: "12px 0 0", fontSize: 11.5, color: "#9aa0a6", lineHeight: 1.7 }}>
                ※ ダミーモードでは画像内容は解析せず、選んだお便りに対応する固定のサンプル予定を返します。
              </p>
            ) : null}
            {error ? <p style={{ color: "#c5221f", fontSize: 13, marginTop: 12 }}>エラー: {error}</p> : null}

            {/* 控えめなAPIキー設定 */}
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px dashed #e8eaed" }}>
              <button
                type="button"
                onClick={() => setShowKeyPanel((v) => !v)}
                style={{ background: "none", border: "none", color: "#80868b", fontSize: 12, cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                ⚙ OpenAI APIキー設定（実抽出用）— 現在: {hasKey ? `設定済み・${currentModel}` : "未設定"}
              </button>
              {showKeyPanel ? (
                <form action="/api/settings/openai-key" method="post" style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8, maxWidth: 460 }}>
                  <input type="password" name="apiKey" placeholder="sk-..." autoComplete="off" style={INP} />
                  <select name="model" defaultValue={currentModel} style={SEL}>
                    <option value="gpt-5-nano">gpt-5-nano（低コスト）</option>
                    <option value="gpt-5-mini">gpt-5-mini（やや高精度）</option>
                  </select>
                  <button type="submit" style={{ ...ghostBtn, alignSelf: "flex-start" }}>
                    キーを保存
                  </button>
                  <span style={{ fontSize: 11, color: "#9aa0a6" }}>
                    ※ キーはサーバ側のhttpOnly Cookieに保存され、OpenAI呼び出しにのみ使用します。
                  </span>
                </form>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* ===== EXTRACTING ===== */}
        {screen === "extracting" ? (
          <div style={{ maxWidth: 520, margin: "30px auto 0", textAlign: "center", animation: "om-up .35s ease both" }}>
            <div style={{ position: "relative", width: 200, height: 258, margin: "0 auto 30px", borderRadius: 12, overflow: "hidden", border: "1px solid #e8eaed", boxShadow: "0 8px 28px rgba(60,64,67,.12)", background: "#fff" }}>
              {fileThumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileThumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", background: A + "0d" }} />
              )}
              <div style={{ position: "absolute", left: 0, right: 0, top: -22, height: 22, background: `linear-gradient(to bottom,transparent,${A}cc)`, boxShadow: `0 0 16px 3px ${A}cc`, animation: "om-scan 1.6s ease-in-out infinite" }} />
              <div style={{ position: "absolute", inset: 0, border: `2px solid ${A}16` }} />
            </div>
            <h2 style={{ margin: "0 0 24px", fontSize: 18, fontWeight: 700 }}>予定を読み取っています…</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 13, textAlign: "left", maxWidth: 320, margin: "0 auto" }}>
              {EXTRACT_LABELS.map((label, i) => {
                const done = i < extractStep;
                const active = i === extractStep;
                return (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        background: done ? "#e6f4ea" : active ? A : "#eef1f4",
                        color: done ? GREEN : "#fff",
                        border: active ? `2px solid ${A}` : "none",
                        borderTopColor: active ? "transparent" : undefined,
                        animation: active ? "om-spin .8s linear infinite" : "none"
                      }}
                    >
                      {done ? "✓" : ""}
                    </div>
                    <span style={{ fontSize: 13.5, color: done ? "#3c4043" : active ? "#202124" : "#9aa0a6", fontWeight: active ? 600 : 400 }}>{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* ===== CONFIRM ===== */}
        {screen === "confirm" ? (
          <div style={{ animation: "om-up .4s ease both" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 6 }}>
              <div>
                <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>内容を確認・修正</h2>
                <p style={{ margin: 0, fontSize: 13, color: "#5f6368" }}>
                  {rows.length}件の予定が見つかりました{usedModel ? `（${usedModel}）` : ""}。タイトル・対象・通知を確認して登録します。
                </p>
              </div>
              <div style={{ display: "inline-flex", gap: 3, padding: 3, background: "#eef1f4", borderRadius: 11 }}>
                <button type="button" onClick={() => setLayout("form")} style={tab(layout === "form")}>
                  フォーム
                </button>
                <button type="button" onClick={() => setLayout("split")} style={tab(layout === "split")}>
                  プレビュー分割
                </button>
                <button type="button" onClick={() => setLayout("compact")} style={tab(layout === "compact")}>
                  カード
                </button>
              </div>
            </div>

            {attention > 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 11, margin: "16px 0 4px", padding: "12px 16px", background: "#fef7e0", border: "1px solid #fde293", borderRadius: 11 }}>
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M10 6.5v4M10 13.5h.01M10 2l8 14H2L10 2z" stroke="#b06000" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span style={{ fontSize: 13, color: "#7a5100", lineHeight: 1.6 }}>
                  {attention}件の予定に未入力の項目があります。
                  <span style={{ color: "#b06000", fontWeight: 600 }}> 赤くハイライトされた項目を入力してください。</span>
                </span>
              </div>
            ) : null}
            {warning ? <p style={{ margin: "10px 0 0", fontSize: 12, color: "#9aa0a6" }}>{warning}</p> : null}

            {/* ----- FORM ----- */}
            {layout === "form" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 18 }}>
                {rows.map((e, i) => {
                  const isReg = registered.includes(i);
                  const audColor = e.audience === "parent" ? A : GREEN;
                  return (
                    <article
                      key={i}
                      style={{ background: "#fff", border: `1px solid ${isReg ? "#ceead6" : "#e8eaed"}`, borderRadius: 16, boxShadow: "0 1px 3px rgba(60,64,67,.06)", overflow: "hidden" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid #eceef1" }}>
                        <span style={audChip(audColor)}>{e.audience === "parent" ? "保護者のみ" : "家族全員"}</span>
                        <input
                          value={e.title}
                          onChange={(ev) => updateField(i, "title", ev.target.value)}
                          placeholder="タイトル"
                          style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 700, border: "none", outline: "none", background: "transparent", color: "#202124" }}
                        />
                        {isReg ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#188038", background: "#e6f4ea", padding: "5px 11px", borderRadius: 999, flexShrink: 0 }}>
                            ✓ 登録済み
                          </span>
                        ) : null}
                      </div>
                      <div style={{ padding: "18px 20px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: "14px 16px" }}>
                          <Field label="日付" need={e.missingFields.includes("date")}>
                            <input type="date" value={e.date} onChange={(ev) => updateField(i, "date", ev.target.value)} style={fieldStyle(e, "date")} />
                          </Field>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, justifyContent: "flex-end" }}>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#3c4043", cursor: "pointer", paddingBottom: 9 }}>
                              <input type="checkbox" checked={e.allDay} onChange={(ev) => updateField(i, "allDay", ev.target.checked)} style={{ width: 15, height: 15, accentColor: A, cursor: "pointer" }} />
                              終日の予定
                            </label>
                          </div>
                          {!e.allDay ? (
                            <>
                              <Field label="開始時刻" need={e.missingFields.includes("startTime")}>
                                <input type="time" value={e.startTime} onChange={(ev) => updateField(i, "startTime", ev.target.value)} style={fieldStyle(e, "startTime")} />
                              </Field>
                              <Field label="終了時刻">
                                <input type="time" value={e.endTime} onChange={(ev) => updateField(i, "endTime", ev.target.value)} style={INP} />
                              </Field>
                            </>
                          ) : null}
                          <Field label="場所">
                            <input value={e.location} onChange={(ev) => updateField(i, "location", ev.target.value)} placeholder="場所" style={fieldStyle(e, "location")} />
                          </Field>
                          <Field label="持ち物">
                            <input value={e.itemsText} onChange={(ev) => updateField(i, "itemsText", ev.target.value)} placeholder="カンマ区切り" style={INP} />
                          </Field>
                          <Field label="締切（提出など）">
                            <input type="date" value={e.deadline} onChange={(ev) => updateField(i, "deadline", ev.target.value)} style={INP} />
                          </Field>
                          <Field label="繰り返し">
                            <select value={e.recurrence} onChange={(ev) => updateField(i, "recurrence", ev.target.value as RecurrenceKey)} style={SEL}>
                              <option value="none">なし</option>
                              <option value="daily">毎日</option>
                              <option value="weekly">毎週</option>
                              <option value="monthly">毎月</option>
                              <option value="yearly">毎年</option>
                            </select>
                          </Field>
                        </div>

                        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed #e8eaed", display: "flex", flexDirection: "column", gap: 14 }}>
                          <Field label="対象（参加者の出し分け）">
                            <AudiencePicker e={e} i={i} />
                          </Field>
                          <NotifyPair e={e} i={i} />
                          <Field label="備考">
                            <input value={e.notes} onChange={(ev) => updateField(i, "notes", ev.target.value)} placeholder="備考" style={INP} />
                          </Field>
                        </div>

                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                          {!isReg && e.date ? (
                            <button type="button" onClick={() => registerOne(i)} disabled={busy} style={ghostBtn}>
                              この予定だけ追加
                            </button>
                          ) : null}
                          {!isReg && !e.date ? <span style={{ fontSize: 12, color: "#d93025" }}>日付を入力すると登録できます</span> : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}

            {/* ----- SPLIT ----- */}
            {layout === "split" ? (
              <div style={{ display: "flex", gap: 20, marginTop: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 240, display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(60,64,67,.06)" }}>
                    {fileThumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={fileThumb} alt="" style={{ width: "100%", display: "block", maxHeight: 240, objectFit: "cover", objectPosition: "top", background: "#f1f3f4" }} />
                    ) : (
                      <div style={{ height: 120, background: "#f1f3f4" }} />
                    )}
                    <div style={{ padding: "9px 13px", fontSize: 11, color: "#80868b", borderTop: "1px solid #eceef1" }}>読み込んだお便り</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    {rows.map((e, i) => {
                      const isSel = i === selectedIdx;
                      const audColor = e.audience === "parent" ? A : GREEN;
                      const dateDisp = fmtDate(e.date) || "日付未設定";
                      const timeDisp = e.allDay ? "終日" : e.startTime || "時刻未設定";
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setSelectedIdx(i)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 11,
                            padding: "10px 12px",
                            borderRadius: 11,
                            cursor: "pointer",
                            width: "100%",
                            textAlign: "left",
                            border: `1px solid ${isSel ? A : "#e8eaed"}`,
                            background: isSel ? A + "0d" : "#fff",
                            boxShadow: isSel ? "none" : "0 1px 2px rgba(60,64,67,.04)"
                          }}
                        >
                          <span style={{ width: 8, height: 38, borderRadius: 5, background: audColor, flexShrink: 0 }} />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "#202124", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title || "（無題）"}</span>
                            <span style={{ display: "block", fontSize: 11.5, color: "#80868b", marginTop: 2 }}>
                              {dateDisp} · {timeDisp}
                            </span>
                          </span>
                          {e.missingFields.length ? <span style={reqBadge}>要確認</span> : null}
                          {registered.includes(i) ? <span style={{ color: "#188038", fontSize: 15, flexShrink: 0 }}>✓</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {(() => {
                  const i = selectedIdx;
                  const e = rows[i];
                  if (!e) return null;
                  const audColor = e.audience === "parent" ? A : GREEN;
                  return (
                    <div style={{ flex: 1.4, minWidth: 300, background: "#fff", border: "1px solid #e8eaed", borderRadius: 16, boxShadow: "0 1px 3px rgba(60,64,67,.06)", overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid #eceef1" }}>
                        <span style={audChip(audColor)}>{e.audience === "parent" ? "保護者のみ" : "家族全員"}</span>
                        <input value={e.title} onChange={(ev) => updateField(i, "title", ev.target.value)} placeholder="タイトル" style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 700, border: "none", outline: "none", background: "transparent" }} />
                      </div>
                      <div style={{ padding: "18px 20px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "14px 16px" }}>
                          <Field label="日付" need={e.missingFields.includes("date")}>
                            <input type="date" value={e.date} onChange={(ev) => updateField(i, "date", ev.target.value)} style={fieldStyle(e, "date")} />
                          </Field>
                          <div style={{ display: "flex", alignItems: "flex-end" }}>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#3c4043", cursor: "pointer", paddingBottom: 9 }}>
                              <input type="checkbox" checked={e.allDay} onChange={(ev) => updateField(i, "allDay", ev.target.checked)} style={{ width: 15, height: 15, accentColor: A, cursor: "pointer" }} />
                              終日
                            </label>
                          </div>
                          {!e.allDay ? (
                            <>
                              <Field label="開始" need={e.missingFields.includes("startTime")}>
                                <input type="time" value={e.startTime} onChange={(ev) => updateField(i, "startTime", ev.target.value)} style={fieldStyle(e, "startTime")} />
                              </Field>
                              <Field label="終了">
                                <input type="time" value={e.endTime} onChange={(ev) => updateField(i, "endTime", ev.target.value)} style={INP} />
                              </Field>
                            </>
                          ) : null}
                          <Field label="場所">
                            <input value={e.location} onChange={(ev) => updateField(i, "location", ev.target.value)} placeholder="場所" style={fieldStyle(e, "location")} />
                          </Field>
                          <Field label="持ち物">
                            <input value={e.itemsText} onChange={(ev) => updateField(i, "itemsText", ev.target.value)} placeholder="カンマ区切り" style={INP} />
                          </Field>
                        </div>
                        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed #e8eaed", display: "flex", flexDirection: "column", gap: 14 }}>
                          <Field label="対象">
                            <AudiencePicker e={e} i={i} />
                          </Field>
                          <NotifyPair e={e} i={i} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                          {!registered.includes(i) && e.date ? (
                            <button type="button" onClick={() => registerOne(i)} disabled={busy} style={ghostBtn}>
                              この予定だけ追加
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : null}

            {/* ----- COMPACT ----- */}
            {layout === "compact" ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16, marginTop: 18 }}>
                {rows.map((e, i) => {
                  const isReg = registered.includes(i);
                  const audColor = e.audience === "parent" ? A : GREEN;
                  const dateDisp = fmtDate(e.date);
                  const timeDisp = e.allDay ? "終日" : e.startTime ? e.startTime + (e.endTime ? "–" + e.endTime : "") : null;
                  const itemsArr = e.itemsText.split(",").map((x) => x.trim()).filter(Boolean);
                  const rem = [notifyLabel(e.notify1), notifyLabel(e.notify2)].filter((l) => l !== "なし");
                  const isExpanded = i === expandedIdx;
                  return (
                    <article key={i} style={{ background: "#fff", border: `1px solid ${isReg ? "#ceead6" : "#e8eaed"}`, borderRadius: 14, boxShadow: "0 1px 3px rgba(60,64,67,.06)", overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "stretch" }}>
                        <div style={{ width: 6, background: audColor, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0, padding: "15px 16px" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 15.5, fontWeight: 700, color: "#202124", lineHeight: 1.3, wordBreak: "break-word" }}>{e.title || "（無題）"}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, fontSize: 12.5, color: "#5f6368" }}>
                                <CalIcon />
                                <span style={{ color: e.date ? "#5f6368" : "#d93025", fontWeight: e.date ? 400 : 600 }}>{dateDisp || "日付未設定"}</span>
                                <span style={{ color: "#dadce0" }}>·</span>
                                <span style={{ color: e.allDay || e.startTime ? "#5f6368" : "#d93025", fontWeight: e.allDay || e.startTime ? 400 : 600 }}>{timeDisp || "時刻未設定"}</span>
                              </div>
                            </div>
                            <span style={audChip(audColor)}>{e.audience === "parent" ? "保護者のみ" : "家族全員"}</span>
                          </div>

                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                            {e.location ? <span style={{ fontSize: 11.5, color: "#3c4043", background: "#f1f3f4", padding: "4px 9px", borderRadius: 7 }}>📍 {e.location}</span> : null}
                            {itemsArr.map((it, k) => (
                              <span key={k} style={{ fontSize: 11.5, color: "#3c4043", background: "#f1f3f4", padding: "4px 9px", borderRadius: 7 }}>{it}</span>
                            ))}
                            <span style={{ fontSize: 11.5, color: "#3c4043", background: "#f1f3f4", padding: "4px 9px", borderRadius: 7 }}>🔔 {rem.length ? rem.join("・") : "なし"}</span>
                            <span style={{ fontSize: 11.5, color: "#3c4043", background: "#f1f3f4", padding: "4px 9px", borderRadius: 7 }}>👥 {resolved(e).length}名</span>
                          </div>

                          {e.missingFields.length ? (
                            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", background: "#fce8e6", borderRadius: 8 }}>
                              <span style={{ fontSize: 11.5, color: "#c5221f", fontWeight: 500 }}>要確認: {e.missingFields.map((f) => FLABEL[f]).join("、")}</span>
                            </div>
                          ) : null}

                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 13, paddingTop: 12, borderTop: "1px solid #eceef1" }}>
                            <button type="button" onClick={() => setExpandedIdx(isExpanded ? -1 : i)} style={{ background: "none", border: "none", color: A, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: "4px 0" }}>
                              {isExpanded ? "× 閉じる" : "✎ この場で修正"}
                            </button>
                            {!isReg && e.date ? (
                              <button type="button" onClick={() => registerOne(i)} disabled={busy} style={{ ...ghostBtn, padding: "6px 12px" }}>
                                追加
                              </button>
                            ) : isReg ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: "#188038" }}>✓ 登録済み</span>
                            ) : null}
                          </div>

                          {isExpanded ? (
                            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, animation: "om-up .25s ease both" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: "1/-1" }}>
                                <label style={{ ...labelStyle, fontSize: 11 }}>タイトル</label>
                                <input value={e.title} onChange={(ev) => updateField(i, "title", ev.target.value)} style={INP} />
                              </div>
                              <Field label="日付" need={e.missingFields.includes("date")}>
                                <input type="date" value={e.date} onChange={(ev) => updateField(i, "date", ev.target.value)} style={fieldStyle(e, "date")} />
                              </Field>
                              {!e.allDay ? (
                                <Field label="開始" need={e.missingFields.includes("startTime")}>
                                  <input type="time" value={e.startTime} onChange={(ev) => updateField(i, "startTime", ev.target.value)} style={fieldStyle(e, "startTime")} />
                                </Field>
                              ) : null}
                              <div style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: "1/-1" }}>
                                <label style={{ ...labelStyle, fontSize: 11 }}>対象</label>
                                <AudiencePicker e={e} i={i} />
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}

            {/* confirm footer */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginTop: 26, padding: "18px 20px", background: "#fff", border: "1px solid #e8eaed", borderRadius: 14, boxShadow: "0 1px 3px rgba(60,64,67,.06)" }}>
              <div style={{ fontSize: 13, color: "#5f6368", lineHeight: 1.6 }}>
                <strong style={{ color: "#202124" }}>
                  {registered.length}/{rows.length}
                </strong>{" "}
                件を登録予定 · 参加者は対象（保護者/家族）に応じて自動付与されます
                {regError ? <span style={{ display: "block", color: "#c5221f", marginTop: 4 }}>{regError}</span> : null}
              </div>
              <button type="button" onClick={finishAll} disabled={!validCount || busy} style={validCount && !busy ? primaryBtn : disabledBtn}>
                {busy ? "登録中…" : "Google カレンダーに登録して完了"}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        ) : null}

        {/* ===== DONE ===== */}
        {screen === "done" ? (
          <div style={{ maxWidth: 560, margin: "20px auto 0", animation: "om-up .4s ease both" }}>
            <div style={{ textAlign: "center", marginBottom: 26 }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#e6f4ea", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px", animation: "om-pop .5s ease both" }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                  <path d="M5 13l4 4L19 7" stroke="#188038" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700 }}>カレンダーに登録しました</h2>
              <p style={{ margin: 0, fontSize: 13.5, color: "#5f6368" }}>
                {registered.length}件の予定を登録し、参加者とリマインドを設定しました。
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {rows
                .map((e, i) => ({ e, i }))
                .filter(({ i }) => registered.includes(i))
                .map(({ e, i }) => {
                  const audColor = e.audience === "parent" ? A : GREEN;
                  const dateDisp = fmtDate(e.date) || "日付未設定";
                  const timeDisp = e.allDay ? "終日" : e.startTime || "時刻未設定";
                  const rem = [notifyLabel(e.notify1), notifyLabel(e.notify2)].filter((l) => l !== "なし");
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "stretch", background: "#fff", border: "1px solid #e8eaed", borderRadius: 13, overflow: "hidden", boxShadow: "0 1px 3px rgba(60,64,67,.06)" }}>
                      <div style={{ width: 6, background: audColor, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0, padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: "#202124" }}>{e.title}</div>
                          <span style={audChip(audColor)}>{e.audience === "parent" ? "保護者のみ" : "家族全員"}</span>
                        </div>
                        <div style={{ fontSize: 12.5, color: "#5f6368", marginTop: 5 }}>
                          {dateDisp} · {timeDisp}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10, fontSize: 11.5, color: "#5f6368" }}>
                          <span style={{ background: "#f1f3f4", padding: "3px 9px", borderRadius: 6 }}>👥 {resolved(e).join(", ") || "—"}</span>
                          <span style={{ background: "#f1f3f4", padding: "3px 9px", borderRadius: 6 }}>🔔 {rem.length ? rem.join("・") : "なし"}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 30 }}>
              <button type="button" onClick={() => reset("upload")} style={primaryBtn}>
                別の画像を試す
              </button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
