from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from backend.store import StudioStore


class FlowVersionAndHealingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.store = StudioStore(Path(self.temp_dir.name) / "studio.db")
        self.project = self.store.create_project("版本与自愈测试")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _flow(self, name: str = "登录流程", steps: list[dict] | None = None) -> dict:
        return self.store.save_flow({
            "flow_id": "flow-version-test",
            "project_id": self.project["id"],
            "name": name,
            "description": "",
            "engine": "playwright",
            "version": 1,
            "variables": {},
            "breakpoints": [],
            "steps": steps or [{"id": "step-login", "name": "点击登录", "action": "click", "element_id": "element-login"}],
        })

    def test_changed_flow_creates_version_and_restore_recovers_snapshot(self) -> None:
        original = self._flow()
        changed = self.store.save_flow({**original, "name": "新版登录流程", "checkpoint_source": "ai"})

        versions = self.store.list_flow_versions(original["flow_id"])
        self.assertEqual(changed["version"], original["version"] + 1)
        self.assertEqual(len(versions), 1)
        self.assertEqual(versions[0]["source"], "ai")

        restored = self.store.restore_flow_version(versions[0]["version_id"])
        self.assertIsNotNone(restored)
        self.assertEqual(restored["name"], "登录流程")
        self.assertEqual(restored["version"], changed["version"] + 1)

    def test_approve_healing_promotes_candidate_and_keeps_old_locator(self) -> None:
        self.store.upsert_element({
            "element_id": "element-login",
            "project_id": self.project["id"],
            "name": "登录按钮",
            "locator_type": "css",
            "locator_value": ".old-login",
            "fallback_locators": [{"type": "text", "value": "登录"}],
        })
        flow = self._flow()
        run = self.store.create_run(flow["flow_id"], None, "chromium")
        suggestion = self.store.create_heal_suggestion("element-login", run["run_id"], 1, {
            "used_fallback": True,
            "original": {"type": "css", "value": ".old-login"},
            "resolved": {"type": "testid", "value": "login-submit"},
        })

        self.assertIsNotNone(suggestion)
        approved = self.store.decide_heal_suggestion(suggestion["suggestion_id"], "approved")
        element = self.store.get_element("element-login")
        self.assertEqual(approved["status"], "approved")
        self.assertEqual(element["locator_type"], "testid")
        self.assertEqual(element["locator_value"], "login-submit")
        self.assertIn({"type": "css", "value": ".old-login"}, element["fallback_locators"])

    def test_reject_healing_does_not_change_element(self) -> None:
        self.store.upsert_element({
            "element_id": "element-login",
            "project_id": self.project["id"],
            "name": "登录按钮",
            "locator_type": "css",
            "locator_value": ".old-login",
        })
        flow = self._flow()
        run = self.store.create_run(flow["flow_id"], None, "chromium")
        suggestion = self.store.create_heal_suggestion("element-login", run["run_id"], 1, {
            "used_fallback": True,
            "original": {"type": "css", "value": ".old-login"},
            "resolved": {"type": "role", "value": "button"},
        })

        rejected = self.store.decide_heal_suggestion(suggestion["suggestion_id"], "rejected")
        element = self.store.get_element("element-login")
        self.assertEqual(rejected["status"], "rejected")
        self.assertEqual(element["locator_type"], "css")
        self.assertEqual(element["locator_value"], ".old-login")

    def test_run_step_preserves_before_and_after_trace_screenshots(self) -> None:
        flow = self._flow()
        run = self.store.create_run(flow["flow_id"], None, "chromium")
        self.store.add_run_step(run["run_id"], {
            "step_id": "step-login",
            "step_no": 1,
            "status": "PASS",
            "before_screenshot_path": "runs/example/before.png",
            "after_screenshot_path": "runs/example/after.png",
            "action_spec": {"id": "step-login", "name": "点击登录", "action": "click"},
        })

        stored = self.store.list_run_steps(run["run_id"])[0]
        self.assertEqual(stored["before_screenshot_path"], "runs/example/before.png")
        self.assertEqual(stored["after_screenshot_path"], "runs/example/after.png")
        self.assertEqual(stored["name"], "点击登录")


if __name__ == "__main__":
    unittest.main()
