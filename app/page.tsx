import { cookies } from "next/headers";
import ExtractUi from "./extract-ui";
import { getStoredOpenAiModel, hasOpenAiKey } from "../lib/openai";

export default function Home() {
  const isSignedIn = Boolean(cookies().get("google_access_token")?.value);
  const hasKey = hasOpenAiKey();
  const currentModel = getStoredOpenAiModel();

  return (
    <main>
      <section className="card">
        <h1>OCR Schedule Assistant</h1>
        <p>
          学校プリントなどの画像を読み取り、予定候補をGoogleカレンダーに登録するアプリです。
          現時点では、Google OAuthログインとテスト予定登録だけを確認します。
        </p>

        <div className="actions">
          <a className="button" href="/api/auth/google">
            Googleでログイン
          </a>
          <form action="/api/calendar/create-event" method="post">
            <button className="button secondary" type="submit">
              テスト予定を作成
            </button>
          </form>
          <a className="button secondary" href="/api/auth/logout">
            ログアウト
          </a>
        </div>

        <p>
          ログイン状態: <strong>{isSignedIn ? "ログイン済み" : "未ログイン"}</strong>
        </p>

        <h2>次の開発候補</h2>
        <ul>
          <li>登録前の確認画面</li>
          <li>予定ごとの家族共有先選択</li>
          <li>事前・当日のリマインド設定</li>
        </ul>
      </section>

      <ExtractUi hasKey={hasKey} currentModel={currentModel} />
    </main>
  );
}
