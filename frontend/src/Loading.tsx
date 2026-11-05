export default function Loading({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="d-flex align-items-center gap-2 py-3" role="status" aria-live="polite">
      <span className="spinner-border spinner-border-sm" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
