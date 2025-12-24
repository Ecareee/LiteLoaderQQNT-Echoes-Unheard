export function toMs(t: any): number {
  const n = Number(t || 0);
  if (!n) return 0;
  return n < 1e12 ? n * 1000 : n;
}