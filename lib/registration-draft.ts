export const REGISTRATION_DRAFT_KEY = "courtside_registration_draft";

export const REGISTRATION_DRAFT_FIELDS = [
  "name",
  "university_choice",
  "faculty_choice",
  "department_choice",
  "grade",
  "has_racket",
  "instagram_id",
  "line_display_name",
  "tennis_experience",
] as const;

export type RegistrationDraft = Partial<Record<(typeof REGISTRATION_DRAFT_FIELDS)[number], string>>;

const allowedFields = new Set<string>(REGISTRATION_DRAFT_FIELDS);

export function sanitizeRegistrationDraft(value: unknown): RegistrationDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const safe: RegistrationDraft = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (allowedFields.has(key) && typeof fieldValue === "string") {
      safe[key as keyof RegistrationDraft] = fieldValue;
    }
  }
  return safe;
}

export function parseRegistrationDraft(serialized: string | null): RegistrationDraft {
  if (!serialized) return {};
  try {
    return sanitizeRegistrationDraft(JSON.parse(serialized));
  } catch {
    return {};
  }
}

export function registrationDraftFromFormData(formData: FormData): RegistrationDraft {
  const values: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string") values[key] = value;
  });
  return sanitizeRegistrationDraft(values);
}
