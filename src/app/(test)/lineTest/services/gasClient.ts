const GAS_URL =
  "https://script.google.com/macros/s/AKfycbyz4nQOG0shS-9jm4bnfuc8clxrZFRxf-g6BBddZ5IIclxXD8hWGaUTRKE9r70UJ9OHOw/exec";

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
