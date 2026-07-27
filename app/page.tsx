import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
export default async function Page() {
  const user = await getSession();
  redirect(!user ? "/login" : user.role === "member" ? "/home" : "/admin");
}
