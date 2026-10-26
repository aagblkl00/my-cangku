from __future__ import annotations

import os
import socket
import sys
from dataclasses import dataclass
from pathlib import Path


def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _local_app_data() -> Path:
    value = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA")
    return Path(value) if value else Path.home() / "AppData" / "Local"


@dataclass(frozen=True)
class ApplicationConfig:
    app_name: str
    version: str
    production: bool
    program_dir: Path
    data_dir: Path
    database_path: Path
    runs_dir: Path
    reports_dir: Path
    screenshots_dir: Path
    logs_dir: Path
    traces_dir: Path
    downloads_dir: Path
    frontend_dist: Path
    backend_host: str
    backend_port: int
    default_browser: str
    playwright_browser_dir: Path

    @classmethod
    def load(cls) -> "ApplicationConfig":
        production = os.environ.get("AUTOMATION_STUDIO_MODE", "").lower() in {"production", "prod"} or getattr(sys, "frozen", False)
        program_dir = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else _project_root()
        resource_dir = Path(getattr(sys, "_MEIPASS", program_dir))
        configured_data = os.environ.get("AUTOMATION_STUDIO_DATA_DIR", "").strip()
        data_dir = Path(configured_data).expanduser() if configured_data else (Path(r"D:\Lodestar\data") if production else program_dir)
        port = int(os.environ.get("AUTOMATION_STUDIO_PORT", "8765"))
        configured_browser = os.environ.get("PLAYWRIGHT_BROWSERS_PATH", "").strip()
        browser_dir = Path(configured_browser).expanduser() if configured_browser else data_dir / "browsers"
        if production:
            os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", str(browser_dir))
        return cls("Lodestar", os.environ.get("AUTOMATION_STUDIO_VERSION", "1.0.0"), production, program_dir, data_dir,
                    data_dir / "studio.db", data_dir / "runs", data_dir / "reports", data_dir / "screenshots",
                    data_dir / "logs", data_dir / "traces", data_dir / "downloads", resource_dir / "frontend" / "dist",
                    os.environ.get("AUTOMATION_STUDIO_HOST", "127.0.0.1"), port,
                    os.environ.get("AUTOMATION_STUDIO_BROWSER", "chromium"), browser_dir)

    def ensure_directories(self) -> None:
        for directory in (self.data_dir, self.runs_dir, self.reports_dir, self.screenshots_dir, self.logs_dir, self.traces_dir, self.downloads_dir, self.playwright_browser_dir):
            directory.mkdir(parents=True, exist_ok=True)

    def public(self) -> dict[str, str | int | bool]:
        return {"app_name": self.app_name, "version": self.version, "production": self.production,
                "backend_host": self.backend_host, "backend_port": self.backend_port, "default_browser": self.default_browser}


def find_free_port(host: str, preferred: int) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind((host, preferred))
            return preferred
        except OSError:
            probe.bind((host, 0))
            return int(probe.getsockname()[1])
