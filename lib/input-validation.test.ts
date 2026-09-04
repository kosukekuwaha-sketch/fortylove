import { describe, expect, it } from "vitest";
import { loginInputSchema, memberProfileInputSchema, registrationInputSchema, uuidSchema } from "./input-validation";

const profile = {
  name: "山田 太郎",
  university: "早稲田大学",
  faculty: "商学部",
  department: "",
  grade: "2",
  instagram_id: "",
  line_display_name: "",
  tennis_experience: "未経験",
  has_racket: "false",
};

describe("server input validation", () => {
  it("accepts a bounded member profile and coerces grade", () => {
    const parsed = memberProfileInputSchema.parse(profile);
    expect(parsed.grade).toBe(2);
  });

  it("rejects invalid grades and oversized login input", () => {
    expect(memberProfileInputSchema.safeParse({ ...profile, grade: "7" }).success).toBe(false);
    expect(loginInputSchema.safeParse({ name: "a".repeat(101), password: "password" }).success).toBe(false);
  });

  it("enforces registration password bounds and UUID shape", () => {
    expect(registrationInputSchema.safeParse({ ...profile, password: "a".repeat(257) }).success).toBe(false);
    expect(uuidSchema.safeParse("not-an-id").success).toBe(false);
    expect(uuidSchema.safeParse("550e8400-e29b-41d4-a716-446655440000").success).toBe(true);
  });
});
