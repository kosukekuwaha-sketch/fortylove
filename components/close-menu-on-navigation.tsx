"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export function CloseMenuOnNavigation() {
  const pathname = usePathname();
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const details = marker.current?.closest("details");
    if (details) details.open = false;
  }, [pathname]);

  return <span ref={marker} hidden />;
}
