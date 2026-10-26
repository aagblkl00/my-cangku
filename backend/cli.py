"""命令行入口：不经 GUI 直接运行自动化流程或回归计划。

用法示例:

    .venv\\Scripts\\python.exe -m backend.cli list
    .venv\\Scripts\\python.exe -m backend.cli run --flow <flow_id> [--env <env_id>] [--headless] [--from 1] [--to 5]
    .venv\\Scripts\\python.exe -m backend.cli run --name 登录 --project <project_id>
    .venv\\Scripts\\python.exe -m backend.cli regression --plan <plan_id> [--headless]

通用选项:
    --data-dir <dir>   数据目录（默认与桌面应用一致；开发模式可用 --data-dir data 指向旧库）
    --browser chromium|firefox|webkit
    --headless         无头运行（适合 CI / 定时任务）

退出码: 0=PASS，1=FAIL/BLOCKED/STOPPED，2=参数错误或找不到流程/计划。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from typing import Any

from .automation.playwright_executor import PlaywrightExecutor
from .report import write_html_report, write_regression_report
from .runtime_config import ApplicationConfig
from .store import StudioStore, now_iso


def _load_config(data_dir: str | None) -> ApplicationConfig:
    if data_dir:
        os.environ["AUTOMATION_STUDIO_DATA_DIR"] = data_dir.strip()
    elif not getattr(sys, "frozen", False):
        # 未指定 data-dir 时，与桌面打包版保持一致（%LOCALAPPDATA%\\AutomationStudio），
        # 这样命令行和桌面应用读写的是同一个 studio.db。
        local = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
        os.environ.setdefault("AUTOMATION_STUDIO_MODE", "production")
        os.environ.setdefault("AUTOMATION_STUDIO_DATA_DIR", str(local / "AutomationStudio"))
    config = ApplicationConfig.load()
    config.ensure_directories()
    return config


def _build_flow_context(store: StudioStore, flow: dict[str, Any]) -> dict[str, Any]:
    flow = dict(flow)
    flow["elements"] = {item["element_id"]: item for item in store.list_elements(flow["project_id"])}
    flow["project_variables"] = store.get_project_variables(flow["project_id"])
    return flow


def _resolve_flow(store: StudioStore, flow_id: str | None, name: str | None, project_id: str | None) -> dict[str, Any]:
    if flow_id:
        flow = store.get_flow(flow_id)
        if not flow:
            raise SystemExit(f"流程不存在：{flow_id}")
        return flow
    candidates: list[dict[str, Any]] = []
    for project in store.list_projects():
        if project_id and project["id"] != project_id:
            continue
        for flow in store.list_flows(project["id"]):
            if not name or name in flow["name"]:
                candidates.append(flow)
    if not candidates:
        raise SystemExit("未找到匹配流程")
    if len(candidates) > 1:
        raise SystemExit("匹配到多个流程：" + "、".join(item["name"] for item in candidates))
    return candidates[0]


def _resolve_environment(store: StudioStore, flow: dict[str, Any], env_id: str | None) -> dict[str, Any]:
    environments = store.list_environments(flow["project_id"])
    if env_id:
        env = next((item for item in environments if item["id"] == env_id), None)
        if not env:
            raise SystemExit(f"环境不存在：{env_id}")
        return env
    if flow.get("environment_id"):
        env = next((item for item in environments if item["id"] == flow["environment_id"]), None)
        if env:
            return env
    return environments[0] if environments else {}


def _persist_run_result(store: StudioStore, config: ApplicationConfig, flow: dict[str, Any],
                        environment: dict[str, Any], run: dict[str, Any], status: str,
                        step_results: list[dict[str, Any]], trace_path: str) -> str:
    run_id = run["run_id"]
    persisted = {item.get("step_id") for item in store.list_run_steps(run_id)}
    for result in step_results:
        if result.get("step_id") in persisted:
            continue
        run_step_id = store.add_run_step(run_id, result)
        if result.get("step_id"):
            source = next((item for item in flow.get("steps", []) if item.get("id") == result["step_id"]), None)
            if source and source.get("element_id"):
                store.increment_element_usage(source["element_id"])
        if result.get("screenshot_path"):
            store.add_artifact(run_id, "screenshot", result["screenshot_path"], run_step_id)
        if result.get("log_path"):
            store.add_artifact(run_id, "log", result["log_path"], run_step_id)
    report_run = {"run_id": run_id, "flow_name": flow["name"], "browser": run["browser"],
                  "environment": environment.get("name", ""), "base_url": environment.get("base_url", ""),
                  "started_at": run.get("started_at", ""), "ended_at": now_iso(), "trace_path": trace_path}
    report_path = write_html_report(report_run, step_results, config.runs_dir / run_id / "report.html")
    store.add_artifact(run_id, "trace", trace_path)
    store.add_artifact(run_id, "report", str(report_path))
    store.finish_run(run_id, status, str(report_path), trace_path)
    return str(report_path)




def _ai_heal_config_from_env() -> dict[str, str]:
    """AI 定位器自愈配置：与 app.py 使用同一组环境变量，未配置时为空（等于关闭自愈）。"""
    return {
        "base_url": os.getenv("LODESTAR_AI_BASE_URL", "").strip(),
        "api_key": (os.getenv("LODESTAR_AI_KEY", "") or os.getenv("LODESTAR_AI_API_KEY", "")).strip(),
        "model": os.getenv("LODESTAR_AI_MODEL", "").strip(),
    }

def _execute_flow(store: StudioStore, config: ApplicationConfig, flow: dict[str, Any],
                  environment: dict[str, Any], browser: str, from_step: int, to_step: int | None,
                  breakpoints: list[int], headless: bool) -> tuple[str, str, str, str]:
    run = store.create_run(flow["flow_id"], environment.get("id"), browser)
    run_id = run["run_id"]
    environment = dict(environment)
    environment["browser"] = browser
    environment["headless"] = headless
    flow = _build_flow_context(store, flow)
    executor = PlaywrightExecutor(config.runs_dir, ai_config=_ai_heal_config_from_env())
    executor.configure(from_step, to_step, breakpoints)
    try:
        status, step_results, trace_path = executor.run(flow, environment, run_id)
        report_path = _persist_run_result(store, config, flow, environment, run, status, step_results, trace_path)
        error_message = ""
        if status != "PASS":
            failed = [item for item in store.list_run_steps(run_id) if item.get("status") == "FAIL"]
            error_message = next((item.get("error_message") or item.get("message") for item in failed), "执行失败")
    except Exception as exc:  # noqa: BLE001 - CLI reports the error and returns a failing exit code.
        error = str(exc)
        report_path = write_html_report(
            {"run_id": run_id, "flow_name": flow.get("name", "自动化流程"), "browser": browser,
             "environment": environment.get("name", ""), "base_url": environment.get("base_url", ""),
             "started_at": run.get("started_at", ""), "ended_at": now_iso(), "error": error},
            [{"step_no": "", "name": "执行器", "action_label": "执行失败", "status": "FAIL", "error_message": error}],
            config.runs_dir / run_id / "report.html")
        store.finish_run(run_id, "FAIL", str(report_path), "", error)
        status = "FAIL"
        error_message = error
    return status, str(report_path), run_id, error_message


def cmd_list(store: StudioStore) -> int:
    print("项目列表：")
    for project in store.list_projects():
        flows = store.list_flows(project["id"])
        envs = store.list_environments(project["id"])
        print(f"  - {project['name']}  (id={project['id']}, 流程 {len(flows)} 个, 环境 {len(envs)} 个)")
        for flow in flows:
            steps = len(store.get_flow(flow["flow_id"]).get("steps", []))
            print(f"      · {flow['name']}  (flow_id={flow['flow_id']}, {steps} 步)")
    return 0


def cmd_run(store: StudioStore, config: ApplicationConfig, args: argparse.Namespace) -> int:
    flow = _resolve_flow(store, args.flow, args.name, args.project)
    environment = _resolve_environment(store, flow, args.env)
    browser = args.browser or environment.get("browser", "chromium")
    breakpoints = [int(item) for item in (args.breakpoints or [])]
    print(f"执行流程：{flow['name']} (flow_id={flow['flow_id']})")
    print(f"环境：{environment.get('name', '未配置')} · 浏览器：{browser} · 无头：{'是' if args.headless else '否'}")
    status, report_path, _run_id, error_message = _execute_flow(store, config, flow, environment, browser,
                                                                args.from_step, args.to_step, breakpoints, args.headless)
    print(f"结果：{status} · 报告：{report_path}")
    if status != "PASS" and error_message:
        print(f"失败原因：{error_message}")
    return 0 if status == "PASS" else 1


def _run_regression(store: StudioStore, config: ApplicationConfig, plan: dict[str, Any],
                    browser: str | None, headless: bool) -> tuple[str, str]:
    environment = next((item for item in store.list_environments(plan["project_id"]) if item["id"] == plan.get("environment_id")), {})
    browser = browser or plan.get("browser", "chromium")
    regression_run = store.create_regression_run(plan)
    regression_id = regression_run["regression_run_id"]
    counts = {"PASS": 0, "FAIL": 0, "SKIP": 0, "BLOCKED": 0}
    cases_for_report: list[dict[str, Any]] = []
    stop_on_failure = plan.get("stop_on_failure")
    for order, case in enumerate(plan.get("cases", [])):
        case_id = case["case_id"]
        title = case.get("title", "")
        if not case.get("enabled", 1):
            counts["SKIP"] += 1
            store.add_regression_case(regression_id, case_id, None, order, "SKIP", "用例已禁用")
            cases_for_report.append({"case_id": case_id, "title": title, "status": "SKIP"})
            continue
        flow = store.get_flow(case.get("automation_flow_id"))
        if not flow:
            counts["BLOCKED"] += 1
            store.add_regression_case(regression_id, case_id, None, order, "BLOCKED", "绑定的自动化流程不存在")
            cases_for_report.append({"case_id": case_id, "title": title, "status": "BLOCKED", "error_message": "绑定的自动化流程不存在"})
            continue
        status, report_path, run_id, error_message = _execute_flow(store, config, flow, environment, browser, 1, None, [], headless)
        counts[status] = counts.get(status, 0) + 1
        store.add_regression_case(regression_id, case_id, run_id, order, status, error_message)
        cases_for_report.append({"case_id": case_id, "title": title, "status": status, "run_id": run_id, "report_path": report_path, "error_message": error_message})
        print(f"  [{status}] {case_id} {title}")
        if status != "PASS" and stop_on_failure:
            for rest_order, rest in enumerate(plan.get("cases", [])[order + 1:], order + 1):
                if rest.get("enabled", 1):
                    counts["SKIP"] += 1
                    store.add_regression_case(regression_id, rest["case_id"], None, rest_order, "SKIP", "前置用例失败，计划设置为失败即停止")
                    cases_for_report.append({"case_id": rest["case_id"], "title": rest.get("title", ""), "status": "SKIP", "error_message": "前置用例失败，计划设置为失败即停止"})
            break
    overall = "FAIL" if counts["FAIL"] or counts["BLOCKED"] else "PASS"
    report_path = write_regression_report(
        {"regression_run_id": regression_id, "plan_name": plan["name"], "environment": environment.get("name", ""),
         "browser": browser, "started_at": regression_run.get("started_at", ""), "ended_at": now_iso()},
        cases_for_report, config.runs_dir / regression_id / "report.html")
    store.finish_regression_run(regression_id, overall, counts, str(report_path))
    return overall, str(report_path)


def cmd_regression(store: StudioStore, config: ApplicationConfig, args: argparse.Namespace) -> int:
    plan = store.get_regression_plan(args.plan)
    if not plan:
        raise SystemExit(f"回归计划不存在：{args.plan}")
    if not plan["cases"]:
        raise SystemExit("回归计划没有可执行的自动化用例")
    print(f"执行回归：{plan['name']} (plan_id={plan['regression_plan_id']}, 用例 {len(plan['cases'])} 个)")
    overall, report_path = _run_regression(store, config, plan, args.browser, args.headless)
    print(f"结果：{overall} · 报告：{report_path}")
    return 0 if overall == "PASS" else 1


def cmd_project_run(store: StudioStore, config: ApplicationConfig, args: argparse.Namespace) -> int:
    project = store.get_project(args.project)
    if not project:
        print(f"项目不存在：{args.project}")
        return 2
    cases = store.list_test_cases(args.project)
    selected = [item for item in cases if item.get("automation_flow_id")]
    blocked = [item for item in cases if not item.get("automation_flow_id")]
    if not selected:
        print("当前项目没有已编译的可执行用例")
        return 2

    suite = ET.Element("testsuite", {
        "name": project.get("name") or args.project,
        "tests": str(len(cases)),
        "timestamp": datetime.now().astimezone().isoformat(timespec="seconds"),
    })
    summary: dict[str, Any] = {"project_id": args.project, "project_name": project.get("name", ""), "passed": 0, "failed": 0, "blocked": len(blocked), "results": []}
    for case in selected:
        flow = store.get_flow(case["automation_flow_id"])
        node = ET.SubElement(suite, "testcase", {"classname": case.get("module") or "Lodestar", "name": case.get("title") or case["case_id"]})
        if not flow:
            message = "关联的执行包不存在"
            ET.SubElement(node, "failure", {"message": message}).text = message
            summary["failed"] += 1
            summary["results"].append({"case_id": case["case_id"], "status": "FAIL", "message": message})
            continue
        environment = _resolve_environment(store, flow, args.env)
        if not environment:
            message = "没有可用执行环境"
            ET.SubElement(node, "skipped", {"message": message})
            summary["blocked"] += 1
            summary["results"].append({"case_id": case["case_id"], "status": "BLOCKED", "message": message})
            continue
        browser = args.browser or environment.get("browser", "chromium")
        status, report_path, run_id, error = _execute_flow(store, config, flow, environment, browser, 1, None, [], args.headless)
        summary["results"].append({"case_id": case["case_id"], "status": status, "run_id": run_id, "report_path": report_path, "message": error})
        if status == "PASS":
            summary["passed"] += 1
        else:
            summary["failed"] += 1
            ET.SubElement(node, "failure", {"message": error or "执行失败"}).text = error or "执行失败"
    for case in blocked:
        node = ET.SubElement(suite, "testcase", {"classname": case.get("module") or "Lodestar", "name": case.get("title") or case["case_id"]})
        ET.SubElement(node, "skipped", {"message": "用例尚未编译为执行包"})
        summary["results"].append({"case_id": case["case_id"], "status": "BLOCKED", "message": "用例尚未编译为执行包"})

    suite.set("failures", str(summary["failed"]))
    suite.set("skipped", str(summary["blocked"]))
    output = Path(args.junit).expanduser().resolve() if args.junit else config.runs_dir / f"ci-{datetime.now().strftime('%Y%m%d-%H%M%S')}" / "junit.xml"
    output.parent.mkdir(parents=True, exist_ok=True)
    ET.ElementTree(suite).write(output, encoding="utf-8", xml_declaration=True)
    json_path = output.with_suffix(".json")
    json_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"项目：{project.get('name')} · 通过 {summary['passed']} · 失败 {summary['failed']} · 阻塞 {summary['blocked']}")
    print(f"JUnit：{output}")
    print(f"JSON：{json_path}")
    if summary["failed"]:
        return 1
    if summary["blocked"]:
        return 2
    return 0


def _ai_config_from_env() -> tuple[str, str, str]:
    return (
        os.getenv("AI_BASE_URL", "").strip(),
        os.getenv("AI_API_KEY", "").strip(),
        os.getenv("AI_MODEL", "").strip(),
    )


def _resolve_case(store: StudioStore, case_id: str | None, name: str | None) -> dict[str, Any]:
    if case_id:
        case = store.get_test_case(case_id)
        if not case:
            raise SystemExit(f"用例不存在：{case_id}")
        return case
    candidates: list[dict[str, Any]] = []
    for project in store.list_projects():
        for case in store.list_test_cases(project["id"]):
            if name and name in (case.get("title") or ""):
                candidates.append(case)
    if not candidates:
        raise SystemExit("未找到匹配用例")
    if len(candidates) > 1:
        raise SystemExit("匹配到多个用例：" + "、".join(item.get("title", "") for item in candidates))
    return candidates[0]


_NO_LOCATOR_ACTIONS = {"open", "wait", "assert_url", "assert_title"}


def cmd_ai_generate(store: StudioStore, config: ApplicationConfig, args: argparse.Namespace) -> int:
    from .ai_client import generate_flow_steps, build_flow_payload

    base_url, api_key, model = _ai_config_from_env()
    if not (base_url and api_key and model):
        print("[提示] 请先设置环境变量 AI_BASE_URL / AI_API_KEY / AI_MODEL")
        return 2
    case = _resolve_case(store, args.case, args.name)
    environments = store.list_environments(case["project_id"])
    environment = next((item for item in environments if item["id"] == args.env), environments[0] if environments else {})
    start_url = args.url or environment.get("base_url", "")
    print(f"用例：{case.get('title', '')} ({case.get('case_id', '')})")
    print(f"环境：{environment.get('name', '未配置')} · base_url={start_url or '(空)'} · 模型={model}")
    steps = generate_flow_steps(base_url, api_key, model, case, start_url)
    if args.dry_run:
        print(json.dumps(steps, ensure_ascii=False, indent=2))
        return 0

    payload = build_flow_payload(case, steps, start_url, environment.get("id"))
    for element in payload.pop("elements", []):
        store.upsert_element(element)
    flow = store.save_flow(payload)
    print(f"[OK] 已生成流程草稿：{flow['name']} (flow_id={flow['flow_id']})，共 {len(flow.get('steps', []))} 步")
    for index, step in enumerate(flow.get("steps", []), 1):
        where = step["element_id"] or "—"
        print(f"  {index}. [{step['action']}] {step['name']}  元素={where}")
    print("提示：该流程是草稿，请到界面里逐条审核定位器后再执行。")
    return 0


def cmd_agent_run(store: StudioStore, config: ApplicationConfig, args: argparse.Namespace) -> int:
    from .agent import run_case_agent
    base_url, api_key, model = _ai_config_from_env()
    if not (base_url and api_key and model):
        print("[提示] 请先设置环境变量 AI_BASE_URL / AI_API_KEY / AI_MODEL")
        return 2
    case = _resolve_case(store, args.case, args.name)
    environments = store.list_environments(case["project_id"])
    environment = next((item for item in environments if item["id"] == args.env), environments[0] if environments else {})
    base = args.url or environment.get("base_url", "")
    variables = environment.get("variables") or {}
    print(f"用例：{case.get('title', '')} ({case.get('case_id', '')})")
    print(f"环境：{environment.get('name', '未配置')} · base_url={base or '(空)'}")
    print("开始执行（会打开浏览器，你可以看着它点）…")
    result = run_case_agent({"base_url": base_url, "api_key": api_key, "model": model}, case, base, variables, headed=not args.headless)
    print(f"\n结果：{result['status']} · {result['reason']}")
    for line in result.get("steps", []):
        print("   ", line)
    return 0 if result["status"] == "PASS" else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="lodestar", description="Lodestar 命令行入口")
    parser.add_argument("--data-dir", help="数据目录（含 studio.db；默认与桌面应用一致）")
    sub = parser.add_subparsers(dest="command", required=True)

    p_list = sub.add_parser("list", help="列出项目、流程与环境")

    p_run = sub.add_parser("run", help="运行单个自动化流程")
    p_run.add_argument("--flow", help="流程 flow_id")
    p_run.add_argument("--name", help="按流程名称（子串）匹配")
    p_run.add_argument("--project", help="按名称匹配时限定项目 id")
    p_run.add_argument("--env", help="环境 id（默认用流程绑定环境）")
    p_run.add_argument("--browser", choices=["chromium", "firefox", "webkit"], help="浏览器（默认用环境配置）")
    p_run.add_argument("--from-step", dest="from_step", type=int, default=1, help="起始步骤（1 起）")
    p_run.add_argument("--to-step", dest="to_step", type=int, default=None, help="结束步骤（含）")
    p_run.add_argument("--breakpoints", nargs="*", type=int, default=[], help="断点步骤号")
    p_run.add_argument("--headless", action="store_true", help="无头运行（CI/定时推荐）")

    p_reg = sub.add_parser("regression", help="运行回归计划")
    p_reg.add_argument("--plan", required=True, help="回归计划 regression_plan_id")
    p_reg.add_argument("--browser", choices=["chromium", "firefox", "webkit"], help="浏览器")
    p_reg.add_argument("--headless", action="store_true", help="无头运行")

    p_project = sub.add_parser("project-run", help="执行项目内所有已编译用例并生成 CI 报告")
    p_project.add_argument("--project", required=True, help="项目 id")
    p_project.add_argument("--env", help="环境 id（默认使用执行包绑定环境）")
    p_project.add_argument("--browser", choices=["chromium", "firefox", "webkit"], help="覆盖浏览器")
    p_project.add_argument("--headless", action="store_true", help="无头运行")
    p_project.add_argument("--junit", help="JUnit XML 输出路径")

    p_ai = sub.add_parser("ai-generate", help="把一条测试用例用AI翻译成可执行流程草稿")
    p_ai.add_argument("--case", help="用例 case_id")
    p_ai.add_argument("--name", help="按用例标题(子串)匹配")
    p_ai.add_argument("--env", help="环境 id（默认用例所属项目的第一个环境）")
    p_ai.add_argument("--url", help="起始地址（覆盖环境 base_url）")
    p_ai.add_argument("--dry-run", action="store_true", help="只打印AI返回的步骤，不保存流程")

    p_agent = sub.add_parser("agent-run", help="用例驱动的浏览器AI代理执行(pilot)")
    p_agent.add_argument("--case", help="用例 case_id")
    p_agent.add_argument("--name", help="按用例标题(子串)匹配")
    p_agent.add_argument("--env", help="环境 id")
    p_agent.add_argument("--url", help="起始地址（覆盖环境 base_url）")
    p_agent.add_argument("--headless", action="store_true", help="无头运行（不显示浏览器）")

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    config = _load_config(args.data_dir)
    store = StudioStore(config.database_path)
    print(f"数据目录：{config.data_dir}")
    print(f"数据库：{store.path}")
    if args.command == "list":
        return cmd_list(store)
    if args.command == "run":
        return cmd_run(store, config, args)
    if args.command == "regression":
        return cmd_regression(store, config, args)
    if args.command == "project-run":
        return cmd_project_run(store, config, args)
    if args.command == "ai-generate":
        return cmd_ai_generate(store, config, args)
    if args.command == "agent-run":
        return cmd_agent_run(store, config, args)
    raise SystemExit("未知命令")


if __name__ == "__main__":
    raise SystemExit(main())
