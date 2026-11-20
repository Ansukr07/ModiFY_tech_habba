import math
import unittest
from datetime import datetime, timedelta

from model_features import auth_features, stress_features


def _week(offset, inflow, outflow=0, payer="p1"):
    start = datetime(2025, 1, 6)
    return {
        "t": (start + timedelta(weeks=offset)).date().isoformat(),
        "inflow_paise": inflow,
        "outflow_paise": outflow,
        "payer_id": payer,
        "source_rail": "upi",
        "currency": "INR",
    }


class FeatureTests(unittest.TestCase):
    def test_auth_hhi_and_round_ratio(self):
        rows = [_week(0, 100000, payer="a"), _week(0, 100000, payer="b"), _week(1, 100000, payer="a")]
        vector = auth_features(rows)["vector"]
        self.assertTrue(math.isclose(vector["payer_hhi"], (2 / 3) ** 2 + (1 / 3) ** 2))
        self.assertTrue(math.isclose(vector["max_payer_share"], 2 / 3))
        self.assertEqual(vector["history_weeks"], 2)
        self.assertEqual(vector["round_amount_ratio"], 1.0)

    def test_auth_excludes_invalid_dates(self):
        rows = [_week(0, 200000), {"t": "not-a-date", "inflow_paise": 500000, "payer_id": "x", "source_rail": "upi"}]
        bundle = auth_features(rows)
        self.assertTrue(bundle["excluded_rows"])
        self.assertEqual(bundle["vector"]["history_weeks"], 1)

    def test_stress_requires_26_weeks_and_orders_features(self):
        rows = [_week(i, 200000, 50000, payer=f"p{i%3}") for i in range(26)]
        bundle = stress_features(rows, "B-full")
        self.assertFalse(bundle["insufficient_history"])
        self.assertEqual(bundle["order"][-1], "log1p_unique_payers")
        self.assertEqual(bundle["vector"]["active_week_ratio"], 1.0)
        self.assertEqual(bundle["vector"]["cv_missing"], 0.0)

    def test_stress_does_not_pad_before_first_week(self):
        rows = [_week(i, 150000) for i in range(10)]
        bundle = stress_features(rows, "B-inflow")
        self.assertTrue(bundle["insufficient_history"])
        self.assertTrue(math.isnan(bundle["vector"]["p10_rel"]))
