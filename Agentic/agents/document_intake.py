"""Read a bank-issued statement PDF. Owner uploads stay unverified."""

import base64
import re
from typing import Any

from zerocibil.tools.audit import append_event

_LITERAL = re.compile(rb"\((?:\\.|[^\\)])*\)")
_ROW = re.compile(r"^STMT\|(\d{4}-\d{2}-\d{2})\|(\d+)\|(\d+)\|([^|]*)\|([^|]*)\|(.+)$")


def _literals(pdf: bytes) -> list[str]:
    lines = []
    for match in _LITERAL.finditer(pdf):
        raw = match.group(0)[1:-1]
        text = raw.replace(b"\\(", b"(").replace(b"\\)", b")").replace(b"\\\\", b"\\")
        lines.append(text.decode("latin1"))
    return lines


def _is_bank_statement(document: dict[str, Any]) -> bool:
    return document.get("issuer") == "bank_api" and document.get("media_type") == "application/pdf"


def _extract(document: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    encoded = document.get("pdf_base64")
    if not encoded:
        return [], "extraction_failed"
    try:
        pdf = base64.b64decode(encoded, validate=True)
    except (ValueError, TypeError):
        return [], "extraction_failed"
    if not pdf.startswith(b"%PDF"):
        return [], "extraction_failed"
    rows = []
    for line in _literals(pdf):
        match = _ROW.match(line)
        if not match:
            continue
        posted_at, inflow, outflow, payer, source, tx_id = match.groups()
        rows.append({
            "t": posted_at,
            "inflow_paise": int(inflow),
            "outflow_paise": int(outflow),
            "payer_id": payer,
            "source_rail": source,
            "source_tx_id": tx_id,
            "provenance": "synthetic",
        })
    return rows, "extracted" if rows else "extraction_failed"


def document_intake(state: dict[str, Any]) -> dict[str, Any]:
    documents = state.get("documents", [])
    document_rows = []
    extracted = []
    signals = list(state.get("supporting_signals", []))
    unverified_uploads = False
    bank_statement = None

    for document in documents:
        if _is_bank_statement(document):
            rows, status = _extract(document)
            document_rows.append({
                "document_id": document.get("document_id"),
                "filename": document.get("filename"),
                "status": status,
                "row_count": len(rows),
            })
            extracted.extend(rows)
            bank_statement = document
        else:
            unverified_uploads = True
            document_rows.append({
                "document_id": document.get("document_id"),
                "status": "extraction_not_configured",
            })

    if unverified_uploads:
        signals.append({
            "code": "DOCUMENTS_UNVERIFIED",
            "message": "Uploaded documents do not count as verified rails",
        })

    result: dict[str, Any] = {
        "invoice_evidence": {
            "count": len(documents),
            "documents": document_rows,
            "trust_class": "bank_issued_synthetic" if bank_statement and not unverified_uploads else "unverified",
            "missing": unverified_uploads,
        },
        "supporting_signals": signals,
    }
    if bank_statement:
        result["statement_intake"] = {
            "document_id": bank_statement.get("document_id"),
            "filename": bank_statement.get("filename"),
            "sha256": bank_statement.get("sha256"),
            "extracted_rows": len(extracted),
            "source": "bank_statement_pdf",
            "provenance": "synthetic",
        }
        if extracted:
            result["statement_rows"] = extracted
            result["cashflows"] = extracted
    result["audit_events"] = append_event(
        {**state, **result},
        "document_intake",
        "statement_extracted" if extracted else "documents_recorded",
        {"extracted_rows": len(extracted)},
    )
    return result
