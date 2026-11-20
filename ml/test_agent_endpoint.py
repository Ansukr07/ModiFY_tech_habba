import json
import os
import unittest
import urllib.error
import urllib.request

SCORE_URL = os.environ.get("SCORE_URL", "http://127.0.0.1:8000")


def _get(path):
    with urllib.request.urlopen(f"{SCORE_URL}{path}", timeout=8) as response:
        return json.loads(response.read().decode())


def _post(path, payload):
    req = urllib.request.Request(
        f"{SCORE_URL}{path}",
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode())


def scorer_up():
    try:
        return _get("/health").get("status") == "ok"
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return False


class AgentEndpointTests(unittest.TestCase):
    @unittest.skipUnless(scorer_up(), "scoring service not running")
    def test_internal_agent_returns_policy_and_trace(self):
        payload = {
            "application_id": "agent-test",
            "shop": {"_id": "clean-kirana", "name": "Lakshmi Stores", "category": "Kirana"},
            "requested_amount_paise": 20000000,
            "policy_version": "v1",
            "rails": [
                {"type": "aa", "trustClass": "verified_simulated", "provenance": "synthetic"},
                {"type": "upi", "trustClass": "verified_simulated", "provenance": "synthetic"},
                {"type": "gst", "trustClass": "verified_simulated", "provenance": "synthetic"},
            ],
            "cashflows": [
                {
                    "t": f"2026-01-{1 + i:02d}",
                    "inflow_paise": 400000,
                    "outflow_paise": 220000,
                    "payer_id": "p0",
                    "source_rail": "upi",
                }
                for i in range(12)
            ],
        }
        out = _post("/internal/agent", payload)
        self.assertIn("verdict", out)
        self.assertTrue(out.get("workflow_trace"))
        self.assertIn("model_scores", out)


if __name__ == "__main__":
    unittest.main()
