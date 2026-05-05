import { gasCall } from "./gasClient";
import type { TokenValidationResult } from "../types";

export async function validateToken(
  token: string | null
): Promise<TokenValidationResult> {
  return gasCall<TokenValidationResult>("validateToken", { token });
}
