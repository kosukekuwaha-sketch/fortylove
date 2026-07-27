"use client";

import { useEffect } from "react";

export const REGISTRATION_DRAFT_KEY = "courtside_registration_draft";

export function RegistrationDraftKeeper() {
  useEffect(() => {
    const form = document.querySelector<HTMLFormElement>("#registration-form");
    if (!form) return;
    const saved = sessionStorage.getItem(REGISTRATION_DRAFT_KEY);
    if (saved) {
      const values = JSON.parse(saved) as Record<string, string>;
      requestAnimationFrame(() => {
        for (const element of Array.from(form.elements)) {
          if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) continue;
          if (!element.name || element.type === "hidden" || element.name.endsWith("_choice") || element.name.startsWith("custom_")) continue;
          if (values[element.name] !== undefined) element.value = values[element.name];
        }
      });
    }
    const save = () => {
      const values: Record<string, string> = {};
      new FormData(form).forEach((value, key) => { if (typeof value === "string") values[key] = value; });
      sessionStorage.setItem(REGISTRATION_DRAFT_KEY, JSON.stringify(values));
    };
    form.addEventListener("input", save);
    form.addEventListener("change", save);
    return () => {
      form.removeEventListener("input", save);
      form.removeEventListener("change", save);
    };
  }, []);
  return null;
}

export function ClearRegistrationDraft() {
  useEffect(() => { sessionStorage.removeItem(REGISTRATION_DRAFT_KEY); }, []);
  return null;
}
