export function visibleDepartment(value?: string | null) {
  const department = value?.trim() ?? "";
  return department.startsWith("学科なし") ? "" : department;
}
