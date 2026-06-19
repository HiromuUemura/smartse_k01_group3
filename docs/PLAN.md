# 開発計画 (PLAN)

OCR Schedule Assistant を「画像をアップロード → 予定がGoogleカレンダーに入る」まで完成させるための計画。

## 完成像（アーキテクチャ）

```
[入力] メール / 連絡アプリ画面 / プリント写真の画像   (issue #1, #2, #3 = 入力サンプル)
   │
   ▼
[1] 画像アップロードUI                                (issue #4)
   ▼
[2] 画像 → 予定情報をJSON抽出（マルチモーダルAI）       (issue #9)
       title / date / startTime / endTime / location
       / items(持ち物) / deadline / missingFields
   ▼
[3] 不足情報の検出 & ユーザへの確認・補完              (issue #5, #6)
   ▼
[4] 登録前プレビュー（編集可）＋ 共有先(家族)選択       (issue #4, #11)
   ▼
[5] Googleカレンダー登録（本番版）                     (issue #8)
       ├ attendees で家族へ共有                        (issue #10, #11)
       └ reminders.overrides で事前/当日通知           (issue #12, #13)
```

## 現状（実装済み）

- Next.js 14 (App Router) + TypeScript の土台
- Google OAuth ログイン（認可・コールバック・ログアウト） `lib/google.ts`, `app/api/auth/*`
- アクセストークンの保存・自動リフレッシュ（Cookie）
- カレンダーへの**テスト予定**登録（固定文言） `app/api/calendar/create-event`
- テスト用プリント画像 `samples/prints/`（issue #2）

→ 「認証」と「カレンダー書き込みの配管」は通っている。アプリの核心（画像→抽出→確認→登録）は未着手。

## フェーズ別タスク

### フェーズ A — 抽出パイプライン（最優先）
- [x] A-1 データモデル定義 `lib/types.ts`（`ScheduleCandidate`）
- [x] A-2 AI抽出API `app/api/extract/route.ts`（画像 → JSON、OpenAI GPT-5 nano/mini）
- [~] A-3 抽出プロンプト `lib/prompts.ts`（作成済み、`samples/prints/` での精度検証はこれから）（issue #9）

### フェーズ B — 入力UI（issue #4）
- [~] B-1 アップロード画面（試作 `app/extract-ui.tsx`：APIキー入力 / ファイル選択 / 抽出実行 / 結果表示）
- [ ] B-2 抽出結果のプレビュー＆編集フォーム

> ⚠️ グループでの確認・決定が必要な事項は [`docs/REVIEW_NEEDED.md`](./REVIEW_NEEDED.md) に集約（コード中は `要グループ確認` コメント）。

### フェーズ C — 不足情報フロー（issue #5, #6）
- [ ] C-1 `missingFields` を画面でハイライトし補完を促す
- [ ] C-2 （任意）不足分の再プロンプト

### フェーズ D — 本番登録
- [ ] D-1 `create-event` を「確定内容の登録」へ改修（issue #8）
- [ ] D-2 予定ごとの共有先選択UI → `attendees`（issue #10, #11）
- [ ] D-3 `reminders.overrides` で事前/当日通知（issue #12, #13）

### フェーズ E — 仕上げ
- [ ] E-1 エラー表示UI / ローディング / 認証ガード
- [ ] E-2 テスト整備（Vitest 等）、README更新
- [ ] E-3 デプロイ設定（リダイレクトURI追加など）

## 既知の課題・要決定事項

1. **AIモデルの選定**（A-2の前提）。画像理解できるマルチモーダルモデルを採用し、「OCR→別LLM」の2段ではなく1段でJSON抽出する構成を推奨。
2. **`.env.example` にAI用キー枠が無い**。採用モデルに合わせて追加し、READMEのセットアップ手順を更新。
3. **テストの仕組みが無い**。テスト画像はあるがテストFW未導入。
4. **リマインド(#12/#13)は別インフラ不要**。`event.reminders.overrides` で実現可能（cron不要）。
5. **画像の保管方針**。抽出後は破棄を基本にしてプライバシーを担保。
6. **入力3系統(#1〜3)の統合**。最終的に「画像1枚アップロード」に集約する想定。
7. **本番運用**。`GOOGLE_REDIRECT_URI` がlocalhost固定。デプロイ先決定時にリダイレクトURI追加。
8. **プロセス**。main直push運用 → ブランチ＋PR＋CI を推奨。

## 最短デモまでの経路

A-1（済） → A-2/A-3（抽出） → B-1/B-2（UI） → D-1（本番登録）
これでコア体験「画像を上げると予定がカレンダーに入る」が完成する。共有・リマインド・不足情報は上積み。
