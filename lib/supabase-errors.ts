type SupabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export function isMissingColumnError(error: SupabaseErrorLike | null | undefined, columns: string[]) {
  if (!error) return false;
  if (error.code === "42703") return true;
  const description = [error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase();
  return (error.code === "PGRST204" || description.includes("column"))
    && columns.some((column) => description.includes(column.toLowerCase()));
}
