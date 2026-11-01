/** The Uptime Sentry mark: three board rows, rank cell plus name bar. */
export default function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="6" fill="currentColor" />
      <g style={{ fill: 'var(--brandmark-ink, #0B0D10)' }}>
        <rect x="7" y="8" width="4" height="3" />
        <rect x="13" y="8" width="12" height="3" />
        <rect x="7" y="14.5" width="4" height="3" />
        <rect x="13" y="14.5" width="9" height="3" />
        <rect x="7" y="21" width="4" height="3" />
        <rect x="13" y="21" width="11" height="3" />
      </g>
    </svg>
  );
}
