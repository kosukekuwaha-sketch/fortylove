"use client";

import { useMemo, useState } from "react";
import { resetUserPassword } from "@/app/actions";
import { ConfirmSubmitButton } from "./confirm-submit-button";

type PasswordUser = {
  id: string;
  name: string;
  university: string;
  email: string;
  role: "member" | "admin" | "super_admin";
};

const roleLabel = (user: PasswordUser) =>
  user.role === "super_admin" ? "最高情報責任者" : user.role === "admin" ? "管理者" : user.university;

export function PasswordResetForm({ users }: { users: PasswordUser[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PasswordUser | null>(null);
  const results = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("ja");
    if (!keyword || selected) return [];
    return users.filter((user) =>
      [user.name, user.university, user.email].some((value) =>
        value?.toLocaleLowerCase("ja").includes(keyword),
      ),
    ).slice(0, 8);
  }, [query, selected, users]);

  return (
    <form action={resetUserPassword} className="role-form">
      <label className="user-search">対象ユーザー
        <input
          value={query}
          placeholder="名前・大学・メールで検索"
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(null);
          }}
        />
        <input type="hidden" name="user_id" value={selected?.id ?? ""} />
        {results.length > 0 && <div className="user-search-results">
          {results.map((user) => <button type="button" key={user.id} onClick={() => {
            setSelected(user);
            setQuery(`${user.name}（${roleLabel(user)}）`);
          }}>
            <strong>{user.name}</strong>
            <small>{roleLabel(user)}{user.email ? `・${user.email}` : ""}</small>
          </button>)}
        </div>}
        {query && !selected && results.length === 0 && <small>一致するユーザーがいません</small>}
      </label>
      <label>新しい仮パスワード<input name="temporary_password" type="password" minLength={4} autoComplete="new-password" required /></label>
      <ConfirmSubmitButton className="primary" disabled={!selected} message={`${selected?.name ?? "選択したユーザー"}のパスワードを再設定しますか？`}>再設定する</ConfirmSubmitButton>
    </form>
  );
}
