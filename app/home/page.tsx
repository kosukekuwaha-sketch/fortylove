import { CalendarDays, Clock3, MapPin, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { cancelReservation, reserve } from "@/app/actions";
import { Brand } from "@/components/brand";
import { MemberNav } from "@/components/member-nav";
import { ClearRegistrationDraft } from "@/components/registration-draft";
import { UserMenu } from "@/components/user-menu";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { SiteFooter } from "@/components/site-footer";
import { ParticipationCalendar } from "@/components/participation-calendar";
import { LinkifiedText } from "@/components/linkified-text";
import { tokyoParts, tokyoTimeLabel } from "@/lib/datetime";

export const dynamic = "force-dynamic";
const dateParts = (iso: string) => {
  const value = tokyoParts(iso);
  return { key: `${value.year}-${value.month}-${value.day}`, label: `${value.month}月${value.day}日`, weekday: value.weekday };
};
const timeLabel = tokyoTimeLabel;

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string; reserved?: string; cancelled?: string }> }) {
  const user = await getSession(); if (!user) redirect("/login");
  const { error, reserved, cancelled } = await searchParams;
  const client = db();
  const [{ data: events }, { data: reservations }, { data: profile }] = await Promise.all([
    client.from("events").select("*,reservations(id,status)").gte("ends_at", new Date().toISOString()).order("starts_at"),
    client.from("reservations").select("event_id,status").eq("user_id", user.id),
    client.from("users").select("avatar_url").eq("id", user.id).maybeSingle(),
  ]);
  const status = new Map(reservations?.map(r => [r.event_id, r.status]));
  const participationEvents = (events ?? []).filter((event) => ["reserved", "attended"].includes(status.get(event.id) ?? "")).map((event) => ({ id: event.id, title: event.title, location: event.location, starts_at: event.starts_at, ends_at: event.ends_at, event_type: event.event_type }));
  return <main className="member-shell">
    <ClearRegistrationDraft />
    <header className="member-header"><Brand /><UserMenu name={user.name} avatarUrl={profile?.avatar_url} /></header>
    <MemberNav active="home" />
    <section className="welcome"><div><p className="eyebrow green">GOOD TO SEE YOU</p><h1>{user.name}さん、こんにちは。</h1><p>練習やイベントをチェックして、Fortyloveを楽しみましょう。</p></div><div className="mini-court"><span /></div></section>
    <section className="member-content">
      {error === "full" && <div className="alert">申し訳ございません。定員がいっぱいになってしまっています。</div>}
      {error === "reservation" && <div className="alert">予約を登録できませんでした。もう一度お試しください。</div>}
      {error === "cancel-deadline" && <div className="alert">開始2時間前を過ぎた予定は、画面からキャンセルできません。</div>}
      {reserved && <div className="success-message">参加予約を登録し、カレンダーへ反映しました。</div>}
      {cancelled && <div className="success-message">参加予約をキャンセルしました。</div>}
      <ParticipationCalendar events={participationEvents} focusEventId={reserved} />
      <div className="section-head"><div><p className="eyebrow green">UPCOMING</p><h2 id="events">これからのイベント</h2></div><span className="count">{events?.length ?? 0}件</span></div>
      <div className="event-list">{events?.map(event => {
        const booked = status.get(event.id) === "reserved";
        const count = event.reservations.filter((r: {status:string}) => r.status === "reserved").length;
        const startDate = dateParts(event.starts_at);
        const endDate = dateParts(event.ends_at);
        const spansMultipleDays = startDate.key !== endDate.key;
        return <article className="event-card" id={`event-${event.id}`} key={event.id}>
          <div className={`event-date${spansMultipleDays ? " date-range" : ""}`}><div><strong>{startDate.label}</strong><span>（{startDate.weekday}）</span></div>{spansMultipleDays && <><b>～</b><div><strong>{endDate.label}</strong><span>（{endDate.weekday}）</span></div></>}</div>
          <div className="event-main"><h3>{event.title}</h3><div className="event-meta"><span><Clock3 />{timeLabel(event.starts_at)}–{timeLabel(event.ends_at)}</span><span><MapPin />{event.location}</span><span><UsersRound />{count}/{event.capacity}名</span></div><p><LinkifiedText text={event.description} /></p></div>
          <form action={booked ? cancelReservation : reserve}><input type="hidden" name="event_id" value={event.id}/><ConfirmSubmitButton className={booked ? "booked" : "reserve"} disabled={!booked && count >= event.capacity} message={booked ? `「${event.title}」の予約をキャンセルしますか？` : `「${event.title}」に参加予約しますか？`}>{booked ? "予約済み" : count >= event.capacity ? "満員" : "予約する"}</ConfirmSubmitButton></form>
        </article>;
      })}</div>
    </section>
    <SiteFooter />
  </main>;
}
