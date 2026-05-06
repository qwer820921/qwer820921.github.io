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

export async function loginWithEmail(
  email: string,
  password: string
): Promise<{ success: boolean; session: AuthSession | null; error?: string }> {
  return gasCall("loginWithEmail", { email, password });
}

export async function sendResetEmail(
  email: string
): Promise<{ success: boolean; error?: string }> {
  return gasCall("sendResetEmail", { email });
}

export async function resetPassword(
  token: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  return gasCall("resetPassword", { token, newPassword });
}
