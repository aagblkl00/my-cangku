from __future__ import annotations

import html
import json
from pathlib import Path
from typing import Any


def write_html_report(run: dict[str, Any], steps: list[dict[str, Any]], output: Path) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    passed = sum(item.get("status") == "PASS" for item in steps)
    failed = sum(item.get("status") == "FAIL" for item in steps)
    skipped = sum(item.get("status") == "SKIP" for item in steps)
    blocked = sum(item.get("status") == "BLOCKED" for item in steps)
    total = len(steps)
    rate = f"{passed / total * 100:.1f}%" if total else "0.0%"
    def artifact_href(raw: Any) -> str:
        if not raw:
            return ""
        path = Path(str(raw))
        try:
            return path.relative_to(output.parent).as_posix()
        except ValueError:
            return path.resolve().as_uri()

    rows = []
    for item in steps:
        evidence_parts = []
        if item.get("screenshot_path"):
            evidence_parts.append(f'<a href="{html.escape(artifact_href(item["screenshot_path"]))}">截图</a>')
        if item.get("log_path"):
            evidence_parts.append(f'<a href="{html.escape(artifact_href(item["log_path"]))}">日志</a>')
        if item.get("dom_snapshot_path"):
            evidence_parts.append(f'<a href="{html.escape(artifact_href(item["dom_snapshot_path"]))}">DOM</a>')
        if item.get("console_summary"):
            evidence_parts.append("Console")
        if item.get("network_summary"):
            evidence_parts.append("Network")
        evidence = " · ".join(evidence_parts) or "-"
        details = html.escape(item.get("error_message") or item.get("message", ""))
        if item.get("page_url"):
            details += f"<br><span class='muted'>{html.escape(item['page_url'])}</span>"
        diagnostic = ""
        if item.get("console_summary") or item.get("network_summary"):
            diagnostic = f"<details><summary>运行诊断</summary><pre>{html.escape(item.get('console_summary', '') or '无 Console 消息')}\n{html.escape(item.get('network_summary', '') or '无失败 Network 请求')}</pre></details>"
        rows.append(f"<tr><td>{item.get('step_no','')}</td><td>{html.escape(item.get('name',''))}</td><td>{html.escape(item.get('action_label', item.get('action','')))}</td><td class='{html.escape(item.get('status',''))}'>{html.escape(item.get('status',''))}</td><td>{item.get('duration_ms',0)} ms</td><td>{details}{diagnostic}</td><td>{evidence}</td></tr>")
    document = f"""<!doctype html>
<html lang='zh-CN'><head><meta charset='utf-8'><title>{html.escape(run.get('flow_name','自动化流程'))} - 测试报告</title>
<style>body{{font-family:Segoe UI,'Microsoft YaHei',sans-serif;background:#10141b;color:#e8edf2;margin:0}}header{{padding:28px 40px;border-bottom:1px solid #2b3442;background:#151b24}}main{{padding:28px 40px}}h1{{margin:0 0 8px;font-size:24px}}.muted{{color:#9ba8b6}}.metrics{{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin:20px 0}}.metric{{background:#19212d;border:1px solid #2b3442;padding:14px;border-radius:8px}}.metric b{{display:block;font-size:22px;margin-top:6px}}table{{width:100%;border-collapse:collapse;background:#151b24}}th,td{{padding:12px;border-bottom:1px solid #2b3442;text-align:left;vertical-align:top}}th{{color:#9ba8b6;font-weight:500}}.PASS{{color:#5ee6a8}}.FAIL{{color:#ff7d8a}}.SKIP{{color:#f5c96a}}.BLOCKED{{color:#b9a6ff}}a{{color:#7db7ff}}</style></head>
<body><header><h1>{html.escape(run.get('flow_name','自动化流程'))}</h1><div class='muted'>执行编号：{html.escape(run.get('run_id',''))} · 浏览器：{html.escape(run.get('browser',''))} · 环境：{html.escape(run.get('environment',''))}</div></header>
<main><div class='metrics'><div class='metric'>总步骤<b>{total}</b></div><div class='metric'>通过<b class='PASS'>{passed}</b></div><div class='metric'>失败<b class='FAIL'>{failed}</b></div><div class='metric'>跳过<b class='SKIP'>{skipped}</b></div><div class='metric'>阻塞<b class='BLOCKED'>{blocked}</b></div><div class='metric'>成功率<b>{rate}</b></div></div>
<p class='muted'>目标地址：{html.escape(run.get('base_url',''))}　Trace：{f'<a href="{html.escape(artifact_href(run["trace_path"]))}">打开 trace.zip</a>' if run.get('trace_path') else '未生成'}</p>
<p class='muted'>开始：{html.escape(run.get('started_at',''))}　结束：{html.escape(run.get('ended_at',''))}</p><table><thead><tr><th>#</th><th>步骤</th><th>动作</th><th>状态</th><th>耗时</th><th>结果</th><th>证据</th></tr></thead><tbody>{''.join(rows)}</tbody></table></main></body></html>"""
    output.write_text(document, encoding="utf-8")
    return output


def write_regression_report(run: dict[str, Any], cases: list[dict[str, Any]], output: Path) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    counts = {status: sum(item.get("status") == status for item in cases) for status in ("PASS", "FAIL", "SKIP", "BLOCKED")}
    total = len(cases)
    rate = f"{counts['PASS'] / total * 100:.1f}%" if total else "0.0%"
    rows = []
    for item in cases:
        # Use a relative link so the report remains usable when opened by double-click.
        link = f'<a href="../{html.escape(item.get("run_id", ""))}/report.html">查看执行报告</a>' if item.get("run_id") else "-"
        rows.append(f"<tr><td>{html.escape(item.get('case_id', ''))}</td><td>{html.escape(item.get('title', ''))}</td><td class='{html.escape(item.get('status', ''))}'>{html.escape(item.get('status', ''))}</td><td>{html.escape(item.get('error_message', ''))}</td><td>{link}</td></tr>")
    document = f"""<!doctype html><html lang='zh-CN'><head><meta charset='utf-8'><title>Regression Report - {html.escape(run.get('plan_name',''))}</title>
<style>body{{font-family:Segoe UI,'Microsoft YaHei',sans-serif;background:#10141b;color:#e8edf2;margin:0}}header{{padding:28px 40px;border-bottom:1px solid #2b3442;background:#151b24}}main{{padding:28px 40px}}h1{{margin:0 0 8px;font-size:24px}}.muted{{color:#9ba8b6}}.metrics{{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin:20px 0}}.metric{{background:#19212d;border:1px solid #2b3442;padding:14px;border-radius:8px}}.metric b{{display:block;font-size:22px;margin-top:6px}}table{{width:100%;border-collapse:collapse;background:#151b24}}th,td{{padding:12px;border-bottom:1px solid #2b3442;text-align:left}}th{{color:#9ba8b6;font-weight:500}}.PASS{{color:#5ee6a8}}.FAIL{{color:#ff7d8a}}.SKIP{{color:#f5c96a}}.BLOCKED{{color:#b9a6ff}}a{{color:#7db7ff}}</style></head><body><header><h1>Regression Report</h1><div class='muted'>计划：{html.escape(run.get('plan_name',''))} · 环境：{html.escape(run.get('environment',''))} · 浏览器：{html.escape(run.get('browser',''))}</div></header><main><div class='metrics'><div class='metric'>总用例<b>{total}</b></div><div class='metric'>通过<b class='PASS'>{counts['PASS']}</b></div><div class='metric'>失败<b class='FAIL'>{counts['FAIL']}</b></div><div class='metric'>跳过<b class='SKIP'>{counts['SKIP']}</b></div><div class='metric'>阻塞<b class='BLOCKED'>{counts['BLOCKED']}</b></div><div class='metric'>成功率<b>{rate}</b></div></div><p class='muted'>开始：{html.escape(run.get('started_at',''))}　结束：{html.escape(run.get('ended_at',''))}</p><table><thead><tr><th>用例编号</th><th>用例名称</th><th>状态</th><th>错误</th><th>证据</th></tr></thead><tbody>{''.join(rows)}</tbody></table></main></body></html>"""
    output.write_text(document, encoding="utf-8")
    return output
