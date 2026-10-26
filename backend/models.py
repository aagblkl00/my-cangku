from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any


ACTION_LABELS = {
    "open": "打开页面",
    "click": "点击",
    "fill": "输入",
    "clear": "清空",
    "select": "下拉选择",
    "select_value": "按值选择",
    "upload": "上传文件",
    "wait": "等待",
    "wait_url": "等待页面跳转",
    "screenshot": "截图",
    "assert_text": "校验文本",
    "assert_equals": "校验文本相等",
    "assert_value": "校验输入值",
    "assert_attribute": "校验属性",
    "assert_exists": "校验元素存在",
    "assert_not_exists": "校验元素不存在",
    "assert_visible": "校验元素可见",
    "assert_not_visible": "校验元素不可见",
    "assert_enabled": "校验元素可用",
    "assert_url": "校验页面地址",
    "assert_title": "校验页面标题",
    "assert_count": "校验元素数量",
    "hover": "悬停",
    "press": "键盘操作",
}


@dataclass(slots=True)
class ActionSpec:
    id: str
    name: str
    action: str
    element_id: str = ""
    value: str = ""
    expected: str = ""
    timeout: int = 15000
    screenshot: bool = False
    risk: str = "read"
    retries: int = 0
    continue_on_failure: bool = False
    page_url: str = ""
    page_title: str = ""
    disabled: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def action_label(action: str) -> str:
    return ACTION_LABELS.get(action, action)
