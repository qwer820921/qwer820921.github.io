const GAS_URL =
  "https://script.google.com/macros/s/AKfycbzx2JS0sHOLBIMy6sFtxC5BpdDmF2ZbpT5Q-EDhus1k03Ksv9NQhaBPnUwZ2GIPzoGq/exec";

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
