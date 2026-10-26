from __future__ import annotations

import unittest

from backend.ai_client import build_chat_prompt


class AiChatPromptTests(unittest.TestCase):
    def test_prompt_contains_context_and_page_action_contract(self) -> None:
        prompt = build_chat_prompt("打开测试用例页面", {"view": "dashboard"})

        self.assertIn("打开测试用例页面", prompt)
        self.assertIn('AUTOMATION_STUDIO_ACTIONS', prompt)
        self.assertIn('navigate', prompt)
        self.assertIn('dashboard', prompt)
        self.assertIn('用户确认后才执行', prompt)
        self.assertIn('不要声称动作已经完成', prompt)


if __name__ == "__main__":
    unittest.main()
