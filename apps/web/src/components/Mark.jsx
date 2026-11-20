export function Mark({ size = 18 }) {
  const s = size / 2 - 1;
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <rect x="0" y="0" width={s} height={s} fill="#111" />
      <rect x={s + 2} y="0" width={s} height={s} fill="#111" />
      <rect x="0" y={s + 2} width={s} height={s} fill="#111" />
      <rect x={s + 2} y={s + 2} width={s} height={s} fill="#111" />
    </svg>
  );
}
