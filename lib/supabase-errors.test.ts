import { describe, expect, it } from "vitest";
import { isMissingColumnError } from "./supabase-errors";

describe("isMissingColumnError", () => {
  it("PostgRESTのスキーマキャッシュ未反映を検出する", () => {
    expect(isMissingColumnError({
      code: "PGRST204",
      message: "Could not find the 'chatbot_admin_sources' column of 'app_settings' in the schema cache",
    }, ["chatbot_admin_sources", "chatbot_member_sources"])).toBe(true);
  });

  it("PostgreSQLの未定義列エラーを検出する", () => {
    expect(isMissingColumnError({ code: "42703", message: "column does not exist" }, ["chatbot_admin_sources"])).toBe(true);
  });

  it("通常の保存エラーを未適用マイグレーション扱いにしない", () => {
    expect(isMissingColumnError({ code: "23514", message: "check constraint failed" }, ["chatbot_admin_sources"])).toBe(false);
  });
});
