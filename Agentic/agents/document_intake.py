"""Record uploaded files without treating them as verified financial data."""

from typing import Any


def document_intake(state: dict[str, Any]) -> dict[str, Any]:
    documents = state.get("documents", [])
    document_rows = [
        {
            "document_id": document.get("document_id"),
            "status": "extraction_not_configured",
        }
        for document in documents
    ]
    signals = list(state.get("supporting_signals", []))

    if documents:
        signals.append(
            {
                "code": "DOCUMENTS_UNVERIFIED",
                "message": "Uploaded documents do not count as verified rails",
            }
        )

    return {
        "invoice_evidence": {
            "count": len(documents),
            "documents": document_rows,
            "trust_class": "unverified",
            "missing": bool(documents),
        },
        "supporting_signals": signals,
    }
