export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="logo-mark">
      <defs>
        <linearGradient id="tf-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="0.55" stopColor="#6366f1" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#tf-grad)" />
      <path d="M9 10.5h14" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M16 10.5v12" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M19.5 18.5l2.2 2.2 4-4.4" stroke="#c4f1d4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="logo-word">TaskForge</span>
    </span>
  );
}
