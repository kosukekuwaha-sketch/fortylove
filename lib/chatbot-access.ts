export type ChatbotRole = "super_admin" | "admin" | "member";

export type ChatbotAccessSettings = {
  chatbot_admin_enabled?: boolean | null;
  chatbot_member_enabled?: boolean | null;
  chatbot_admin_sources?: string[] | null;
  chatbot_member_sources?: string[] | null;
};

export function canUseChatbot(role: ChatbotRole, settings: ChatbotAccessSettings | null | undefined) {
  if (role === "super_admin") return true;
  if (role === "admin") return settings?.chatbot_admin_enabled === true;
  return settings?.chatbot_member_enabled === true;
}

export function chatbotSourcesForAudience(audience: "admin" | "member", settings: ChatbotAccessSettings | null | undefined) {
  return audience === "admin" ? settings?.chatbot_admin_sources ?? [] : settings?.chatbot_member_sources ?? [];
}
