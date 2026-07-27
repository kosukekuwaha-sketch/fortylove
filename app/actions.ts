"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { clearSession, getSession, setSession } from "@/lib/auth";

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

function configuredSupabaseRole() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (key.startsWith("sb_secret_")) return "secret";
  try {
    const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
    return String(payload.role ?? "jwt-without-role");
  } catch {
    return key ? "unrecognized-key-format" : "missing";
  }
}

export async function login(fd: FormData) {
  const name = text(fd, "name");
  const password = text(fd, "password");
  const { data: users, error } = await db().from("users").select("id,name,password_hash,role").eq("name", name);
  if (error) {
    console.error("Login database error", {
      message: error.message,
      code: error.code,
      details: error.details,
      configuredKeyRole: configuredSupabaseRole(),
    });
    redirect("/login?error=server");
  }
  const user = users?.find((item) => bcrypt.compareSync(password, item.password_hash));
  if (!user) redirect("/login?error=1");
  await setSession({ id: user.id, name: user.name, role: user.role });
  redirect(user.role === "member" ? "/home" : "/admin");
}

export async function register(fd: FormData) {
  const password = text(fd, "password");
  if (password.length < 4) redirect("/register?error=password");
  const name = text(fd, "name");
  const client = db();
  const { data: sameNames } = await client.from("users").select("password_hash").eq("name", name);
  if (sameNames?.some((u) => bcrypt.compareSync(password, u.password_hash))) redirect("/register?error=duplicate");
  const { data, error } = await client.from("users").insert({
    name, password_hash: await bcrypt.hash(password, 12), university: text(fd, "university"),
    faculty: text(fd, "faculty"), department: text(fd, "department"), grade: Number(text(fd, "grade")), email: text(fd, "email"),
    line_id: text(fd, "line_id") || null, tennis_experience: text(fd, "tennis_experience"), role: "member",
  }).select("id,name,role").single();
  if (error || !data) redirect("/register?error=server");
  await setSession(data);
  redirect("/home");
}

export async function logout() { await clearSession(); redirect("/login"); }

export async function reserve(fd: FormData) {
  const user = await getSession();
  if (!user) redirect("/login");
  const eventId = text(fd, "event_id");
  const client = db();
  const { data: event } = await client.from("events").select("capacity,starts_at").eq("id", eventId).single();
  const { count } = await client.from("reservations").select("*", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "reserved");
  if (!event || new Date(event.starts_at) <= new Date()) return;
  if ((count ?? 0) >= event.capacity) redirect("/home?error=full");
  await client.from("reservations").upsert({ user_id: user.id, event_id: eventId, status: "reserved" }, { onConflict: "user_id,event_id" });
  revalidatePath("/home");
}

export async function cancelReservation(fd: FormData) {
  const user = await getSession();
  if (!user) redirect("/login");
  const eventId = text(fd, "event_id");
  const { data: event } = await db().from("events").select("starts_at").eq("id", eventId).single();
  if (event && new Date(event.starts_at).getTime() - Date.now() >= 2 * 3600_000) {
    await db().from("reservations").update({ status: "cancelled" }).eq("user_id", user.id).eq("event_id", eventId);
  }
  revalidatePath("/home");
}

export async function applyMembership() {
  const user = await getSession();
  if (!user) redirect("/login");
  await db().from("membership_applications").upsert({ user_id: user.id, status: "pending" }, { onConflict: "user_id", ignoreDuplicates: true });
  revalidatePath("/home");
}

export async function updateProfile(fd: FormData) {
  const user = await getSession();
  if (!user) redirect("/login");
  const name = text(fd, "name");
  const { error } = await db().from("users").update({
    name,
    university: text(fd, "university"),
    faculty: text(fd, "faculty"),
    department: text(fd, "department"),
    grade: Number(text(fd, "grade")),
    email: text(fd, "email"),
    line_id: text(fd, "line_id") || null,
    tennis_experience: text(fd, "tennis_experience"),
    has_racket: text(fd, "has_racket") === "true",
  }).eq("id", user.id);
  if (error) redirect("/profile?error=update");
  await setSession({ ...user, name });
  redirect("/profile?saved=1");
}

async function requireAdmin() {
  const user = await getSession();
  if (!user || user.role === "member") redirect("/login");
  return user;
}

export async function createEvent(fd: FormData) {
  const user = await requireAdmin();
  const client = db();
  const { data } = await client.from("events").insert({
    title: text(fd, "title"), starts_at: text(fd, "starts_at"), ends_at: text(fd, "ends_at"),
    location: text(fd, "location"), capacity: Number(text(fd, "capacity")), description: text(fd, "description"),
  }).select("id").single();
  await client.from("audit_logs").insert({ actor_id: user.id, action: "event.create", target_type: "event", target_id: data?.id });
  revalidatePath("/admin/events");
}

export async function updateApplication(fd: FormData) {
  const user = await requireAdmin();
  const id = text(fd, "id");
  await db().from("membership_applications").update({ status: text(fd, "status") }).eq("id", id);
  await db().from("audit_logs").insert({ actor_id: user.id, action: "application.update", target_type: "application", target_id: id });
  revalidatePath("/admin/applications");
}

export async function updateAttendance(fd: FormData) {
  await requireAdmin();
  await db().from("reservations").update({ status: text(fd, "status") }).eq("id", text(fd, "id"));
  revalidatePath("/admin/events");
}
