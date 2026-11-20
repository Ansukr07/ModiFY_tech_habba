import "./skeleton.css";

export function Skeleton({ className = "", label = "Loading" }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" data-loading-label={label} />;
}

export function SkeletonBlock({ className = "", label = "Loading", children }) {
  return <div className={`skeleton-block ${className}`} role="status" aria-label={label}>{children}</div>;
}
