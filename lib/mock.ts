import type { ExtractionResult, ScheduleCandidate } from "./types";

// LLMを使わずに動作確認するためのダミー抽出結果。
// サンプルお便りごとに、対応する固定の予定を返す（パイプライン疎通＆UI確認用）。

function candidate(o: Partial<ScheduleCandidate> & { title: string }): ScheduleCandidate {
  return {
    title: o.title,
    date: o.date ?? null,
    startTime: o.startTime ?? null,
    endTime: o.endTime ?? null,
    location: o.location ?? null,
    items: o.items ?? [],
    deadline: o.deadline ?? null,
    notes: o.notes ?? null,
    missingFields: o.missingFields ?? [],
    audience: o.audience ?? "family",
    attendees: o.attendees,
    confidence: o.confidence
  };
}

const SCENARIOS: Record<string, ScheduleCandidate[]> = {
  jugyo: [
    candidate({
      title: "授業参観",
      date: "2026-09-11",
      startTime: "14:00",
      endTime: "14:45",
      location: "御船が丘小学校",
      items: ["上履き（スリッパ等）"],
      notes: "駐車は競輪場第4・5駐車場を利用。",
      audience: "parent"
    }),
    candidate({
      title: "出欠フォーム提出",
      deadline: "2026-09-09",
      notes: "日付・時刻が読み取れませんでした。",
      missingFields: ["date", "startTime"],
      audience: "parent"
    })
  ],
  bukatsu: [
    candidate({
      title: "部活動保護者会",
      date: "2026-05-11",
      startTime: "15:30",
      endTime: "16:30",
      location: "各学級の教室",
      items: ["上履き"],
      audience: "parent"
    }),
    candidate({
      title: "出欠フォーム提出（部活動保護者会）",
      deadline: "2026-05-08",
      notes: "欠席でも入力が必要です。",
      missingFields: ["date"],
      audience: "parent"
    })
  ],
  natsu: [
    candidate({
      title: "夏季休業の短縮（短縮期間 開始）",
      date: "2026-08-25",
      audience: "family",
      notes: "例年より早く2学期が始まります。"
    })
  ],
  natsuyasumi: [
    candidate({
      title: "プール開放",
      date: "2026-07-25",
      startTime: "09:00",
      endTime: "11:30",
      location: "学校プール",
      items: ["水着", "タオル", "水泳帽"],
      audience: "family"
    })
  ]
};

export function getMockExtractionResult(sample?: string, fileName?: string): ExtractionResult {
  const candidates = (sample && SCENARIOS[sample]) || SCENARIOS.jugyo;
  return {
    candidates,
    warning: `これはダミー応答です（LLM未使用）。実際の画像内容は解析していません。${
      fileName ? ` / 入力: ${fileName}` : ""
    }`
  };
}
