type BrandMarkProps = { className?: string };

export function BrandMark({ className = '' }: BrandMarkProps) {
  return (
    <span className={`brand-mark ${className}`.trim()}>
      <span className="brand-mark-dot" aria-hidden="true" />
      <span>绒页</span>
    </span>
  );
}
