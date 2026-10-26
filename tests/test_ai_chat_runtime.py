from __future__ import annotations

import unittest
from unittest.mock import patch

from backend.ai_provider import AITextResponse
from backend.ai_client import build_chat_prompt
from backend.app import AiChatIn, ai_chat


class AiChatRuntimeTests(unittest.TestCase):
    def payload(self, **overrides: str) -> AiChatIn:
        values = {
            "base_url": "https://example.test/v1",
            "api_key": "test-key",
            "model": "test-model",
            "message": "解释一下边界值测试",
        }
        values.update(overrides)
        return AiChatIn(**values)

    @patch("backend.app.klein_capabilities.desktop_context", return_value=None)
    @patch("backend.app.klein_capabilities.remember_from_message", return_value=None)
    def test_local_answer_reports_local_runtime(self, _remember, _desktop) -> None:
        result = ai_chat(self.payload(base_url="local://lodestar", api_key="", model="lodestar-local"))

        self.assertEqual(result["runtime"]["source"], "local")
        self.assertEqual(result["runtime"]["model"], "lodestar-local")
        self.assertFalse(result["runtime"]["fallback"])
        self.assertGreaterEqual(result["runtime"]["duration_ms"], 0)

    @patch("backend.app.klein_capabilities.desktop_context", return_value=None)
    @patch("backend.app.klein_capabilities.remember_from_message", return_value=None)
    @patch("backend.ai_provider.request_ai_text")
    def test_external_answer_reports_actual_model(self, request_ai_text, _remember, _desktop) -> None:
        request_ai_text.return_value = AITextResponse(
            text="真实外部回答",
            base_url="https://example.test/v1",
            model="actual-model",
            api_kind="responses",
        )

        result = ai_chat(self.payload())

        self.assertEqual(result["answer"], "真实外部回答")
        self.assertEqual(result["runtime"]["source"], "external")
        self.assertEqual(result["runtime"]["model"], "actual-model")
        self.assertEqual(result["runtime"]["api_kind"], "responses")
        self.assertFalse(result["runtime"]["fallback"])

    @patch("backend.app.klein_capabilities.desktop_context", return_value=None)
    @patch("backend.app.klein_capabilities.remember_from_message", return_value=None)
    @patch("backend.ai_provider.request_ai_text", side_effect=TimeoutError("provider timeout"))
    def test_external_failure_returns_usable_local_fallback(self, _request, _remember, _desktop) -> None:
        result = ai_chat(self.payload())

        self.assertTrue(result["answer"])
        self.assertEqual(result["runtime"]["source"], "local")
        self.assertEqual(result["runtime"]["provider"], "Lodestar Local")
        self.assertEqual(result["runtime"]["model"], "lodestar-local")
        self.assertEqual(result["runtime"]["api_kind"], "local-fallback")
        self.assertTrue(result["runtime"]["fallback"])
        self.assertIn("provider timeout", result["runtime"]["error"])

    def test_chat_prompt_does_not_ask_model_to_guess_runtime_status(self) -> None:
        prompt = build_chat_prompt("现在模型能用了吗", {"最近对话": "之前连接失败", "本次调用配置": {"model": "deepseek-v4-pro"}})

        self.assertIn("调用凭证是本次请求的权威状态", prompt)
        self.assertIn("不得声称自己无法判断本次请求是否调用到模型", prompt)
        self.assertIn("直接说明本次请求配置的实际模型名称", prompt)
        self.assertIn("deepseek-v4-pro", prompt)


if __name__ == "__main__":
    unittest.main()
