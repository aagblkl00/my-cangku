from __future__ import annotations

import re
from typing import Any

from ..models import ActionSpec

VARIABLE_PATTERN = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")


def resolve_variables(value: str, variables: dict[str, Any]) -> str:
    if value is None:
        return ""
    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        if key not in variables:
            available = "、".join(list(variables.keys())[:20]) or "（空）"
            hint = "请在 流程/环境 变量中定义" if "password" in key.lower() else "请在 流程/环境 变量中定义或检查变量名大小写"
            raise KeyError(f"测试变量未定义：{key}；{hint}。当前可用变量：{available}")
        return str(variables[key])

    return VARIABLE_PATTERN.sub(replace, value)


def normalize_action(value: dict[str, Any]) -> ActionSpec:
    data = dict(value)
    data.setdefault("id", "")
    data.setdefault("name", data.get("action", "测试步骤"))
    data.setdefault("action", "click")
    data.setdefault("expected", "")
    data.setdefault("value", "")
    data.setdefault("timeout", 15000)
    data.setdefault("risk", "read")
    data.setdefault("retries", 0)
    data.setdefault("screenshot", False)
    data.setdefault("continue_on_failure", False)
    data.setdefault("disabled", False)
    return ActionSpec(**{key: data[key] for key in ActionSpec.__dataclass_fields__ if key in data})
