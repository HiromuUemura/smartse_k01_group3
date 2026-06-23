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
          学校のプリントやメール画像から予定を読み取り、必要な参加者を付けて Google カレンダーに登録するアプリです。
          まずは Google OAuth ログインと OCR 抽出の流れを確認できます。
        </p>

        <div className="actions">
          <a className="button" href="/api/auth/google">
            Googleでログイン
          </a>
          <a className="button secondary" href="/api/auth/logout">
            ログアウト
          </a>
        </div>

        <p>
          ログイン状態: <strong>{isSignedIn ? "ログイン済み" : "未ログイン"}</strong>
        </p>

        <h2>今後の流れ</h2>
        <ul>
          <li>OCR で予定候補を抽出</li>
          <li>不足項目があればユーザーに確認</li>
          <li>必要な参加者を付けて Google カレンダーに登録</li>
        </ul>
      </section>

      <ExtractUi hasKey={hasKey} currentModel={currentModel} isSignedIn={isSignedIn} />
    </main>
  );
}
