import { CircleDot } from "lucide-react";
import Link from "next/link";

export function Brand() {
  return <Link href="/" className="brand" aria-label="ホームへ戻る"><span className="brand-mark"><CircleDot size={21} /></span><span>Fortylove</span></Link>;
}
