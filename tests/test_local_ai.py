from __future__ import annotations

import unittest

from backend.app import _local_ai_answer


class LocalAiIdentityTests(unittest.TestCase):
    def test_identity_questions_only_return_klein(self) -> None:
        for question in ("你是谁？", "你叫什么名字？", "你的名字是什么？", "Who are you?", "What is your name?"):
            with self.subTest(question=question):
                self.assertEqual(_local_ai_answer(question, "chat", {}), "Lodestar。")


if __name__ == "__main__":
    unittest.main()
