import { Instagram } from "lucide-react";

const INSTAGRAM_URL = "https://www.instagram.com/waseda_fortylove_shinkan";
const X_URL = "";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="social-heading">
        <strong>早大Fortylove 公式SNS</strong>
        <small>新歓情報や活動の様子を発信しています</small>
      </div>
      <div className="social-links">
        <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
          <span className="social-mark"><Instagram /></span>
          <span>Instagram<small>@waseda_fortylove_shinkan</small></span>
        </a>
        {X_URL ? (
          <a href={X_URL} target="_blank" rel="noopener noreferrer">
            <span className="social-mark social-x">X</span>
            <span>X<small>公式アカウント</small></span>
          </a>
        ) : (
          <span className="social-link-disabled">
            <span className="social-mark social-x">X</span>
            <span>X<small>準備中</small></span>
          </span>
        )}
      </div>
    </footer>
  );
}
