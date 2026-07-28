import Link from "next/link";
import { LogOut, Menu, UserRound } from "lucide-react";
import { logout } from "@/app/actions";
import { ConfirmSubmitButton } from "./confirm-submit-button";

export function UserMenu({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  return (
    <details className="user-menu">
      <summary className={`avatar${avatarUrl ? " has-image" : ""}`} aria-label="アカウントメニューを開く">
        <span className="mobile-menu-label"><Menu /><span>メニュー</span></span>
        <span className="avatar-content">{avatarUrl ? <img src={avatarUrl} alt="" /> : name.slice(0, 1)}</span>
      </summary>
      <div className="user-menu-panel">
        <p>{name}さん</p>
        <Link href="/profile"><UserRound />プロフィール編集</Link>
        <form action={logout}>
          <ConfirmSubmitButton message="ログアウトしますか？"><LogOut />ログアウト</ConfirmSubmitButton>
        </form>
      </div>
    </details>
  );
}
