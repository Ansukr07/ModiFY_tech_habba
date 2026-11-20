import unittest

from features import build_features, verified_rail_count
from policy import underwrite


def rails(*types, trust="verified_simulated"):
    return [{"type": t, "trust_class": "unverified" if t == "pdf" else trust, "payload": {}} for t in types]


def cfs(weeks, payers=4):
    rows = []
    for i, w in enumerate(weeks):
        for p in range(payers):
            rows.append(
                {
                    "t": f"2026-01-{1 + i:02d}",
                    "inflow_paise": (w * 100000) // payers,
                    "outflow_paise": (w * 72000) // payers if p == 0 else 0,
                    "payer_id": f"p{p}",
                    "source_rail": "upi",
                }
            )
    return rows


class PolicyTests(unittest.TestCase):
    def test_pdf_only_unverified(self):
        r = rails("pdf")
        f = build_features({"name": "x"}, r, cfs([20] * 12))
        out = underwrite(f, r, 20000000, True, False)
        self.assertEqual(out["verdict"], "UNVERIFIED")
        self.assertEqual(out["principal_paise"], 0)
        self.assertEqual(verified_rail_count(r), 0)

    def test_clean_positive_principal(self):
        r = rails("aa", "upi", "gst")
        f = build_features({"name": "Lakshmi"}, r, cfs([42, 48, 39, 51, 44, 28, 46, 49, 41, 47, 43, 45], 6))
        out = underwrite(f, r, 20000000, True, False)
        self.assertIn(out["verdict"], ("STANDARD", "THIN_FILE"))
        self.assertGreater(out["principal_paise"], 0)

    def test_mule_low_auth(self):
        r = rails("upi")
        f = build_features({"name": "m"}, r, cfs([90] * 12, 1))
        out = underwrite(f, r, 30000000, True, False)
        self.assertEqual(out["verdict"], "DECLINE")
        self.assertEqual(out["principal_paise"], 0)

    def test_identity_mismatch(self):
        r = rails("upi")
        f = build_features({"name": "x"}, r, cfs([40] * 12))
        out = underwrite(f, r, 1000000, True, True)
        self.assertEqual(out["verdict"], "DECLINE")


if __name__ == "__main__":
    unittest.main()
