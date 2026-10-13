type BrandMarkProps = { className?: string };

export function BrandMark({ className = '' }: BrandMarkProps) {
  return (
    <span className={`brand-mark ${className}`.trim()}>
      <img className="brand-mark-symbol" src="/icon.svg" alt="" aria-hidden="true" />
      <span>绒页</span>
    </span>
  );
}
