import { redirect } from "next/navigation";
import { ChatbotPreview } from "@/components/chatbot-preview";
import { getSession } from "@/lib/auth";
import { canUseChatbot, type ChatbotRole } from "@/lib/chatbot-access";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminChatbotPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const client = db();
  const [{ data: user }, { data: settings }] = await Promise.all([
    client.from("users").select("role").eq("id", session.id).single(),
    client.from("app_settings").select("chatbot_admin_enabled,chatbot_member_enabled").eq("id", 1).maybeSingle(),
  ]);
  if (!user || !canUseChatbot(user.role as ChatbotRole, settings)) redirect("/admin");
  return <section className="admin-page chatbot-use-page"><div className="page-title"><div><p className="eyebrow green">CHAT SUPPORT</p><h1>チャットBot</h1><p>Fortyloveについて知りたいことを質問できます。</p></div></div><ChatbotPreview mode="admin" /></section>;
}
