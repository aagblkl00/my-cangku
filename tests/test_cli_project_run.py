from pathlib import Path

from backend.cli import build_parser, cmd_project_run
from backend.store import StudioStore


def test_project_run_parser_accepts_ci_arguments() -> None:
    args = build_parser().parse_args([
        "project-run",
        "--project",
        "project-demo",
        "--env",
        "env-test",
        "--headless",
        "--junit",
        r"D:\测试报告\Lodestar_CI_JUnit.xml",
    ])

    assert args.command == "project-run"
    assert args.project == "project-demo"
    assert args.env == "env-test"
    assert args.headless is True


def test_project_run_returns_configuration_error_for_unknown_project(tmp_path: Path) -> None:
    store = StudioStore(tmp_path / "studio.db")
    args = build_parser().parse_args(["project-run", "--project", "missing"])

    assert cmd_project_run(store, None, args) == 2
