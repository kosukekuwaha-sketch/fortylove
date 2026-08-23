export const MIN_PASSWORD_LENGTH = 8;

export function isValidNewPassword(password: string) {
  return password.length >= MIN_PASSWORD_LENGTH;
}
