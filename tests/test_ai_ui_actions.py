from __future__ import annotations

import unittest

from backend.ai_ui_actions import normalize_ui_action


class AiUiActionTests(unittest.TestCase):
    def test_allows_whitelisted_navigation(self) -> None:
        self.assertEqual(
            normalize_ui_action({"action": "navigate", "target": "cases"}),
            {"action": "navigate", "target": "cases"},
        )

    def test_allows_step_selection_with_positive_number(self) -> None:
        self.assertEqual(
            normalize_ui_action({"action": "select_step", "step": 3}),
            {"action": "select_step", "step": 3},
        )

    def test_rejects_unknown_or_dangerous_actions(self) -> None:
        with self.assertRaises(ValueError):
            normalize_ui_action({"action": "delete_project"})

    def test_rejects_invalid_navigation_target(self) -> None:
        with self.assertRaises(ValueError):
            normalize_ui_action({"action": "navigate", "target": "admin"})


if __name__ == "__main__":
    unittest.main()
