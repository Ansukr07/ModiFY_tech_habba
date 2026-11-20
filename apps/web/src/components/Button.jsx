import { Link } from "react-router-dom";

/** Shared action control. Use `to` for navigation and `href` for external links. */
export default function Button({ children, variant = "primary", size = "md", arrow = false, loading = false, to, href, className = "", disabled, ...props }) {
  const classes = `btn btn-${variant} btn-${size}${arrow ? " btn-arrow" : ""}${className ? ` ${className}` : ""}`;
  const content = <><span className="btn-label">{children}</span>{arrow && <span className="btn-icon" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none"><path d="M3.5 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg></span>}</>;

  if (to) return <Link className={classes} to={to} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : undefined} {...props}>{content}</Link>;
  if (href) return <a className={classes} href={href} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : undefined} {...props}>{content}</a>;
  return <button className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>{content}</button>;
}
