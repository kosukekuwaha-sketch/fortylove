import { CalendarDays, Clock3, MapPin, Sparkles, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { applyMembership, cancelReservation, reserve } from "@/app/actions";
import { Brand } from "@/components/brand";
import { MemberNav } from "@/components/member-nav";
import { ClearRegistrationDraft } from "@/components/registration-draft";
import { UserMenu } from "@/components/user-menu";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { SiteFooter } from "@/components/site-footer";

export const dynamic = "force-dynamic";
const dateLabel = (iso: string) => new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric", weekday: "short" }).format(new Date(iso));
const timeLabel = (iso: string) => new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getSession(); if (!user) redirect("/login");
  const { error } = await searchParams;
  const client = db();
  const [{ data: events }, { data: reservations }, { data: application }, { data: settings }, { data: profile }] = await Promise.all([
    client.from("events").select("*,reservations(id,status)").gte("ends_at", new Date().toISOString()).order("starts_at"),
    client.from("reservations").select("event_id,status").eq("user_id", user.id),
    client.from("membership_applications").select("status").eq("user_id", user.id).maybeSingle(),
    client.from("app_settings").select("recruiting_open").eq("id", 1).maybeSingle(),
    client.from("users").select("avatar_url").eq("id", user.id).maybeSingle(),
  ]);
  const status = new Map(reservations?.map(r => [r.event_id, r.status]));
  return <main className="member-shell">
    <ClearRegistrationDraft />
    <header className="member-header"><Brand /><UserMenu name={user.name} avatarUrl={profile?.avatar_url} /></header>
    <section className="welcome"><div><p className="eyebrow green">GOOD TO SEE YOU</p><h1>{user.name}さん、こんにちは。</h1><p>練習やイベントをチェックして、Fortyloveを楽しみましょう。</p></div><div className="mini-court"><span /></div></section>
    <section className="member-content">
      {error === "full" && <div className="alert">申し訳ございません。定員がいっぱいになってしまっています。</div>}
      <section className="join-card"><div className="join-icon"><Sparkles /></div><div><p className="eyebrow">READY TO JOIN?</p><h2>{application ? application.status === "approved" ? "入会が承認されました！" : application.status === "withdrawn" ? "退会済みです" : "入会申請を受け付けています" : "この春、一緒にテニスしませんか？"}</h2><p>{application?.status === "withdrawn" ? "再入会を希望する場合は運営へご連絡ください。" : application ? "運営からの連絡をお待ちください。" : "いつでも入会を申請できます。まずは気軽に送ってみてください。"}</p></div>{!application && settings?.recruiting_open !== false && <form action={applyMembership}><ConfirmSubmitButton className="dark" message="Fortyloveへ入会申請しますか？">入会を申請する</ConfirmSubmitButton></form>}</section>
      <div className="section-head"><div><p className="eyebrow green">UPCOMING</p><h2 id="events">これからのイベント</h2></div><span className="count">{events?.length ?? 0}件</span></div>
      <div className="event-list">{events?.map(event => {
        const booked = status.get(event.id) === "reserved";
        const count = event.reservations.filter((r: {status:string}) => r.status === "reserved").length;
        return <article className="event-card" key={event.id}>
          <div className="event-date"><strong>{dateLabel(event.starts_at).split("日")[0]}日</strong><span>{dateLabel(event.starts_at).split("日")[1]}</span></div>
          <div className="event-main"><h3>{event.title}</h3><div className="event-meta"><span><Clock3 />{timeLabel(event.starts_at)}–{timeLabel(event.ends_at)}</span><span><MapPin />{event.location}</span><span><UsersRound />{count}/{event.capacity}名</span></div><p>{event.description}</p></div>
          <form action={booked ? cancelReservation : reserve}><input type="hidden" name="event_id" value={event.id}/><ConfirmSubmitButton className={booked ? "booked" : "reserve"} disabled={!booked && count >= event.capacity} message={booked ? `「${event.title}」の予約をキャンセルしますか？` : `「${event.title}」に参加予約しますか？`}>{booked ? "予約済み" : count >= event.capacity ? "満員" : "予約する"}</ConfirmSubmitButton></form>
        </article>;
      })}</div>
    </section>
    <SiteFooter />
    <MemberNav active="home" />
  </main>;
}
