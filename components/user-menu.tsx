import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import { logout } from "@/app/actions";

export function UserMenu({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  return (
    <details className="user-menu">
      <summary className="avatar" aria-label="アカウントメニューを開く">
        {avatarUrl ? <img src={avatarUrl} alt="" /> : name.slice(0, 1)}
      </summary>
      <div className="user-menu-panel">
        <p>{name}さん</p>
        <Link href="/profile"><UserRound />プロフィール編集</Link>
        <form action={logout}>
          <button type="submit"><LogOut />ログアウト</button>
        </form>
      </div>
    </details>
  );
}
