export function parseCollaborationInviteToken(
  param: string | string[] | undefined,
): string {
  const token = Array.isArray(param) ? param[0] : param;
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(token)) {
    throw new Error("Invalid invitation");
  }
  return token;
}
