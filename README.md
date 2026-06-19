# OCR Schedule Assistant

学校プリント画像などを読み取り、予定候補をGoogleカレンダーに登録するアプリ。

## 技術スタック

- Next.js
- TypeScript
- Google OAuth 2.0
- Google Calendar API

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
FAMILY_ATTENDEES=father@example.com,child@example.com
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
5. `テスト予定を作成` を押す
6. Googleカレンダーに `APIテスト予定` が登録されているか確認する
7. `FAMILY_ATTENDEES` を設定している場合、指定したメールに予定招待が届くか確認する

## GitHubに上げないもの

以下は `.gitignore` に入っています。

- `.env`
- `.env.local`
- `.env.*.local`
- `node_modules`
- `.next`

OAuthのClient Secretなどは絶対にコミットしないでください。

## 今後の開発候補

- プリント画像アップロード
- OpenAI APIによる予定・締切・持ち物抽出
- 抽出結果の確認・修正画面
- 家族役メンバーの選択UI
- Googleカレンダー登録前のプレビュー
- デモ用サンプルプリント
