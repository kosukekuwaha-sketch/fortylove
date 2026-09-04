"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { tokyoLocalToIso } from "@/lib/datetime";
import { formText, requireAdmin } from "@/lib/server/action-context";
import { isOwnedEventDocumentUploadPath, isValidEventDocumentName } from "@/lib/event-document-policy";
import { attachUploadedEventDocument, EVENT_DOCUMENT_BUCKET, removeEventDocument, removeUploadedEventDocument } from "@/lib/server/event-documents";

function uploadedDocument(formData: FormData, actorId: string) {
  const state = formText(formData, "document_upload_state");
  const path = formText(formData, "document_path");
  const name = formText(formData, "document_name");
  if (state === "uploading") return { error: "pending" } as const;
  if (state === "error") return { error: "upload" } as const;
  if (!path && !name) return { document: null } as const;
  if (state !== "ready" || !isOwnedEventDocumentUploadPath(path, actorId) || !isValidEventDocumentName(name)) {
    return { error: "upload" } as const;
  }
  return { document: { path, name } } as const;
}

export async function createEvent(formData: FormData) {
  const user = await requireAdmin();
  const uploaded = uploadedDocument(formData, user.id);
  if ("error" in uploaded) redirect(`/admin/events?error=document-${uploaded.error}`);
  const client = db();
  const startsAt = tokyoLocalToIso(formText(formData, "starts_at"));
  const endsAt = tokyoLocalToIso(formText(formData, "ends_at"));
  if (!startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) {
    if (uploaded.document) await removeUploadedEventDocument(uploaded.document.path, user.id);
    redirect("/admin/events?error=create");
  }
  const { data, error } = await client.from("events").insert({
    title: formText(formData, "title"), starts_at: startsAt, ends_at: endsAt,
    location: formText(formData, "location"), capacity: Number(formText(formData, "capacity")), description: formText(formData, "description"),
    event_type: formText(formData, "event_type") || "tennis",
  }).select("id").single();
  if (error) {
    if (uploaded.document) await removeUploadedEventDocument(uploaded.document.path, user.id);
    redirect("/admin/events?error=create");
  }
  if (data?.id && uploaded.document) {
    const documentError = await attachUploadedEventDocument(data.id, user.id, uploaded.document.path, uploaded.document.name);
    if (documentError) {
      await client.from("events").delete().eq("id", data.id);
      await removeUploadedEventDocument(uploaded.document.path, user.id);
      redirect(`/admin/events?error=document-${documentError}`);
    }
  }
  await client.from("audit_logs").insert({ actor_id: user.id, action: "event.create", target_type: "event", target_id: data?.id });
  revalidatePath("/admin/events");
}

export async function updateEvent(formData: FormData) {
  const user = await requireAdmin();
  const uploaded = uploadedDocument(formData, user.id);
  if ("error" in uploaded) redirect(`/admin/events?error=document-${uploaded.error}`);
  const eventId = formText(formData, "event_id");
  const startsAt = tokyoLocalToIso(formText(formData, "starts_at"));
  const endsAt = tokyoLocalToIso(formText(formData, "ends_at"));
  const capacity = Number(formText(formData, "capacity"));
  if (!eventId || !startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt) || capacity < 1) {
    if (uploaded.document) await removeUploadedEventDocument(uploaded.document.path, user.id);
    redirect("/admin/events?error=update");
  }
  const client = db();
  const { count } = await client.from("reservations").select("*", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "reserved");
  if (capacity < (count ?? 0)) {
    if (uploaded.document) await removeUploadedEventDocument(uploaded.document.path, user.id);
    redirect("/admin/events?error=capacity");
  }
  const { error } = await client.from("events").update({
    title: formText(formData, "title"), starts_at: startsAt, ends_at: endsAt,
    location: formText(formData, "location"), capacity, description: formText(formData, "description"),
    event_type: formText(formData, "event_type") || "tennis",
  }).eq("id", eventId);
  if (error) {
    if (uploaded.document) await removeUploadedEventDocument(uploaded.document.path, user.id);
    redirect("/admin/events?error=update");
  }
  if (uploaded.document) {
    const documentError = await attachUploadedEventDocument(eventId, user.id, uploaded.document.path, uploaded.document.name);
    if (documentError) {
      await removeUploadedEventDocument(uploaded.document.path, user.id);
      redirect(`/admin/events?error=document-${documentError}`);
    }
  } else if (formText(formData, "remove_document") === "true" && !await removeEventDocument(eventId)) {
    redirect("/admin/events?error=document-delete");
  }
  await client.from("audit_logs").insert({ actor_id: user.id, action: "event.update", target_type: "event", target_id: eventId });
  revalidatePath("/home");
  redirect("/admin/events?updated=1");
}

export async function deleteEvent(formData: FormData) {
  const user = await requireAdmin();
  const eventId = formText(formData, "event_id");
  if (!eventId) redirect("/admin/events?error=selection");
  const client = db();
  const { data: document } = await client.from("event_documents").select("file_path").eq("event_id", eventId).maybeSingle();
  const { error } = await client.from("events").delete().eq("id", eventId);
  if (error) {
    console.error("Event delete error", { message: error.message, code: error.code, details: error.details });
    redirect("/admin/events?error=delete");
  }
  if (document?.file_path) await client.storage.from(EVENT_DOCUMENT_BUCKET).remove([document.file_path]);
  await client.from("audit_logs").insert({ actor_id: user.id, action: "event.delete", target_type: "event", target_id: eventId });
  redirect("/admin/events?deleted=1");
}

export async function updateAttendance(formData: FormData) {
  const user = await requireAdmin();
  const reservationId = formText(formData, "id");
  const status = formText(formData, "status");
  if (!["reserved", "cancelled", "attended"].includes(status)) redirect("/admin/events?error=attendance");
  const client = db();
  const { error } = await client.from("reservations").update({ status }).eq("id", reservationId);
  if (error) redirect("/admin/events?error=attendance");
  await client.from("audit_logs").insert({ actor_id: user.id, action: "reservation.attendance.update", target_type: "reservation", target_id: reservationId });
  redirect("/admin/events?attendance_updated=1");
}
