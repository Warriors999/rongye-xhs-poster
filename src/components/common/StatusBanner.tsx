type StatusBannerProps = { message?: string | null };

export function StatusBanner({ message }: StatusBannerProps) {
  if (!message) return null;
  return <p className="status-banner" role="alert">{message}</p>;
}
