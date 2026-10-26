from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from backend.mission_engine import build_scenarios, build_tapd_draft, classify_reproduction, validate_environment, validate_request_target, verify_execution
from backend.store import StudioStore


class MissionSafetyTests(unittest.TestCase):
    def test_production_identity_is_blocked_even_when_kind_says_test(self) -> None:
        findings = validate_environment({
            "name": "测试环境",
            "base_url": "https://prod.example.com",
            "allowed_hosts": ["prod.example.com"],
            "environment_kind": "test",
        })
        self.assertIn("PRODUCTION_FORBIDDEN", {item["code"] for item in findings})

    def test_real_payment_gateway_is_always_blocked(self) -> None:
        findings = validate_environment({
            "name": "QA",
            "base_url": "https://pay.weixin.qq.com/order",
            "allowed_hosts": ["pay.weixin.qq.com"],
            "environment_kind": "test",
            "payment_mode": "sandbox",
        })
        self.assertIn("REAL_PAYMENT_FORBIDDEN", {item["code"] for item in findings})

    def test_runtime_request_gate_blocks_xhr_outside_allowlist(self) -> None:
        finding = validate_request_target("https://api.example.com/orders", {
            "allowed_hosts": ["qa.example.com"], "payment_mode": "disabled",
        })
        self.assertEqual("REQUEST_HOST_NOT_ALLOWED", finding["code"])

    def test_runtime_request_gate_blocks_production_after_click(self) -> None:
        finding = validate_request_target("https://prod.example.com/api/order", {
            "allowed_hosts": ["prod.example.com"], "payment_mode": "disabled",
        })
        self.assertEqual("PRODUCTION_REQUEST_FORBIDDEN", finding["code"])

    def test_runtime_request_gate_only_allows_matching_sandbox_payment(self) -> None:
        environment = {"allowed_hosts": ["sandbox.paypal.com"], "payment_mode": "sandbox"}
        self.assertIsNone(validate_request_target("https://sandbox.paypal.com/checkout", environment))
        environment["payment_mode"] = "disabled"
        self.assertEqual("PAYMENT_DISABLED", validate_request_target("https://sandbox.paypal.com/checkout", environment)["code"])


class MissionPlanningTests(unittest.TestCase):
    def test_quick_depth_prioritizes_risk_and_limits_scope(self) -> None:
        cases = [
            {"case_id": f"TC-{index}", "title": f"商品创建 {index}", "priority": "P0" if index == 7 else "P2", "tags": []}
            for index in range(8)
        ]
        scenarios = build_scenarios(cases, "商品创建", "quick")
        self.assertEqual(5, len(scenarios))
        self.assertEqual("TC-7", scenarios[0]["case_id"])


class MissionVerdictTests(unittest.TestCase):
    def _evidence(self, directory: Path, prefix: str) -> dict[str, str]:
        result: dict[str, str] = {}
        for key, suffix in (("before_screenshot_path", "before.png"), ("after_screenshot_path", "after.png"), ("log_path", "step.log")):
            path = directory / f"{prefix}-{suffix}"
            path.write_text("evidence", encoding="utf-8")
            result[key] = str(path)
        return result

    def test_actions_without_assertion_are_inconclusive(self) -> None:
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as value:
            root = Path(value)
            trace = root / "trace.zip"; trace.write_text("trace", encoding="utf-8")
            flow = [{"id": "s1", "name": "点击保存", "action": "click"}]
            run = [{"run_step_id": "r1", "step_id": "s1", "status": "PASS", "message": "执行成功", "action": "click", **self._evidence(root, "s1")}]
            self.assertEqual("INCONCLUSIVE", verify_execution(flow, run, str(trace))["verdict"])

    def test_complete_action_assertion_and_evidence_can_pass(self) -> None:
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as value:
            root = Path(value)
            trace = root / "trace.zip"; trace.write_text("trace", encoding="utf-8")
            flow = [
                {"id": "s1", "name": "打开页面", "action": "open"},
                {"id": "s2", "name": "校验标题", "action": "assert_title"},
            ]
            run = [
                {"run_step_id": "r1", "step_id": "s1", "status": "PASS", "message": "已打开", "action": "open", **self._evidence(root, "s1")},
                {"run_step_id": "r2", "step_id": "s2", "status": "PASS", "message": "断言通过", "action": "assert_title", **self._evidence(root, "s2")},
            ]
            self.assertEqual("PASS", verify_execution(flow, run, str(trace))["verdict"])
            self.assertEqual("INCONCLUSIVE", verify_execution(flow, run, str(trace), "P0")["verdict"])

    def test_reproduction_classifies_stable_same_failure(self) -> None:
        original = [{"step_id": "s2", "status": "FAIL", "error_message": "期望成功，实际失败"}]
        reproduced = [{"step_id": "s2", "status": "FAIL", "error_message": "期望成功，实际失败"}]
        result = classify_reproduction(original, reproduced, "FAIL")
        self.assertEqual("PRODUCT_DEFECT_CANDIDATE", result["classification"])

    def test_ai_or_flaky_result_never_becomes_confirmed_defect(self) -> None:
        result = classify_reproduction([{"step_id": "s2", "status": "FAIL"}], [], "PASS")
        self.assertEqual("FLAKY", result["classification"])

    def test_tapd_draft_contains_only_five_evidence_fields(self) -> None:
        draft = build_tapd_draft({"title": "保存商品", "preconditions": "已登录", "steps": "点击保存", "expected": "保存成功"}, [{"step_no": 2, "status": "FAIL", "error_message": "返回 500"}])
        self.assertEqual({"title", "preconditions", "steps", "expected", "actual"}, set(draft))
        self.assertIn("第 2 步失败", draft["actual"])


class MissionStoreTests(unittest.TestCase):
    def test_mission_round_trip_persists_scenarios_and_events(self) -> None:
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as value:
            store = StudioStore(Path(value) / "studio.db")
            project = store.create_project("Mission Test")
            environment = store.create_environment(project["id"], "本地", "http://127.0.0.1:3000", allowed_hosts=["127.0.0.1"], environment_kind="local")
            created = store.create_mission({
                "project_id": project["id"], "environment_id": environment["id"], "objective": "验证商品创建",
                "depth": "standard", "case_ids": [], "config": {"time_budget_minutes": 30},
            }, [{"case_id": "", "title": "商品创建", "source": {"type": "objective"}, "verification_rules": [], "sort_order": 1}])
            loaded = store.get_mission(created["mission_id"])
            self.assertIsNotNone(loaded)
            self.assertEqual("PLANNING", loaded["status"])
            self.assertEqual(1, loaded["summary"]["total"])
            self.assertEqual("mission_created", loaded["events"][0]["event_type"])
            scenario_id = loaded["scenarios"][0]["scenario_id"]
            store.update_mission_scenario(
                scenario_id, reproduction_run_id="run-repro", reproduction_verdict="FAIL",
                failure_classification="PRODUCT_DEFECT_CANDIDATE", reproduction_confidence=88,
                tapd_draft={"title": "缺陷", "preconditions": "前置", "steps": "步骤", "expected": "预期", "actual": "实际"},
            )
            reproduced = store.get_mission(created["mission_id"])["scenarios"][0]
            self.assertEqual("run-repro", reproduced["reproduction_run_id"])
            self.assertEqual("缺陷", reproduced["tapd_draft"]["title"])


if __name__ == "__main__":
    unittest.main()
