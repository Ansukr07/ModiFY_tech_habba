function pdfEscape(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function ascii(value) {
  return String(value ?? "").replace(/[^\x20-\x7e]/g, "");
}

export function buildStatementPdf({ documentId, accountRef, holder, sourceHash, rows }) {
  const lines = [
    "BANK STATEMENT",
    `DOC ${ascii(documentId)}`,
    `ACCOUNT ${ascii(accountRef)}`,
    `HOLDER ${ascii(holder)}`,
    `HASH ${ascii(sourceHash)}`,
    "COLUMNS date credit_paise debit_paise payer source tx",
    ...rows.map((row) => `STMT|${row.posted_at}|${row.inflow_paise}|${row.outflow_paise}|${ascii(row.payer_id)}|${ascii(row.source_rail)}|${ascii(row._id)}`),
  ];
  const stream = ["BT", "/F1 8 Tf", ...lines.map((line, index) => `1 0 0 1 36 ${800 - index * 8} Tm (${pdfEscape(line)}) Tj`), "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 5 0 R /Resources << /Font << /F1 4 0 R >> >> >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, "latin1");
}

export function publicStatement(statement) {
  if (!statement) return null;
  const { pdf_base64, ...safe } = statement;
  return safe;
}

export function publicResult(result) {
  if (!result?.statement) return result;
  return { ...result, statement: publicStatement(result.statement) };
}
