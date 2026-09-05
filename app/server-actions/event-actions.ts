"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { tokyoLocalToIso } from "@/lib/datetime";
import { requireAdmin } from "@/lib/server/action-context";
import { formText } from "@/lib/server/form-data";
import { isOwnedEventDocumentUploadPath, isValidEventDocumentName } from "@/lib/event-document-policy";
import { attachUploadedEventDocument, EVENT_DOCUMENT_BUCKET, removeEventDocument, removeUploadedEventDocument } from "@/lib/server/event-documents";
import {
  attendanceInputSchema,
  createEventInputSchema,
  eventIdInputSchema,
  updateEventInputSchema,
} from "@/lib/server-action-validation";

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
  const parsed = createEventInputSchema.safeParse({
    title: formText(formData, "title"),
    starts_at: formText(formData, "starts_at"),
    ends_at: formText(formData, "ends_at"),
    location: formText(formData, "location"),
    capacity: formText(formData, "capacity"),
    description: formText(formData, "description"),
    event_type: formText(formData, "event_type") || undefined,
  });
  if (!parsed.success) {
    if (uploaded.document) await removeUploadedEventDocument(uploaded.document.path, user.id);
    redirect("/admin/events?error=create");
  }
  const client = db();
  const startsAt = tokyoLocalToIso(parsed.data.starts_at);
  const endsAt = tokyoLocalToIso(parsed.data.ends_at);
  if (!startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) {
    if (uploaded.document) await removeUploadedEventDocument(uploaded.document.path, user.id);
    redirect("/admin/events?error=create");
  }
  const { data, error } = await client.from("events").insert({
    title: parsed.data.title, starts_at: startsAt, ends_at: endsAt,
    location: parsed.data.location, capacity: parsed.data.capacity, description: parsed.data.description,
    event_type: parsed.data.event_type,
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
  const parsed = updateEventInputSchema.safeParse({
    event_id: formText(formData, "event_id"),
    title: formText(formData, "title"),
    starts_at: formText(formData, "starts_at"),
    ends_at: formText(formData, "ends_at"),
    location: formText(formData, "location"),
    capacity: formText(formData, "capacity"),
    description: formText(formData, "description"),
    event_type: formText(formData, "event_type") || undefined,
    remove_document: formText(formData, "remove_document") || "false",
  });
  const startsAt = parsed.success ? tokyoLocalToIso(parsed.data.starts_at) : null;
  const endsAt = parsed.success ? tokyoLocalToIso(parsed.data.ends_at) : null;
  if (!parsed.success || !startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) {
    if (uploaded.document) await removeUploadedEventDocument(uploaded.document.path, user.id);
    redirect("/admin/events?error=update");
  }
  const { event_id: eventId, capacity } = parsed.data;
  const client = db();
  const { count } = await client.from("reservations").select("*", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "reserved");
  if (capacity < (count ?? 0)) {
    if (uploaded.document) await removeUploadedEventDocument(uploaded.document.path, user.id);
    redirect("/admin/events?error=capacity");
  }
  const { error } = await client.from("events").update({
    title: parsed.data.title, starts_at: startsAt, ends_at: endsAt,
    location: parsed.data.location, capacity, description: parsed.data.description,
    event_type: parsed.data.event_type,
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
  } else if (parsed.data.remove_document && !await removeEventDocument(eventId)) {
    redirect("/admin/events?error=document-delete");
  }
  await client.from("audit_logs").insert({ actor_id: user.id, action: "event.update", target_type: "event", target_id: eventId });
  revalidatePath("/home");
  redirect("/admin/events?updated=1");
}

export async function deleteEvent(formData: FormData) {
  const user = await requireAdmin();
  const parsed = eventIdInputSchema.safeParse({ event_id: formText(formData, "event_id") });
  if (!parsed.success) redirect("/admin/events?error=selection");
  const eventId = parsed.data.event_id;
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
  const parsed = attendanceInputSchema.safeParse({ id: formText(formData, "id"), status: formText(formData, "status") });
  if (!parsed.success) redirect("/admin/events?error=attendance");
  const { id: reservationId, status } = parsed.data;
  const client = db();
  const { error } = await client.from("reservations").update({ status }).eq("id", reservationId);
  if (error) redirect("/admin/events?error=attendance");
  await client.from("audit_logs").insert({ actor_id: user.id, action: "reservation.attendance.update", target_type: "reservation", target_id: reservationId });
  redirect("/admin/events?attendance_updated=1");
}
