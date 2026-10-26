from __future__ import annotations

from typing import Any, Mapping

UI_VIEWS = {"dashboard", "cases", "flows", "regression", "elements", "runs", "environments", "settings"}
UI_ACTIONS = {"navigate", "select_step", "save_flow", "run_flow"}


def normalize_ui_action(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Validate the small, explicit command surface exposed to the AI panel."""
    action = str(payload.get("action", "")).strip()
    if action not in UI_ACTIONS:
        raise ValueError("不支持的页面操作")
    if action == "navigate":
        target = str(payload.get("target", "")).strip()
        if target not in UI_VIEWS:
            raise ValueError("不支持的页面模块")
        return {"action": action, "target": target}
    if action == "select_step":
        step = payload.get("step")
        if isinstance(step, bool) or not isinstance(step, int) or step < 1:
            raise ValueError("步骤编号必须为正整数")
        return {"action": action, "step": step}
    return {"action": action}
