"use client";

import { useMemo, useState } from "react";
import { registerJoinedMember } from "@/app/actions";
import { ConfirmSubmitButton } from "./confirm-submit-button";

type Candidate = {
  id: string;
  name: string;
  university: string;
  instagram_id?: string | null;
};

export function DirectMembershipForm({ users }: { users: Candidate[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Candidate | null>(null);
  const results = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("ja");
    if (!keyword || selected) return [];
    return users.filter((user) =>
      [user.name, user.university, user.instagram_id].some((value) => value?.toLocaleLowerCase("ja").includes(keyword)),
    ).slice(0, 8);
  }, [query, selected, users]);

  return <form action={registerJoinedMember} className="role-form direct-membership-form">
    <label className="user-search">入会者
      <input
        value={query}
        placeholder="名前・大学・Instagram IDで検索"
        autoComplete="off"
        onChange={(event) => { setQuery(event.target.value); setSelected(null); }}
      />
      <input type="hidden" name="user_id" value={selected?.id ?? ""} />
      {results.length > 0 && <div className="user-search-results">{results.map((user) => <button type="button" key={user.id} onClick={() => {
        setSelected(user);
        setQuery(`${user.name}（${user.university}）`);
      }}><strong>{user.name}</strong><small>{user.university}{user.instagram_id ? `・@${user.instagram_id.replace(/^@/, "")}` : ""}</small></button>)}</div>}
      {query && !selected && results.length === 0 && <small>一致する未入会ユーザーがいません</small>}
    </label>
    <ConfirmSubmitButton className="primary" disabled={!selected} message={`${selected?.name ?? "選択したユーザー"}さんを入会者として登録しますか？`}>入会者として登録</ConfirmSubmitButton>
  </form>;
}
