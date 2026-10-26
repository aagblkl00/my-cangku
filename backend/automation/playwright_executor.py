from __future__ import annotations

import json
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

from ..models import ACTION_LABELS
from ..mission_engine import is_real_payment_url, validate_environment, validate_request_target
from .action_spec import normalize_action, resolve_variables


class ActionBlocked(RuntimeError):
    """Security policy blocked an action before it reached the browser."""


class PlaywrightExecutor:
    """Code-free action executor. Playwright is imported lazily for local startup diagnostics."""

    def __init__(self, artifact_root: Path, event: Callable[[str, dict[str, Any]], None] | None = None, ai_config: dict[str, Any] | None = None) -> None:
        self.artifact_root = artifact_root
        self.event = event or (lambda _name, _payload: None)
        # AI 定位器自愈配置（base_url / api_key / model）。为空时完全不影响原有行为。
        self.ai_config = ai_config or {}
        self._paused = False
        self._stopped = False
        self._state = "IDLE"
        self._control = threading.Condition()
        self._step_once = False
        self._from_step = 1
        self._to_step: int | None = None
        self._breakpoints: set[int] = set()
        self._last_locator_resolution: dict[str, Any] = {}

    @property
    def state(self) -> str:
        with self._control:
            return self._state

    def configure(self, from_step: int = 1, to_step: int | None = None, breakpoints: list[int] | None = None) -> None:
        with self._control:
            self._from_step = max(1, int(from_step or 1))
            self._to_step = int(to_step) if to_step else None
            self._breakpoints = {int(item) for item in (breakpoints or []) if int(item) > 0}

    def pause(self) -> None:
        with self._control:
            if self._state in {"RUNNING", "IDLE"}:
                self._paused = True
                self._state = "PAUSED"
                self.event("run_state", {"status": "PAUSED"})

    def resume(self) -> None:
        with self._control:
            self._paused = False
            self._step_once = False
            if self._state == "PAUSED":
                self._state = "RUNNING"
                self.event("run_state", {"status": "RUNNING"})
            self._control.notify_all()

    def step_once(self) -> None:
        with self._control:
            self._step_once = True
            self._paused = False
            if self._state == "PAUSED":
                self._state = "RUNNING"
                self.event("run_state", {"status": "RUNNING", "mode": "STEP"})
            self._control.notify_all()

    def set_breakpoints(self, breakpoints: list[int]) -> None:
        with self._control:
            self._breakpoints = {int(item) for item in breakpoints if int(item) > 0}
            self.event("breakpoints", {"breakpoints": sorted(self._breakpoints)})

    def stop(self) -> None:
        with self._control:
            self._stopped = True
            self._paused = False
            self._state = "STOPPING"
            self.event("run_state", {"status": "STOPPING"})
            self._control.notify_all()

    def run(self, flow: dict[str, Any], environment: dict[str, Any], run_id: str, runtime_variables: dict[str, Any] | None = None) -> tuple[str, list[dict[str, Any]], str]:
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:
            raise RuntimeError("尚未安装 Playwright，请先安装依赖并执行浏览器安装命令") from exc

        run_dir = self.artifact_root / run_id
        screenshots = run_dir / "screenshots"
        logs = run_dir / "logs"
        dom_dir = run_dir / "dom"
        trace_dir = run_dir / "trace"
        screenshots.mkdir(parents=True, exist_ok=True)
        logs.mkdir(parents=True, exist_ok=True)
        dom_dir.mkdir(parents=True, exist_ok=True)
        trace_dir.mkdir(parents=True, exist_ok=True)
        variables = {**flow.get("project_variables", {}), **environment.get("variables", {}), **flow.get("variables", {}), **(runtime_variables or {})}
        variables.setdefault("base_url", environment.get("base_url", ""))
        results: list[dict[str, Any]] = []
        status = "PASS"
        with self._control:
            self._state = "RUNNING"
            self._stopped = False
            self.event("run_state", {"status": "RUNNING"})
        trace_path = trace_dir / "trace.zip"
        with sync_playwright() as playwright:
            browser_type = getattr(playwright, environment.get("browser", "chromium"), playwright.chromium)
            browser = browser_type.launch(headless=bool(environment.get("headless", False)))
            context = browser.new_context(viewport={"width": 1440, "height": 900})
            context.tracing.start(screenshots=True, snapshots=True, sources=True)
            console_messages: list[str] = []
            network_messages: list[str] = []
            security_blocks: list[dict[str, str]] = []

            def guard_request(route: Any) -> None:
                finding = validate_request_target(route.request.url, environment)
                if not finding:
                    route.continue_()
                    return
                blocked = {**finding, "url": route.request.url, "method": route.request.method}
                security_blocks.append(blocked)
                network_messages.append(f"[BLOCKED] {route.request.method} {route.request.url} -> {finding['code']}")
                self.event("security_request_blocked", blocked)
                route.abort("blockedbyclient")

            context.route("**/*", guard_request)
            page = context.new_page()
            page.on("console", lambda message: console_messages.append(f"{message.type}: {message.text}"))
            page.on("requestfailed", lambda request: network_messages.append(f"{request.method} {request.url} -> {request.failure}"))
            try:
                for number, raw in enumerate(flow.get("steps", []), 1):
                    step = normalize_action(raw)
                    if number < self._from_step or (self._to_step is not None and number > self._to_step):
                        skipped = self._result(step, number, "SKIP", "不在本次执行范围")
                        results.append(skipped)
                        self.event("step_finished", skipped)
                        continue
                    if step.disabled:
                        skipped = self._result(step, number, "SKIP", "步骤已禁用")
                        skipped["log_path"] = str(logs / f"{number:02d}_{step.action}.log")
                        Path(skipped["log_path"]).write_text("步骤已禁用", encoding="utf-8")
                        results.append(skipped)
                        continue
                    self._wait_for_control(number)
                    if self._stopped:
                        status = "STOPPED"
                        blocked = self._result(step, number, "BLOCKED", "执行已停止", started=time.perf_counter())
                        results.append(blocked)
                        self.event("step_finished", blocked)
                        break
                    self.event("step_started", {"step_no": number, "name": step.name, "action": step.action})
                    started = time.perf_counter()
                    result: dict[str, Any]
                    last_error = ""
                    before_screenshot = ""
                    for attempt in range(step.retries + 1):
                        try:
                            security_block_count = len(security_blocks)
                            self._last_locator_resolution = {}
                            if not before_screenshot:
                                before_screenshot = str(screenshots / f"{number:02d}_{step.action}_before.png")
                                try:
                                    page.screenshot(path=before_screenshot, full_page=True)
                                except Exception:
                                    before_screenshot = ""
                            if page.url and page.url != "about:blank":
                                self._validate_url(page.url, environment)
                            if environment.get("read_only") and getattr(step, "risk", "read") in {"write", "destructive"}:
                                raise ActionBlocked("当前测试环境为只读模式，已阻止高风险步骤")
                            try:
                                message = self._execute(page, step, variables, flow.get("elements", {}), environment)
                                page.wait_for_timeout(100)
                            except Exception as exc:  # noqa: BLE001
                                if len(security_blocks) > security_block_count:
                                    raise ActionBlocked(security_blocks[-1]["message"]) from exc
                                raise
                            if len(security_blocks) > security_block_count:
                                raise ActionBlocked(security_blocks[-1]["message"])
                            after_screenshot = str(screenshots / f"{number:02d}_{step.action}_after.png")
                            try:
                                page.screenshot(path=after_screenshot, full_page=True)
                            except Exception:
                                after_screenshot = ""
                            screenshot = after_screenshot if step.screenshot else ""
                            result = self._result(step, number, "PASS", message, screenshot, started)
                            result["before_screenshot_path"] = before_screenshot
                            result["after_screenshot_path"] = after_screenshot
                            result["attempts"] = attempt + 1
                            result["page_url"] = page.url
                            result["page_title"] = page.title()
                            result["console_summary"] = "\n".join(console_messages[-20:])
                            result["network_summary"] = "\n".join(network_messages[-20:])
                            result["security_findings"] = security_blocks[security_block_count:]
                            last_error = ""
                            break
                        except ActionBlocked as exc:
                            last_error = str(exc)
                            screenshot = str(screenshots / f"{number:02d}_{step.action}_blocked.png")
                            try:
                                page.screenshot(path=screenshot, full_page=True)
                            except Exception:
                                screenshot = ""
                            result = self._result(step, number, "BLOCKED", "执行已阻止", screenshot, started, last_error)
                            result["before_screenshot_path"] = before_screenshot
                            result["after_screenshot_path"] = screenshot
                            result["attempts"] = attempt + 1
                            result["page_url"] = page.url
                            result["page_title"] = page.title()
                            result["console_summary"] = "\n".join(console_messages[-20:])
                            result["network_summary"] = "\n".join(network_messages[-20:])
                            result["security_findings"] = security_blocks[security_block_count:]
                        except Exception as exc:  # noqa: BLE001
                            last_error = str(exc)
                            if attempt < step.retries:
                                self.event("step_retry", {"step_no": number, "attempt": attempt + 1, "error": last_error})
                                continue
                            screenshot = str(screenshots / f"{number:02d}_{step.action}_failed.png")
                            try:
                                page.screenshot(path=screenshot, full_page=True)
                            except Exception:
                                screenshot = ""
                            result = self._result(step, number, "FAIL", "执行失败", screenshot, started, last_error)
                            result["before_screenshot_path"] = before_screenshot
                            result["after_screenshot_path"] = screenshot
                            result["attempts"] = attempt + 1
                            result["page_url"] = page.url
                            result["page_title"] = page.title()
                            result["console_summary"] = "\n".join(console_messages[-20:])
                            result["network_summary"] = "\n".join(network_messages[-20:])
                            result["security_findings"] = security_blocks[security_block_count:]
                    if self._last_locator_resolution:
                        result["locator"] = dict(self._last_locator_resolution)
                    if result.get("status") == "FAIL":
                        dom_path = dom_dir / f"{number:02d}_{step.action}_failed.html"
                        try:
                            dom_path.write_text(page.content(), encoding="utf-8")
                            result["dom_snapshot_path"] = str(dom_path)
                        except Exception:
                            result["dom_snapshot_path"] = ""
                    if last_error:
                        status = "BLOCKED" if result.get("status") == "BLOCKED" else "FAIL"
                        if not step.continue_on_failure:
                            results.append(result)
                            self.event("step_finished", result)
                            break
                    log_path = logs / f"{number:02d}_{step.action}.log"
                    log_path.write_text(json.dumps({"step": step.to_dict(), "status": result["status"], "message": result.get("message", ""), "error": result.get("error_message", ""), "page_url": result.get("page_url", ""), "page_title": result.get("page_title", "")}, ensure_ascii=False, indent=2), encoding="utf-8")
                    result["log_path"] = str(log_path)
                    results.append(result)
                    self.event("step_finished", result)
                    with self._control:
                        if self._step_once and not self._stopped:
                            self._step_once = False
                            self._paused = True
                            self._state = "PAUSED"
                            self.event("run_state", {"status": "PAUSED", "reason": "单步完成", "step_no": number})
                (logs / "console.log").write_text("\n".join(console_messages), encoding="utf-8")
                (logs / "network.log").write_text("\n".join(network_messages), encoding="utf-8")
                context.tracing.stop(path=str(trace_path))
            finally:
                browser.close()
        with self._control:
            if self._state not in {"STOPPING", "STOPPED"}:
                self._state = "PASSED" if status == "PASS" else ("STOPPED" if status == "STOPPED" else "FAILED")
            final_state = self._state
        self.event("run_state", {"status": final_state})
        return status, results, str(trace_path)

    def _wait_for_control(self, number: int) -> None:
        with self._control:
            if number in self._breakpoints and self._state == "RUNNING":
                self._paused = True
                self._state = "PAUSED"
                self.event("run_state", {"status": "PAUSED", "reason": "命中断点", "step_no": number})
            while self._paused and not self._stopped:
                self._control.wait(timeout=0.2)

    def _execute(self, page: Any, step: Any, variables: dict[str, Any], elements: dict[str, Any] | list[dict[str, Any]], environment: dict[str, Any] | None = None) -> str:
        value = resolve_variables(step.value, variables)
        expected = resolve_variables(step.expected, variables)
        locator = None
        if step.element_id:
            element = elements.get(step.element_id) if isinstance(elements, dict) else next((item for item in elements if item.get("element_id") == step.element_id), None)
            if not element:
                raise RuntimeError(f"页面元素不存在：{step.element_id}")
            locator = self._resolve_locator(page, element)
        if step.action == "open":
            self._validate_url(value, environment)
            page.goto(value, wait_until="domcontentloaded", timeout=step.timeout)
            return f"已打开 {page.url}"
        if locator is None and step.action not in {"wait", "wait_url", "assert_url", "assert_title", "screenshot"}:
            raise RuntimeError("步骤未配置页面元素")
        if step.action == "click": locator.click(timeout=step.timeout)
        elif step.action == "fill": locator.fill(value, timeout=step.timeout)
        elif step.action == "clear": locator.fill("", timeout=step.timeout)
        elif step.action == "select": locator.select_option(label=value, timeout=step.timeout)
        elif step.action == "select_value": locator.select_option(value=value, timeout=step.timeout)
        elif step.action == "upload": locator.set_input_files(value, timeout=step.timeout)
        elif step.action == "wait": page.wait_for_timeout(int(value or 500))
        elif step.action == "wait_url": page.wait_for_url(f"**{value}**", timeout=step.timeout)
        elif step.action == "screenshot": page.screenshot(path=value or str(self.artifact_root / "manual.png"), full_page=True)
        elif step.action == "assert_text":
            actual = locator.inner_text(timeout=step.timeout)
            if expected not in actual: raise AssertionError(f"文本断言失败：期望包含“{expected}”，实际为“{actual[:200]}”")
        elif step.action == "assert_equals":
            actual = locator.inner_text(timeout=step.timeout)
            if actual != expected: raise AssertionError(f"文本相等断言失败：期望“{expected}”，实际为“{actual[:200]}”")
        elif step.action == "assert_value":
            actual = locator.input_value(timeout=step.timeout)
            if expected not in actual: raise AssertionError(f"输入值断言失败：期望包含“{expected}”，实际为“{actual[:200]}”")
        elif step.action == "assert_attribute":
            attribute = (value or "value").strip()
            actual = locator.get_attribute(attribute, timeout=step.timeout) or ""
            if expected not in actual: raise AssertionError(f"属性“{attribute}”断言失败：期望包含“{expected}”，实际为“{actual[:200]}”")
        elif step.action == "assert_count":
            actual = locator.count()
            want = int(expected) if str(expected).strip().isdigit() else -1
            if want < 0 or actual != want: raise AssertionError(f"元素数量断言失败：期望 {expected}，实际 {actual}")
        elif step.action == "assert_exists": locator.wait_for(state="attached", timeout=step.timeout)
        elif step.action == "assert_not_exists":
            if locator.count() > 0: raise AssertionError("断言失败：元素仍存在，期望其不存在")
        elif step.action == "assert_visible": locator.wait_for(state="visible", timeout=step.timeout)
        elif step.action == "assert_not_visible":
            if locator.is_visible(): raise AssertionError("断言失败：元素仍然可见")
        elif step.action == "assert_enabled":
            if not locator.is_enabled(): raise AssertionError("元素当前不可用")
        elif step.action == "assert_url":
            if expected not in page.url: raise AssertionError(f"页面地址不包含“{expected}”")
        elif step.action == "assert_title":
            if expected not in page.title(): raise AssertionError(f"页面标题断言失败：期望包含“{expected}”，实际为“{page.title()}”")
        elif step.action == "hover": locator.hover(timeout=step.timeout)
        elif step.action == "press": locator.press(value, timeout=step.timeout)
        else: raise RuntimeError(f"暂不支持的动作：{step.action}")
        return "执行成功"

    @staticmethod
    def _validate_url(value: str, environment: dict[str, Any] | None = None) -> None:
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise RuntimeError("打开页面需要完整的 http/https 地址")
        allowed = (environment or {}).get("allowed_hosts") or []
        if allowed and parsed.hostname not in allowed:
            raise ActionBlocked(f"目标域名不在白名单中：{parsed.hostname}")
        if is_real_payment_url(value):
            raise ActionBlocked("检测到真实支付网关，核心门禁已阻止执行")
        if environment:
            findings = validate_environment({**environment, "base_url": value})
            blocked = [item for item in findings if item.get("severity") == "block"]
            if blocked:
                raise ActionBlocked("；".join(item["message"] for item in blocked))

    @staticmethod
    def _locator(page: Any, element: dict[str, Any]) -> Any:
        locator_type = element.get("locator_type", "css")
        value = element.get("locator_value", "")
        if locator_type == "testid":
            return page.get_by_test_id(value)
        if locator_type == "role":
            try:
                role_data = json.loads(value)
                return page.get_by_role(role_data.get("role", "button"), name=role_data.get("name"))
            except (TypeError, json.JSONDecodeError):
                return page.get_by_role(value)
        if locator_type == "label":
            return page.get_by_label(value)
        if locator_type == "placeholder":
            return page.get_by_placeholder(value)
        if locator_type == "text":
            return page.get_by_text(value)
        if locator_type == "name":
            return page.locator(f"[name={json.dumps(value)}]")
        return page.locator(value)

    def _resolve_locator(self, page: Any, element: dict[str, Any]) -> Any:
        """Return the first locator that matches at least one node, trying fallbacks in order.

        The recorder captures a preferred locator plus fallback candidates. If the primary
        locator no longer matches the page, execution degrades to the next candidate instead
        of failing immediately.
        """
        candidates: list[dict[str, str]] = [{
            "locator_type": element.get("locator_type", "css") or "css",
            "locator_value": element.get("locator_value", ""),
        }]
        for fallback in element.get("fallback_locators") or []:
            if not isinstance(fallback, dict):
                continue
            candidates.append({
                "locator_type": fallback.get("type", fallback.get("locator_type", "css")) or "css",
                "locator_value": fallback.get("value", fallback.get("locator_value", "")),
            })
        primary = None
        original = candidates[0] if candidates else {}
        for index, candidate in enumerate(candidates):
            if not candidate.get("locator_value"):
                continue
            try:
                locator = self._locator(page, candidate)
            except Exception:  # noqa: BLE001 - a malformed candidate is skipped in favour of the next.
                continue
            if primary is None:
                primary = locator
            try:
                if locator.count() > 0:
                    self._last_locator_resolution = {
                        "original": {"type": original.get("locator_type", ""), "value": original.get("locator_value", "")},
                        "resolved": {"type": candidate.get("locator_type", ""), "value": candidate.get("locator_value", "")},
                        "used_fallback": index > 0,
                        "candidate_index": index,
                    }
                    return locator
            except Exception:  # noqa: BLE001 - an unresolved candidate is skipped in favour of the next.
                continue
        if primary is not None:
            # 主定位器与全部备用定位器都没命中。先试 AI 兜底（让模型重新认元素），
            # 成功就直接用新定位器继续执行；失败则保持原语义返回 primary（让动作去超时报错）。
            healed = self._try_ai_heal(page, element)
            if healed is not None:
                return healed
            return primary
        healed = self._try_ai_heal(page, element)
        if healed is not None:
            return healed
        raise RuntimeError(f"页面元素缺少有效定位器：{element.get('name') or element.get('element_id', '')}")

    def _try_ai_heal(self, page: Any, element: dict[str, Any]) -> Any:
        """AI 兜底定位：所有原定位器失效时，由模型在页面候选元素里重新找到目标。

        返回可用的 locator；配置缺失、模型判断失败或定位器验证不通过都返回 None，
        不会改变调用方原有的失败语义。
        """
        try:
            from ..ai_locator_heal import ai_config_ready, heal_locator_with_ai, normalize_ai_config

            config = normalize_ai_config(self.ai_config)
            if not ai_config_ready(config):
                return None
            result = heal_locator_with_ai(page, element, config)
            if not result:
                return None
            locator = self._locator(page, {
                "locator_type": result["locator_type"],
                "locator_value": result["locator_value"],
            })
        except Exception:  # noqa: BLE001 - 自愈失败绝不影响原有执行链路
            return None
        self._last_locator_resolution = {
            "original": {
                "type": element.get("locator_type", ""),
                "value": element.get("locator_value", ""),
            },
            "resolved": {
                "type": result["locator_type"],
                "value": result["locator_value"],
            },
            "used_fallback": False,
            "candidate_index": -1,
            "ai_healed": True,
            "ai_confidence": result["confidence"],
            "ai_reason": result["reason"],
            "ai_matched": result["matched"],
        }
        self.event("ai_heal", {
            "element_id": element.get("element_id", ""),
            "name": element.get("name", ""),
            "locator": dict(self._last_locator_resolution["resolved"]),
            "confidence": result["confidence"],
            "reason": result["reason"],
        })
        return locator

    def _result(self, step: Any, number: int, status: str, message: str, screenshot: str = "", started: float | None = None, error: str = "") -> dict[str, Any]:
        duration = int((time.perf_counter() - started) * 1000) if started is not None else 0
        ended_at = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
        started_at = datetime.fromtimestamp(time.time() - duration / 1000, timezone.utc).astimezone().isoformat(timespec="seconds")
        return {"step_id": step.id, "step_no": number, "name": step.name, "action": step.action, "action_label": ACTION_LABELS.get(step.action, step.action), "status": status, "started_at": started_at, "ended_at": ended_at, "duration_ms": duration, "message": message, "error_message": error, "screenshot_path": screenshot, "log_path": "", "page_url": "", "page_title": "", "action_spec": step.to_dict()}
