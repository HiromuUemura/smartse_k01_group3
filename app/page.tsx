import { cookies } from "next/headers";
import AppFlow from "./app-flow";
import { getStoredOpenAiModel, hasOpenAiKey } from "../lib/openai";
import { resolveAttendeeEmails } from "../lib/google";

export default function Home() {
  const isSignedIn = Boolean(cookies().get("google_access_token")?.value);
  const hasKey = hasOpenAiKey();
  const currentModel = getStoredOpenAiModel();
  // 参加者プレビュー用（秘密情報ではない）。
  const parentAttendees = resolveAttendeeEmails(process.env.PARENT_ATTENDEES);
  const familyAttendees = resolveAttendeeEmails(process.env.FAMILY_ATTENDEES);

  return (
    <AppFlow
      isSignedIn={isSignedIn}
      hasKey={hasKey}
      currentModel={currentModel}
      parentAttendees={parentAttendees}
      familyAttendees={familyAttendees}
    />
  );
}
