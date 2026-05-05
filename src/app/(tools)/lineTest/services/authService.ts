import { gasCall } from "./gasClient";
import type { Member, AuthSession } from "../types";

export async function findMemberByLineUserId(
  lineUserId: string
): Promise<{ member: Member | null }> {
  return gasCall("findMemberByLineUserId", { lineUserId });
}

export async function bindLineUserId(
  email: string,
  password: string,
  lineUserId: string
): Promise<{ success: boolean; session: AuthSession | null; error?: string }> {
  return gasCall("bindLineUserId", { email, password, lineUserId });
}

export async function checkFriendship(
  lineUserId: string
): Promise<{ isFriend: boolean }> {
  return gasCall("checkFriendship", { lineUserId });
}
