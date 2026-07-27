import Link from "next/link";
import { TennisBallIcon } from "./tennis-ball-icon";

export function Brand() {
  return <Link href="/" className="brand" aria-label="ホームへ戻る"><span className="brand-mark"><TennisBallIcon /></span><span>Fortylove</span></Link>;
}
