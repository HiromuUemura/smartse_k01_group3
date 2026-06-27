# OCR Schedule Assistant

学校のお便りやメール画像から予定を抽出し、必要な参加者を付けて Google カレンダーに登録する Next.js アプリです。

## 技術スタック

- Next.js
- TypeScript
- Google OAuth 2.0
- Google Calendar API

## できること

- 画像から予定候補を抽出（OpenAI。LLMを使わないダミーモードあり）
- `parent` / `family` を画像内容から判定
- 判定結果に応じて参加者を自動付与
- 抽出結果を**画面で確認・修正**してから Google カレンダーに追加
- 不足項目（日付・時刻など）を画面でハイライトして補完
- リマインド（前日・当日）を付けて登録

## Google Cloud Console の前提設定

Google Cloud Consoleで以下を設定してください。

1. Google Calendar APIを有効化
2. OAuth同意画面を作成
3. OAuthクライアントIDを作成
   - アプリケーションの種類: ウェブ アプリケーション
   - 承認済みのリダイレクトURI: `http://localhost:3000/api/auth/callback`
4. OAuth同意画面がテスト公開の場合、テストユーザーに研修用Googleアカウントを追加

必要なスコープは以下です。

```text
https://www.googleapis.com/auth/calendar.events
```

## セットアップ

```bash
npm install
cp .env.example .env.local
```

`.env.local` にGoogle Cloud Consoleで作成した値を入力します。

```env
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback
GOOGLE_CALENDAR_ID=primary
PARENT_ATTENDEES=mother@example.com,father@example.com
FAMILY_ATTENDEES=mother@example.com,father@example.com,child@example.com
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5-nano
```

`GOOGLE_CALENDAR_ID` は通常は `primary` で問題ありません。
特定のカレンダーに登録したい場合は、そのカレンダーIDを指定してください。

## 起動

```bash
npm run dev
```

ブラウザで以下を開きます。

```text
http://localhost:3000/
```

## 動作確認手順

1. `Googleでログイン` を押す
2. 研修用Googleアカウントでログインする
3. Calendar APIへのアクセスを許可する
4. トップ画面に戻る
5. OpenAI API キーを保存（※ダミーで試すだけならキー不要）
6. 画像をアップロードして抽出（または「ダミーで実行」にチェックして抽出）
7. 「3. 内容を確認・修正して登録」で、`要確認` の項目（日付・時刻など）を補完し、
   タイトル・対象（parent/family）・リマインドを確認/修正
8. `Googleカレンダーに追加` を押す

### ダミーモード（LLM・APIキー不要）

「ダミーで実行」にチェックして「抽出する」を押すと、固定のサンプル予定が返ります。
画像解析やAPIキーなしで、抽出→確認/編集→カレンダー登録の流れを確認できます。

## 補足

- `PARENT_ATTENDEES` は親だけ向け予定の参加者メールです
- `FAMILY_ATTENDEES` は家族全員向け予定の参加者メールです
- 参加者の出し分けはアプリ側で行うので、Google 側の家族共有カレンダーを必須にはしていません

## GitHubに上げないもの

以下は `.gitignore` に入っています。

- `.env`
- `.env.local`
- `.env.*.local`
- `node_modules`
- `.next`

OAuthのClient Secretなどは絶対にコミットしないでください。

## 今後の開発候補

- メール・連絡アプリ画面の入力サンプル拡充（issue #1 / #3）
- Agent SDK によるマルチエージェント構成への移行検討（issue #15-17）
- 入力例ごとの抽出精度チューニング

開発計画・要確認事項は [`docs/PLAN.md`](docs/PLAN.md) / [`docs/REVIEW_NEEDED.md`](docs/REVIEW_NEEDED.md) を参照。
