from __future__ import annotations

import json
import hashlib
import re
import shutil
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


class StudioStore:
    """Small SQLite store for the standalone local studio."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._backup_before_schema_upgrade(6)
        self._init_db()

    def _backup_before_schema_upgrade(self, target_version: int) -> None:
        if not self.path.is_file():
            return
        try:
            conn = sqlite3.connect(self.path)
            try:
                current = conn.execute("SELECT COALESCE(MAX(schema_version), 0) FROM schema_meta").fetchone()[0]
            finally:
                conn.close()
        except sqlite3.Error:
            current = 0
        if int(current or 0) >= target_version:
            return
        backup_dir = self.path.parent / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        target = backup_dir / f"studio_before_v{target_version}_{stamp}.db"
        if not target.exists():
            shutil.copy2(self.path, target)

    @contextmanager
    def _connect(self):
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS schema_meta (schema_version INTEGER NOT NULL, migrated_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL DEFAULT '',
                    variables_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS environments (
                    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    name TEXT NOT NULL, base_url TEXT NOT NULL DEFAULT '', variables_json TEXT NOT NULL DEFAULT '{}',
                    browser TEXT NOT NULL DEFAULT 'chromium', read_only INTEGER NOT NULL DEFAULT 1,
                    allowed_hosts_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS elements (
                    element_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    page_url TEXT NOT NULL DEFAULT '', page_title TEXT NOT NULL DEFAULT '', name TEXT NOT NULL,
                    element_type TEXT NOT NULL DEFAULT 'element', role TEXT NOT NULL DEFAULT '',
                    locator_type TEXT NOT NULL, locator_value TEXT NOT NULL, fallback_locators_json TEXT NOT NULL DEFAULT '[]',
                    health_status TEXT NOT NULL DEFAULT '未验证', last_verified_at TEXT NOT NULL DEFAULT '',
                    usage_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS flows (
                    flow_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', engine TEXT NOT NULL DEFAULT 'playwright',
                    version INTEGER NOT NULL DEFAULT 1, environment_id TEXT, variables_json TEXT NOT NULL DEFAULT '{}',
                    breakpoints_json TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS flow_steps (
                    step_id TEXT PRIMARY KEY, flow_id TEXT NOT NULL REFERENCES flows(flow_id) ON DELETE CASCADE,
                    step_no INTEGER NOT NULL, action_spec_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                    UNIQUE(flow_id, step_no)
                );
                CREATE TABLE IF NOT EXISTS runs (
                    run_id TEXT PRIMARY KEY, flow_id TEXT NOT NULL REFERENCES flows(flow_id), environment_id TEXT,
                    browser TEXT NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT NOT NULL DEFAULT '',
                    report_path TEXT NOT NULL DEFAULT '', trace_path TEXT NOT NULL DEFAULT '', error_message TEXT NOT NULL DEFAULT '',
                    dataset_name TEXT NOT NULL DEFAULT ''
                );
                CREATE TABLE IF NOT EXISTS run_steps (
                    run_step_id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
                    step_id TEXT NOT NULL, step_no INTEGER NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL,
                    ended_at TEXT NOT NULL, duration_ms INTEGER NOT NULL DEFAULT 0, message TEXT NOT NULL DEFAULT '',
                    error_message TEXT NOT NULL DEFAULT '', screenshot_path TEXT NOT NULL DEFAULT '',
                    before_screenshot_path TEXT NOT NULL DEFAULT '', after_screenshot_path TEXT NOT NULL DEFAULT '',
                    log_path TEXT NOT NULL DEFAULT '', page_url TEXT NOT NULL DEFAULT '', page_title TEXT NOT NULL DEFAULT '',
                    action_spec_json TEXT NOT NULL DEFAULT '{}', locator_json TEXT NOT NULL DEFAULT '{}',
                    dom_snapshot_path TEXT NOT NULL DEFAULT '', console_summary TEXT NOT NULL DEFAULT '',
                    network_summary TEXT NOT NULL DEFAULT '', attempts INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS artifacts (
                    artifact_id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
                    run_step_id TEXT, type TEXT NOT NULL, path TEXT NOT NULL, created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS flow_versions (
                    version_id TEXT PRIMARY KEY, flow_id TEXT NOT NULL REFERENCES flows(flow_id) ON DELETE CASCADE,
                    version_no INTEGER NOT NULL, label TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'manual',
                    snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL,
                    UNIQUE(flow_id, version_no)
                );
                CREATE TABLE IF NOT EXISTS locator_heal_suggestions (
                    suggestion_id TEXT PRIMARY KEY, element_id TEXT NOT NULL REFERENCES elements(element_id) ON DELETE CASCADE,
                    run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE, step_no INTEGER NOT NULL,
                    original_type TEXT NOT NULL, original_value TEXT NOT NULL, proposed_type TEXT NOT NULL,
                    proposed_value TEXT NOT NULL, confidence INTEGER NOT NULL DEFAULT 80,
                    status TEXT NOT NULL DEFAULT 'pending', screenshot_path TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
                    UNIQUE(element_id, run_id, step_no, proposed_type, proposed_value)
                );
                CREATE TABLE IF NOT EXISTS test_cases (
                    case_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    title TEXT NOT NULL, module TEXT NOT NULL DEFAULT '', priority TEXT NOT NULL DEFAULT 'P1',
                    case_type TEXT NOT NULL DEFAULT '回归测试', preconditions TEXT NOT NULL DEFAULT '',
                    steps TEXT NOT NULL DEFAULT '', test_data TEXT NOT NULL DEFAULT '', expected TEXT NOT NULL DEFAULT '', tags_json TEXT NOT NULL DEFAULT '[]',
                    status TEXT NOT NULL DEFAULT '未自动化', automation_flow_id TEXT REFERENCES flows(flow_id) ON DELETE SET NULL,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS regression_plans (
                    regression_plan_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', environment_id TEXT,
                    browser TEXT NOT NULL DEFAULT 'chromium', stop_on_failure INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS regression_plan_cases (
                    id TEXT PRIMARY KEY, regression_plan_id TEXT NOT NULL REFERENCES regression_plans(regression_plan_id) ON DELETE CASCADE,
                    case_id TEXT NOT NULL REFERENCES test_cases(case_id) ON DELETE CASCADE,
                    sort_order INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1,
                    UNIQUE(regression_plan_id, case_id)
                );
                CREATE TABLE IF NOT EXISTS regression_runs (
                    regression_run_id TEXT PRIMARY KEY, regression_plan_id TEXT NOT NULL REFERENCES regression_plans(regression_plan_id),
                    environment_id TEXT, browser TEXT NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL,
                    ended_at TEXT NOT NULL DEFAULT '', total_cases INTEGER NOT NULL DEFAULT 0, passed_cases INTEGER NOT NULL DEFAULT 0,
                    failed_cases INTEGER NOT NULL DEFAULT 0, skipped_cases INTEGER NOT NULL DEFAULT 0,
                    blocked_cases INTEGER NOT NULL DEFAULT 0, report_path TEXT NOT NULL DEFAULT ''
                );
                CREATE TABLE IF NOT EXISTS regression_run_cases (
                    id TEXT PRIMARY KEY, regression_run_id TEXT NOT NULL REFERENCES regression_runs(regression_run_id) ON DELETE CASCADE,
                    case_id TEXT NOT NULL REFERENCES test_cases(case_id), run_id TEXT REFERENCES runs(run_id),
                    sort_order INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'SKIP', error_message TEXT NOT NULL DEFAULT ''
                );
                CREATE TABLE IF NOT EXISTS missions (
                    mission_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    environment_id TEXT REFERENCES environments(id) ON DELETE SET NULL,
                    objective TEXT NOT NULL, depth TEXT NOT NULL DEFAULT 'standard', status TEXT NOT NULL,
                    verdict TEXT NOT NULL DEFAULT '', progress INTEGER NOT NULL DEFAULT 0,
                    case_ids_json TEXT NOT NULL DEFAULT '[]', config_json TEXT NOT NULL DEFAULT '{}',
                    blocking_reason TEXT NOT NULL DEFAULT '', started_at TEXT NOT NULL DEFAULT '',
                    ended_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS mission_scenarios (
                    scenario_id TEXT PRIMARY KEY, mission_id TEXT NOT NULL REFERENCES missions(mission_id) ON DELETE CASCADE,
                    case_id TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, source_json TEXT NOT NULL DEFAULT '{}',
                    risk TEXT NOT NULL DEFAULT 'P1', preconditions TEXT NOT NULL DEFAULT '', test_data TEXT NOT NULL DEFAULT '',
                    execution_target TEXT NOT NULL DEFAULT 'ui', verification_rules_json TEXT NOT NULL DEFAULT '[]',
                    cleanup_strategy TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'PENDING',
                    verdict TEXT NOT NULL DEFAULT '', run_id TEXT REFERENCES runs(run_id) ON DELETE SET NULL,
                    findings_json TEXT NOT NULL DEFAULT '[]', sort_order INTEGER NOT NULL DEFAULT 0,
                    started_at TEXT NOT NULL DEFAULT '', ended_at TEXT NOT NULL DEFAULT '',
                    reproduction_run_id TEXT NOT NULL DEFAULT '', reproduction_verdict TEXT NOT NULL DEFAULT '',
                    failure_classification TEXT NOT NULL DEFAULT '', reproduction_confidence INTEGER NOT NULL DEFAULT 0,
                    tapd_draft_json TEXT NOT NULL DEFAULT '{}'
                );
                CREATE TABLE IF NOT EXISTS mission_step_ledger (
                    ledger_id TEXT PRIMARY KEY, mission_id TEXT NOT NULL REFERENCES missions(mission_id) ON DELETE CASCADE,
                    scenario_id TEXT NOT NULL REFERENCES mission_scenarios(scenario_id) ON DELETE CASCADE,
                    source_step_no INTEGER NOT NULL, source_step_id TEXT NOT NULL DEFAULT '', source_text TEXT NOT NULL DEFAULT '',
                    actual_action TEXT NOT NULL DEFAULT '', postcondition TEXT NOT NULL DEFAULT '',
                    evidence_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL, run_step_id TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS mission_verifications (
                    verification_id TEXT PRIMARY KEY, mission_id TEXT NOT NULL REFERENCES missions(mission_id) ON DELETE CASCADE,
                    scenario_id TEXT NOT NULL REFERENCES mission_scenarios(scenario_id) ON DELETE CASCADE,
                    layer TEXT NOT NULL, status TEXT NOT NULL, rule_text TEXT NOT NULL DEFAULT '',
                    observed TEXT NOT NULL DEFAULT '', evidence_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS mission_events (
                    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    mission_id TEXT NOT NULL REFERENCES missions(mission_id) ON DELETE CASCADE,
                    event_type TEXT NOT NULL, phase TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '',
                    payload_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS requirements (
                    requirement_id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    title TEXT NOT NULL, module TEXT NOT NULL DEFAULT '',
                    source_type TEXT NOT NULL DEFAULT 'text', source_name TEXT NOT NULL DEFAULT '',
                    current_version_id TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active',
                    pending_questions_json TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                    UNIQUE(project_id, module, title)
                );
                CREATE TABLE IF NOT EXISTS requirement_versions (
                    version_id TEXT PRIMARY KEY,
                    requirement_id TEXT NOT NULL REFERENCES requirements(requirement_id) ON DELETE CASCADE,
                    version_no INTEGER NOT NULL, content TEXT NOT NULL, content_hash TEXT NOT NULL,
                    change_type TEXT NOT NULL DEFAULT 'NEW', review_status TEXT NOT NULL DEFAULT 'active',
                    effective_at TEXT NOT NULL DEFAULT '', supersedes_version_id TEXT NOT NULL DEFAULT '',
                    imported_at TEXT NOT NULL,
                    UNIQUE(requirement_id, version_no)
                );
                CREATE TABLE IF NOT EXISTS domain_entities (
                    entity_id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    name TEXT NOT NULL, entity_type TEXT NOT NULL DEFAULT 'business_object',
                    description TEXT NOT NULL DEFAULT '', attributes_json TEXT NOT NULL DEFAULT '{}',
                    status TEXT NOT NULL DEFAULT 'active', source_requirement_ids_json TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                    UNIQUE(project_id, name, entity_type)
                );
                CREATE TABLE IF NOT EXISTS domain_relations (
                    relation_id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    source_entity_id TEXT NOT NULL REFERENCES domain_entities(entity_id) ON DELETE CASCADE,
                    target_entity_id TEXT NOT NULL REFERENCES domain_entities(entity_id) ON DELETE CASCADE,
                    relation_type TEXT NOT NULL DEFAULT 'relates_to', description TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'active', source_requirement_ids_json TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                    UNIQUE(project_id, source_entity_id, target_entity_id, relation_type)
                );
                CREATE TABLE IF NOT EXISTS business_rules (
                    rule_id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    module TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, rule_text TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active', scope TEXT NOT NULL DEFAULT 'project',
                    source_requirement_id TEXT NOT NULL DEFAULT '', source_version_id TEXT NOT NULL DEFAULT '',
                    supersedes_rule_id TEXT NOT NULL DEFAULT '', impacted_case_ids_json TEXT NOT NULL DEFAULT '[]',
                    impacted_api_ids_json TEXT NOT NULL DEFAULT '[]', pending_questions_json TEXT NOT NULL DEFAULT '[]',
                    effective_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS requirement_impacts (
                    impact_id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    requirement_id TEXT NOT NULL REFERENCES requirements(requirement_id) ON DELETE CASCADE,
                    version_id TEXT NOT NULL REFERENCES requirement_versions(version_id) ON DELETE CASCADE,
                    target_type TEXT NOT NULL, target_id TEXT NOT NULL DEFAULT '', target_name TEXT NOT NULL DEFAULT '',
                    reason TEXT NOT NULL DEFAULT '', risk TEXT NOT NULL DEFAULT 'P1', status TEXT NOT NULL DEFAULT 'pending',
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_elements_project ON elements(project_id);
                CREATE INDEX IF NOT EXISTS idx_flows_project ON flows(project_id);
                CREATE INDEX IF NOT EXISTS idx_runs_flow ON runs(flow_id);
                CREATE INDEX IF NOT EXISTS idx_flow_versions_flow ON flow_versions(flow_id, version_no DESC);
                CREATE INDEX IF NOT EXISTS idx_heal_suggestions_run ON locator_heal_suggestions(run_id, status);
                CREATE INDEX IF NOT EXISTS idx_missions_project ON missions(project_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_mission_scenarios ON mission_scenarios(mission_id, sort_order);
                CREATE INDEX IF NOT EXISTS idx_mission_events ON mission_events(mission_id, event_id);
                CREATE INDEX IF NOT EXISTS idx_requirements_project ON requirements(project_id, updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_requirement_versions ON requirement_versions(requirement_id, version_no DESC);
                CREATE INDEX IF NOT EXISTS idx_domain_entities_project ON domain_entities(project_id, name);
                CREATE INDEX IF NOT EXISTS idx_domain_relations_project ON domain_relations(project_id);
                CREATE INDEX IF NOT EXISTS idx_business_rules_project ON business_rules(project_id, module, status);
                CREATE INDEX IF NOT EXISTS idx_requirement_impacts_version ON requirement_impacts(version_id, target_type);
                """
            )
            if conn.execute("SELECT COUNT(*) FROM schema_meta").fetchone()[0] == 0:
                conn.execute("INSERT INTO schema_meta(schema_version, migrated_at) VALUES (1, ?)", (now_iso(),))
            columns = {row[1] for row in conn.execute("PRAGMA table_info(projects)").fetchall()}
            if "variables_json" not in columns:
                conn.execute("ALTER TABLE projects ADD COLUMN variables_json TEXT NOT NULL DEFAULT '{}' ")
            version = conn.execute("SELECT COALESCE(MAX(schema_version), 1) FROM schema_meta").fetchone()[0]
            if version < 2:
                conn.execute("UPDATE schema_meta SET schema_version=2, migrated_at=?", (now_iso(),))
            flow_columns = {row[1] for row in conn.execute("PRAGMA table_info(flows)").fetchall()}
            if "breakpoints_json" not in flow_columns:
                conn.execute("ALTER TABLE flows ADD COLUMN breakpoints_json TEXT NOT NULL DEFAULT '[]'")
            if version < 3:
                conn.execute("UPDATE schema_meta SET schema_version=3, migrated_at=?", (now_iso(),))
            # Incremental columns keep existing SQLite files and historical runs intact.
            run_columns = {row[1] for row in conn.execute("PRAGMA table_info(runs)").fetchall()}
            if "error_message" not in run_columns:
                conn.execute("ALTER TABLE runs ADD COLUMN error_message TEXT NOT NULL DEFAULT ''")
            if "dataset_name" not in run_columns:
                conn.execute("ALTER TABLE runs ADD COLUMN dataset_name TEXT NOT NULL DEFAULT ''")
            step_columns = {row[1] for row in conn.execute("PRAGMA table_info(run_steps)").fetchall()}
            for name, definition in {
                "action_spec_json": "TEXT NOT NULL DEFAULT '{}'",
                "locator_json": "TEXT NOT NULL DEFAULT '{}'",
                "before_screenshot_path": "TEXT NOT NULL DEFAULT ''",
                "after_screenshot_path": "TEXT NOT NULL DEFAULT ''",
                "dom_snapshot_path": "TEXT NOT NULL DEFAULT ''",
                "console_summary": "TEXT NOT NULL DEFAULT ''",
                "network_summary": "TEXT NOT NULL DEFAULT ''",
                "attempts": "INTEGER NOT NULL DEFAULT 0",
            }.items():
                if name not in step_columns:
                    conn.execute(f"ALTER TABLE run_steps ADD COLUMN {name} {definition}")
            case_columns = {row[1] for row in conn.execute("PRAGMA table_info(test_cases)").fetchall()}
            if "steps" not in case_columns:
                conn.execute("ALTER TABLE test_cases ADD COLUMN steps TEXT NOT NULL DEFAULT ''")
            environment_columns = {row[1] for row in conn.execute("PRAGMA table_info(environments)").fetchall()}
            if "environment_kind" not in environment_columns:
                conn.execute("ALTER TABLE environments ADD COLUMN environment_kind TEXT NOT NULL DEFAULT 'test'")
            if "payment_mode" not in environment_columns:
                conn.execute("ALTER TABLE environments ADD COLUMN payment_mode TEXT NOT NULL DEFAULT 'disabled'")
            if version < 4:
                conn.execute("UPDATE schema_meta SET schema_version=4, migrated_at=?", (now_iso(),))
            scenario_columns = {row[1] for row in conn.execute("PRAGMA table_info(mission_scenarios)").fetchall()}
            for name, definition in {
                "reproduction_run_id": "TEXT NOT NULL DEFAULT ''",
                "reproduction_verdict": "TEXT NOT NULL DEFAULT ''",
                "failure_classification": "TEXT NOT NULL DEFAULT ''",
                "reproduction_confidence": "INTEGER NOT NULL DEFAULT 0",
                "tapd_draft_json": "TEXT NOT NULL DEFAULT '{}'",
            }.items():
                if name not in scenario_columns:
                    conn.execute(f"ALTER TABLE mission_scenarios ADD COLUMN {name} {definition}")
            if version < 5:
                conn.execute("UPDATE schema_meta SET schema_version=5, migrated_at=?", (now_iso(),))
            relation_columns = {row[1] for row in conn.execute("PRAGMA table_info(domain_relations)").fetchall()}
            if "status" not in relation_columns:
                conn.execute("ALTER TABLE domain_relations ADD COLUMN status TEXT NOT NULL DEFAULT 'active'")
            if version < 6:
                conn.execute("UPDATE schema_meta SET schema_version=6, migrated_at=?", (now_iso(),))

    def _json(self, value: Any) -> str:
        return json.dumps(value if value is not None else {}, ensure_ascii=False)

    def ensure_demo_data(self) -> None:
        with self._connect() as conn:
            if conn.execute("SELECT COUNT(*) FROM projects").fetchone()[0]:
                return
            project_id = "project-demo"
            environment_id = "env-demo"
            ts = now_iso()
            conn.execute("INSERT INTO projects(id, name, description, variables_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", (project_id, "我的自动化项目", "个人 Web 自动化工作台", self._json({}), ts, ts))
            conn.execute(
                """INSERT INTO environments(
                    id, project_id, name, base_url, variables_json, browser, read_only,
                    allowed_hosts_json, created_at, updated_at, environment_kind, payment_mode
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (environment_id, project_id, "测试环境", "http://127.0.0.1:3000", self._json({"username": "", "password": ""}), "chromium", 1, self._json(["127.0.0.1", "localhost"]), ts, ts, "local", "disabled"),
            )
            flow_id = "flow-demo"
            conn.execute("INSERT INTO flows(flow_id, project_id, name, description, engine, version, environment_id, variables_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (flow_id, project_id, "登录流程示例", "可编辑的 Playwright 流程示例", "playwright", 1, environment_id, self._json({}), ts, ts))
            steps = [
                {"id": "step-001", "name": "打开登录页", "action": "open", "value": "${base_url}/login", "page_url": "", "page_title": ""},
                {"id": "step-002", "name": "输入用户名", "action": "fill", "element_id": "", "value": "${username}"},
                {"id": "step-003", "name": "输入密码", "action": "fill", "element_id": "", "value": "${password}"},
                {"id": "step-004", "name": "点击登录", "action": "click", "element_id": "", "screenshot": True},
            ]
            for no, spec in enumerate(steps, 1):
                conn.execute("INSERT INTO flow_steps VALUES (?, ?, ?, ?, ?, ?)", (spec["id"], flow_id, no, self._json(spec), ts, ts))

    def list_projects(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            return [dict(row) for row in conn.execute("SELECT * FROM projects ORDER BY name")]

    def create_project(self, name: str, description: str = "") -> dict[str, Any]:
        project_id = f"project-{uuid.uuid4().hex[:10]}"
        ts = now_iso()
        with self._connect() as conn:
            conn.execute("INSERT INTO projects(id, name, description, variables_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", (project_id, name.strip(), description.strip(), self._json({}), ts, ts))
        return self.get_project(project_id) or {}

    def get_project(self, project_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
        return dict(row) if row else None

    def delete_project(self, project_id: str) -> list[str]:
        """Delete a project and all owned assets.

        Regression runs and execution runs are removed first because their
        foreign keys do not cascade from projects. Returns the removed run ids
        so the caller can clean up run artifact directories.
        """
        with self._connect() as conn:
            plan_ids = [row[0] for row in conn.execute("SELECT regression_plan_id FROM regression_plans WHERE project_id = ?", (project_id,)).fetchall()]
            if plan_ids:
                conn.execute(f"DELETE FROM regression_runs WHERE regression_plan_id IN ({','.join('?' for _ in plan_ids)})", plan_ids)
            run_ids = [row[0] for row in conn.execute("SELECT run_id FROM runs WHERE flow_id IN (SELECT flow_id FROM flows WHERE project_id = ?)", (project_id,)).fetchall()]
            if run_ids:
                conn.execute(f"DELETE FROM runs WHERE run_id IN ({','.join('?' for _ in run_ids)})", run_ids)
            conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        return run_ids

    @staticmethod
    def _requirement_signals(content: str, module: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, str]], list[str]]:
        """Extract conservative project-brain signals without pretending to be an AI parser."""
        entities: list[dict[str, Any]] = []
        rules: list[dict[str, Any]] = []
        relations: list[dict[str, str]] = []
        questions: list[str] = []
        seen_entities: set[str] = set()

        def add_entity(name: str, entity_type: str = "business_object") -> None:
            clean = name.strip(" `#*：:。；;，,()（）[]【】")
            if not clean or len(clean) > 40 or clean in seen_entities:
                return
            seen_entities.add(clean)
            entities.append({"name": clean, "entity_type": entity_type, "description": "由需求文本识别"})

        if module.strip():
            add_entity(module.strip(), "module")
        rule_tokens = ("必须", "不得", "只能", "禁止", "应当", "需要", "不可", "不能", "规则", "等于", "不超过", "至少", "最多")
        question_tokens = ("待确认", "未明确", "不确定", "口径", "？", "?")
        for raw_line in content.splitlines():
            line = raw_line.strip().lstrip("-*0123456789.、 ")
            if not line or len(line) > 500:
                continue
            if any(token in line for token in question_tokens):
                questions.append(line[:300])
            if any(token in line for token in rule_tokens):
                rules.append({"title": line[:48], "rule_text": line})
            relation_line = line.replace("->", "→").replace("=>", "→")
            if "→" in relation_line:
                chain = [item.strip() for item in relation_line.split("→") if item.strip()]
                if 2 <= len(chain) <= 12 and all(len(item) <= 40 for item in chain):
                    for item in chain:
                        add_entity(item)
                    for source, target in zip(chain, chain[1:]):
                        relations.append({"source": source, "target": target, "relation_type": "flows_to", "description": "需求中的业务链路"})
        return entities[:80], rules[:80], relations[:120], list(dict.fromkeys(questions))[:30]

    def import_requirement(self, project_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.get_project(project_id):
            raise ValueError("项目不存在")
        title = str(payload.get("title") or "").strip()
        content = "\n".join(line.rstrip() for line in str(payload.get("content") or "").strip().splitlines()).strip()
        if not title or not content:
            raise ValueError("需求标题和正文不能为空")
        module = str(payload.get("module") or "").strip()
        digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
        ts = now_iso()
        inferred_entities, inferred_rules, inferred_relations, inferred_questions = self._requirement_signals(content, module)
        entities = payload.get("entities") or inferred_entities
        rules = payload.get("rules") or inferred_rules
        relations = payload.get("relations") or inferred_relations
        questions = list(dict.fromkeys([*(payload.get("pending_questions") or []), *inferred_questions]))
        duplicate = False
        with self._connect() as conn:
            requirement = conn.execute(
                "SELECT * FROM requirements WHERE project_id=? AND module=? AND title=?",
                (project_id, module, title),
            ).fetchone()
            if requirement:
                requirement_id = requirement["requirement_id"]
                latest = conn.execute(
                    "SELECT * FROM requirement_versions WHERE requirement_id=? ORDER BY version_no DESC LIMIT 1",
                    (requirement_id,),
                ).fetchone()
                if latest and latest["content_hash"] == digest:
                    duplicate = True
                    version_id = latest["version_id"]
                    version_no = latest["version_no"]
                    import_result = "DUPLICATE"
                else:
                    version_no = int(latest["version_no"] if latest else 0) + 1
                    version_id = f"reqv-{uuid.uuid4().hex[:12]}"
                    import_result = "UPDATED"
                    conn.execute(
                        """INSERT INTO requirement_versions(
                            version_id, requirement_id, version_no, content, content_hash, change_type,
                            review_status, effective_at, supersedes_version_id, imported_at
                        ) VALUES (?, ?, ?, ?, ?, 'UPDATED', 'pending', '', ?, ?)""",
                        (version_id, requirement_id, version_no, content, digest, requirement["current_version_id"], ts),
                    )
                    conn.execute(
                        """UPDATE requirements SET source_type=?, source_name=?, status='pending_review',
                            pending_questions_json=?, updated_at=? WHERE requirement_id=?""",
                        (payload.get("source_type", "text"), payload.get("source_name", ""), self._json(questions), ts, requirement_id),
                    )
            else:
                requirement_id = f"req-{uuid.uuid4().hex[:12]}"
                version_id = f"reqv-{uuid.uuid4().hex[:12]}"
                version_no = 1
                import_result = "NEW"
                conn.execute(
                    """INSERT INTO requirements(
                        requirement_id, project_id, title, module, source_type, source_name,
                        current_version_id, status, pending_questions_json, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)""",
                    (requirement_id, project_id, title, module, payload.get("source_type", "text"), payload.get("source_name", ""), version_id, self._json(questions), ts, ts),
                )
                conn.execute(
                    """INSERT INTO requirement_versions(
                        version_id, requirement_id, version_no, content, content_hash, change_type,
                        review_status, effective_at, supersedes_version_id, imported_at
                    ) VALUES (?, ?, 1, ?, ?, 'NEW', 'active', ?, '', ?)""",
                    (version_id, requirement_id, content, digest, ts, ts),
                )

            if duplicate:
                return {
                    "import_result": import_result,
                    "requirement": self.get_requirement(requirement_id),
                    "affected_cases": [],
                    "detected": {"entities": 0, "relations": 0, "rules": 0, "questions": len(questions)},
                }

            review_status = "active" if import_result == "NEW" else "pending_review"
            case_rows = conn.execute(
                "SELECT case_id, title, priority FROM test_cases WHERE project_id=? AND module=? ORDER BY priority, title",
                (project_id, module),
            ).fetchall() if module else []
            if module:
                conn.execute(
                    "INSERT INTO requirement_impacts VALUES (?, ?, ?, ?, 'module', ?, ?, ?, 'P1', 'pending', ?)",
                    (f"impact-{uuid.uuid4().hex[:12]}", project_id, requirement_id, version_id, module, module, "需求所属模块", ts),
                )
            for case in case_rows:
                conn.execute(
                    "INSERT INTO requirement_impacts VALUES (?, ?, ?, ?, 'test_case', ?, ?, ?, ?, 'pending', ?)",
                    (f"impact-{uuid.uuid4().hex[:12]}", project_id, requirement_id, version_id, case["case_id"], case["title"], "与需求模块一致", case["priority"] or "P1", ts),
                )

            entity_ids: dict[str, str] = {}
            for raw in entities:
                item = {"name": raw} if isinstance(raw, str) else dict(raw)
                name = str(item.get("name") or "").strip()
                if not name:
                    continue
                entity_type = str(item.get("entity_type") or "business_object")
                existing = conn.execute(
                    "SELECT * FROM domain_entities WHERE project_id=? AND name=? AND entity_type=?",
                    (project_id, name, entity_type),
                ).fetchone()
                if existing:
                    entity_id = existing["entity_id"]
                    sources = json.loads(existing["source_requirement_ids_json"] or "[]")
                    if requirement_id not in sources:
                        sources.append(requirement_id)
                    conn.execute("UPDATE domain_entities SET source_requirement_ids_json=?, updated_at=? WHERE entity_id=?", (self._json(sources), ts, entity_id))
                else:
                    entity_id = f"entity-{uuid.uuid4().hex[:12]}"
                    conn.execute(
                        """INSERT INTO domain_entities VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (entity_id, project_id, name, entity_type, item.get("description", ""), self._json(item.get("attributes", {})), review_status, self._json([requirement_id]), ts, ts),
                    )
                entity_ids[name] = entity_id

            def ensure_relation_entity(name: str) -> str:
                if name in entity_ids:
                    return entity_ids[name]
                row = conn.execute("SELECT entity_id FROM domain_entities WHERE project_id=? AND name=? ORDER BY entity_type LIMIT 1", (project_id, name)).fetchone()
                if row:
                    entity_ids[name] = row["entity_id"]
                    return row["entity_id"]
                entity_id = f"entity-{uuid.uuid4().hex[:12]}"
                conn.execute(
                    "INSERT INTO domain_entities VALUES (?, ?, ?, 'business_object', '', '{}', ?, ?, ?, ?)",
                    (entity_id, project_id, name, review_status, self._json([requirement_id]), ts, ts),
                )
                entity_ids[name] = entity_id
                return entity_id

            relation_count = 0
            for raw in relations:
                item = dict(raw)
                source_name = str(item.get("source") or "").strip()
                target_name = str(item.get("target") or "").strip()
                if not source_name or not target_name or source_name == target_name:
                    continue
                source_id = ensure_relation_entity(source_name)
                target_id = ensure_relation_entity(target_name)
                relation_type = str(item.get("relation_type") or "relates_to")
                conn.execute(
                    """INSERT INTO domain_relations(
                        relation_id, project_id, source_entity_id, target_entity_id, relation_type,
                        description, status, source_requirement_ids_json, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(project_id, source_entity_id, target_entity_id, relation_type)
                    DO UPDATE SET description=excluded.description, updated_at=excluded.updated_at""",
                    (f"relation-{uuid.uuid4().hex[:12]}", project_id, source_id, target_id, relation_type, item.get("description", ""), review_status, self._json([requirement_id]), ts, ts),
                )
                relation_count += 1

            rule_count = 0
            impacted_case_ids = [row["case_id"] for row in case_rows]
            for raw in rules:
                item = {"title": str(raw)[:48], "rule_text": str(raw)} if isinstance(raw, str) else dict(raw)
                text = str(item.get("rule_text") or item.get("text") or "").strip()
                if not text:
                    continue
                conn.execute(
                    """INSERT INTO business_rules(
                        rule_id, project_id, module, title, rule_text, status, scope,
                        source_requirement_id, source_version_id, supersedes_rule_id,
                        impacted_case_ids_json, impacted_api_ids_json, pending_questions_json,
                        effective_at, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?)""",
                    (f"rule-{uuid.uuid4().hex[:12]}", project_id, module, item.get("title") or text[:48], text,
                     review_status, item.get("scope", "project"), requirement_id, version_id,
                     self._json(impacted_case_ids), self._json(item.get("impacted_api_ids", [])), self._json(questions),
                     ts if review_status == "active" else "", ts, ts),
                )
                rule_count += 1

        return {
            "import_result": import_result,
            "requirement": self.get_requirement(requirement_id),
            "affected_cases": [dict(row) for row in case_rows],
            "detected": {"entities": len(entity_ids), "relations": relation_count, "rules": rule_count, "questions": len(questions)},
        }

    def get_requirement(self, requirement_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                """SELECT r.*, cv.version_no AS current_version_no, cv.content AS current_content,
                          cv.review_status AS current_review_status,
                          lv.version_id AS latest_version_id, lv.version_no AS latest_version_no,
                          lv.change_type AS latest_change_type, lv.review_status AS latest_review_status,
                          lv.imported_at AS latest_imported_at
                   FROM requirements r
                   LEFT JOIN requirement_versions cv ON cv.version_id=r.current_version_id
                   LEFT JOIN requirement_versions lv ON lv.version_id=(
                       SELECT version_id FROM requirement_versions WHERE requirement_id=r.requirement_id
                       ORDER BY version_no DESC LIMIT 1
                   ) WHERE r.requirement_id=?""",
                (requirement_id,),
            ).fetchone()
        if not row:
            return None
        value = dict(row)
        value["pending_questions"] = json.loads(value.pop("pending_questions_json") or "[]")
        return value

    def list_requirement_versions(self, requirement_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM requirement_versions WHERE requirement_id=? ORDER BY version_no DESC", (requirement_id,)).fetchall()
        return [dict(row) for row in rows]

    def review_requirement_version(self, version_id: str, decision: str) -> dict[str, Any] | None:
        if decision not in {"activate", "reject"}:
            raise ValueError("不支持的审核决定")
        ts = now_iso()
        with self._connect() as conn:
            version = conn.execute(
                """SELECT rv.*, r.current_version_id FROM requirement_versions rv
                   JOIN requirements r ON r.requirement_id=rv.requirement_id WHERE rv.version_id=?""",
                (version_id,),
            ).fetchone()
            if not version:
                return None
            requirement_id = version["requirement_id"]
            if decision == "reject":
                conn.execute("UPDATE requirement_versions SET review_status='rejected' WHERE version_id=?", (version_id,))
                conn.execute("UPDATE requirements SET status='active', updated_at=? WHERE requirement_id=?", (ts, requirement_id))
                conn.execute("UPDATE business_rules SET status='rejected', updated_at=? WHERE source_version_id=?", (ts, version_id))
                conn.execute("UPDATE requirement_impacts SET status='rejected' WHERE version_id=?", (version_id,))
            else:
                conn.execute("UPDATE requirement_versions SET review_status='superseded' WHERE requirement_id=? AND review_status='active' AND version_id<>?", (requirement_id, version_id))
                conn.execute("UPDATE requirement_versions SET review_status='active', effective_at=? WHERE version_id=?", (ts, version_id))
                conn.execute("UPDATE requirements SET current_version_id=?, status='active', updated_at=? WHERE requirement_id=?", (version_id, ts, requirement_id))
                conn.execute(
                    "UPDATE business_rules SET status='superseded', updated_at=? WHERE source_requirement_id=? AND source_version_id<>? AND status='active'",
                    (ts, requirement_id, version_id),
                )
                conn.execute("UPDATE business_rules SET status='active', effective_at=?, updated_at=? WHERE source_version_id=?", (ts, ts, version_id))
                conn.execute("UPDATE requirement_impacts SET status='confirmed' WHERE version_id=?", (version_id,))
            entity_decision = "active" if decision == "activate" else "rejected"
            for table in ("domain_entities", "domain_relations"):
                rows = conn.execute(f"SELECT rowid, source_requirement_ids_json FROM {table} WHERE status='pending_review'").fetchall()
                for row in rows:
                    if requirement_id in json.loads(row["source_requirement_ids_json"] or "[]"):
                        conn.execute(f"UPDATE {table} SET status=?, updated_at=? WHERE rowid=?", (entity_decision, ts, row["rowid"]))
        return self.get_requirement(requirement_id)

    def get_project_brain(self, project_id: str) -> dict[str, Any]:
        project = self.get_project(project_id)
        if not project:
            raise ValueError("项目不存在")
        with self._connect() as conn:
            requirement_ids = [row["requirement_id"] for row in conn.execute("SELECT requirement_id FROM requirements WHERE project_id=? ORDER BY updated_at DESC", (project_id,)).fetchall()]
            entity_rows = conn.execute("SELECT * FROM domain_entities WHERE project_id=? ORDER BY status, entity_type, name", (project_id,)).fetchall()
            relation_rows = conn.execute(
                """SELECT dr.*, source.name AS source_name, target.name AS target_name
                   FROM domain_relations dr
                   JOIN domain_entities source ON source.entity_id=dr.source_entity_id
                   JOIN domain_entities target ON target.entity_id=dr.target_entity_id
                   WHERE dr.project_id=? ORDER BY dr.status, dr.created_at, dr.rowid""",
                (project_id,),
            ).fetchall()
            rule_rows = conn.execute("SELECT * FROM business_rules WHERE project_id=? ORDER BY status, module, updated_at DESC", (project_id,)).fetchall()
            impact_rows = conn.execute("SELECT * FROM requirement_impacts WHERE project_id=? ORDER BY created_at DESC LIMIT 300", (project_id,)).fetchall()
            version_count = conn.execute(
                "SELECT COUNT(*) FROM requirement_versions rv JOIN requirements r ON r.requirement_id=rv.requirement_id WHERE r.project_id=?",
                (project_id,),
            ).fetchone()[0]
            case_module_rows = conn.execute(
                "SELECT COALESCE(module, '') AS module, COUNT(*) AS case_count FROM test_cases WHERE project_id=? GROUP BY module",
                (project_id,),
            ).fetchall()
        requirements = [item for item in (self.get_requirement(req_id) for req_id in requirement_ids) if item]
        entities = []
        for row in entity_rows:
            item = dict(row)
            item["attributes"] = json.loads(item.pop("attributes_json") or "{}")
            item["source_requirement_ids"] = json.loads(item.pop("source_requirement_ids_json") or "[]")
            entities.append(item)
        relations = []
        for row in relation_rows:
            item = dict(row)
            item["source_requirement_ids"] = json.loads(item.pop("source_requirement_ids_json") or "[]")
            relations.append(item)
        rules = []
        for row in rule_rows:
            item = dict(row)
            item["impacted_case_ids"] = json.loads(item.pop("impacted_case_ids_json") or "[]")
            item["impacted_api_ids"] = json.loads(item.pop("impacted_api_ids_json") or "[]")
            item["pending_questions"] = json.loads(item.pop("pending_questions_json") or "[]")
            rules.append(item)
        modules: dict[str, dict[str, Any]] = {row["module"] or "未分组": {"name": row["module"] or "未分组", "case_count": row["case_count"], "requirement_count": 0, "pending_changes": 0} for row in case_module_rows}
        for requirement in requirements:
            name = requirement.get("module") or "未分组"
            module_item = modules.setdefault(name, {"name": name, "case_count": 0, "requirement_count": 0, "pending_changes": 0})
            module_item["requirement_count"] += 1
            module_item["pending_changes"] += int(requirement.get("status") == "pending_review")
        return {
            "project": project,
            "knowledge_version": f"K{version_count}",
            "summary": {
                "requirements": len(requirements),
                "pending_changes": sum(item.get("status") == "pending_review" for item in requirements),
                "entities": len(entities),
                "relations": len(relations),
                "active_rules": sum(item.get("status") == "active" for item in rules),
                "impacted_cases": len({item["target_id"] for item in impact_rows if item["target_type"] == "test_case"}),
            },
            "requirements": requirements,
            "entities": entities,
            "relations": relations,
            "rules": rules,
            "impacts": [dict(row) for row in impact_rows],
            "modules": sorted(modules.values(), key=lambda item: (-item["pending_changes"], -item["requirement_count"], item["name"])),
        }

    def list_environments(self, project_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM environments WHERE project_id=? ORDER BY name", (project_id,)).fetchall()
        return [self._environment_row(row) for row in rows]

    def create_environment(self, project_id: str, name: str, base_url: str, variables: dict[str, str] | None = None, browser: str = "chromium", read_only: bool = True, allowed_hosts: list[str] | None = None, environment_kind: str = "test", payment_mode: str = "disabled") -> dict[str, Any]:
        env_id = f"env-{uuid.uuid4().hex[:10]}"
        ts = now_iso()
        host = base_url.split("//")[-1].split("/")[0].split(":")[0] if base_url else ""
        hosts = allowed_hosts if allowed_hosts is not None else ([host] if host else [])
        with self._connect() as conn:
            conn.execute("""INSERT INTO environments(
                id, project_id, name, base_url, variables_json, browser, read_only,
                allowed_hosts_json, created_at, updated_at, environment_kind, payment_mode
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (env_id, project_id, name.strip(), base_url.strip(), self._json(variables or {}), browser, int(read_only), self._json(hosts), ts, ts, environment_kind, payment_mode))
            row = conn.execute("SELECT * FROM environments WHERE id=?", (env_id,)).fetchone()
        return self._environment_row(row)

    def update_environment(self, env_id: str, payload: dict[str, Any]) -> dict[str, Any] | None:
        with self._connect() as conn:
            conn.execute("""UPDATE environments SET name=?, base_url=?, variables_json=?, browser=?, read_only=?,
                allowed_hosts_json=?, environment_kind=?, payment_mode=?, updated_at=? WHERE id=?""",
                (payload.get("name", ""), payload.get("base_url", ""), self._json(payload.get("variables", {})), payload.get("browser", "chromium"), int(bool(payload.get("read_only", True))), self._json(payload.get("allowed_hosts", [])), payload.get("environment_kind", "test"), payload.get("payment_mode", "disabled"), now_iso(), env_id))
            row = conn.execute("SELECT * FROM environments WHERE id=?", (env_id,)).fetchone()
        return self._environment_row(row) if row else None

    def delete_environment(self, env_id: str) -> bool:
        with self._connect() as conn:
            references = {
                "自动化流程": conn.execute("SELECT COUNT(*) FROM flows WHERE environment_id=?", (env_id,)).fetchone()[0],
                "回归计划": conn.execute("SELECT COUNT(*) FROM regression_plans WHERE environment_id=?", (env_id,)).fetchone()[0],
                "执行记录": conn.execute("SELECT COUNT(*) FROM runs WHERE environment_id=?", (env_id,)).fetchone()[0],
                "回归记录": conn.execute("SELECT COUNT(*) FROM regression_runs WHERE environment_id=?", (env_id,)).fetchone()[0],
            }
            used = [f"{label} {count}" for label, count in references.items() if count]
            if used:
                raise ValueError(f"环境仍被引用（{'、'.join(used)}），请先调整关联后再删除")
            cur = conn.execute("DELETE FROM environments WHERE id=?", (env_id,))
        return cur.rowcount > 0

    def _environment_row(self, row: sqlite3.Row) -> dict[str, Any]:
        value = dict(row)
        value["variables"] = json.loads(value.pop("variables_json") or "{}")
        value["allowed_hosts"] = json.loads(value.pop("allowed_hosts_json") or "[]")
        value["read_only"] = bool(value["read_only"])
        return value

    def list_elements(self, project_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM elements WHERE project_id=? ORDER BY page_title, name", (project_id,)).fetchall()
        return [self._element_row(row) for row in rows]

    def get_element(self, element_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM elements WHERE element_id=?", (element_id,)).fetchone()
        return self._element_row(row) if row else None

    def mark_element_verified(self, element_id: str, health_status: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            conn.execute("UPDATE elements SET health_status=?, last_verified_at=?, updated_at=? WHERE element_id=?", (health_status, now_iso(), now_iso(), element_id))
        return self.get_element(element_id)

    def increment_element_usage(self, element_id: str) -> None:
        with self._connect() as conn:
            conn.execute("UPDATE elements SET usage_count=usage_count+1, updated_at=? WHERE element_id=?", (now_iso(), element_id))

    def upsert_element(self, payload: dict[str, Any]) -> dict[str, Any]:
        element_id = payload.get("element_id") or f"element-{uuid.uuid4().hex[:10]}"
        ts = now_iso()
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO elements(element_id, project_id, page_url, page_title, name, element_type, role, locator_type, locator_value, fallback_locators_json, health_status, last_verified_at, usage_count, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(element_id) DO UPDATE SET page_url=excluded.page_url, page_title=excluded.page_title, name=excluded.name, element_type=excluded.element_type, role=excluded.role, locator_type=excluded.locator_type, locator_value=excluded.locator_value, fallback_locators_json=excluded.fallback_locators_json, health_status=excluded.health_status, last_verified_at=excluded.last_verified_at, updated_at=excluded.updated_at""",
                (element_id, payload["project_id"], payload.get("page_url", ""), payload.get("page_title", ""), payload.get("name", "页面元素"), payload.get("element_type", "element"), payload.get("role", ""), payload.get("locator_type", "css"), payload.get("locator_value", ""), self._json(payload.get("fallback_locators", [])), payload.get("health_status", "未验证"), payload.get("last_verified_at", ""), int(payload.get("usage_count", 0)), payload.get("created_at", ts), ts),
            )
        return next(item for item in self.list_elements(payload["project_id"]) if item["element_id"] == element_id)

    def delete_element(self, element_id: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM elements WHERE element_id=?", (element_id,))
        return cur.rowcount > 0

    def get_element_usage(self, element_id: str) -> list[dict[str, Any]]:
        """Return flow steps that reference an element without duplicating locator data."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT f.flow_id, f.name AS flow_name, fs.step_id, fs.step_no, fs.action_spec_json "
                "FROM flow_steps fs JOIN flows f ON f.flow_id=fs.flow_id "
                "WHERE json_extract(fs.action_spec_json, '$.element_id')=? ORDER BY f.name, fs.step_no",
                (element_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def _element_row(self, row: sqlite3.Row) -> dict[str, Any]:
        value = dict(row)
        value["fallback_locators"] = json.loads(value.pop("fallback_locators_json") or "[]")
        return value

    def list_flows(self, project_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            flows = conn.execute("SELECT * FROM flows WHERE project_id=? ORDER BY updated_at DESC", (project_id,)).fetchall()
        return [self._flow_row(flow) for flow in flows]

    def get_flow(self, flow_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            flow = conn.execute("SELECT * FROM flows WHERE flow_id=?", (flow_id,)).fetchone()
            if not flow:
                return None
            steps = conn.execute("SELECT * FROM flow_steps WHERE flow_id=? ORDER BY step_no", (flow_id,)).fetchall()
        result = self._flow_row(flow)
        result["steps"] = [json.loads(row["action_spec_json"]) for row in steps]
        return result

    def _flow_row(self, row: sqlite3.Row) -> dict[str, Any]:
        value = dict(row)
        value["variables"] = json.loads(value.pop("variables_json") or "{}")
        try:
            value["breakpoints"] = [int(item) for item in json.loads(value.pop("breakpoints_json", "[]") or "[]") if int(item) > 0]
        except (TypeError, ValueError, json.JSONDecodeError):
            value["breakpoints"] = []
        return value

    def get_project_variables(self, project_id: str) -> dict[str, str]:
        project = self.get_project(project_id) or {}
        try:
            return json.loads(project.get("variables_json") or "{}")
        except (TypeError, json.JSONDecodeError):
            return {}

    def save_flow(self, payload: dict[str, Any]) -> dict[str, Any]:
        flow_id = payload.get("flow_id") or f"flow-{uuid.uuid4().hex[:10]}"
        ts = now_iso()
        steps = payload.get("steps", [])
        previous = self.get_flow(flow_id) if payload.get("flow_id") else None
        changed = bool(previous and self._flow_changed(previous, payload))
        with self._connect() as conn:
            existing = conn.execute("SELECT created_at FROM flows WHERE flow_id=?", (flow_id,)).fetchone()
            if previous and changed:
                self._create_flow_version(conn, previous, str(payload.get("checkpoint_source", "manual")))
            next_version = int(previous.get("version", 1)) + 1 if previous and changed else int(payload.get("version", 1))
            conn.execute(
                """INSERT INTO flows(flow_id, project_id, name, description, engine, version, environment_id, variables_json, breakpoints_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(flow_id) DO UPDATE SET project_id=excluded.project_id, name=excluded.name, description=excluded.description, engine=excluded.engine, version=excluded.version, environment_id=excluded.environment_id, variables_json=excluded.variables_json, breakpoints_json=excluded.breakpoints_json, updated_at=excluded.updated_at""",
                (flow_id, payload["project_id"], payload.get("name", "新自动化流程"), payload.get("description", ""), payload.get("engine", "playwright"), next_version, payload.get("environment_id"), self._json(payload.get("variables", {})), self._json(sorted({int(item) for item in payload.get("breakpoints", []) if int(item) > 0})), existing["created_at"] if existing else ts, ts),
            )
            conn.execute("DELETE FROM flow_steps WHERE flow_id=?", (flow_id,))
            for no, step in enumerate(steps, 1):
                step_id = step.get("id") or f"step-{uuid.uuid4().hex[:10]}"
                duplicate = conn.execute("SELECT flow_id FROM flow_steps WHERE step_id=?", (step_id,)).fetchone()
                if duplicate and duplicate[0] != flow_id:
                    step_id = f"step-{uuid.uuid4().hex[:10]}"
                step["id"] = step_id
                conn.execute("INSERT INTO flow_steps VALUES (?, ?, ?, ?, ?, ?)", (step_id, flow_id, no, self._json(step), ts, ts))
        return self.get_flow(flow_id) or {}

    @staticmethod
    def _flow_changed(previous: dict[str, Any], payload: dict[str, Any]) -> bool:
        fields = ("name", "description", "engine", "environment_id", "variables", "breakpoints", "steps")
        return any(previous.get(field) != payload.get(field, previous.get(field)) for field in fields)

    def _create_flow_version(self, conn: sqlite3.Connection, snapshot: dict[str, Any], source: str) -> dict[str, Any]:
        flow_id = snapshot["flow_id"]
        snapshot_json = self._json(snapshot)
        latest = conn.execute("SELECT version_id, flow_id, version_no, label, source, snapshot_json FROM flow_versions WHERE flow_id=? ORDER BY version_no DESC LIMIT 1", (flow_id,)).fetchone()
        if latest and latest["snapshot_json"] == snapshot_json:
            return {key: latest[key] for key in ("version_id", "flow_id", "version_no", "label", "source")}
        version_no = int(conn.execute("SELECT COALESCE(MAX(version_no), 0) + 1 FROM flow_versions WHERE flow_id=?", (flow_id,)).fetchone()[0])
        version_id = f"flow-version-{uuid.uuid4().hex[:10]}"
        label = f"{source == 'ai' and 'AI 修改前' or source == 'restore' and '恢复前' or '手动保存前'} · v{version_no}"
        conn.execute("INSERT INTO flow_versions(version_id, flow_id, version_no, label, source, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", (version_id, flow_id, version_no, label, source, snapshot_json, now_iso()))
        return {"version_id": version_id, "flow_id": flow_id, "version_no": version_no, "label": label, "source": source}

    def create_flow_checkpoint(self, flow_id: str, source: str = "manual", label: str = "") -> dict[str, Any]:
        snapshot = self.get_flow(flow_id)
        if not snapshot:
            raise ValueError("自动化流程不存在")
        with self._connect() as conn:
            version = self._create_flow_version(conn, snapshot, source)
            if label.strip():
                conn.execute("UPDATE flow_versions SET label=? WHERE version_id=?", (label.strip(), version["version_id"]))
                version["label"] = label.strip()
        return version

    def list_flow_versions(self, flow_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute("SELECT version_id, flow_id, version_no, label, source, created_at FROM flow_versions WHERE flow_id=? ORDER BY version_no DESC", (flow_id,)).fetchall()
        return [dict(row) for row in rows]

    def restore_flow_version(self, version_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT snapshot_json FROM flow_versions WHERE version_id=?", (version_id,)).fetchone()
        if not row:
            return None
        snapshot = json.loads(row["snapshot_json"])
        snapshot["checkpoint_source"] = "restore"
        return self.save_flow(snapshot)

    def create_heal_suggestion(self, element_id: str, run_id: str, step_no: int, locator: dict[str, Any], screenshot_path: str = "") -> dict[str, Any] | None:
        # used_fallback：备用定位器命中；ai_healed：主+备用全失效后由 AI 重新定位成功。
        is_ai = bool(locator.get("ai_healed"))
        if not (locator.get("used_fallback") or is_ai):
            return None
        original = locator.get("original") or {}
        proposed = locator.get("resolved") or {}
        proposed_type = str(proposed.get("type", ""))
        proposed_value = str(proposed.get("value", ""))
        if not proposed_type or not proposed_value:
            return None
        confidence_by_type = {"testid": 96, "role": 92, "label": 90, "name": 88, "placeholder": 86, "text": 80, "css": 70}
        if is_ai:
            # AI 自愈的置信度来自模型判断（已通过命中校验），比按类型拍的值更有信息量
            try:
                confidence = int(locator.get("ai_confidence") or 0)
            except (TypeError, ValueError):
                confidence = 0
            if confidence <= 0:
                confidence = confidence_by_type.get(proposed_type, 75)
            confidence = max(1, min(confidence, 100))
        else:
            confidence = confidence_by_type.get(proposed_type, 75)
        suggestion_id = f"heal-{uuid.uuid4().hex[:10]}"
        with self._connect() as conn:
            conn.execute("""INSERT OR IGNORE INTO locator_heal_suggestions(suggestion_id, element_id, run_id, step_no, original_type, original_value, proposed_type, proposed_value, confidence, status, screenshot_path, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)""", (suggestion_id, element_id, run_id, int(step_no), str(original.get("type", "")), str(original.get("value", "")), proposed_type, proposed_value, confidence, screenshot_path, now_iso()))
            row = conn.execute("SELECT * FROM locator_heal_suggestions WHERE element_id=? AND run_id=? AND step_no=? AND proposed_type=? AND proposed_value=?", (element_id, run_id, int(step_no), proposed_type, proposed_value)).fetchone()
        return dict(row) if row else None

    def list_heal_suggestions(self, run_id: str = "", status: str = "pending") -> list[dict[str, Any]]:
        query = "SELECT lhs.*, e.name AS element_name FROM locator_heal_suggestions lhs JOIN elements e ON e.element_id=lhs.element_id WHERE 1=1"
        values: list[Any] = []
        if run_id:
            query += " AND lhs.run_id=?"; values.append(run_id)
        if status:
            query += " AND lhs.status=?"; values.append(status)
        query += " ORDER BY lhs.created_at DESC"
        with self._connect() as conn:
            return [dict(row) for row in conn.execute(query, values).fetchall()]

    def decide_heal_suggestion(self, suggestion_id: str, decision: str) -> dict[str, Any] | None:
        if decision not in {"approved", "rejected"}:
            raise ValueError("无效的自愈处理结果")
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM locator_heal_suggestions WHERE suggestion_id=?", (suggestion_id,)).fetchone()
            if not row:
                return None
            if decision == "approved":
                element = conn.execute("SELECT * FROM elements WHERE element_id=?", (row["element_id"],)).fetchone()
                if not element:
                    return None
                fallbacks = json.loads(element["fallback_locators_json"] or "[]")
                old = {"type": element["locator_type"], "value": element["locator_value"]}
                fallbacks = [old, *[item for item in fallbacks if item != old and item != {"type": row["proposed_type"], "value": row["proposed_value"]}]]
                conn.execute("UPDATE elements SET locator_type=?, locator_value=?, fallback_locators_json=?, health_status='已修复', updated_at=? WHERE element_id=?", (row["proposed_type"], row["proposed_value"], self._json(fallbacks[:8]), now_iso(), row["element_id"]))
            conn.execute("UPDATE locator_heal_suggestions SET status=? WHERE suggestion_id=?", (decision, suggestion_id))
            result = conn.execute("SELECT * FROM locator_heal_suggestions WHERE suggestion_id=?", (suggestion_id,)).fetchone()
        return dict(result) if result else None

    def delete_flow(self, flow_id: str) -> bool:
        with self._connect() as conn:
            if conn.execute("SELECT 1 FROM test_cases WHERE automation_flow_id=?", (flow_id,)).fetchone():
                raise ValueError("自动化流程仍被测试用例引用，不能删除；请先解除绑定")
            try:
                cur = conn.execute("DELETE FROM flows WHERE flow_id=?", (flow_id,))
            except sqlite3.IntegrityError as exc:
                raise ValueError("自动化流程已有执行历史，不能删除；请保留流程以维护报告证据") from exc
        return cur.rowcount > 0

    def create_run(self, flow_id: str, environment_id: str | None, browser: str, dataset_name: str = "") -> dict[str, Any]:
        run_id = f"run-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:5]}"
        started_at = now_iso()
        with self._connect() as conn:
            conn.execute("INSERT INTO runs(run_id, flow_id, environment_id, browser, status, started_at, dataset_name) VALUES (?, ?, ?, ?, ?, ?, ?)", (run_id, flow_id, environment_id, browser, "RUNNING", started_at, dataset_name))
        return {"run_id": run_id, "flow_id": flow_id, "environment_id": environment_id, "browser": browser, "status": "RUNNING", "started_at": started_at, "ended_at": "", "report_path": "", "trace_path": "", "error_message": "", "dataset_name": dataset_name}

    def update_run_status(self, run_id: str, status: str, error_message: str = "") -> None:
        with self._connect() as conn:
            conn.execute("UPDATE runs SET status=?, error_message=? WHERE run_id=?", (status, error_message, run_id))

    def recover_incomplete_runs(self) -> dict[str, int]:
        """Recover interrupted executions while retaining their historical evidence."""
        with self._connect() as conn:
            runs = conn.execute(
                "UPDATE runs SET status='STOPPED', ended_at=?, error_message=? WHERE status='RUNNING'",
                (now_iso(), "程序重新启动时发现上次执行未完成"),
            ).rowcount
            regressions = conn.execute(
                "UPDATE regression_runs SET status='STOPPED', ended_at=? WHERE status='RUNNING'",
                (now_iso(),),
            ).rowcount
            missions = conn.execute(
                """UPDATE missions SET status='REPORT_COMPLETE', verdict='INCONCLUSIVE', progress=100,
                   blocking_reason=?, ended_at=?, updated_at=? WHERE status!='REPORT_COMPLETE'""",
                ("Lodestar 重启时任务仍未完成，已保留现场并标记为证据不足", now_iso(), now_iso()),
            ).rowcount
        return {"runs": runs, "regressions": regressions, "missions": missions}

    def finish_run(self, run_id: str, status: str, report_path: str = "", trace_path: str = "", error_message: str = "") -> None:
        with self._connect() as conn:
            conn.execute("UPDATE runs SET status=?, ended_at=?, report_path=?, trace_path=?, error_message=? WHERE run_id=?", (status, now_iso(), report_path, trace_path, error_message, run_id))

    def add_run_step(self, run_id: str, step: dict[str, Any]) -> str:
        run_step_id = f"run-step-{uuid.uuid4().hex[:10]}"
        with self._connect() as conn:
                conn.execute("""INSERT INTO run_steps(
                    run_step_id, run_id, step_id, step_no, status, started_at, ended_at, duration_ms,
                    message, error_message, screenshot_path, before_screenshot_path, after_screenshot_path, log_path, page_url, page_title,
                    action_spec_json, locator_json, dom_snapshot_path, console_summary, network_summary, attempts
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""", (
                    run_step_id, run_id, step.get("step_id", ""), step.get("step_no", 0), step.get("status", "FAIL"),
                    step.get("started_at", now_iso()), step.get("ended_at", now_iso()), int(step.get("duration_ms", 0)),
                    step.get("message", ""), step.get("error_message", ""), step.get("screenshot_path", ""),
                    step.get("before_screenshot_path", ""), step.get("after_screenshot_path", ""), step.get("log_path", ""),
                    step.get("page_url", ""), step.get("page_title", ""), self._json(step.get("action_spec", {})),
                    self._json(step.get("locator", {})), step.get("dom_snapshot_path", ""), step.get("console_summary", ""),
                    step.get("network_summary", ""), int(step.get("attempts", 0)),
                ))
        return run_step_id

    def add_artifact(self, run_id: str, artifact_type: str, path: str, run_step_id: str | None = None) -> None:
        with self._connect() as conn:
            conn.execute("INSERT INTO artifacts(artifact_id, run_id, run_step_id, type, path, created_at) VALUES (?, ?, ?, ?, ?, ?)", (f"artifact-{uuid.uuid4().hex[:10]}", run_id, run_step_id, artifact_type, path, now_iso()))

    def save_test_case(self, payload: dict[str, Any]) -> dict[str, Any]:
        case_id = payload.get("case_id") or f"TC-{uuid.uuid4().hex[:8].upper()}"
        ts = now_iso()
        title = str(payload.get("title", "")).strip()
        if not title:
            raise ValueError("用例名称不能为空")
        priority = payload.get("priority", "P1")
        if priority not in {"P0", "P1", "P2", "P3"}:
            raise ValueError("优先级必须是 P0/P1/P2/P3")
        flow_id = payload.get("automation_flow_id") or None
        with self._connect() as conn:
            # Case IDs are used as cross-table references, so they remain
            # globally unique.  Never let an upsert from another project
            # silently take ownership of an existing case.
            owner = conn.execute("SELECT project_id FROM test_cases WHERE case_id=?", (case_id,)).fetchone()
            if owner and owner["project_id"] != payload["project_id"]:
                raise ValueError("用例编号已属于其他项目；请修改编号后再保存")
            if flow_id and not conn.execute("SELECT 1 FROM flows WHERE flow_id=? AND project_id=?", (flow_id, payload["project_id"])).fetchone():
                raise ValueError("绑定的自动化流程不存在或不属于当前项目")
            conn.execute("""INSERT INTO test_cases(case_id, project_id, title, module, priority, case_type, preconditions, steps, test_data, expected, tags_json, status, automation_flow_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(case_id) DO UPDATE SET project_id=excluded.project_id, title=excluded.title, module=excluded.module, priority=excluded.priority, case_type=excluded.case_type, preconditions=excluded.preconditions, steps=excluded.steps, test_data=excluded.test_data, expected=excluded.expected, tags_json=excluded.tags_json, status=excluded.status, automation_flow_id=excluded.automation_flow_id, updated_at=excluded.updated_at""",
                (case_id, payload["project_id"], title, payload.get("module", ""), priority, payload.get("case_type", "回归测试"), payload.get("preconditions", ""), payload.get("steps", ""), payload.get("test_data", ""), payload.get("expected", ""), self._json(payload.get("tags", [])), payload.get("status", "已自动化" if flow_id else "未自动化"), flow_id, payload.get("created_at", ts), ts))
        return self.get_test_case(case_id) or {}

    def get_test_case(self, case_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM test_cases WHERE case_id=?", (case_id,)).fetchone()
        if not row:
            return None
        value = dict(row)
        value["tags"] = json.loads(value.pop("tags_json") or "[]")
        return value

    def list_test_cases(self, project_id: str, query: str = "", module: str = "", priority: str = "", status: str = "") -> list[dict[str, Any]]:
        sql = "SELECT * FROM test_cases WHERE project_id=?"
        params: list[Any] = [project_id]
        if query:
            sql += " AND (case_id LIKE ? OR title LIKE ?)"; params.extend([f"%{query}%", f"%{query}%"])
        if module:
            sql += " AND module=?"; params.append(module)
        if priority:
            sql += " AND priority=?"; params.append(priority)
        if status:
            sql += " AND status=?"; params.append(status)
        sql += " ORDER BY updated_at DESC"
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self.get_test_case(row["case_id"]) for row in rows if self.get_test_case(row["case_id"])]

    def get_test_case_history(self, case_id: str) -> dict[str, Any]:
        """Build lightweight execution history from existing Run/RunStep records."""
        with self._connect() as conn:
            rows = conn.execute(
                """SELECT r.run_id, r.started_at, r.ended_at, r.status, r.browser, r.environment_id,
                          COALESCE(e.name, '') AS environment_name,
                          COALESCE(SUM(rs.duration_ms), 0) AS duration_ms,
                          r.error_message
                   FROM runs r
                   JOIN flows f ON f.flow_id = r.flow_id
                   LEFT JOIN environments e ON e.id = r.environment_id
                   LEFT JOIN run_steps rs ON rs.run_id = r.run_id
                   JOIN test_cases tc ON tc.automation_flow_id = f.flow_id
                   WHERE tc.case_id = ?
                   GROUP BY r.run_id
                   ORDER BY r.started_at DESC""",
                (case_id,),
            ).fetchall()
        history = [dict(row) for row in rows]
        passed = sum(item.get("status") == "PASS" for item in history)
        failed = sum(item.get("status") == "FAIL" for item in history)
        latest = history[0] if history else None
        return {
            "case_id": case_id,
            "execution_count": len(history),
            "pass_count": passed,
            "fail_count": failed,
            "latest_run_at": latest.get("ended_at") or latest.get("started_at") if latest else "",
            "latest_status": latest.get("status", "") if latest else "",
            "latest_error": (latest.get("error_message") or "") if latest else "",
            "history": history,
        }

    def delete_test_case(self, case_id: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM test_cases WHERE case_id=?", (case_id,))
        return cur.rowcount > 0

    def delete_test_cases(self, project_id: str, case_ids: list[str]) -> int:
        ids = [str(item).strip() for item in case_ids if str(item).strip()]
        if not ids:
            return 0
        placeholders = ",".join("?" for _ in ids)
        with self._connect() as conn:
            cur = conn.execute(f"DELETE FROM test_cases WHERE project_id=? AND case_id IN ({placeholders})", [project_id, *ids])
        return cur.rowcount

    def save_regression_plan(self, payload: dict[str, Any]) -> dict[str, Any]:
        plan_id = payload.get("regression_plan_id") or f"plan-{uuid.uuid4().hex[:10]}"
        ts = now_iso()
        cases = payload.get("cases", [])
        with self._connect() as conn:
            conn.execute("""INSERT INTO regression_plans(regression_plan_id, project_id, name, description, environment_id, browser, stop_on_failure, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(regression_plan_id) DO UPDATE SET project_id=excluded.project_id, name=excluded.name, description=excluded.description, environment_id=excluded.environment_id, browser=excluded.browser, stop_on_failure=excluded.stop_on_failure, updated_at=excluded.updated_at""",
                (plan_id, payload["project_id"], payload.get("name", "新回归计划"), payload.get("description", ""), payload.get("environment_id"), payload.get("browser", "chromium"), int(bool(payload.get("stop_on_failure", False))), payload.get("created_at", ts), ts))
            conn.execute("DELETE FROM regression_plan_cases WHERE regression_plan_id=?", (plan_id,))
            for order, item in enumerate(cases):
                case_id = item.get("case_id") if isinstance(item, dict) else item
                if conn.execute("SELECT 1 FROM test_cases WHERE case_id=? AND project_id=? AND automation_flow_id IS NOT NULL", (case_id, payload["project_id"])).fetchone():
                    conn.execute("INSERT INTO regression_plan_cases(id, regression_plan_id, case_id, sort_order, enabled) VALUES (?, ?, ?, ?, ?)", (f"rpc-{uuid.uuid4().hex[:10]}", plan_id, case_id, order, int(item.get("enabled", True) if isinstance(item, dict) else True)))
        return self.get_regression_plan(plan_id) or {}

    def get_regression_plan(self, plan_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM regression_plans WHERE regression_plan_id=?", (plan_id,)).fetchone()
            if not row: return None
            cases = conn.execute("SELECT rpc.*, tc.title, tc.priority, tc.automation_flow_id FROM regression_plan_cases rpc JOIN test_cases tc ON tc.case_id=rpc.case_id WHERE rpc.regression_plan_id=? ORDER BY rpc.sort_order", (plan_id,)).fetchall()
        value = dict(row); value["stop_on_failure"] = bool(value["stop_on_failure"]); value["cases"] = [dict(item) for item in cases]; return value

    def list_regression_plans(self, project_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            ids = [row["regression_plan_id"] for row in conn.execute("SELECT regression_plan_id FROM regression_plans WHERE project_id=? ORDER BY updated_at DESC", (project_id,)).fetchall()]
        return [self.get_regression_plan(item) for item in ids]

    def delete_regression_plan(self, plan_id: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM regression_plans WHERE regression_plan_id=?", (plan_id,))
        return cur.rowcount > 0

    def create_regression_run(self, plan: dict[str, Any]) -> dict[str, Any]:
        run_id = f"reg-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:5]}"
        started_at = now_iso()
        with self._connect() as conn:
            conn.execute("INSERT INTO regression_runs(regression_run_id, regression_plan_id, environment_id, browser, status, started_at, total_cases) VALUES (?, ?, ?, ?, ?, ?, ?)", (run_id, plan["regression_plan_id"], plan.get("environment_id"), plan.get("browser", "chromium"), "RUNNING", started_at, len(plan.get("cases", []))))
        return {"regression_run_id": run_id, "regression_plan_id": plan["regression_plan_id"], "environment_id": plan.get("environment_id"), "browser": plan.get("browser", "chromium"), "status": "RUNNING", "started_at": started_at, "ended_at": "", "total_cases": len(plan.get("cases", [])), "passed_cases": 0, "failed_cases": 0, "skipped_cases": 0, "blocked_cases": 0, "report_path": ""}

    def add_regression_case(self, regression_run_id: str, case_id: str, run_id: str | None, sort_order: int, status: str, error_message: str = "") -> None:
        with self._connect() as conn:
            conn.execute("INSERT INTO regression_run_cases(id, regression_run_id, case_id, run_id, sort_order, status, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)", (f"rrc-{uuid.uuid4().hex[:10]}", regression_run_id, case_id, run_id, sort_order, status, error_message))

    def finish_regression_run(self, regression_run_id: str, status: str, counts: dict[str, int], report_path: str) -> None:
        with self._connect() as conn:
            conn.execute("UPDATE regression_runs SET status=?, ended_at=?, passed_cases=?, failed_cases=?, skipped_cases=?, blocked_cases=?, report_path=? WHERE regression_run_id=?", (status, now_iso(), counts.get("PASS", 0), counts.get("FAIL", 0), counts.get("SKIP", 0), counts.get("BLOCKED", 0), report_path, regression_run_id))

    def list_regression_runs(self, plan_id: str | None = None) -> list[dict[str, Any]]:
        with self._connect() as conn:
            if plan_id:
                rows = conn.execute("SELECT * FROM regression_runs WHERE regression_plan_id=? ORDER BY started_at DESC", (plan_id,)).fetchall()
            else:
                rows = conn.execute("SELECT * FROM regression_runs ORDER BY started_at DESC LIMIT 50").fetchall()
        return [dict(row) for row in rows]

    def get_regression_run(self, regression_run_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM regression_runs WHERE regression_run_id=?", (regression_run_id,)).fetchone()
        return dict(row) if row else None

    def list_regression_run_cases(self, regression_run_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT rrc.*, tc.title, tc.module, tc.priority, tc.automation_flow_id "
                "FROM regression_run_cases rrc JOIN test_cases tc ON tc.case_id=rrc.case_id "
                "WHERE rrc.regression_run_id=? ORDER BY rrc.sort_order, rrc.id",
                (regression_run_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def create_mission(self, payload: dict[str, Any], scenarios: list[dict[str, Any]]) -> dict[str, Any]:
        mission_id = f"mission-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:5]}"
        ts = now_iso()
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO missions(
                    mission_id, project_id, environment_id, objective, depth, status, verdict, progress,
                    case_ids_json, config_json, blocking_reason, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 'PLANNING', '', 5, ?, ?, '', ?, ?)""",
                (
                    mission_id, payload["project_id"], payload.get("environment_id"), payload.get("objective", ""),
                    payload.get("depth", "standard"), self._json(payload.get("case_ids", [])),
                    self._json(payload.get("config", {})), ts, ts,
                ),
            )
            for index, scenario in enumerate(scenarios, 1):
                scenario_id = f"scenario-{uuid.uuid4().hex[:10]}"
                conn.execute(
                    """INSERT INTO mission_scenarios(
                        scenario_id, mission_id, case_id, title, source_json, risk, preconditions, test_data,
                        execution_target, verification_rules_json, cleanup_strategy, status, sort_order
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)""",
                    (
                        scenario_id, mission_id, scenario.get("case_id", ""), scenario.get("title", ""),
                        self._json(scenario.get("source", {})), scenario.get("risk", "P1"),
                        scenario.get("preconditions", ""), scenario.get("test_data", ""),
                        scenario.get("execution_target", "ui"), self._json(scenario.get("verification_rules", [])),
                        scenario.get("cleanup_strategy", ""), int(scenario.get("sort_order", index)),
                    ),
                )
            conn.execute(
                "INSERT INTO mission_events(mission_id, event_type, phase, message, payload_json, created_at) VALUES (?, 'mission_created', 'PLANNING', ?, ?, ?)",
                (mission_id, "自主测试任务已创建", self._json({"scenarios": len(scenarios)}), ts),
            )
        return self.get_mission(mission_id) or {}

    @staticmethod
    def _decode_mission_row(row: sqlite3.Row | None) -> dict[str, Any] | None:
        if not row:
            return None
        value = dict(row)
        for column, target, fallback in (("case_ids_json", "case_ids", []), ("config_json", "config", {})):
            try:
                value[target] = json.loads(value.pop(column) or json.dumps(fallback))
            except (TypeError, json.JSONDecodeError):
                value[target] = fallback
        return value

    @staticmethod
    def _decode_scenario_row(row: sqlite3.Row) -> dict[str, Any]:
        value = dict(row)
        for column, target, fallback in (
            ("source_json", "source", {}),
            ("verification_rules_json", "verification_rules", []),
            ("findings_json", "findings", []),
            ("tapd_draft_json", "tapd_draft", {}),
        ):
            try:
                value[target] = json.loads(value.pop(column) or json.dumps(fallback))
            except (TypeError, json.JSONDecodeError):
                value[target] = fallback
        return value

    def get_mission(self, mission_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            mission = self._decode_mission_row(conn.execute("SELECT * FROM missions WHERE mission_id=?", (mission_id,)).fetchone())
            if not mission:
                return None
            scenario_rows = conn.execute("SELECT * FROM mission_scenarios WHERE mission_id=? ORDER BY sort_order, scenario_id", (mission_id,)).fetchall()
            ledger_rows = conn.execute("SELECT * FROM mission_step_ledger WHERE mission_id=? ORDER BY scenario_id, source_step_no", (mission_id,)).fetchall()
            verification_rows = conn.execute("SELECT * FROM mission_verifications WHERE mission_id=? ORDER BY scenario_id, verification_id", (mission_id,)).fetchall()
            event_rows = conn.execute("SELECT * FROM mission_events WHERE mission_id=? ORDER BY event_id", (mission_id,)).fetchall()
        mission["scenarios"] = [self._decode_scenario_row(row) for row in scenario_rows]
        mission["ledger"] = []
        for row in ledger_rows:
            value = dict(row)
            try:
                value["evidence"] = json.loads(value.pop("evidence_json") or "[]")
            except (TypeError, json.JSONDecodeError):
                value["evidence"] = []
            mission["ledger"].append(value)
        mission["verifications"] = []
        for row in verification_rows:
            value = dict(row)
            try:
                value["evidence"] = json.loads(value.pop("evidence_json") or "[]")
            except (TypeError, json.JSONDecodeError):
                value["evidence"] = []
            mission["verifications"].append(value)
        mission["events"] = []
        for row in event_rows:
            value = dict(row)
            try:
                value["payload"] = json.loads(value.pop("payload_json") or "{}")
            except (TypeError, json.JSONDecodeError):
                value["payload"] = {}
            mission["events"].append(value)
        mission["summary"] = {
            "total": len(mission["scenarios"]),
            "passed": sum(item.get("verdict") == "PASS" for item in mission["scenarios"]),
            "failed": sum(item.get("verdict") == "FAIL" for item in mission["scenarios"]),
            "blocked": sum(item.get("verdict") == "BLOCKED" for item in mission["scenarios"]),
            "inconclusive": sum(item.get("verdict") == "INCONCLUSIVE" for item in mission["scenarios"]),
        }
        return mission

    def list_missions(self, project_id: str, limit: int = 50) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM missions WHERE project_id=? ORDER BY created_at DESC LIMIT ?",
                (project_id, max(1, min(int(limit), 200))),
            ).fetchall()
        return [self._decode_mission_row(row) or {} for row in rows]

    def update_mission(self, mission_id: str, *, status: str | None = None, verdict: str | None = None,
                       progress: int | None = None, blocking_reason: str | None = None,
                       started: bool = False, ended: bool = False) -> dict[str, Any] | None:
        fields = ["updated_at=?"]
        values: list[Any] = [now_iso()]
        for column, value in (("status", status), ("verdict", verdict), ("progress", progress), ("blocking_reason", blocking_reason)):
            if value is not None:
                fields.append(f"{column}=?")
                values.append(value)
        if started:
            fields.append("started_at=CASE WHEN started_at='' THEN ? ELSE started_at END")
            values.append(now_iso())
        if ended:
            fields.append("ended_at=?")
            values.append(now_iso())
        values.append(mission_id)
        with self._connect() as conn:
            conn.execute(f"UPDATE missions SET {', '.join(fields)} WHERE mission_id=?", values)
        return self.get_mission(mission_id)

    def add_mission_event(self, mission_id: str, event_type: str, phase: str, message: str,
                          payload: dict[str, Any] | None = None) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO mission_events(mission_id, event_type, phase, message, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (mission_id, event_type, phase, message, self._json(payload or {}), now_iso()),
            )

    def update_mission_scenario(self, scenario_id: str, *, status: str | None = None, verdict: str | None = None,
                                run_id: str | None = None, findings: list[dict[str, Any]] | None = None,
                                started: bool = False, ended: bool = False, reproduction_run_id: str | None = None,
                                reproduction_verdict: str | None = None, failure_classification: str | None = None,
                                reproduction_confidence: int | None = None, tapd_draft: dict[str, str] | None = None) -> None:
        fields: list[str] = []
        values: list[Any] = []
        for column, value in (
            ("status", status), ("verdict", verdict), ("run_id", run_id),
            ("reproduction_run_id", reproduction_run_id), ("reproduction_verdict", reproduction_verdict),
            ("failure_classification", failure_classification), ("reproduction_confidence", reproduction_confidence),
        ):
            if value is not None:
                fields.append(f"{column}=?")
                values.append(value)
        if findings is not None:
            fields.append("findings_json=?")
            values.append(self._json(findings))
        if tapd_draft is not None:
            fields.append("tapd_draft_json=?")
            values.append(self._json(tapd_draft))
        if started:
            fields.append("started_at=CASE WHEN started_at='' THEN ? ELSE started_at END")
            values.append(now_iso())
        if ended:
            fields.append("ended_at=?")
            values.append(now_iso())
        if not fields:
            return
        values.append(scenario_id)
        with self._connect() as conn:
            conn.execute(f"UPDATE mission_scenarios SET {', '.join(fields)} WHERE scenario_id=?", values)

    def save_mission_verdict(self, mission_id: str, scenario_id: str, result: dict[str, Any]) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM mission_step_ledger WHERE scenario_id=?", (scenario_id,))
            conn.execute("DELETE FROM mission_verifications WHERE scenario_id=?", (scenario_id,))
            for item in result.get("ledger", []):
                conn.execute(
                    """INSERT INTO mission_step_ledger(
                        ledger_id, mission_id, scenario_id, source_step_no, source_step_id, source_text,
                        actual_action, postcondition, evidence_json, status, run_step_id, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        f"ledger-{uuid.uuid4().hex[:10]}", mission_id, scenario_id, int(item.get("source_step_no", 0)),
                        item.get("source_step_id", ""), item.get("source_text", ""), item.get("actual_action", ""),
                        item.get("postcondition", ""), self._json(item.get("evidence", [])), item.get("status", "INCONCLUSIVE"),
                        item.get("run_step_id", ""), now_iso(),
                    ),
                )
            for item in result.get("verifications", []):
                conn.execute(
                    """INSERT INTO mission_verifications(
                        verification_id, mission_id, scenario_id, layer, status, rule_text, observed, evidence_json, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        f"verify-{uuid.uuid4().hex[:10]}", mission_id, scenario_id, item.get("layer", "ui"),
                        item.get("status", "INCONCLUSIVE"), item.get("rule", ""), item.get("observed", ""),
                        self._json(item.get("evidence", [])), now_iso(),
                    ),
                )

    def list_runs(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM runs ORDER BY started_at DESC LIMIT ?", (limit,)).fetchall()
        return [dict(row) for row in rows]

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM runs WHERE run_id=?", (run_id,)).fetchone()
        return dict(row) if row else None

    def list_run_steps(self, run_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM run_steps WHERE run_id=? ORDER BY step_no", (run_id,)).fetchall()
        results: list[dict[str, Any]] = []
        for row in rows:
            value = dict(row)
            try:
                action_spec = json.loads(value.get("action_spec_json") or "{}")
            except (TypeError, json.JSONDecodeError):
                action_spec = {}
            value["action_spec"] = action_spec
            value["name"] = action_spec.get("name", "")
            value["action"] = action_spec.get("action", "")
            results.append(value)
        return results
