import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { api } from "../data/api.js";
import "../demo.css";

export const startDemo = () => window.dispatchEvent(new CustomEvent("zerocibil:demo", { detail: { scope: "full" } }));
export const startApplyDemo = () => window.dispatchEvent(new CustomEvent("zerocibil:demo", { detail: { scope: "apply" } }));
const fullChapters = ["Owner sign-in", "Shop details", "Operating evidence", "Funding request", "Submit application", "Bank sign-in", "Verify activity", "Lender sign-in", "Assess application"];
const applyChapters = ["Shop details", "Operating evidence", "Funding request", "Your turn"];

export function DemoPlayer() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [view, setView] = useState(null);
  const [pointer, setPointer] = useState(null);
  const run = useRef(null);
  const actions = useRef({ navigate, logout });
  actions.current = { navigate, logout };
  const stop = () => {
    if (run.current) run.current.cancelled = true;
    run.current = null;
    document.querySelectorAll(".demo-target").forEach(el => el.classList.remove("demo-target"));
    setView(null); setPointer(null);
  };
  useEffect(() => {
    async function play(event) {
      if (run.current) run.current.cancelled = true;
      const session = { cancelled: false, paused: false };
      run.current = session;
      const scope = event?.detail?.scope === "apply" ? "apply" : "full";
      const chapters = scope === "apply" ? applyChapters : fullChapters;
      let chapter = 0;
      const check = () => { if (session.cancelled) throw new DOMException("Stopped", "AbortError"); };
      const sleep = async (ms) => {
        for (let elapsed = 0; elapsed < ms;) {
          check(); await new Promise(resolve => setTimeout(resolve, 40));
          if (!session.paused) elapsed += 40;
        }
        check();
      };
      const status = (index, message) => { chapter = index; setView({ chapter: index, message, paused: session.paused, scope, chapters }); };
      const wait = async (selector) => {
        for (let n = 0; n < 200; n++) {
          check();
          const element = document.querySelector(selector);
          if (element && !element.disabled) return element;
          const error = document.querySelector(".login-error, .owner-error, .bank-error, .dashboard-main [role=alert]");
          if (error?.textContent) throw new Error(error.textContent);
          await sleep(100);
        }
        throw new Error("This step is taking longer than expected. Check that the demo API is running, then replay.");
      };
      const point = async (selector, click = true) => {
        const element = await wait(selector);
        document.querySelectorAll(".demo-target").forEach(el => el.classList.remove("demo-target"));
        element.classList.add("demo-target");
        element.scrollIntoView({ behavior: "instant", block: "center" });
        const rect = element.getBoundingClientRect();
        setPointer({ left: rect.left + Math.min(80, rect.width / 2), top: rect.top + rect.height / 2, clicking: false });
        await sleep(650);
        if (click) {
          setPointer(current => ({ ...current, clicking: true }));
          element.focus({ preventScroll: true });
          element.click();
          await sleep(200);
          setPointer(current => current && ({ ...current, clicking: false }));
        }
        return element;
      };
      const write = (input, value) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const type = async (selector, value) => {
        const input = await point(selector);
        write(input, "");
        for (let index = 1; index <= value.length; index++) {
          await sleep(65);
          write(input, value.slice(0, index));
        }
        await sleep(450);
      };
      const signIn = async (identity, index) => {
        status(index, `Typing ${identity} into the demo sign-in.`);
        await actions.current.logout().catch(error => { if (error.message !== "Sign in required") throw error; }); check();
        actions.current.navigate("/login");
        await type(".login-field input", identity);
        await point(".login-submit");
      };
      const fillApplication = async (start, { submit = true } = {}) => {
        status(start, "Entering the shop identity that matches the synthetic bank account.");
        await type('input[name="name"]', "Lakshmi Stores");
        await type('input[name="type"]', "Kirana");
        await type('input[name="city"]', "Bengaluru");
        status(start + 1, "Selecting Lakshmi Stores’ simulated operating account.");
        if (!submit) await type('input[name="upi"]', "lakshmi@upi");
        await wait('select[name="evidence"] option[value="DEMO-ACCT-001"]');
        const select = await point('select[name="evidence"]');
        await sleep(500);
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, "DEMO-ACCT-001");
        select.dispatchEvent(new Event("change", { bubbles: true }));
        await sleep(1000);
        status(start + 2, submit ? "Requesting ₹50,000. The assessment will determine the proposed amount." : "Entering a sample request of ₹50,000.");
        await type('input[name="amount"]', "50000");
        if (!submit) {
          status(start + 3, "Sample left in the form. Submit it, or change any field and write your own.");
          await point('.owner-submit button[type="submit"]', false);
          return;
        }
        status(start + 3, "Submitting this synthetic application for bank review.");
        await point('.owner-submit button[type="submit"]');
        await wait("#owner-progress");
      };
      try {
        if (scope === "apply") {
          status(0, "Filling a sample application. The values stay in the form so you can submit them or change them.");
          await sleep(700);
          if (window.location.pathname !== "/apply") actions.current.navigate("/apply");
          await wait('input[name="name"]');
          await fillApplication(0, { submit: false });
          await sleep(600);
          document.querySelectorAll(".demo-target").forEach(el => el.classList.remove("demo-target"));
          setPointer(null);
          setView({ chapter: applyChapters.length - 1, done: true, scope, chapters, message: "Sample is filled in and was not submitted. Submit this application, or edit the fields and write your own." });
          return;
        }
        status(0, "A live synthetic demo. Follow the cursor through all three workspaces.");
        await sleep(1100);
        await signIn("owner@demo", 0);
        await point('.owner-actions a[href="/apply"]');
        await fillApplication(1);
        const applicationId = window.location.pathname.split("/").pop();
        await sleep(1600);
        await signIn("bank@demo", 5);
        await wait(".bank-queue");
        const bank = await api("/bank/dashboard"); check();
        const verification = bank.recent?.find(item => String(item.application_id) === applicationId);
        if (!verification) throw new Error("The submitted verification request was not found in the bank queue.");
        status(6, "Opening the request and checking it against server-held synthetic activity.");
        await point(`a[href="/bank/verification/${verification._id}"]`);
        await point(".bank-review .btn-primary");
        await wait(".bank-review p");
        await sleep(1600);
        await signIn("lender@demo", 7);
        await wait(".dashboard-heading");
        status(8, "Opening the verified application and running the lender assessment.");
        actions.current.navigate(`/application/${applicationId}`);
        await point(".dashboard-main > .btn-primary");
        await wait(".dashboard-assessment-summary");
        await sleep(1500);
        await point(`a[href="/application/${applicationId}/terms"]`);
        await sleep(1200);
        document.querySelectorAll(".demo-target").forEach(el => el.classList.remove("demo-target"));
        setPointer(null);
        setView({ chapter: 8, done: true, scope, chapters, message: "Demo complete. Owner request, bank verification and lender assessment are ready to explore." });
      } catch (error) {
        if (error.name !== "AbortError") {
          setPointer(null);
          setView({ chapter, error: true, scope, chapters, message: error.message });
        }
      }
    }
    const keyboard = event => { if (event.key === "Escape") stop(); };
    window.addEventListener("zerocibil:demo", play);
    window.addEventListener("keydown", keyboard);
    return () => { window.removeEventListener("zerocibil:demo", play); window.removeEventListener("keydown", keyboard); if (run.current) run.current.cancelled = true; };
  }, []);
  if (!view) return null;
  return <>
    {pointer && <div className={`demo-pointer ${pointer.clicking ? "is-clicking" : ""}`} style={{ left: pointer.left, top: pointer.top }} aria-hidden="true"><span className="demo-click-ring" /><svg viewBox="0 0 32 40" fill="none"><path d="M3 2.5v29l7.3-7.1 5.6 12.1 5.4-2.5-5.7-12.1H26L3 2.5Z" fill="#111" stroke="white" strokeWidth="2.5" strokeLinejoin="round" /></svg><span className="demo-pointer-label">Demo</span></div>}
    <section className="demo-player" aria-label="Live demo player">
      <div className="demo-player-heading"><strong>{view.done ? "Demo complete" : view.error ? "Demo paused" : view.chapters[view.chapter]}</strong><button type="button" onClick={stop} aria-label="Stop demo">×</button></div>
      <p role="status">{view.message}</p>
      <div className="demo-player-progress" aria-label={`Step ${view.chapter + 1} of ${view.chapters.length}`}>{view.chapters.map((name, index) => <span key={name} className={index <= view.chapter ? "done" : ""} />)}</div>
      <div className="demo-player-controls"><span>Synthetic demo · {view.chapter + 1}/{view.chapters.length}</span>{view.done || view.error ? <button type="button" onClick={view.scope === "apply" ? startApplyDemo : startDemo}>Replay</button> : <button type="button" onClick={() => { run.current.paused = !run.current.paused; setView(current => ({ ...current, paused: run.current.paused })); }}>{view.paused ? "Resume" : "Pause"}</button>}<button type="button" onClick={stop}>{view.done ? (view.scope === "apply" ? "Close" : "Explore") : "Stop"}</button></div>
    </section>
  </>;
}
