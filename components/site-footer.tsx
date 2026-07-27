import { Instagram } from "lucide-react";

const INSTAGRAM_URL = "https://www.instagram.com/waseda_fortylove_shinkan";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <span className="instagram-mark"><Instagram /></span>
        <p><strong>早大Fortylove 新歓</strong><small>@waseda_fortylove_shinkan</small></p>
      </div>
      <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
        Instagramを見る
      </a>
    </footer>
  );
}
