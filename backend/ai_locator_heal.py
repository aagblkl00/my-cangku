"""AI 定位器自愈（Lodestar）。

背景：现有自愈机制是「主定位器失效 → 逐个试备用定位器」，全部落空后只能报错。
本模块补上最后一层兜底：把当前页面上的可交互元素摘要交给模型，由模型判断目标
元素并给出新定位器；新定位器必须经过**实际验证**（命中元素数量）才会被采纳。

设计约束：
- 任何异常都不向上抛，最坏返回 None，绝不改变原有执行语义。
- 复用 ai_client._extract_json 与 ai_provider.request_ai_text，不引入新依赖。
- 采纳结果写入 locator_heal_suggestions，走现有的人工审批流程。

作者备注：模型在这里只负责"在候选里选一个"，不负责编造选择器 —— 候选摘要和
最终验证都由本地代码完成，避免模型幻觉直接落到执行链路上。
"""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

# 能从配置里取的 AI 参数键名（RunIn.ai / 环境变量）
AI_CONFIG_KEYS = ("base_url", "api_key", "model")

# 收集页面可交互元素的 JS：只取"看得见 + 可交互"的，控制在 80 个以内
CANDIDATE_COLLECT_JS = """
() => {
  const sel = 'a,button,input,textarea,select,[role],[data-testid],[aria-label],[contenteditable="true"]';
  const out = [];
  const seen = new Set();
  const nodes = document.querySelectorAll(sel);
  for (const el of nodes) {
    if (out.length >= 80) break;
    let rect = null;
    try { rect = el.getBoundingClientRect(); } catch (e) { continue; }
    if (!rect) continue;
    // 过滤不可见元素（隐藏的模板节点会干扰模型判断）
    if (rect.width < 1 && rect.height < 1) continue;
    const style = (() => { try { return window.getComputedStyle(el); } catch (e) { return null; } })();
    if (style && (style.display === 'none' || style.visibility === 'hidden')) continue;
    let cls = '';
    try { cls = (typeof el.className === 'string' ? el.className : '').trim().slice(0, 80); } catch (e) { cls = ''; }
    const item = {
      tag: el.tagName.toLowerCase(),
      type: (el.getAttribute && el.getAttribute('type')) || '',
      id: (el.id || '').slice(0, 80),
      name: ((el.getAttribute && el.getAttribute('name')) || '').slice(0, 80),
      cls: cls,
      testid: ((el.getAttribute && el.getAttribute('data-testid')) || '').slice(0, 80),
      aria: ((el.getAttribute && el.getAttribute('aria-label')) || '').slice(0, 80),
      placeholder: ((el.getAttribute && el.getAttribute('placeholder')) || '').slice(0, 80),
      role: ((el.getAttribute && el.getAttribute('role')) || '').slice(0, 40),
      text: ((el.innerText || el.value || '') + '').trim().replace(/\\s+/g, ' ').slice(0, 60),
    };
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
"""

HEAL_SYSTEM_PROMPT = (
    "你是 Web 自动化测试的定位器修复工具。一个测试步骤原本要操作的元素，其主定位器和全部备用定位器"
    "在页面上都找不到了（页面改版了）。现在给你该元素的业务描述和当前页面上所有可交互元素的摘要，"
    "请你判断哪个候选元素是同一个元素，并给出新的定位方式。\n"
    "严格只输出一个 JSON 对象，不要任何解释、不要 Markdown 代码块。格式：\n"
    '{"found": true, "index": 3, "locator_type": "css", "locator_value": "#submit", "confidence": 85, "reason": "简短理由"}\n'
    "规则：\n"
    "1. 找不到把握足够的候选时，必须输出 {\"found\": false, \"reason\": \"...\"}，不要硬猜。\n"
    "2. locator_type 只能取 css / testid / role / label / placeholder / name / text。\n"
    "3. 优先级：testid > id > name > placeholder > aria/role > text > css 组合类名，越稳定越好。\n"
    "4. css 取值必须能在该页面唯一命中一个元素；不要使用会匹配多个元素的宽泛选择器。\n"
    "5. confidence 是 0-100 的整数，表示你的把握程度；低于 60 就不要返回 found=true。\n"
    "6. reason 用一句中文说明为什么认定是它（例如“同一位置的登录按钮，文案一致”）。"
)


def normalize_ai_config(raw: Any) -> dict[str, str]:
    """把各种来源的 AI 配置规整成 {'base_url','api_key','model'}；缺项返回空串。"""
    if not isinstance(raw, dict):
        return {"base_url": "", "api_key": "", "model": ""}
    result = {}
    for key in AI_CONFIG_KEYS:
        result[key] = str(raw.get(key) or "").strip()
    return result


def ai_config_ready(config: dict[str, str] | None) -> bool:
    """判断配置够不够发起一次调用。base_url + model 必填，api_key 允许为空（部分本地网关不需要）。"""
    if not config:
        return False
    return bool(config.get("base_url") and config.get("model"))


def collect_candidates(page: Any, limit: int = 80) -> list[dict[str, Any]]:
    """抓取页面可交互元素摘要；失败返回空列表（不抛异常）。"""
    try:
        data = page.evaluate(CANDIDATE_COLLECT_JS)
    except Exception as exc:  # noqa: BLE001 - 页面可能正在跳转，抓不到就算了
        logger.warning("AI 自愈：候选元素收集失败 %s", exc)
        return []
    if not isinstance(data, list):
        return []
    return [item for item in data if isinstance(item, dict)][:limit]


def build_heal_prompt(element: dict[str, Any], candidates: list[dict[str, Any]], page_url: str) -> str:
    """构造交给模型的分析请求。"""
    original = {
        "定位方式": element.get("locator_type", ""),
        "定位值": element.get("locator_value", ""),
    }
    fallbacks = []
    for item in element.get("fallback_locators") or []:
        if isinstance(item, dict):
            fallbacks.append({
                "定位方式": item.get("type", item.get("locator_type", "")),
                "定位值": item.get("value", item.get("locator_value", "")),
            })
    indexed = [{"index": i, **cand} for i, cand in enumerate(candidates)]
    return (
        "目标元素的业务描述：\n"
        f"- 元素名称：{element.get('name') or element.get('element_id') or '（未命名）'}\n"
        f"- 所属页面：{element.get('page_url') or page_url}\n"
        f"- 原定位器（已失效）：{json.dumps(original, ensure_ascii=False)}\n"
        f"- 备用定位器（也失效）：{json.dumps(fallbacks, ensure_ascii=False)}\n\n"
        "当前页面可交互元素摘要（index 从 0 开始）：\n"
        f"{json.dumps(indexed, ensure_ascii=False)}\n\n"
        "请判断哪个 index 是同一个元素，输出约定的 JSON。"
    )


def verify_locator(page: Any, locator_type: str, locator_value: str) -> int:
    """验证定位器在页面上的命中数量；异常返回 -1。"""
    if not locator_value:
        return -1
    try:
        from .automation.playwright_executor import PlaywrightExecutor
        locator = PlaywrightExecutor._locator(page, {"locator_type": locator_type, "locator_value": locator_value})
        return int(locator.count())
    except Exception as exc:  # noqa: BLE001 - 无效选择器就是验证失败
        logger.warning("AI 自愈：定位器验证失败 %s(%s) -> %s", locator_type, locator_value, exc)
        return -1


def heal_locator_with_ai(
    page: Any,
    element: dict[str, Any],
    ai_config: dict[str, str] | None,
    *,
    timeout: int = 30,
    max_candidates: int = 80,
) -> dict[str, Any] | None:
    """AI 兜底定位。

    成功返回 {"locator_type", "locator_value", "confidence", "reason", "matched"}，
    任何环节不成立都返回 None（调用方保持原有一切行为）。
    """
    config = normalize_ai_config(ai_config)
    if not ai_config_ready(config):
        return None

    candidates = collect_candidates(page, limit=max_candidates)
    if not candidates:
        logger.info("AI 自愈：页面上没有可分析的可交互元素，跳过")
        return None

    page_url = ""
    try:
        page_url = str(page.url)
    except Exception:  # noqa: BLE001
        page_url = ""

    prompt = build_heal_prompt(element, candidates, page_url)

    try:
        from .ai_client import _extract_json
        from .ai_provider import request_ai_text

        response = request_ai_text(
            config["base_url"],
            config["api_key"],
            config["model"],
            f"{HEAL_SYSTEM_PROMPT}\n\n{prompt}",
            timeout=timeout,
            max_tokens=600,
            max_retries=0,
            retry_backoff_seconds=0,
            total_timeout=timeout * 2,
        )
        payload = _extract_json(response.text)
    except Exception as exc:  # noqa: BLE001 - 模型不可用不能影响原流程
        logger.warning("AI 自愈：模型调用或解析失败 %s", exc)
        return None

    if not isinstance(payload, dict) or not payload.get("found"):
        logger.info("AI 自愈：模型判断找不到对应元素（%s）", payload.get("reason") if isinstance(payload, dict) else "")
        return None

    locator_type = str(payload.get("locator_type") or "").strip().lower()
    locator_value = str(payload.get("locator_value") or "").strip()
    if locator_type not in {"css", "testid", "role", "label", "placeholder", "name", "text"} or not locator_value:
        logger.info("AI 自愈：模型返回的定位器不合法（%s / %s）", locator_type, locator_value)
        return None

    try:
        confidence = int(payload.get("confidence") or 0)
    except (TypeError, ValueError):
        confidence = 0
    if confidence < 60:
        logger.info("AI 自愈：置信度不足（%s），放弃", confidence)
        return None

    matched = verify_locator(page, locator_type, locator_value)
    if matched <= 0:
        logger.info("AI 自愈：模型给出的定位器 %s(%s) 在页面上命中 %s 个，丢弃", locator_type, locator_value, matched)
        return None
    if locator_type == "css" and matched != 1:
        logger.info("AI 自愈：css 定位器必须唯一命中 1 个元素，%s 实际命中 %s 个，丢弃", locator_value, matched)
        return None
    return {
        "locator_type": locator_type,
        "locator_value": locator_value,
        "confidence": min(confidence, 100),
        "reason": str(payload.get("reason") or "").strip()[:200],
        "matched": matched,
    }


__all__ = [
    "AI_CONFIG_KEYS",
    "ai_config_ready",
    "build_heal_prompt",
    "collect_candidates",
    "heal_locator_with_ai",
    "normalize_ai_config",
    "verify_locator",
]
