"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clearSession, setSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { loginInputSchema, registrationInputSchema } from "@/lib/input-validation";
import {
  clientAddress,
  LOGIN_BLOCK_SECONDS,
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_SECONDS,
  loginRateLimitKey,
} from "@/lib/login-rate-limit";
import { isValidNewPassword } from "@/lib/password-policy";
import { formText } from "@/lib/server/form-data";
import { configuredSupabaseRole } from "@/lib/server/supabase-diagnostics";

export async function login(formData: FormData) {
  const input = loginInputSchema.safeParse({
    name: formText(formData, "name"),
    password: String(formData.get("password") ?? ""),
  });
  if (!input.success) redirect("/login?error=1");

  const { name, password } = input.data;
  const requestHeaders = await headers();
  const address = clientAddress(requestHeaders.get("x-forwarded-for"), requestHeaders.get("x-real-ip"));
  const secret = process.env.SESSION_SECRET ?? "";
  const keys = [
    loginRateLimitKey("address", address, secret),
    loginRateLimitKey("identity", name, secret),
  ];
  const client = db();
  const checks = await Promise.all(keys.map((key) => client.rpc("check_login_rate_limit", { p_key_hash: key })));
  const checkError = checks.find((check) => check.error)?.error;
  if (checkError) {
    console.error("Login rate-limit database error", { message: checkError.message, code: checkError.code });
    redirect("/login?error=server");
  }
  if (checks.some((check) => Number(check.data ?? 0) > 0)) redirect("/login?error=rate-limit");

  const { data: users, error } = await client
    .from("users")
    .select("id,name,password_hash,role,session_version")
    .eq("name", name);
  if (error) {
    console.error("Login database error", {
      message: error.message,
      code: error.code,
      details: error.details,
      configuredKeyRole: configuredSupabaseRole(),
    });
    redirect("/login?error=server");
  }

  const user = users?.find((candidate) => bcrypt.compareSync(password, candidate.password_hash));
  if (!user) {
    const failures = await Promise.all(keys.map((key) => client.rpc("record_login_failure", {
      p_key_hash: key,
      p_window_seconds: LOGIN_WINDOW_SECONDS,
      p_max_failures: LOGIN_MAX_FAILURES,
      p_block_seconds: LOGIN_BLOCK_SECONDS,
    })));
    const failureError = failures.find((failure) => failure.error)?.error;
    if (failureError) {
      console.error("Login failure recording error", { message: failureError.message, code: failureError.code });
      redirect("/login?error=server");
    }
    if (failures.some((failure) => Number(failure.data ?? 0) > 0)) {
      await client.from("audit_logs").insert({ action: "auth.login.rate_limited", target_type: "login" });
      redirect("/login?error=rate-limit");
    }
    redirect("/login?error=1");
  }

  await client.rpc("clear_login_rate_limit", { p_key_hash: keys[1] });
  await setSession({
    id: user.id,
    name: user.name,
    role: user.role,
    session_version: user.session_version,
  });
  redirect(user.role === "member" ? "/home" : "/admin");
}

export async function register(formData: FormData) {
  const client = db();
  const { data: settings, error: settingsError } = await client
    .from("app_settings")
    .select("recruiting_open")
    .eq("id", 1)
    .maybeSingle();
  if (settingsError) redirect("/register?error=server");
  if (settings?.recruiting_open === false) redirect("/register?error=closed");

  const input = registrationInputSchema.safeParse({
    name: formText(formData, "name"),
    password: String(formData.get("password") ?? ""),
    university: formText(formData, "university"),
    faculty: formText(formData, "faculty"),
    department: formText(formData, "department"),
    grade: formText(formData, "grade"),
    instagram_id: formText(formData, "instagram_id"),
    line_display_name: formText(formData, "line_display_name"),
    tennis_experience: formText(formData, "tennis_experience"),
    has_racket: formText(formData, "has_racket"),
  });
  if (!input.success) redirect("/register?error=validation");
  if (!isValidNewPassword(input.data.password)) redirect("/register?error=password");

  const { name, password } = input.data;
  const { data: sameNames } = await client.from("users").select("password_hash").eq("name", name);
  if (sameNames?.some((user) => bcrypt.compareSync(password, user.password_hash))) {
    redirect("/register?error=duplicate");
  }

  const { data, error } = await client.from("users").insert({
    name,
    password_hash: await bcrypt.hash(password, 12),
    university: input.data.university,
    faculty: input.data.faculty,
    department: input.data.department,
    grade: input.data.grade,
    instagram_id: input.data.instagram_id || null,
    line_display_name: input.data.line_display_name || null,
    tennis_experience: input.data.tennis_experience,
    has_racket: input.data.has_racket === "true",
    role: "member",
  }).select("id,name,role,session_version").single();
  if (error || !data) redirect("/register?error=server");
  await setSession(data);
  redirect("/home");
}

export async function logout() {
  await clearSession();
  redirect("/login");
}
