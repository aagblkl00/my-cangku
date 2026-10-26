"""用例驱动的浏览器执行代理（pilot）。

对一条测试用例：打开页面 → 抽取可见可交互元素 → 交给 AI 决定下一步动作
（点击哪个元素 / 往哪个输入框填什么 / 或判定完成）→ 执行 → 观察 → 重复，
直到 AI 判定通过/失败或达到步数上限。

复用 ai_provider（支持 OpenAI 兼容 / Sub2API / MiniMax / Anthropic），
浏览器用已安装的 Playwright。定位方式：抽取时给每个元素打 data-agent-idx 索引，
AI 返回索引号，避免"猜定位器"的歧义。
"""

from __future__ import annotations

import json
import re
from typing import Any

from .ai_provider import request_ai_text
from .mission_engine import validate_request_target
from .automation.action_spec import resolve_variables

_VARIABLE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")

AGENT_SYSTEM_PROMPT = (
    "你是网页自动化测试的执行代理。我会给你：一条测试用例（前置条件、操作步骤、预期结果）、"
    "当前页面地址、当前页面可见的可交互元素清单（每个元素有编号），以及你到目前为止已经完成的动作。\n"
    "请判断下一步该做什么，并只输出一个JSON对象，不要任何解释：\n"
    '{"action":"click|fill|select|done|blocked","element":<编号或null>,"value":"<fill/select要用的值，可用变量>","passed":<true|false|null>,"reason":"<简短说明>"}\n'
    "规则：\n"
    "1. click=点击元素；fill=往输入框填值（value 填要输入的内容，密码等敏感值用 ${PASSWORD}）；select=下拉选择（value 填选项文字）。\n"
    "2. done=用例已跑完，必须给 passed(true/false) 和 reason；blocked=页面无法继续（缺少元素/卡死），给 reason。\n"
    "3. element 只填元素清单里的编号。优先选标签文字/占位符能对上、语义明确的元素。\n"
    "4. 严格按操作步骤的先后顺序执行，不要跳步、不要臆造步骤。变量 ${...} 表示从测试环境变量取值。\n"
    "5. 每步只做一个动作。"
)


def _extract_js() -> str:
    return r"""
    () => {
      const sel = 'a,button,input,select,textarea,[role="button"],[role="link"],[role="textbox"],[role="combobox"],[role="checkbox"],[data-testid],label';
      const out = [];
      const seen = new Set();
      document.querySelectorAll(sel).forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden') return;
        let node = el;
        while (node) { if (node.__agent_idx !== undefined) { seen.add(node.__agent_idx); break; } node = node.parentElement; }
        const text = (el.innerText || el.value || '').trim().slice(0, 80);
        if (!text && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;
        const idx = out.length;
        el.__agent_idx = idx;
        el.setAttribute('data-agent-idx', String(idx));
        out.push({
          i: idx,
          tag: el.tagName.toLowerCase(),
          type: el.type || '',
          testid: el.getAttribute('data-testid') || '',
          name: el.getAttribute('name') || '',
          placeholder: el.getAttribute('placeholder') || '',
          aria: el.getAttribute('aria-label') || '',
          label: (el.labels && el.labels[0] ? el.labels[0].innerText : '').trim().slice(0, 40),
          text,
        });
      });
      return out;
    }
    """


def extract_elements(page: Any) -> list[dict[str, Any]]:
    try:
        raw = page.evaluate(_extract_js())
        return raw if isinstance(raw, list) else []
    except Exception:
        return []


def _parse_action(text: str, n_elements: int) -> dict[str, Any]:
    cleaned = text.strip().strip("`")
    if cleaned.startswith("json"):
        cleaned = cleaned[4:]
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end == -1:
        raise RuntimeError(f"AI 未返回 JSON：{text[:200]}")
    payload = json.loads(cleaned[start:end + 1])
    action = str(payload.get("action", "")).strip().lower()
    allowed = {"click", "fill", "select", "done", "blocked"}
    if action not in allowed:
        raise RuntimeError(f"AI 返回了不支持的动作：{action}")
    element = payload.get("element")
    if action in {"click", "fill", "select"}:
        if not isinstance(element, int) or not (0 <= element < n_elements):
            raise RuntimeError(f"AI 返回的元素编号无效：{element}")
    passed = payload.get("passed")
    if passed is not None:
        passed = bool(passed)
    return {"action": action, "element": element, "value": str(payload.get("value", "") or ""),
            "passed": passed, "reason": str(payload.get("reason", "") or "")}


def _mask(value: str) -> str:
    if _VARIABLE.search(value):
        return value
    if len(value) <= 2:
        return "*" * len(value)
    return value[:1] + "*" * (len(value) - 2) + value[-1:]


def next_action(ai_cfg: dict[str, str], case: dict[str, Any], elements: list[dict[str, Any]],
                done_log: list[str], url: str, variables: dict[str, str]) -> dict[str, Any]:
    task_lines = []
    for label, key in (("前置条件", "preconditions"), ("操作步骤", "steps"), ("预期结果", "expected")):
        value = case.get(key) or ""
        if value:
            task_lines.append(f"{label}：{value}")
    task = "测试用例：\n" + "\n".join(task_lines)
    task += f"\n\n当前页面地址：{url}"
    task += "\n\n可交互元素清单：\n" + json.dumps(elements, ensure_ascii=False)
    if done_log:
        task += "\n\n已完成动作：\n" + "\n".join(done_log)
    task += "\n可用的环境变量：" + (json.dumps(variables, ensure_ascii=False) if variables else "（无）") + "\n\n请输出下一步JSON。"
    response = request_ai_text(
        ai_cfg["base_url"],
        ai_cfg["api_key"],
        ai_cfg["model"],
        f"{AGENT_SYSTEM_PROMPT}\n\n{task}",
        timeout=90,
        max_retries=2,
        retry_backoff_seconds=0.8,
        total_timeout=180,
    )
    return _parse_action(response.text, len(elements))


def run_case_agent(ai_cfg: dict[str, str], case: dict[str, Any], base_url: str,
                   variables: dict[str, str] | None = None, headed: bool = True, max_steps: int = 25,
                   on_step: Any = None, environment: dict[str, Any] | None = None) -> dict[str, Any]:
    from playwright.sync_api import sync_playwright
    variables = dict(variables or {})
    variables.setdefault("base_url", base_url)
    steps: list[dict[str, Any]] = []

    def record(step_no: int, action: str, description: str) -> None:
        steps.append({"step_no": step_no, "action": action, "description": description})
        if on_step:
            on_step({"step_no": step_no, "action": action, "description": description})

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not headed)
        try:
            context = browser.new_context(viewport={"width": 1440, "height": 900})
            security_environment = {**(environment or {}), "base_url": base_url}
            blocked_requests: list[dict[str, str]] = []

            def guard_request(route: Any) -> None:
                finding = validate_request_target(route.request.url, security_environment)
                if not finding:
                    route.continue_()
                    return
                blocked = {**finding, "url": route.request.url, "method": route.request.method}
                blocked_requests.append(blocked)
                record(len(steps) + 1, "blocked", finding["message"])
                route.abort("blockedbyclient")

            context.route("**/*", guard_request)
            page = context.new_page()
            if base_url:
                try:
                    page.goto(base_url, wait_until="domcontentloaded", timeout=30000)
                except Exception as exc:  # noqa: BLE001
                    if blocked_requests:
                        return {"status": "BLOCKED", "reason": blocked_requests[-1]["message"], "steps": steps}
                    raise exc
            for step_no in range(1, max_steps + 1):
                if blocked_requests:
                    return {"status": "BLOCKED", "reason": blocked_requests[-1]["message"], "steps": steps}
                page.wait_for_timeout(400)
                elements = extract_elements(page)
                decision = next_action(ai_cfg, case, elements, [s["description"] for s in steps], page.url, variables)
                action = decision["action"]
                if action == "done":
                    desc = f"判定{'通过' if decision['passed'] else '失败'}：{decision['reason']}"
                    record(step_no, action, desc)
                    return {"status": "INCONCLUSIVE" if decision["passed"] else "FAIL",
                            "reason": "AI 已完成操作，但必须由独立验证器裁决" if decision["passed"] else decision["reason"], "steps": steps}
                if action == "blocked":
                    desc = f"无法继续：{decision['reason'] or '缺元素/卡死'}"
                    record(step_no, action, desc)
                    return {"status": "FAIL", "reason": decision["reason"] or "AI 判定无法继续", "steps": steps}
                locator = page.locator(f'[data-agent-idx="{decision["element"]}"]')
                value = resolve_variables(decision["value"], variables) if decision["value"] else ""
                if action == "click":
                    locator.click(timeout=15000)
                    page.wait_for_timeout(100)
                    record(step_no, action, f"点击元素#{decision['element']}")
                elif action == "fill":
                    locator.fill(value, timeout=15000)
                    record(step_no, action, f"元素#{decision['element']} 输入 {var_or_mask(decision['value'], variables)}")
                elif action == "select":
                    locator.select_option(label=value, timeout=15000)
                    record(step_no, action, f"元素#{decision['element']} 选择 {value}")
                if blocked_requests:
                    return {"status": "BLOCKED", "reason": blocked_requests[-1]["message"], "steps": steps}
            desc = "达到最大步数仍未完成"
            record(max_steps + 1, "done", desc)
            return {"status": "FAIL", "reason": "达到最大步数仍未完成", "steps": steps}
        finally:
            browser.close()


def var_or_mask(value: str, variables: dict[str, str]) -> str:
    if _VARIABLE.search(value):
        return value
    return _mask(value)


__all__ = ["run_case_agent", "next_action", "extract_elements"]
