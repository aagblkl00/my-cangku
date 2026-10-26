from __future__ import annotations

import base64
import io
import json
import os
import re
import threading
import uuid
import zipfile
from pathlib import Path
from typing import Any


TEXT_EXTENSIONS = {
    ".txt", ".md", ".markdown", ".json", ".yaml", ".yml", ".csv", ".log",
    ".py", ".js", ".jsx", ".ts", ".tsx", ".html", ".css", ".xml", ".toml",
    ".ini", ".cfg", ".sql", ".java", ".kt", ".go", ".rs", ".sh", ".ps1",
}


class KleinCapabilityStore:
    """Persistent, user-controlled memory, skills and read-only desktop grants."""

    def __init__(self, data_dir: Path) -> None:
        self.root = data_dir / "klein"
        self.skills_dir = self.root / "skills"
        self.state_path = self.root / "capabilities.json"
        self._lock = threading.RLock()
        self.skills_dir.mkdir(parents=True, exist_ok=True)
        if not self.state_path.exists():
            self._write_state({"memories": [], "skills": [], "desktop_grants": []})

    def _read_state(self) -> dict[str, list[dict[str, Any]]]:
        with self._lock:
            try:
                data = json.loads(self.state_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                data = {}
            return {
                "memories": list(data.get("memories") or []),
                "skills": list(data.get("skills") or []),
                "desktop_grants": list(data.get("desktop_grants") or []),
            }

    def _write_state(self, data: dict[str, Any]) -> None:
        with self._lock:
            self.root.mkdir(parents=True, exist_ok=True)
            temporary = self.state_path.with_suffix(".tmp")
            temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            temporary.replace(self.state_path)

    def list_memories(self) -> list[dict[str, Any]]:
        return self._read_state()["memories"]

    def save_memory(self, key: str, value: str) -> dict[str, Any]:
        key = key.strip()[:80]
        value = value.strip()[:4000]
        if not key or not value:
            raise ValueError("记忆标题和内容不能为空")
        data = self._read_state()
        existing = next((item for item in data["memories"] if item.get("key") == key), None)
        item = existing or {"id": f"memory-{uuid.uuid4().hex[:12]}"}
        item.update({"key": key, "value": value, "enabled": True})
        if not existing:
            data["memories"].insert(0, item)
        self._write_state(data)
        return item

    def delete_memory(self, memory_id: str) -> bool:
        data = self._read_state()
        before = len(data["memories"])
        data["memories"] = [item for item in data["memories"] if item.get("id") != memory_id]
        if len(data["memories"]) == before:
            return False
        self._write_state(data)
        return True

    def set_memory_enabled(self, memory_id: str, enabled: bool) -> dict[str, Any] | None:
        data = self._read_state()
        result = None
        for item in data["memories"]:
            if item.get("id") == memory_id:
                item["enabled"] = bool(enabled)
                result = item
                break
        if result:
            self._write_state(data)
        return result

    def remember_from_message(self, message: str) -> dict[str, Any] | None:
        match = re.search(r"(?:请)?记住(?:一下)?[：:\s]*(.{2,2000})", message.strip(), re.S)
        if not match:
            return None
        value = match.group(1).strip().rstrip("。！!")
        if not value:
            return None
        key = value.split("，", 1)[0].split("。", 1)[0][:24] or "用户记忆"
        return self.save_memory(key, value)

    def memory_context(self) -> list[dict[str, str]]:
        return [
            {"key": str(item.get("key", "")), "value": str(item.get("value", ""))}
            for item in self.list_memories()
            if item.get("enabled", True)
        ][:50]

    def list_skills(self) -> list[dict[str, Any]]:
        return self._read_state()["skills"]

    @staticmethod
    def _skill_name(filename: str, content: str) -> str:
        frontmatter = re.search(r"^---\s*\n([\s\S]*?)\n---", content)
        if frontmatter:
            match = re.search(r"^name:\s*[\"']?(.+?)[\"']?\s*$", frontmatter.group(1), re.M)
            if match:
                return match.group(1).strip()[:80]
        heading = re.search(r"^#\s+(.+)$", content, re.M)
        return (heading.group(1).strip() if heading else Path(filename).stem)[:80]

    def install_skill(self, filename: str, content_base64: str) -> dict[str, Any]:
        suffix = Path(filename).suffix.lower()
        if suffix not in {".md", ".markdown", ".json", ".zip"}:
            raise ValueError("仅支持 Markdown、JSON 或 ZIP Skill")
        try:
            raw = base64.b64decode(content_base64, validate=True)
        except ValueError as exc:
            raise ValueError("Skill 文件内容无效") from exc
        if suffix == ".zip":
            try:
                with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                    candidates = [
                        item for item in archive.infolist()
                        if not item.is_dir() and Path(item.filename).name.casefold() == "skill.md"
                    ]
                    if not candidates:
                        raise ValueError("ZIP Skill 中未找到 SKILL.md")
                    selected = min(candidates, key=lambda item: (len(Path(item.filename).parts), len(item.filename)))
                    if selected.file_size > 200_000:
                        raise ValueError("SKILL.md 超过 200 KB")
                    content = archive.read(selected).decode("utf-8-sig")
            except zipfile.BadZipFile as exc:
                raise ValueError("ZIP Skill 文件已损坏") from exc
            except UnicodeDecodeError as exc:
                raise ValueError("SKILL.md 不是有效的 UTF-8 文本") from exc
        else:
            try:
                content = raw.decode("utf-8-sig")
            except UnicodeDecodeError as exc:
                raise ValueError("Skill 文件不是有效的 UTF-8 文本") from exc
        if not content.strip() or len(content) > 200_000:
            raise ValueError("Skill 内容为空或超过 200 KB")
        if suffix == ".json":
            try:
                parsed = json.loads(content)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Skill JSON 无法解析：{exc}") from exc
            if isinstance(parsed, dict):
                content = str(parsed.get("prompt") or parsed.get("instructions") or content)
        name = self._skill_name(filename, content)
        data = self._read_state()
        existing = next((item for item in data["skills"] if item.get("name") == name), None)
        skill_id = str(existing.get("id")) if existing else f"skill-{uuid.uuid4().hex[:12]}"
        stored_name = f"{skill_id}.md"
        (self.skills_dir / stored_name).write_text(content, encoding="utf-8")
        item = {"id": skill_id, "name": name, "filename": filename[:160], "enabled": True, "size": len(content), "path": stored_name}
        if existing:
            data["skills"] = [item if current.get("id") == skill_id else current for current in data["skills"]]
        else:
            data["skills"].insert(0, item)
        self._write_state(data)
        return item

    def set_skill_enabled(self, skill_id: str, enabled: bool) -> dict[str, Any] | None:
        data = self._read_state()
        result = None
        for item in data["skills"]:
            if item.get("id") == skill_id:
                item["enabled"] = bool(enabled)
                result = item
                break
        if result:
            self._write_state(data)
        return result

    def delete_skill(self, skill_id: str) -> bool:
        data = self._read_state()
        item = next((current for current in data["skills"] if current.get("id") == skill_id), None)
        if not item:
            return False
        path = self.skills_dir / str(item.get("path", ""))
        if path.is_file() and path.parent == self.skills_dir:
            path.unlink(missing_ok=True)
        data["skills"] = [current for current in data["skills"] if current.get("id") != skill_id]
        self._write_state(data)
        return True

    def skill_context(self) -> list[dict[str, str]]:
        result: list[dict[str, str]] = []
        total = 0
        for item in self.list_skills():
            if not item.get("enabled", True):
                continue
            path = self.skills_dir / str(item.get("path", ""))
            try:
                content = path.read_text(encoding="utf-8")[:4000]
            except OSError:
                continue
            remaining = 12_000 - total
            if remaining <= 0:
                break
            content = content[:remaining]
            total += len(content)
            result.append({"name": str(item.get("name", "Skill")), "instructions": content})
        return result

    def grant_desktop(self) -> dict[str, Any]:
        desktop = (Path.home() / "Desktop").resolve()
        if not desktop.is_dir():
            raise ValueError("未找到当前 Windows 用户桌面目录")
        data = self._read_state()
        existing = next((item for item in data["desktop_grants"] if item.get("path") == str(desktop)), None)
        if existing:
            return existing
        item = {"id": f"grant-{uuid.uuid4().hex[:12]}", "name": "Windows 桌面", "path": str(desktop), "read_only": True}
        data["desktop_grants"].append(item)
        self._write_state(data)
        return item

    def list_grants(self) -> list[dict[str, Any]]:
        return self._read_state()["desktop_grants"]

    def delete_grant(self, grant_id: str) -> bool:
        data = self._read_state()
        before = len(data["desktop_grants"])
        data["desktop_grants"] = [item for item in data["desktop_grants"] if item.get("id") != grant_id]
        if len(data["desktop_grants"]) == before:
            return False
        self._write_state(data)
        return True

    def _resolve_granted_path(self, value: str) -> Path:
        candidate = Path(value).expanduser().resolve()
        for grant in self.list_grants():
            root = Path(str(grant.get("path", ""))).resolve()
            try:
                if os.path.commonpath((str(candidate), str(root))) == str(root):
                    return candidate
            except ValueError:
                continue
        raise PermissionError("该路径未获得桌面访问授权")

    def list_desktop(self, path: str = "") -> dict[str, Any]:
        grants = self.list_grants()
        if not grants:
            raise PermissionError("请先在能力中心授权 Windows 桌面")
        target = self._resolve_granted_path(path or str(grants[0]["path"]))
        if not target.is_dir():
            raise ValueError("目标不是可读取目录")
        entries = []
        for item in sorted(target.iterdir(), key=lambda value: (not value.is_dir(), value.name.casefold()))[:200]:
            try:
                size = item.stat().st_size if item.is_file() else 0
            except OSError:
                size = 0
            entries.append({"name": item.name, "path": str(item), "kind": "folder" if item.is_dir() else "file", "size": size})
        return {"path": str(target), "entries": entries}

    def read_desktop_text(self, path: str) -> dict[str, Any]:
        target = self._resolve_granted_path(path)
        if not target.is_file():
            raise ValueError("目标不是可读取文件")
        if target.suffix.lower() not in TEXT_EXTENSIONS:
            raise ValueError("当前仅允许读取文本、代码、Markdown、CSV 和 JSON 文件")
        if target.stat().st_size > 1_000_000:
            raise ValueError("文件超过 1 MB，请先缩小范围")
        content = target.read_text(encoding="utf-8-sig", errors="replace")
        return {"path": str(target), "name": target.name, "content": content[:120_000], "truncated": len(content) > 120_000}

    def desktop_context(self, message: str) -> dict[str, Any] | None:
        if "桌面" not in message and "desktop" not in message.casefold():
            return None
        try:
            listing = self.list_desktop()
        except (OSError, PermissionError, ValueError):
            return {"authorized": False, "message": "Windows 桌面尚未授权"}
        result: dict[str, Any] = {"authorized": True, "path": listing["path"], "entries": listing["entries"][:80]}
        if any(keyword in message for keyword in ("读取", "打开", "分析", "查看内容")):
            for entry in listing["entries"]:
                if entry["kind"] == "file" and entry["name"] in message:
                    try:
                        result["file"] = self.read_desktop_text(entry["path"])
                    except (OSError, PermissionError, ValueError) as exc:
                        result["file_error"] = str(exc)
                    break
        return result
