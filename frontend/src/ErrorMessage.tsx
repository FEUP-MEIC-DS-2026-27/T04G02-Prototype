export default function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="alert alert-danger" role="alert">
      <p className="mb-0">{message}</p>
    </div>
  );
}
