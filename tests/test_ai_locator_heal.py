"""AI 定位器自愈的验证测试。

用真实 Playwright 打开一个"改版后"的页面，用 mock 掉模型回复的方式，
验证：配置校验 → 候选收集 → 定位器验证 → 端到端兜底 → 原有行为不变。
"""

from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.ai_locator_heal import (  # noqa: E402
    ai_config_ready,
    build_heal_prompt,
    collect_candidates,
    heal_locator_with_ai,
    normalize_ai_config,
    verify_locator,
)
from backend.automation.playwright_executor import PlaywrightExecutor  # noqa: E402

# 模拟"页面改版"：原来的 #old-login-btn 已不存在，按钮变成 data-testid="login-submit"
PAGE_HTML = """
<!doctype html><html><body>
  <form>
    <input name="username" placeholder="用户名" />
    <input name="password" type="password" placeholder="密码" />
    <button type="submit" data-testid="login-submit">登录</button>
    <a href="/help">忘记密码</a>
  </form>
</body></html>
"""

AI_CONFIG = {"base_url": "http://127.0.0.1:9/v1", "api_key": "test-key", "model": "test-model"}

ELEMENT = {
    "element_id": "el-login-btn",
    "name": "登录按钮",
    "page_url": "http://demo.local/login",
    "locator_type": "css",
    "locator_value": "#old-login-btn",
    "fallback_locators": [{"type": "css", "value": ".btn-login-old"}],
}


class FakeResponse:
    def __init__(self, text: str) -> None:
        self.text = text
        self.base_url = "http://127.0.0.1:9/v1"
        self.model = "test-model"
        self.api_kind = "openai"


def ai_reply(payload: dict) -> FakeResponse:
    return FakeResponse("```json\n" + json.dumps(payload, ensure_ascii=False) + "\n```")


class ConfigTests(unittest.TestCase):
    def test_normalize(self):
        self.assertEqual(normalize_ai_config(None), {"base_url": "", "api_key": "", "model": ""})
        cfg = normalize_ai_config({"base_url": " http://x/v1 ", "model": "m"})
        self.assertEqual(cfg["base_url"], "http://x/v1")

    def test_ready_requires_base_url_and_model(self):
        self.assertTrue(ai_config_ready({"base_url": "http://x", "model": "m", "api_key": ""}))
        self.assertFalse(ai_config_ready({"base_url": "", "model": "m"}))
        self.assertFalse(ai_config_ready({"base_url": "http://x", "model": ""}))
        self.assertFalse(ai_config_ready({}))

    def test_prompt_carries_context(self):
        prompt = build_heal_prompt(ELEMENT, [{"index": 0, "tag": "button"}], "http://demo.local/login")
        self.assertIn("登录按钮", prompt)
        self.assertIn("#old-login-btn", prompt)
        self.assertIn("button", prompt)


class BrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from playwright.sync_api import sync_playwright

        cls._pw = sync_playwright().start()
        cls.launch_error = ""
        try:
            cls.browser = cls._pw.chromium.launch(headless=True)
        except Exception as exc:  # noqa: BLE001 - 环境缺浏览器时跳过而不是失败
            cls.browser = None
            cls.launch_error = str(exc)

    @classmethod
    def tearDownClass(cls):
        if getattr(cls, "browser", None):
            cls.browser.close()
        cls._pw.stop()

    def setUp(self):
        if not self.browser:
            self.skipTest("Chromium 不可用：" + self.launch_error)
        self.page = self.browser.new_page()
        self.page.set_content(PAGE_HTML)

    def tearDown(self):
        if getattr(self, "page", None):
            self.page.close()

    # ---------- 基础能力 ----------
    def test_collect_candidates_finds_interactive(self):
        cands = collect_candidates(self.page)
        self.assertTrue(cands, "应该能抓到可交互元素")
        self.assertTrue(any(c.get("testid") == "login-submit" for c in cands))
        self.assertTrue(any(c.get("placeholder") == "用户名" for c in cands))

    def test_verify_locator_counts(self):
        self.assertEqual(verify_locator(self.page, "testid", "login-submit"), 1)
        self.assertEqual(verify_locator(self.page, "css", "#not-exist"), 0)
        self.assertEqual(verify_locator(self.page, "css", "input"), 2)

    # ---------- 降级路径：任何一种不成立都必须返回 None ----------
    def test_no_config_returns_none(self):
        self.assertIsNone(heal_locator_with_ai(self.page, ELEMENT, {}))

    def test_model_says_not_found(self):
        with mock.patch("backend.ai_provider.request_ai_text", return_value=ai_reply({"found": False, "reason": "页面上没有"})):
            self.assertIsNone(heal_locator_with_ai(self.page, ELEMENT, AI_CONFIG))

    def test_reject_locator_that_matches_nothing(self):
        reply = ai_reply({"found": True, "locator_type": "css", "locator_value": "#not-on-page", "confidence": 90, "reason": "x"})
        with mock.patch("backend.ai_provider.request_ai_text", return_value=reply):
            self.assertIsNone(heal_locator_with_ai(self.page, ELEMENT, AI_CONFIG))

    def test_reject_low_confidence(self):
        reply = ai_reply({"found": True, "locator_type": "testid", "locator_value": "login-submit", "confidence": 30, "reason": "不确定"})
        with mock.patch("backend.ai_provider.request_ai_text", return_value=reply):
            self.assertIsNone(heal_locator_with_ai(self.page, ELEMENT, AI_CONFIG))

    def test_reject_illegal_locator_type(self):
        reply = ai_reply({"found": True, "locator_type": "xpath", "locator_value": "//button", "confidence": 95, "reason": "x"})
        with mock.patch("backend.ai_provider.request_ai_text", return_value=reply):
            self.assertIsNone(heal_locator_with_ai(self.page, ELEMENT, AI_CONFIG))

    def test_model_call_failure_is_swallowed(self):
        with mock.patch("backend.ai_provider.request_ai_text", side_effect=RuntimeError("网络不通")):
            self.assertIsNone(heal_locator_with_ai(self.page, ELEMENT, AI_CONFIG))

    # ---------- 成功路径 ----------
    def test_heal_success(self):
        reply = ai_reply({"found": True, "index": 2, "locator_type": "testid", "locator_value": "login-submit", "confidence": 92, "reason": "同一个登录按钮"})
        with mock.patch("backend.ai_provider.request_ai_text", return_value=reply):
            result = heal_locator_with_ai(self.page, ELEMENT, AI_CONFIG)
        self.assertIsNotNone(result)
        self.assertEqual(result["locator_type"], "testid")
        self.assertEqual(result["locator_value"], "login-submit")
        self.assertEqual(result["matched"], 1)
        self.assertEqual(result["confidence"], 92)

    # ---------- 端到端：执行器集成 ----------
    def test_executor_ai_heal_end_to_end(self):
        executor = PlaywrightExecutor(ROOT / "runs", ai_config=AI_CONFIG)
        reply = ai_reply({"found": True, "locator_type": "testid", "locator_value": "login-submit", "confidence": 88, "reason": "同一按钮"})
        with mock.patch("backend.ai_provider.request_ai_text", return_value=reply):
            locator = executor._resolve_locator(self.page, ELEMENT)
        self.assertIsNotNone(locator)
        self.assertEqual(locator.count(), 1)
        self.assertTrue(executor._last_locator_resolution.get("ai_healed"))
        self.assertEqual(executor._last_locator_resolution["resolved"]["value"], "login-submit")
        self.assertEqual(executor._last_locator_resolution["original"]["value"], "#old-login-btn")

    def test_executor_without_ai_config_behaves_as_before(self):
        executor = PlaywrightExecutor(ROOT / "runs")
        locator = executor._resolve_locator(self.page, ELEMENT)
        self.assertIsNotNone(locator)
        self.assertFalse(executor._last_locator_resolution.get("ai_healed", False))

    def test_executor_ai_failure_keeps_old_behavior(self):
        executor = PlaywrightExecutor(ROOT / "runs", ai_config=AI_CONFIG)
        with mock.patch("backend.ai_provider.request_ai_text", side_effect=RuntimeError("模型挂了")):
            locator = executor._resolve_locator(self.page, ELEMENT)
        self.assertIsNotNone(locator)
        self.assertFalse(executor._last_locator_resolution.get("ai_healed", False))


class FakeLocator:
    def __init__(self, count_value: int) -> None:
        self._count_value = count_value

    def count(self) -> int:
        return self._count_value


class FakePage:
    """不依赖真实浏览器的页面替身，用于确定性验证 verify_locator 分支。"""

    def __init__(self, css_count: int = 1) -> None:
        self.url = "http://demo.local/login"
        self._css_count = css_count

    def get_by_test_id(self, value: str) -> FakeLocator:
        return FakeLocator(1)

    def get_by_role(self, value: str, name: str | None = None) -> FakeLocator:
        return FakeLocator(1)

    def get_by_label(self, value: str) -> FakeLocator:
        return FakeLocator(1)

    def get_by_placeholder(self, value: str) -> FakeLocator:
        return FakeLocator(1)

    def get_by_text(self, value: str) -> FakeLocator:
        return FakeLocator(1)

    def locator(self, value: str) -> FakeLocator:
        return FakeLocator(self._css_count)


class HealGuardTests(unittest.TestCase):
    def test_reject_css_locator_matching_multiple_elements(self):
        page = FakePage(css_count=2)
        reply = ai_reply({"found": True, "locator_type": "css", "locator_value": "input", "confidence": 95, "reason": "x"})
        with mock.patch("backend.ai_provider.request_ai_text", return_value=reply), \
             mock.patch("backend.ai_locator_heal.collect_candidates", return_value=[{"index": 0, "tag": "input"}]):
            self.assertIsNone(heal_locator_with_ai(page, ELEMENT, AI_CONFIG))

    def test_accept_css_locator_with_unique_match(self):
        page = FakePage(css_count=1)
        reply = ai_reply({"found": True, "locator_type": "css", "locator_value": "#submit", "confidence": 95, "reason": "x"})
        with mock.patch("backend.ai_provider.request_ai_text", return_value=reply), \
             mock.patch("backend.ai_locator_heal.collect_candidates", return_value=[{"index": 0, "tag": "button"}]):
            result = heal_locator_with_ai(page, ELEMENT, AI_CONFIG)
        self.assertIsNotNone(result)
        self.assertEqual(result["matched"], 1)


class RunWiringTests(unittest.TestCase):
    """验证 app.py 执行入口接线：ai 配置注入与自愈建议不重复落库。"""

    @classmethod
    def setUpClass(cls):
        import os
        import tempfile

        cls._tmp_dir = tempfile.mkdtemp(prefix="lodestar_test_")
        os.environ["AUTOMATION_STUDIO_DATA_DIR"] = cls._tmp_dir
        import backend.app as app  # noqa: E402 - 依赖数据目录环境变量，延迟导入
        cls.app = app

    @classmethod
    def tearDownClass(cls):
        import os

        os.environ.pop("AUTOMATION_STUDIO_DATA_DIR", None)

    def test_run_flow_injects_ai_config_from_run_dict(self):
        captured = {}

        def fake_executor(*args, **kwargs):
            captured["ai_config"] = kwargs.get("ai_config")
            return mock.MagicMock()

        with mock.patch.object(self.app, "PlaywrightExecutor", side_effect=fake_executor), \
             mock.patch.object(self.app, "_execute_and_report", return_value=("PASS", "report.html", "trace.zip")), \
             mock.patch.object(self.app, "_publish_threadsafe", lambda message: None):
            self.app._run_flow(
                {"run_id": "wiring-test", "from_step": 1, "to_step": None, "breakpoints": [],
                 "runtime_variables": {}, "ai_config": {"base_url": "http://127.0.0.1:9/v1", "model": "test-model"}},
                {"name": "演示流程"},
                {"name": "env"},
            )
        self.assertEqual(captured.get("ai_config"), {"base_url": "http://127.0.0.1:9/v1", "api_key": "", "model": "test-model"})

    def test_cli_execute_flow_injects_env_ai_config(self):
        import backend.cli as cli

        captured = {}
        fake = mock.MagicMock()
        fake.run.return_value = ("PASS", [], "trace.zip")

        def fake_executor(*args, **kwargs):
            captured["ai_config"] = kwargs.get("ai_config")
            return fake

        config = mock.MagicMock()
        config.runs_dir = "runs"
        store = mock.MagicMock()
        store.create_run.return_value = {"run_id": "r1"}
        flow = {"flow_id": "f1", "name": "流程", "steps": []}
        environment = {"id": "e1", "name": "env", "base_url": ""}
        with mock.patch.dict(os.environ, {"LODESTAR_AI_BASE_URL": "http://127.0.0.1:9/v1", "LODESTAR_AI_MODEL": "test-model"}, clear=False), \
             mock.patch.object(cli, "PlaywrightExecutor", side_effect=fake_executor), \
             mock.patch.object(cli, "_build_flow_context", return_value=flow), \
             mock.patch.object(cli, "_persist_run_result", return_value="report.html"):
            cli._execute_flow(store, config, flow, environment, "chromium", 1, None, [], False)
        self.assertEqual(captured.get("ai_config"), {"base_url": "http://127.0.0.1:9/v1", "api_key": "", "model": "test-model"})
    def test_execute_and_report_skips_suggestion_for_persisted_steps(self):
        healed_step = {
            "step_id": "step-1",
            "step_no": 1,
            "action": "click",
            "action_spec": {"action": "click", "element_id": "el-1"},
            "locator": {
                "used_fallback": False,
                "ai_healed": True,
                "original": {"type": "css", "value": "#old-btn"},
                "resolved": {"type": "testid", "value": "login-submit"},
            },
        }
        executor = mock.MagicMock()
        executor.run.return_value = ("PASS", [healed_step], "trace.zip")
        run = {"run_id": "r1", "browser": "chromium", "started_at": ""}
        flow = {"name": "演示流程", "steps": []}
        environment = {"name": "env", "base_url": ""}
        with mock.patch.object(self.app.store, "list_run_steps", return_value=[{"step_id": "step-1"}]), \
             mock.patch.object(self.app.store, "create_heal_suggestion") as create_suggestion, \
             mock.patch.object(self.app.store, "add_run_step"), \
             mock.patch.object(self.app.store, "increment_element_usage"), \
             mock.patch.object(self.app.store, "add_artifact"), \
             mock.patch.object(self.app.store, "finish_run"), \
             mock.patch.object(self.app, "write_html_report", return_value="report.html"):
            self.app._execute_and_report(run, flow, environment, executor)
        create_suggestion.assert_not_called()

if __name__ == "__main__":
    unittest.main(verbosity=2)
