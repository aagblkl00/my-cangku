"""把一条测试用例翻译成可执行的 Playwright 流程草稿。

调用 vendored 的 `ai_provider`（来自 ai_test_workbench），适配 OpenAI 兼容 /
Sub2API / MiniMax / Anthropic Messages 多种协议，含模型发现、路由、重试与 SSE 解析。
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from .ai_provider import AIRequestError, discover_models, request_ai_text, verify_ai_connection


def build_chat_prompt(message: str, context: dict[str, Any]) -> str:
    recent_history = str(context.get("最近对话", "")).strip()
    workspace_context = {key: value for key, value in context.items() if key != "最近对话"}
    context_text = json.dumps(workspace_context, ensure_ascii=False, indent=2) if workspace_context else "无"
    return (
        "你是 Lodestar。你的名字和身份都只使用 Lodestar，不添加任何前缀、后缀或其他称呼。默认使用中文，回答自然、准确、直接。\n"
        "不要自称 Automation Studio、内置 AI、AI 助手、本地协作引擎、模型或测试机器人。测试工作台只是你可以协作的环境，不是你的身份。\n"
        "你可以进行通用问答、数学计算、写作润色、总结、翻译、代码分析、方案设计和专业测试分析。\n\n"
        "对话理解规则：\n"
        "1. 首先结合最近对话理解用户当前问题。用户说‘这个’‘上一个’‘确定不确定’‘对不对’时，优先指向最近一轮对话内容。\n"
        "2. 工作区上下文只是可选参考。只有问题明确涉及测试、用例、流程、运行、页面或当前项目时才使用；普通问答不得强行关联工作区。\n"
        "3. 如果指代仍无法确定，先用一句简短问题澄清，不要擅自猜测成测试问题。\n"
        "4. 数学和事实核对要给出明确结论；不确定时说明不确定性，不得编造。\n"
        "5. 除非用户明确要求操作页面，否则只回答问题，不生成页面动作。\n\n"
        "6. 当前回复本身就是一次已经成功进入模型的生成请求。不得声称自己无法判断本次请求是否调用到模型，也不要根据旧对话猜测连接是否恢复。"
        "如果用户询问‘现在能用了吗’‘模型恢复了吗’之类的问题，应正常回答，并说明客户端回复旁的调用凭证是本次请求的权威状态。\n\n"
        "7. 如果用户询问‘你是什么模型’‘当前底层模型是什么’，身份仍然只回答 Lodestar；同时必须读取可选上下文中的‘本次调用配置’，"
        "直接说明本次请求配置的实际模型名称，不得回答无法确认，也不得使用最近对话里的旧模型状态。\n\n"
        "最近对话：\n" + (recent_history or "无") + "\n\n"
        "可选的测试工作区上下文：\n" + context_text + "\n\n"
        "用户当前请求：\n" + message + "\n\n"
        "仅当用户明确要求操作 Automation Studio 页面时，才可在回复末尾单独输出 AUTOMATION_STUDIO_ACTIONS: 后接 JSON 数组；"
        "仅允许 navigate(target)、select_step(step)、save_flow、run_flow。"
        "动作只作为待确认建议展示，用户确认后才执行；不要声称动作已经完成。"
    )

ALLOWED_ACTIONS = {
    "open", "click", "fill", "clear", "select", "wait", "hover", "press",
    "assert_text", "assert_exists", "assert_visible", "assert_enabled",
    "assert_value", "assert_url", "assert_title", "assert_count",
}
ALLOWED_LOCATORS = {"css", "testid", "role", "label", "placeholder", "name", "text"}
_NO_LOCATOR_ACTIONS = {"open", "wait", "assert_url", "assert_title"}

FLOW_SYSTEM_PROMPT = (
    "你是Web自动化测试工程师。根据给定测试用例，输出一条可直接执行的浏览器操作流程。\n"
    "严格输出JSON对象，不要输出任何解释或Markdown代码块以外的内容。格式：\n"
    '{"steps":[{"name":"步骤名","action":"动作","locator":{"type":"定位方式","value":"定位值"},"value":"输入值","expected":"断言期望"}]}\n'
    "规则：\n"
    "1. action 只能取：open, click, fill, clear, select, wait, hover, press, "
    "assert_text, assert_exists, assert_visible, assert_enabled, assert_value, assert_url, assert_title, assert_count。\n"
    "2. locator.type 只能取：css, testid, role, label, placeholder, name, text。\n"
    "   - text 表示按页面可见文字定位；testid 表示 data-testid 属性值；label 表示输入框标签文字；placeholder 表示占位提示。\n"
    "   - 优先 testid / name / placeholder / label / text 这类稳定定位，其次才是 css。\n"
    "3. open 通常是第一步，value 填完整网址或 ${base_url} 开头的相对路径。\n"
    "4. fill 的 value 从用例的测试数据/前置条件里取真实值；密码等敏感值填 ${PASSWORD}。\n"
    "5. select 的 value 填要选中的可见文字；wait 的 value 填等待毫秒。\n"
    "6. assert_* 的 expected 填要断言的内容；不需定位器的动作（open/wait/assert_url/assert_title）locator 填 null。\n"
    "7. 每步 name 用简短中文描述，不要编号前缀。只输出用例里有的操作，不臆造。"
)


def verify_connection(base_url: str, api_key: str, model: str) -> dict[str, Any]:
    response = verify_ai_connection(base_url, api_key, model)
    return {"ok": True, "base_url": response.base_url, "model": response.model, "api_kind": response.api_kind, "sample": response.text[:100]}


def list_models(base_url: str, api_key: str) -> dict[str, Any]:
    catalog = discover_models(base_url, api_key)
    return {"base_url": catalog.base_url, "models": list(catalog.models), "selected": catalog.selected_model}


def _extract_json(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise RuntimeError(f"AI 未返回 JSON：{text[:200]}")
    try:
        return json.loads(cleaned[start:end + 1])
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"AI 返回的 JSON 无法解析：{exc}") from exc


def _normalize_step(raw: dict[str, Any]) -> dict[str, Any]:
    action = str(raw.get("action", "")).strip().lower()
    if action not in ALLOWED_ACTIONS:
        raise RuntimeError(f"AI 返回了不支持的动作：{action}")
    locator = raw.get("locator") or {}
    locator_type = ""
    locator_value = ""
    if isinstance(locator, dict):
        locator_type = str(locator.get("type", "")).strip().lower()
        locator_value = str(locator.get("value", "")).strip()
    if locator_value and locator_type not in ALLOWED_LOCATORS:
        locator_type = "text"
    return {
        "name": str(raw.get("name", "")).strip() or action,
        "action": action,
        "locator_type": locator_type,
        "locator_value": locator_value,
        "value": str(raw.get("value", "") or ""),
        "expected": str(raw.get("expected", "") or ""),
    }


def generate_flow_steps(base_url: str, api_key: str, model: str, case: dict[str, Any], start_url: str = "") -> list[dict[str, Any]]:
    """把一条用例翻译成流程步骤草稿，返回带 locator_type/locator_value 的步骤列表。"""
    sections = []
    for label, value in (
        ("用例标题", case.get("title", "")),
        ("模块", case.get("module", "")),
        ("前置条件", case.get("preconditions", "")),
        ("操作步骤", case.get("steps", "")),
        ("测试数据", case.get("test_data", "")),
        ("预期结果", case.get("expected", "")),
    ):
        if value:
            sections.append(f"{label}：{value}")
    user = "目标网站基础地址：" + (start_url or "${base_url}") + "\n\n" + "\n".join(sections) + "\n\n请输出这个用例的可执行流程JSON。"
    response = request_ai_text(
        base_url,
        api_key,
        model,
        f"{FLOW_SYSTEM_PROMPT}\n\n{user}",
        timeout=120,
        max_retries=2,
        retry_backoff_seconds=1.0,
        total_timeout=240,
    )
    payload = _extract_json(response.text)
    raw_steps = payload.get("steps") if isinstance(payload, dict) else None
    if not isinstance(raw_steps, list) or not raw_steps:
        raise RuntimeError("AI 返回的流程没有 steps")
    return [_normalize_step(item) for item in raw_steps if isinstance(item, dict)]


def build_flow_payload(case: dict[str, Any], steps: list[dict[str, Any]], start_url: str = "", environment_id: Any = None) -> dict[str, Any]:
    """把步骤草稿转成 AutomationStudio 流程 payload，含需要 upsert 的元素列表。"""
    step_dicts: list[dict[str, Any]] = []
    elements: list[dict[str, Any]] = []
    for index, item in enumerate(steps, 1):
        action = item["action"]
        element_id = ""
        if action not in _NO_LOCATOR_ACTIONS and item.get("locator_value"):
            element_id = "ai-" + hashlib.sha1(f"{item['locator_type']}|{item['locator_value']}".encode()).hexdigest()[:12]
            elements.append({
                "project_id": case["project_id"], "element_id": element_id, "name": item["name"],
                "page_url": start_url, "page_title": "", "locator_type": item["locator_type"] or "css",
                "locator_value": item["locator_value"], "fallback_locators": [], "health_status": "未验证",
            })
        value = item.get("value", "")
        if action == "open" and not value:
            value = start_url
        step_dicts.append({
            "id": f"ai-step-{index:03d}", "name": item["name"], "action": action,
            "element_id": element_id, "value": value, "expected": item.get("expected", ""),
            "timeout": 15000, "screenshot": action.startswith("assert"),
            "risk": "read", "retries": 0, "continue_on_failure": False,
        })
    return {
        "project_id": case["project_id"],
        "name": f"{case.get('title', 'AI流程')}（AI草稿）",
        "description": f"由用例 {case.get('case_id', '')} 经 AI 生成，请人工审核后再执行",
        "engine": "playwright", "environment_id": environment_id,
        "variables": {}, "breakpoints": [], "steps": step_dicts, "elements": elements,
    }


__all__ = ["verify_connection", "list_models", "generate_flow_steps", "build_flow_payload", "AIRequestError"]
