function pdfEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function ascii(value) {
  return String(value ?? "").replaceAll("₹", "Rs ").replace(/[^\x20-\x7e]/g, " ").replace(/[ \t]+/g, " ").trim();
}

function wrap(text, width) {
  const clean = ascii(text);
  if (!clean) return [""];
  const lines = [];
  let line = "";
  for (const word of clean.split(" ")) {
    const parts = word.length > width ? word.match(new RegExp(`.{1,${width}}`, "g")) : [word];
    for (const part of parts) {
      if (!line) line = part;
      else if (line.length + 1 + part.length <= width) line += ` ${part}`;
      else {
        lines.push(line);
        line = part;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function buildTextPdf(paragraphs) {
  const lines = [];
  for (const paragraph of paragraphs) {
    lines.push(...wrap(paragraph, 86), "");
  }
  if (lines.at(-1) === "") lines.pop();
  const pages = [];
  for (let index = 0; index < Math.max(lines.length, 1); index += 46) pages.push(lines.slice(index, index + 46));

  const objects = new Array(3 + pages.length * 2);
  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>";
  const kids = [];
  pages.forEach((pageLines, index) => {
    const pageId = 4 + index * 2;
    const contentId = pageId + 1;
    kids.push(`${pageId} 0 R`);
    const commands = ["BT", "/F1 10 Tf", ...pageLines.map((line, lineIndex) => `1 0 0 1 48 ${760 - lineIndex * 14} Tm (${pdfEscape(line)}) Tj`), "ET"];
    const stream = commands.join("\n");
    objects[pageId - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`;
    objects[contentId - 1] = `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`;
  });
  objects[1] = `<< /Type /Pages /Count ${pages.length} /Kids [${kids.join(" ")}] >>`;

  const chunks = [new TextEncoder().encode("%PDF-1.4\n")];
  let offset = chunks[0].length;
  const offsets = [0];
  objects.forEach((object, index) => {
    const piece = new TextEncoder().encode(`${index + 1} 0 obj\n${object}\nendobj\n`);
    offsets.push(offset);
    offset += piece.length;
    chunks.push(piece);
  });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((value) => `${String(value).padStart(10, "0")} 00000 n \n`).join("")}trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`;
  chunks.push(new TextEncoder().encode(xref));
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let cursor = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, cursor);
    cursor += chunk.length;
  }
  return bytes;
}

export function downloadTextPdf(filename, paragraphs) {
  const bytes = buildTextPdf(paragraphs);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
