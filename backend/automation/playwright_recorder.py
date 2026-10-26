from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Any, Callable


RECORDER_SCRIPT = r"""
(() => {
  const previous = new WeakMap();
  const cssPath = (el) => {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let node = el;
    for (let i = 0; node && node.nodeType === 1 && node !== document.body && parts.length < 4; node = node.parentElement) {
      let part = node.tagName.toLowerCase();
      const classes = Array.from(node.classList || []).filter(Boolean).slice(0, 2);
      if (classes.length) part += '.' + classes.map(CSS.escape).join('.');
      const siblings = node.parentElement ? Array.from(node.parentElement.children).filter((x) => x.tagName === node.tagName) : [];
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      parts.unshift(part);
    }
    return parts.join(' > ');
  };
  const info = (el) => {
    const role = el.getAttribute('role') || ({BUTTON:'button', A:'link', INPUT:'textbox', TEXTAREA:'textbox', SELECT:'combobox', CHECKBOX:'checkbox', RADIO:'radio'}[el.tagName] || '');
    const label = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || (el.labels && el.labels[0] ? el.labels[0].innerText : '') || (el.innerText || '').trim().slice(0, 80);
    const candidates = [];
    if (el.dataset && el.dataset.testid) candidates.push({type:'testid', value:el.dataset.testid});
    if (role && label) candidates.push({type:'role', value:JSON.stringify({role, name:label})});
    if (el.labels && el.labels[0]) candidates.push({type:'label', value:el.labels[0].innerText.trim()});
    if (el.placeholder) candidates.push({type:'placeholder', value:el.placeholder});
    if (el.name) candidates.push({type:'name', value:el.name});
    if (el.id) candidates.push({type:'css', value:`#${CSS.escape(el.id)}`});
    candidates.push({type:'css', value:cssPath(el)});
    return {name: label || el.tagName.toLowerCase(), role, element_type:el.tagName.toLowerCase(), candidates:candidates.filter((x) => x.value)};
  };
  const send = (kind, el, extra = {}) => window.__automationStudioRecord({kind, ...info(el), page_url:location.href, page_title:document.title, ...extra});
  document.addEventListener('click', (e) => { const el = e.target.closest('button,a,[role="button"],input,select,textarea,[data-testid]'); if (el) send('click', el); }, true);
  document.addEventListener('input', (e) => { const el = e.target; if (!el || !('value' in el)) return; const value = String(el.value); const old = previous.get(el); previous.set(el, value); send(value === '' && old ? 'clear' : 'fill', el, {value: value, password:el.type === 'password'}); }, true);
  document.addEventListener('change', (e) => { const el = e.target; if (!el) return; if (el.tagName === 'SELECT') send('select', el, {value: el.value, selected_text:el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : ''}); }, true);
  document.addEventListener('mouseover', (e) => { const el = e.target.closest('[data-record-hover]'); if (el) send('hover', el); }, true);
  document.addEventListener('keydown', (e) => { const el = e.target; if (el && ['Enter','Tab','Escape'].includes(e.key)) send('press', el, {value:e.key}); }, true);
})();
"""


class PlaywrightRecorder:
    """Visible Playwright browser recorder. It intentionally records user intent, not raw DOM events."""

    def __init__(self, artifact_root: Path, event: Callable[[str, dict[str, Any]], None] | None = None) -> None:
        self.artifact_root = artifact_root
        self.event = event or (lambda _name, _payload: None)
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.recording_id = ""
        self.steps: list[dict[str, Any]] = []
        self.elements: dict[str, dict[str, Any]] = {}
        self._ready = False

    def start(self, url: str, recording_id: str) -> None:
        if self._thread and self._thread.is_alive():
            raise RuntimeError("已有录制任务正在运行")
        self.recording_id = recording_id
        self.steps = []
        self.elements = {}
        self._ready = False
        self._stop.clear()
        self._thread = threading.Thread(target=self._worker, args=(url,), daemon=True)
        self._thread.start()

    def stop(self) -> dict[str, Any]:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)
        return {"recording_id": self.recording_id, "steps": self.steps, "elements": list(self.elements.values())}

    def _worker(self, url: str) -> None:
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:
            self.event("recording_error", {"error": "尚未安装 Playwright"})
            return
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=False)
            context = browser.new_context(viewport={"width": 1440, "height": 900})
            context.add_init_script(RECORDER_SCRIPT)
            page = context.new_page()
            page.expose_binding("__automationStudioRecord", lambda source, payload: self._capture(payload))
            page.on("framenavigated", lambda frame: self._navigation(frame.url) if frame == page.main_frame else None)
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=30000)
                self._append_step({"name": "打开页面", "action": "open", "value": url, "page_url": page.url, "page_title": page.title()})
                self._ready = True
                self.event("recording_started", {"recording_id": self.recording_id, "url": page.url})
                while not self._stop.wait(0.2):
                    pass
            except Exception as exc:  # noqa: BLE001
                self.event("recording_error", {"recording_id": self.recording_id, "error": str(exc)})
            finally:
                browser.close()
                self.event("recording_finished", {"recording_id": self.recording_id, "steps": self.steps, "elements": list(self.elements.values())})

    def _navigation(self, url: str) -> None:
        if not self._ready:
            return
        if not self.steps or self.steps[-1].get("action") != "open" or self.steps[-1].get("value") != url:
            self._append_step({"name": "页面跳转", "action": "wait_url", "value": url, "page_url": url})

    def _capture(self, payload: dict[str, Any]) -> None:
        candidates = payload.get("candidates") or []
        if not candidates:
            return
        preferred = candidates[0]
        import hashlib
        element_id = "element-" + hashlib.sha1(f"{payload.get('page_url','')}|{payload.get('name','')}|{preferred.get('type')}|{preferred.get('value')}".encode()).hexdigest()[:10]
        element = {"element_id": element_id, "name": payload.get("name") or "页面元素", "page_url": payload.get("page_url", ""), "page_title": payload.get("page_title", ""), "element_type": payload.get("element_type", "element"), "role": payload.get("role", ""), "locator_type": preferred.get("type", "css"), "locator_value": preferred.get("value", ""), "fallback_locators": candidates[1:], "health_status": "未验证"}
        self.elements[element_id] = element
        action = payload.get("kind", "click")
        step = {"name": f"{self._label(action)}{element['name']}", "action": action, "element_id": element_id, "value": payload.get("value", ""), "page_url": payload.get("page_url", ""), "page_title": payload.get("page_title", "")}
        if action == "fill" and self.steps and self.steps[-1].get("action") == "fill" and self.steps[-1].get("element_id") == element_id and time.time() - self.steps[-1].get("_ts", 0) < 1.2:
            self.steps[-1]["value"] = step["value"]
            self.steps[-1]["_ts"] = time.time()
            self.event("step_updated", {"step": self._public_step(self.steps[-1])})
            return
        step["_ts"] = time.time()
        self._append_step(step)

    def _append_step(self, step: dict[str, Any]) -> None:
        step.setdefault("id", f"step-{len(self.steps)+1:03d}")
        self.steps.append(step)
        self.event("step_recorded", {"step": self._public_step(step), "element": self.elements.get(step.get("element_id", ""))})

    @staticmethod
    def _public_step(step: dict[str, Any]) -> dict[str, Any]:
        return {key: value for key, value in step.items() if not key.startswith("_")}

    @staticmethod
    def _label(action: str) -> str:
        return {"click":"点击", "fill":"输入", "clear":"清空", "select":"选择", "press":"按键", "hover":"悬停"}.get(action, action)
