const GAS_URL =
  "https://script.google.com/macros/s/AKfycbzUsPr27vpzBF7EXJgDWtoejz0II5861g3HFmcTrZanQeJWseVvhjrYorMYgYy-xFHaBw/exec";

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
