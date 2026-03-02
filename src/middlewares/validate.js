export function badRequest(msg) {
  const e = new Error(msg);
  e.status = 400;
  return e;
}