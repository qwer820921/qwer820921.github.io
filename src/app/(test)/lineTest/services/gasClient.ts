const GAS_URL =
  "https://script.google.com/macros/s/AKfycbwhHv8hQHsILEA1Ex7Ns9EX00oj_WQamDygk_Yzfs8uoag6_DGQlqCAPaKhYI5ld9wLSQ/exec";

export async function gasCall<T>(
  action: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action, ...params }),
  });
  if (!res.ok) throw new Error(`GAS error: ${res.status}`);
  return res.json();
}
