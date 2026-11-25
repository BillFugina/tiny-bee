export function formatMinutes(total: number): string {
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? `${h} hr ${m} min` : `${h} hr`
}
