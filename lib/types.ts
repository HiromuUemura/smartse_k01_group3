// 抽出パイプラインの共通データモデル。
// 画像 → AI抽出 → 確認UI → カレンダー登録 の全フェーズで共有する。

/** 入力画像の出どころ。 */
export type ScheduleSource = "print" | "email" | "contact-app";

/** ScheduleCandidate のフィールド名。不足情報の指摘などで使う。 */
export type ScheduleField =
  | "title"
  | "date"
  | "startTime"
  | "endTime"
  | "location"
  | "items"
  | "deadline";

/**
 * 画像から抽出した予定候補1件。
 * 値が読み取れない/曖昧な場合は null（または空配列）とし、
 * 確認が必要な項目を missingFields に列挙する。
 */
export interface ScheduleCandidate {
  /** 予定タイトル（例: 「6月 授業参観」）。 */
  title: string;
  /** 日付 YYYY-MM-DD。読み取れない場合は null。 */
  date: string | null;
  /** 開始時刻 HH:mm（24時間表記）。終日/不明なら null。 */
  startTime: string | null;
  /** 終了時刻 HH:mm。不明なら null。 */
  endTime: string | null;
  /** 場所。不明なら null。 */
  location: string | null;
  /** 持ち物リスト。無ければ空配列。 */
  items: string[];
  /** 提出・締切日 YYYY-MM-DD。無ければ null。 */
  deadline: string | null;
  /** 備考・補足。無ければ null。 */
  notes: string | null;
  /**
   * 抽出できなかった、または曖昧でユーザ確認が必要な項目。
   * 不足情報フロー（issue #5, #6）で使用する。
   */
  missingFields: ScheduleField[];
  /** モデルの自己申告の確信度 0.0〜1.0（任意）。 */
  confidence?: number;
}

/** AI抽出API（app/api/extract）のレスポンス。 */
export interface ExtractionResult {
  /** 抽出した予定候補（1枚の画像に複数予定が含まれる場合がある）。 */
  candidates: ScheduleCandidate[];
  /** 入力の出どころ（任意）。 */
  source?: ScheduleSource;
  /** 予定が見つからない/読み取れない場合などの注意書き。 */
  warning?: string | null;
}

/** カレンダー登録時の通知（リマインド）設定。issue #12, #13。 */
export interface ReminderSetting {
  /** 通知方法。 */
  method: "popup" | "email";
  /** 予定開始の何分前に通知するか。 */
  minutesBefore: number;
}

/**
 * 確認UIで確定し、カレンダー登録APIへ渡す予定。
 * ScheduleCandidate のうち登録に必須な項目を確定値にしたもの。
 */
export interface ConfirmedSchedule {
  title: string;
  /** 日付 YYYY-MM-DD（必須）。 */
  date: string;
  /** HH:mm。null の場合は終日予定として扱う。 */
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  items: string[];
  deadline: string | null;
  notes: string | null;
  /** 共有する家族などのメールアドレス。issue #10, #11。 */
  attendees: string[];
  /** 通知設定。issue #12, #13。 */
  reminders: ReminderSetting[];
}
