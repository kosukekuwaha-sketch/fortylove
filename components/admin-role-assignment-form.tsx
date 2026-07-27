"use client";

import { useMemo, useState } from "react";
import { updateUserRole } from "@/app/actions";
import { ConfirmSubmitButton } from "./confirm-submit-button";

type RoleCandidate = {
  id: string;
  name: string;
  university: string;
  email: string;
};

export function AdminRoleAssignmentForm({ users }: { users: RoleCandidate[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RoleCandidate | null>(null);
  const [role, setRole] = useState("admin");
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
    <form action={updateUserRole} className="role-form">
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
            setQuery(`${user.name}（${user.university}）`);
          }}>
            <strong>{user.name}</strong>
            <small>{user.university}{user.email ? `・${user.email}` : ""}</small>
          </button>)}
        </div>}
        {query && !selected && results.length === 0 && <small>一致するユーザーがいません</small>}
      </label>
      <label>付与する権限
        <select name="role" value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="admin">管理者</option>
          <option value="super_admin">最高情報責任者</option>
        </select>
      </label>
      <ConfirmSubmitButton
        className="primary"
        disabled={!selected}
        message={`${selected?.name ?? "選択したユーザー"}へ${role === "super_admin" ? "最高情報責任者" : "管理者"}権限を付与しますか？`}
      >
        権限を付与
      </ConfirmSubmitButton>
    </form>
  );
}
