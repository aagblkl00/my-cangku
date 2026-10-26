from __future__ import annotations

from pathlib import Path
from typing import Any
from urllib.parse import urlparse


MISSION_PHASES = (
    "PLANNING",
    "PREFLIGHT",
    "DATA_PREPARATION",
    "EXECUTING",
    "VERIFYING",
    "FAILURE_REPRODUCTION",
    "DATA_CLEANUP",
    "REPORT_COMPLETE",
)
MISSION_VERDICTS = {"PASS", "FAIL", "BLOCKED", "INCONCLUSIVE", "CANCELLED"}

_TRANSITIONS = {
    "PLANNING": {"PREFLIGHT", "REPORT_COMPLETE"},
    "PREFLIGHT": {"DATA_PREPARATION", "REPORT_COMPLETE"},
    "DATA_PREPARATION": {"EXECUTING", "DATA_CLEANUP", "REPORT_COMPLETE"},
    "EXECUTING": {"VERIFYING", "FAILURE_REPRODUCTION", "DATA_CLEANUP"},
    "VERIFYING": {"FAILURE_REPRODUCTION", "DATA_CLEANUP"},
    "FAILURE_REPRODUCTION": {"DATA_CLEANUP"},
    "DATA_CLEANUP": {"REPORT_COMPLETE"},
    "REPORT_COMPLETE": set(),
}

_PRODUCTION_TOKENS = {"prod", "production", "online", "live", "正式", "生产"}
_REAL_PAYMENT_HOSTS = (
    "alipay.com",
    "pay.weixin.qq.com",
    "paypal.com",
    "stripe.com",
    "unionpay.com",
)
_SAFE_PAYMENT_MARKERS = ("sandbox", "mock", "test", "staging", "qa", "dev")
_NON_NETWORK_SCHEMES = {"about", "blob", "data"}
_ASSERT_ACTIONS = {
    "assert_text",
    "assert_equals",
    "assert_value",
    "assert_attribute",
    "assert_exists",
    "assert_not_exists",
    "assert_visible",
    "assert_not_visible",
    "assert_enabled",
    "assert_url",
    "assert_title",
    "assert_count",
}


def ensure_transition(current: str, target: str) -> None:
    if target not in _TRANSITIONS.get(current, set()):
        raise ValueError(f"Mission 状态不能从 {current} 变更为 {target}")


def is_real_payment_url(value: str) -> bool:
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    if not host or any(marker in host for marker in _SAFE_PAYMENT_MARKERS):
        return False
    return any(host == item or host.endswith(f".{item}") for item in _REAL_PAYMENT_HOSTS)


def _identity_tokens(value: str) -> set[str]:
    normalized = value.lower()
    for separator in ("-", "_", "/", ":", " "):
        normalized = normalized.replace(separator, ".")
    return {item for item in normalized.split(".") if item}


def _host_is_allowed(host: str, allowed_hosts: list[Any]) -> bool:
    normalized = host.strip().lower().rstrip(".")
    for raw in allowed_hosts:
        allowed = str(raw or "").strip().lower().rstrip(".")
        if not allowed:
            continue
        if allowed.startswith("*.") and normalized.endswith(allowed[1:]) and normalized != allowed[2:]:
            return True
        if normalized == allowed:
            return True
    return False


def validate_request_target(value: str, environment: dict[str, Any]) -> dict[str, str] | None:
    """Validate a browser request before Playwright transmits it.

    The environment display name is deliberately ignored here. Runtime requests are
    authorised only by their actual URL and the persisted host allowlist.
    """
    parsed = urlparse(str(value or "").strip())
    scheme = parsed.scheme.lower()
    if scheme in _NON_NETWORK_SCHEMES:
        return None
    if scheme not in {"http", "https", "ws", "wss"}:
        return {"code": "REQUEST_SCHEME_FORBIDDEN", "severity": "block", "message": f"已阻止非 HTTP(S) 请求：{scheme or 'unknown'}"}
    host = (parsed.hostname or "").lower().rstrip(".")
    if not host:
        return {"code": "REQUEST_HOST_MISSING", "severity": "block", "message": "请求目标缺少有效域名"}
    if _PRODUCTION_TOKENS.intersection(_identity_tokens(f"{host} {parsed.path}")):
        return {"code": "PRODUCTION_REQUEST_FORBIDDEN", "severity": "block", "message": f"已阻止疑似生产地址：{host}"}
    if is_real_payment_url(value):
        return {"code": "REAL_PAYMENT_REQUEST_FORBIDDEN", "severity": "block", "message": f"已阻止真实支付网关：{host}"}
    payment_host = any(host == item or host.endswith(f".{item}") for item in _REAL_PAYMENT_HOSTS)
    if payment_host:
        payment_mode = str(environment.get("payment_mode") or "disabled").lower()
        if payment_mode == "disabled":
            return {"code": "PAYMENT_DISABLED", "severity": "block", "message": f"当前环境已关闭支付执行：{host}"}
        required_marker = "sandbox" if payment_mode == "sandbox" else "mock"
        if required_marker not in host:
            return {"code": "PAYMENT_MODE_MISMATCH", "severity": "block", "message": f"支付地址与 {payment_mode} 策略不匹配：{host}"}
    allowed_hosts = list(environment.get("allowed_hosts") or [])
    if not allowed_hosts or not _host_is_allowed(host, allowed_hosts):
        return {"code": "REQUEST_HOST_NOT_ALLOWED", "severity": "block", "message": f"已阻止白名单外请求：{host}"}
    return None


def validate_environment(environment: dict[str, Any]) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    base_url = str(environment.get("base_url") or "").strip()
    parsed = urlparse(base_url)
    host = (parsed.hostname or "").lower()
    environment_kind = str(environment.get("environment_kind") or "test").lower()
    identity = f"{host} {parsed.path.lower()} {str(environment.get('name') or '').lower()}"
    identity_tokens = _identity_tokens(identity)

    if environment_kind == "production" or _PRODUCTION_TOKENS.intersection(identity_tokens):
        findings.append({"code": "PRODUCTION_FORBIDDEN", "severity": "block", "message": "检测到生产环境标识，核心门禁已阻止执行"})
    if parsed.scheme not in {"http", "https"} or not host:
        findings.append({"code": "INVALID_BASE_URL", "severity": "block", "message": "测试环境必须配置完整的 http/https 地址"})
    allowed_hosts = list(environment.get("allowed_hosts") or [])
    if not allowed_hosts or not _host_is_allowed(host, allowed_hosts):
        findings.append({"code": "HOST_NOT_REGISTERED", "severity": "block", "message": "环境域名未登记到执行白名单"})
    if is_real_payment_url(base_url):
        findings.append({"code": "REAL_PAYMENT_FORBIDDEN", "severity": "block", "message": "检测到真实支付网关，所有环境均禁止执行"})
    if not findings:
        findings.append({"code": "ENVIRONMENT_READY", "severity": "info", "message": "环境身份、域名白名单和支付门禁检查通过"})
    return findings


def build_scenarios(
    cases: list[dict[str, Any]],
    objective: str,
    depth: str,
    selected_case_ids: list[str] | None = None,
    custom_limit: int | None = None,
) -> list[dict[str, Any]]:
    selected = {str(item) for item in selected_case_ids or [] if str(item)}
    candidates = [item for item in cases if not selected or item.get("case_id") in selected]
    if not selected and objective.strip():
        keywords = {item.lower() for item in objective.replace("，", " ").replace("。", " ").split() if len(item) >= 2}
        matched = [
            item for item in candidates
            if any(keyword in f"{item.get('title', '')} {item.get('module', '')} {' '.join(item.get('tags') or [])}".lower() for keyword in keywords)
        ]
        if matched:
            candidates = matched
    limit = custom_limit if depth == "custom" and custom_limit else {"quick": 5, "standard": 20, "deep": 50}.get(depth, 20)
    candidates = sorted(candidates, key=lambda item: ({"P0": 0, "P1": 1, "P2": 2, "P3": 3}.get(item.get("priority"), 4), item.get("case_id", "")))[: max(1, min(int(limit), 100))]

    scenarios: list[dict[str, Any]] = []
    for index, case in enumerate(candidates, 1):
        expected = str(case.get("expected") or "").strip()
        scenarios.append({
            "case_id": case.get("case_id") or "",
            "title": case.get("title") or f"场景 {index}",
            "source": {"type": "test_case", "id": case.get("case_id") or "", "objective": objective},
            "risk": case.get("priority") or "P1",
            "preconditions": case.get("preconditions") or "",
            "test_data": case.get("test_data") or "",
            "execution_target": "ui",
            "verification_rules": [{"layer": "ui", "rule": expected}] if expected else [],
            "cleanup_strategy": "保留失败现场；仅清理 KLEIN_OWNED 数据",
            "sort_order": index,
        })
    return scenarios


def verify_execution(
    flow_steps: list[dict[str, Any]],
    run_steps: list[dict[str, Any]],
    trace_path: str,
    risk: str = "P1",
) -> dict[str, Any]:
    observed_by_id = {str(item.get("step_id") or ""): item for item in run_steps if item.get("step_id")}
    assertions = [item for item in run_steps if str(item.get("action") or (item.get("action_spec") or {}).get("action") or "") in _ASSERT_ACTIONS]
    assertion_passed = bool(assertions) and all(item.get("status") == "PASS" for item in assertions)
    trace_exists = bool(trace_path) and Path(trace_path).is_file()
    ledger: list[dict[str, Any]] = []
    has_failure = False
    has_block = False
    has_gap = False

    for number, source in enumerate([item for item in flow_steps if not item.get("disabled")], 1):
        step_id = str(source.get("id") or "")
        observed = observed_by_id.get(step_id)
        evidence = []
        if observed:
            for key, kind in (("before_screenshot_path", "before"), ("after_screenshot_path", "after"), ("log_path", "log")):
                path = str(observed.get(key) or "")
                if path and Path(path).is_file():
                    evidence.append({"type": kind, "path": path})
        action = str(source.get("action") or "")
        observed_status = str((observed or {}).get("status") or "MISSING")
        if observed_status == "FAIL":
            has_failure = True
        elif observed_status == "BLOCKED":
            has_block = True
        requires_postcondition = action not in _ASSERT_ACTIONS and action not in {"screenshot", "wait"}
        postcondition = "断言步骤已独立执行" if action in _ASSERT_ACTIONS and observed_status == "PASS" else ("后续断言通过" if assertion_passed else "缺少可判定的后置验证")
        evidence_complete = len(evidence) == 3
        item_status = "PASS" if observed_status == "PASS" and evidence_complete and (not requires_postcondition or assertion_passed) else observed_status
        if item_status not in {"PASS", "FAIL", "BLOCKED"} or not evidence_complete or (requires_postcondition and not assertion_passed):
            has_gap = True
            if item_status not in {"FAIL", "BLOCKED"}:
                item_status = "INCONCLUSIVE"
        ledger.append({
            "source_step_no": number,
            "source_step_id": step_id,
            "source_text": source.get("name") or action,
            "actual_action": (observed or {}).get("message") or "未执行",
            "postcondition": postcondition,
            "evidence": evidence,
            "status": item_status,
            "run_step_id": (observed or {}).get("run_step_id") or "",
        })

    verification_layers = [{
        "layer": "ui",
        "status": "PASS" if assertion_passed else "INCONCLUSIVE",
        "rule": "至少一个明确 UI 断言通过",
        "observed": f"已执行 {len(assertions)} 个断言",
        "evidence": [item.get("run_step_id") for item in assertions if item.get("run_step_id")],
    }, {
        "layer": "evidence",
        "status": "PASS" if trace_exists and not has_gap else "INCONCLUSIVE",
        "rule": "步骤前后截图、日志和 Trace 完整",
        "observed": "证据完整" if trace_exists and not has_gap else "存在缺失证据或覆盖缺口",
        "evidence": [trace_path] if trace_exists else [],
    }]
    if risk == "P0":
        has_network_signal = any(str(item.get("network_summary") or "").strip() for item in run_steps)
        verification_layers.append({
            "layer": "api",
            "status": "PASS" if has_network_signal else "INCONCLUSIVE",
            "rule": "P0 结果必须具备第二验证通道",
            "observed": "已采集网络验证信号" if has_network_signal else "缺少独立 API/数据验证",
            "evidence": [],
        })
        has_gap = has_gap or not has_network_signal

    if has_failure:
        verdict = "FAIL"
    elif has_block:
        verdict = "BLOCKED"
    elif not flow_steps or has_gap or not assertion_passed or not trace_exists:
        verdict = "INCONCLUSIVE"
    else:
        verdict = "PASS"
    return {"verdict": verdict, "ledger": ledger, "verifications": verification_layers}


def aggregate_verdict(verdicts: list[str], cancelled: bool = False) -> str:
    if cancelled:
        return "CANCELLED"
    if not verdicts:
        return "BLOCKED"
    if "FAIL" in verdicts:
        return "FAIL"
    if "BLOCKED" in verdicts:
        return "BLOCKED"
    if "INCONCLUSIVE" in verdicts:
        return "INCONCLUSIVE"
    return "PASS" if all(item == "PASS" for item in verdicts) else "INCONCLUSIVE"


def classify_reproduction(original_steps: list[dict[str, Any]], reproduced_steps: list[dict[str, Any]], reproduced_verdict: str) -> dict[str, Any]:
    if reproduced_verdict == "PASS":
        return {"classification": "FLAKY", "confidence": 90, "message": "相同环境与流程复现时通过，已归类为 Flaky 候选"}
    if reproduced_verdict == "BLOCKED":
        return {"classification": "ENVIRONMENT_OR_EXECUTOR", "confidence": 75, "message": "复现被环境或执行器阻塞，不能直接定性为产品缺陷"}
    if reproduced_verdict != "FAIL":
        return {"classification": "UNCONFIRMED", "confidence": 60, "message": "复现证据不足，保留为待确认"}

    def failure_signature(items: list[dict[str, Any]]) -> tuple[str, str]:
        failed = next((item for item in items if item.get("status") == "FAIL"), {})
        identity = str(failed.get("step_id") or failed.get("step_no") or "")
        reason = str(failed.get("error_message") or failed.get("message") or "").strip().lower()[:160]
        return identity, reason

    original_signature = failure_signature(original_steps)
    reproduced_signature = failure_signature(reproduced_steps)
    if original_signature[0] and original_signature == reproduced_signature:
        return {"classification": "PRODUCT_DEFECT_CANDIDATE", "confidence": 88, "message": "同一步骤与同一失败信号稳定复现，已生成待审核缺陷草稿"}
    return {"classification": "UNCONFIRMED", "confidence": 65, "message": "再次失败但失败位置或信号不同，需要人工复核证据"}


def build_tapd_draft(case: dict[str, Any], run_steps: list[dict[str, Any]]) -> dict[str, str]:
    failed = next((item for item in run_steps if item.get("status") == "FAIL"), {})
    actual = str(failed.get("error_message") or failed.get("message") or "执行结果与预期不一致").strip()
    step_no = failed.get("step_no")
    if step_no:
        actual = f"第 {step_no} 步失败：{actual}"
    return {
        "title": str(case.get("title") or "测试执行失败").strip(),
        "preconditions": str(case.get("preconditions") or "未填写").strip(),
        "steps": str(case.get("steps") or "未填写").strip(),
        "expected": str(case.get("expected") or "未填写").strip(),
        "actual": actual,
    }


__all__ = [
    "MISSION_PHASES",
    "MISSION_VERDICTS",
    "aggregate_verdict",
    "build_tapd_draft",
    "build_scenarios",
    "classify_reproduction",
    "ensure_transition",
    "is_real_payment_url",
    "validate_request_target",
    "validate_environment",
    "verify_execution",
]
