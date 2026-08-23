import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const formText = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

export async function requireAdmin() {
  const session = await getSession();
  if (!session) redirect("/login");
  const { data: user } = await db().from("users").select("id,name,role").eq("id", session.id).single();
  if (!user || user.role === "member") redirect("/login");
  return user;
}
