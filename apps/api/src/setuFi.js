import crypto from "node:crypto";

// shortcut: the session secret keys demo FI storage; use a separate KMS key before rotating secrets in production.
export function sealFiRow(row, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", crypto.createHash("sha256").update(secret).digest(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(row)), cipher.final()]);
  return { _id: row._id, consent_id: row.consent_id, account_id: row.account_id, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
}

export function openFiRow(stored, secret) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", crypto.createHash("sha256").update(secret).digest(), Buffer.from(stored.iv, "base64"));
  decipher.setAuthTag(Buffer.from(stored.tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(stored.ciphertext, "base64")), decipher.final()]).toString("utf8"));
}

function paise(value) {
  const match = String(value).match(/^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error("Invalid FI amount");
  const amount = BigInt(match[1]) * 100n + BigInt((match[2] || "").padEnd(2, "0"));
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("FI amount exceeds safe paise range");
  return Number(amount);
}

export function normalizeSetuFi(fi, consentId) {
  const accounts = [];
  const transactions = [];
  if (!Array.isArray(fi.fiData || fi.fips)) throw new Error("Invalid FI response");
  for (const fip of fi.fiData || fi.fips || []) for (const entry of fip.data || fip.accounts || []) {
    const account = entry.decryptedFI?.account || entry.data?.account;
    if (!account && fi.status === "PARTIAL" && entry.data === null) continue;
    const link = entry.linkRefNumber || account?.linkedAccRef;
    if (!account || !link || !fip.fipID) throw new Error("Invalid FI account");
    if (account.summary?.currency && account.summary.currency !== "INR") throw new Error("Unsupported FI currency");
    const accountId = crypto.createHash("sha256").update(`${consentId}:${fip.fipID}:${link}`).digest("hex");
    const holders = account.profile?.holders?.holder;
    accounts.push({ _id: accountId, consent_id: consentId, fip_id: fip.fipID, masked_number: entry.maskedAccNumber || account.maskedAccNumber, holder_name: (Array.isArray(holders) ? holders[0] : holders)?.name || null, type: account.type, status: account.summary?.status || null });
    for (const tx of account.transactions?.transaction || []) {
      const day = String(tx.valueDate || tx.transactionTimestamp || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) throw new Error("Invalid FI date");
      if (!["CREDIT", "DEBIT"].includes(tx.type)) throw new Error("Invalid FI transaction type");
      const amount = paise(tx.amount);
      // shortcut: no stable reference means pending-to-posted changes may duplicate a row; reconcile when Setu exposes a lifecycle ID.
      const ref = tx.reference || tx.txnId || JSON.stringify([day, tx.type, tx.amount, tx.narration]);
      const id = crypto.createHash("sha256").update(`${accountId}:${ref}`).digest("hex");
      transactions.push({ _id: id, account_id: accountId, posted_at: day, inflow_paise: tx.type === "CREDIT" ? amount : 0, outflow_paise: tx.type === "DEBIT" ? amount : 0, mode: String(tx.mode || ""), source_rail: "aa" });
    }
  }
  return { accounts, transactions };
}
