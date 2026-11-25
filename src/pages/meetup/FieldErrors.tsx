export function FieldErrors({ errors }: { errors: unknown[] }) {
  return errors.map((err, i) => (
    <span key={i} className="error">
      {typeof err === 'string' ? err : (err as { message?: string } | undefined)?.message}
    </span>
  ))
}
