export function Mark({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <rect x="0" y="0" width="8" height="8" fill="#111" />
      <rect x="10" y="0" width="8" height="8" fill="#111" />
      <rect x="0" y="10" width="8" height="8" fill="#111" />
      <rect x="10" y="10" width="8" height="8" fill="#111" />
    </svg>
  );
}
