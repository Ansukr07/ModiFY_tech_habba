import { Link } from "react-router-dom";

export function BackButton({ to, children, className = "", onClick, type = "button" }) {
  const content = <><svg className="back-button-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M15.5 10h-11m0 0 4.5-4.5M4.5 10 9 14.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg><span>{children}</span></>;
  const classes = `back-button ${className}`.trim();
  return to ? <Link className={classes} to={to}>{content}</Link> : <button className={classes} type={type} onClick={onClick}>{content}</button>;
}
