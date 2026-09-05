"use client";
import { useFormStatus } from "react-dom";
export function FormFeedback() {
  const { pending } = useFormStatus();
  return pending ? <span className="form-pending" role="status">処理中です…</span> : null;
}
