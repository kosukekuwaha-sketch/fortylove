"use client";

import type { MouseEvent, ReactNode } from "react";

export function ConfirmSubmitButton({
  message,
  className,
  disabled,
  children,
}: {
  message: string;
  className?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  function confirmSubmission(event: MouseEvent<HTMLButtonElement>) {
    if (!window.confirm(message)) event.preventDefault();
  }

  return (
    <button type="submit" className={className} disabled={disabled} onClick={confirmSubmission}>
      {children}
    </button>
  );
}
