import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
export default async function Page() {
  const session = await getSession();
  if (!session) redirect("/login");
  const { data: user } = await db().from("users").select("role").eq("id", session.id).single();
  redirect(!user ? "/login" : user.role === "member" ? "/home" : "/admin");
}
