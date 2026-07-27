import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AdminNav } from "@/components/admin-nav";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession(); if (!user || user.role === "member") redirect("/login");
  return <div className="admin-shell"><AdminNav /><main className="admin-main"><header className="admin-top"><span>早大フォーティーラブ</span><span className="admin-user">{user.name} <small>{user.role === "super_admin" ? "最高管理者" : "管理者"}</small></span></header>{children}</main></div>;
}
