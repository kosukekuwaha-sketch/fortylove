import { db } from "@/lib/db";

export async function archiveAndDeleteMember(userId: string, withdrawnBy: string, source: "self" | "admin") {
  const { data, error } = await db().rpc("archive_and_delete_member", {
    p_user_id: userId,
    p_withdrawn_by: withdrawnBy,
    p_source: source,
  });
  if (error) {
    console.error("Atomic account deletion failed", { userId, source, message: error.message, code: error.code });
    return false;
  }
  return data === "deleted";
}
