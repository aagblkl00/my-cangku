"""Desktop entry point for the packaged Lodestar application."""
from __future__ import annotations

import json
import atexit
import logging
import os
import subprocess
import sys
from pathlib import Path

# Windowed PyInstaller builds do not provide Python stream objects. Uvicorn's
# logging setup still expects them, so provide harmless sinks before import.
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")

import uvicorn

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    from .runtime_config import ApplicationConfig, find_free_port
except ImportError:  # PyInstaller executes the entry script as __main__.
    from backend.runtime_config import ApplicationConfig, find_free_port


def _program_dir() -> Path:
    return Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parents[1]


def _run_server() -> int:
    try:
        from .app import app
    except ImportError:
        from backend.app import app
    config = ApplicationConfig.load()
    uvicorn.run(app, host="127.0.0.1", port=config.backend_port, log_level="info", access_log=False)
    return 0


def main() -> int:
    cli_commands = {"list", "run", "regression", "project-run", "ai-generate", "agent-run"}
    if cli_commands.intersection(sys.argv[1:]):
        try:
            from .cli import main as cli_main
        except ImportError:
            from backend.cli import main as cli_main
        return cli_main(sys.argv[1:])
    if "--install-browser" in sys.argv:
        from playwright.__main__ import main as playwright_main
        sys.argv = ["playwright", "install", "chromium"]
        playwright_main()
        return 0
    if "--server" in sys.argv:
        return _run_server()

    program_dir = _program_dir()
    app_data = Path(os.environ.get("AUTOMATION_STUDIO_DATA_DIR") or r"D:\Lodestar\data")
    os.environ.setdefault("AUTOMATION_STUDIO_MODE", "production")
    os.environ.setdefault("AUTOMATION_STUDIO_DATA_DIR", str(app_data))
    os.environ.setdefault("AUTOMATION_STUDIO_HOST", "127.0.0.1")
    port = find_free_port("127.0.0.1", int(os.environ.get("AUTOMATION_STUDIO_PORT", "8765")))
    os.environ["AUTOMATION_STUDIO_PORT"] = str(port)
    config = ApplicationConfig.load()
    config.ensure_directories()
    logging.basicConfig(filename=config.logs_dir / "app.log", level=logging.INFO, encoding="utf-8", format="%(asctime)s %(levelname)s %(message)s")
    if not config.frontend_dist.exists():
        logging.error("frontend dist not found: %s", config.frontend_dist)
        return 2
    os.environ["AUTOMATION_STUDIO_RUNTIME_FILE"] = str(config.data_dir / "runtime.json")
    (config.data_dir / "runtime.json").write_text(json.dumps({"port": port, "version": config.version}, ensure_ascii=False, indent=2), encoding="utf-8")

    backend_log = (config.logs_dir / "backend.log").open("a", encoding="utf-8")
    if getattr(sys, "frozen", False):
        command = [sys.executable, "--server"]
    else:
        command = [sys.executable, "-m", "backend.launcher", "--server"]
    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    child = subprocess.Popen(command, cwd=str(program_dir), env=os.environ.copy(), stdout=backend_log, stderr=backend_log, creationflags=creationflags)
    def cleanup_child() -> None:
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                child.kill()
    atexit.register(cleanup_child)
    logging.info("Lodestar local service started on http://127.0.0.1:%s (API only)", port)
    try:
        return_code = child.wait()
    except KeyboardInterrupt:
        logging.info("stopping local service")
        cleanup_child()
        return_code = 0
    finally:
        backend_log.close()
    return return_code


if __name__ == "__main__":
    raise SystemExit(main())
