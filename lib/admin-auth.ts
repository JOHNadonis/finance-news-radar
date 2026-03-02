import { cookies } from "next/headers";
import { getAdminConfig } from "./db";

export async function verifyAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) return false;

  const stored = getAdminConfig("session_token");
  const expires = getAdminConfig("session_expires");
  if (!stored || !expires) return false;
  if (Date.now() > Number(expires)) return false;

  return token === stored;
}
