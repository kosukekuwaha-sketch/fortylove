import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const year = new Date().getUTCFullYear();
  const action = `grade.promote.${year}`;
  const client = db();
  const { data: completed } = await client
    .from("audit_logs")
    .select("id")
    .eq("action", action)
    .maybeSingle();

  if (completed) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { data: users, error } = await client
    .from("users")
    .select("id,grade")
    .eq("role", "member")
    .lt("grade", 5);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 実行記録を先に残し、同じ年の再実行で学年が二重に進むことを防ぐ。
  const { error: auditError } = await client
    .from("audit_logs")
    .insert({ action, target_type: "users" });
  if (auditError) return NextResponse.json({ error: auditError.message }, { status: 500 });

  const results = await Promise.all(
    (users ?? []).map((user) =>
      client.from("users").update({ grade: Math.min(Number(user.grade) + 1, 5) }).eq("id", user.id),
    ),
  );
  const updateError = results.find((result) => result.error)?.error;
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true, updated: users?.length ?? 0 });
}
