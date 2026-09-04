"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearSession, getSession, setSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { memberProfileInputSchema, uuidSchema } from "@/lib/input-validation";
import { formText } from "@/lib/server/form-data";
import { removeAvatarFiles, uploadAvatar } from "@/lib/server/avatar-service";
import { archiveAndDeleteMember } from "@/lib/server/member-account-service";
import { configuredSupabaseRole } from "@/lib/server/supabase-diagnostics";

export async function reserve(formData: FormData) {
  const user = await getSession();
  if (!user) redirect("/login");
  const eventId = formText(formData, "event_id");
  if (!uuidSchema.safeParse(eventId).success) redirect("/home?error=reservation");

  const { data, error } = await db().rpc("reserve_event", { p_user_id: user.id, p_event_id: eventId });
  if (error) redirect("/home?error=reservation");
  if (data === "full") redirect("/home?error=full");
  if (!["reserved", "already_reserved"].includes(String(data))) redirect("/home?error=reservation");
  revalidatePath("/home");
  redirect(`/home?reserved=${eventId}`);
}

export async function cancelReservation(formData: FormData) {
  const user = await getSession();
  if (!user) redirect("/login");
  const eventId = formText(formData, "event_id");
  if (!uuidSchema.safeParse(eventId).success) redirect("/home?error=reservation");

  const { data, error } = await db().rpc("cancel_event_reservation", { p_user_id: user.id, p_event_id: eventId });
  if (error) redirect("/home?error=reservation");
  if (data === "deadline_passed") redirect("/home?error=cancel-deadline");
  if (data !== "cancelled") redirect("/home?error=reservation");
  revalidatePath("/home");
  redirect("/home?cancelled=1");
}

export async function deleteOwnAccount() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!await archiveAndDeleteMember(user.id, user.id, "self")) redirect("/profile?error=delete");
  await removeAvatarFiles(user.id);
  await clearSession();
  redirect("/login?deleted=1");
}

export async function updateProfile(formData: FormData) {
  const user = await getSession();
  if (!user) redirect("/login");
  const input = memberProfileInputSchema.safeParse({
    name: formText(formData, "name"),
    university: formText(formData, "university"),
    faculty: formText(formData, "faculty"),
    department: formText(formData, "department"),
    grade: formText(formData, "grade"),
    instagram_id: formText(formData, "instagram_id"),
    line_display_name: formText(formData, "line_display_name"),
    tennis_experience: formText(formData, "tennis_experience"),
    has_racket: formText(formData, "has_racket"),
  });
  if (!input.success) redirect("/profile?error=validation");

  const avatar = formData.get("avatar");
  const avatarResult = avatar instanceof File && avatar.size > 0
    ? await uploadAvatar(user.id, avatar)
    : undefined;
  if (avatarResult?.error) redirect(`/profile?error=${avatarResult.error}`);

  const updates = {
    name: input.data.name,
    university: input.data.university,
    faculty: input.data.faculty,
    department: input.data.department,
    grade: input.data.grade,
    instagram_id: input.data.instagram_id || null,
    line_display_name: input.data.line_display_name || null,
    tennis_experience: input.data.tennis_experience,
    has_racket: input.data.has_racket === "true",
    ...(avatarResult?.avatarUrl ? { avatar_url: avatarResult.avatarUrl } : {}),
  };
  const { error } = await db().from("users").update(updates).eq("id", user.id);
  if (error) {
    console.error("Profile database error", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      configuredKeyRole: configuredSupabaseRole(),
    });
    if (error.message.includes("avatar_url")) redirect("/profile?error=avatar-column");
    redirect("/profile?error=update");
  }
  await setSession({ ...user, name: input.data.name });
  redirect("/profile?saved=1");
}
