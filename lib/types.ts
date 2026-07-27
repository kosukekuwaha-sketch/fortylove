export type Role = "super_admin" | "admin" | "member";
export type SessionUser = { id: string; name: string; role: Role };
export type EventItem = {
  id: string; title: string; starts_at: string; ends_at: string; location: string;
  capacity: number; description: string | null; reserved_count?: number; reservation_status?: string | null;
};
export type Member = {
  id: string; name: string; university: string; faculty: string; grade: number;
  email: string; line_id: string | null; role: Role; created_at: string;
};
