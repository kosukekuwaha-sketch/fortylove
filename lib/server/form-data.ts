export const formText = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
