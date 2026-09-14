import type { SVGProps } from "react";

export function SpinnerIcon(props: SVGProps<SVGSVGElement> & { size?: number }) {
  const { size = 20, ...rest } = props;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      {...rest}
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

export function InlineSpinner({ className = "" }: { className?: string }) {
  return <SpinnerIcon size={20} className={`animate-spin text-zinc-400 ${className}`} />;
}