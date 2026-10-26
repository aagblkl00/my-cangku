from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class ArtifactStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def run_dir(self, run_id: str) -> Path:
        path = self.root / run_id
        for name in ("screenshots", "logs", "trace"):
            (path / name).mkdir(parents=True, exist_ok=True)
        return path

    def write_metadata(self, run_id: str, payload: dict[str, Any]) -> Path:
        path = self.run_dir(run_id) / "metadata.json"
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return path
