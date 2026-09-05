import { z } from "zod";

const shortText = z.string().trim().max(100);
const organizationText = z.string().trim().max(160);

export const loginInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(256),
});

export const memberProfileInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  university: organizationText,
  faculty: organizationText,
  department: organizationText,
  grade: z.coerce.number().int().min(1).max(6),
  instagram_id: shortText,
  line_display_name: shortText,
  tennis_experience: z.string().trim().max(200),
  has_racket: z.enum(["true", "false"]),
});

export const registrationInputSchema = memberProfileInputSchema.extend({
  password: z.string().min(1).max(256),
});

export const uuidSchema = z.string().uuid();
