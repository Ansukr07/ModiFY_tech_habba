"""Build grounded explanation text from workflow fields."""

import json
import os
import re
from typing import Any


EXPLAINER_SYSTEM_PROMPT = """You are ZeroCIBIL's Explainability Agent.
Your role is advisory: explain the supplied structured assessment to a lender
and a small business owner. You do not make or recommend a credit decision.

Rules:
- Use only facts in the supplied fact sheet. Do not add or guess facts.
- Do not calculate, change, round, or convert any number or amount.
- Do not set a score, threshold, haircut, limit, rate, or repayment term.
- Do not approve, decline, or promise approval for an application.
- Describe stress as an estimate of cash-flow pressure, not default probability.
- Say a factor "contributed to" an outcome; do not say it caused the outcome.
- Never accuse a business of fraud or call evidence fake.
- Distinguish verified rails from uploaded or otherwise unverified documents.
- Explain missing evidence as a request for information, not wrongdoing.
- Return only a JSON object with string fields "lender_text" and "owner_text".
- Keep owner_text short, respectful, and easy to understand.
"""

FORBIDDEN_TERMS = ("fraud", "fake", "caused by", "guaranteed", "approved")


def facts(state: dict) -> list[dict]:
    fields = (
        "verdict",
        "verified_rail_count",
        "authenticity_band",
        "auth_gate",
        "stress_band",
        "p_auth",
        "p_stress",
        "capacity",
        "missing_features",
        "verification_requests",
        "reconciliation",
        "model_versions",
    )
    return [
        {"path": field, "value": state[field]}
        for field in fields
        if field in state
    ]


def render(state: dict) -> dict:
    verdict = state.get("verdict", "REVIEW")
    owner_text = f"Your application is {verdict.lower().replace('_', ' ')}."
    requests = state.get("verification_requests", [])
    if requests:
        owner_text += " Please provide: " + ", ".join(requests) + "."

    lender_text = (
        f"Outcome: {verdict}. "
        f"Verified rails: {state.get('verified_rail_count', 0)}. "
        f"Authenticity: {state.get('authenticity_band', 'not scored')}; "
        f"stress: {state.get('stress_band', 'not scored')}."
    )
    capacity = state.get("capacity", {})
    amount = capacity.get("max_principal_paise")
    if amount is not None:
        rupees = amount / 100
        version = state.get("policy_version", "prototype-0.1")
        lender_text += (
            f" Calculated principal capacity: ₹{rupees:.2f} "
            f"under policy {version}."
        )
    lender_text += " Stress estimates cash-flow pressure, not default probability."

    return {
        "lender_text": lender_text,
        "owner_text": owner_text,
        "language": "en",
        "source_fields": [fact["path"] for fact in facts(state)],
        "grounded": True,
        "fallback_used": True,
    }


def _numbers_in(value: Any) -> set[str]:
    if isinstance(value, dict):
        found = set()
        for child in value.values():
            found.update(_numbers_in(child))
        return found
    if isinstance(value, (list, tuple)):
        found = set()
        for child in value:
            found.update(_numbers_in(child))
        return found
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return {str(value)}
    if isinstance(value, str):
        return set(re.findall(r"\d+(?:\.\d+)?", value))
    return set()


def verify_explanation(text: str, fact_sheet: list[dict]) -> bool:
    """Reject numeric claims or wording that facts cannot support."""
    fact_numbers = _numbers_in(fact_sheet)
    text_numbers = set(re.findall(r"\d+(?:\.\d+)?", text))
    if not text_numbers.issubset(fact_numbers):
        return False
    lowered = text.lower()
    return not any(term in lowered for term in FORBIDDEN_TERMS)


def _call_groq(fact_sheet: list[dict], language: str) -> dict[str, str] | None:
    """Ask Groq to phrase facts; use fallback when the optional service fails."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return None

    try:
        from groq import Groq

        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model=os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b"),
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": EXPLAINER_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {"language": language, "facts": fact_sheet},
                        ensure_ascii=False,
                    ),
                },
            ],
        )
        content = response.choices[0].message.content
        result = json.loads(content or "{}")
        lender_text = result.get("lender_text")
        owner_text = result.get("owner_text")
        if not isinstance(lender_text, str) or not isinstance(owner_text, str):
            return None
        if not verify_explanation(lender_text, fact_sheet):
            return None
        if not verify_explanation(owner_text, fact_sheet):
            return None
        return {"lender_text": lender_text, "owner_text": owner_text}
    except Exception:
        return None


def generate(state: dict, language: str = "en") -> dict:
    """Use Groq when configured and grounded; otherwise use the template."""
    template = render(state)
    generated = _call_groq(facts(state), language)
    if generated is None:
        return template
    return {
        **template,
        **generated,
        "language": language,
        "fallback_used": False,
    }
