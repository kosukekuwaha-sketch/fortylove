type EscalationEmailInput = {
  recipient: string | null;
  question: string;
  requesterName: string;
  questionId: string;
};

type EmailConfig = {
  apiKey?: string;
  senderEmail?: string;
  senderName?: string;
};

export type EscalationEmailResult = "sent" | "recipient_not_configured" | "provider_not_configured" | "failed";

export function createEscalationEmailPayload(input: EscalationEmailInput, config: Required<Pick<EmailConfig, "senderEmail">> & Pick<EmailConfig, "senderName">) {
  return {
    sender: { email: config.senderEmail, name: config.senderName || "Fortylove" },
    to: [{ email: input.recipient }],
    subject: "【Fortylove】チャットBotから有人対応の依頼があります",
    textContent: [
      "チャットBotの利用者が有人対応を希望しています。",
      "",
      `利用者: ${input.requesterName}`,
      `質問: ${input.question}`,
      `問い合わせID: ${input.questionId}`,
      "",
      "Fortylove管理画面のFAQ管理から対応してください。",
    ].join("\n"),
  };
}

export async function sendChatbotEscalationEmail(
  input: EscalationEmailInput,
  options: { config?: EmailConfig; fetcher?: typeof fetch } = {},
): Promise<EscalationEmailResult> {
  if (!input.recipient) return "recipient_not_configured";
  const config = options.config ?? {
    apiKey: process.env.BREVO_API_KEY,
    senderEmail: process.env.BREVO_SENDER_EMAIL,
    senderName: process.env.BREVO_SENDER_NAME,
  };
  if (!config.apiKey || !config.senderEmail) return "provider_not_configured";

  try {
    const response = await (options.fetcher ?? fetch)("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { accept: "application/json", "api-key": config.apiKey, "content-type": "application/json" },
      body: JSON.stringify(createEscalationEmailPayload(input, { senderEmail: config.senderEmail, senderName: config.senderName })),
    });
    return response.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
