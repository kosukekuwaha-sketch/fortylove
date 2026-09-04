import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { ChatbotPreview } from "@/components/chatbot-preview";
import { MemberNav } from "@/components/member-nav";
import { SiteFooter } from "@/components/site-footer";
import { UserMenu } from "@/components/user-menu";
import { getSession } from "@/lib/auth";
import { canUseChatbot, type ChatbotRole } from "@/lib/chatbot-access";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function MemberChatbotPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const client = db();
  const [{ data: user }, { data: settings }] = await Promise.all([
    client.from("users").select("name,role,avatar_url").eq("id", session.id).single(),
    client.from("app_settings").select("chatbot_admin_enabled,chatbot_member_enabled").eq("id", 1).maybeSingle(),
  ]);
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin/chat");
  if (user.role === "super_admin") redirect("/admin/chatbot");
  if (!canUseChatbot(user.role as ChatbotRole, settings)) redirect("/home");
  return <main className="member-shell chatbot-member-page"><header className="member-header"><Brand /><UserMenu name={user.name} avatarUrl={user.avatar_url} /></header><MemberNav active="chatbot" chatbotEnabled /><section className="chatbot-user-content"><div className="section-head"><div><p className="eyebrow green">CHAT SUPPORT</p><h1>チャットBot</h1></div></div><ChatbotPreview mode="member" /></section><SiteFooter /></main>;
}
