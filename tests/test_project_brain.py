import tempfile
import unittest
from pathlib import Path

from backend.store import StudioStore


def _case(project_id: str) -> dict[str, object]:
    return {
        "case_id": "TC-PRODUCT-001",
        "project_id": project_id,
        "title": "新增商品名称边界",
        "module": "商品库",
        "priority": "P0",
        "steps": "输入商品名称并保存",
        "expected": "符合长度规则时保存成功",
    }


class ProjectBrainTests(unittest.TestCase):
    def _store(self, name: str) -> tuple[tempfile.TemporaryDirectory[str], StudioStore]:
        temporary = tempfile.TemporaryDirectory(prefix=name, dir=Path(__file__).parent)
        return temporary, StudioStore(Path(temporary.name) / "studio.db")

    def test_requirement_import_builds_versioned_project_brain(self) -> None:
        temporary, store = self._store("brain-")
        with temporary:
            project = store.create_project("动态项目大脑")
            store.save_test_case(_case(project["id"]))
            first = store.import_requirement(project["id"], {
                "title": "商品新增规则",
                "module": "商品库",
                "source_type": "markdown",
                "source_name": "商品库.md",
                "content": "商品 → SKU → 订单\n商品名称必须保持唯一。",
            })
            self.assertEqual("NEW", first["import_result"])
            self.assertEqual(1, first["requirement"]["current_version_no"])
            self.assertEqual("TC-PRODUCT-001", first["affected_cases"][0]["case_id"])
            brain = store.get_project_brain(project["id"])
            self.assertEqual(1, brain["summary"]["requirements"])
            self.assertGreaterEqual(brain["summary"]["entities"], 3)
            self.assertEqual(2, brain["summary"]["relations"])
            self.assertEqual(1, brain["summary"]["active_rules"])
            self.assertEqual(1, brain["summary"]["impacted_cases"])

    def test_duplicate_and_changed_requirement_need_explicit_review(self) -> None:
        temporary, store = self._store("versions-")
        with temporary:
            project = store.create_project("需求版本审核")
            payload = {"title": "退款金额规则", "module": "退款审批", "content": "退款金额不得超过可退金额。"}
            first = store.import_requirement(project["id"], payload)
            duplicate = store.import_requirement(project["id"], payload)
            self.assertEqual("DUPLICATE", duplicate["import_result"])
            self.assertEqual(1, len(store.list_requirement_versions(first["requirement"]["requirement_id"])))

            changed = store.import_requirement(project["id"], {**payload, "content": "退款金额不得超过可退金额，拒绝原因必须填写。"})
            requirement = changed["requirement"]
            self.assertEqual("UPDATED", changed["import_result"])
            self.assertEqual("pending_review", requirement["status"])
            self.assertEqual(1, requirement["current_version_no"])
            self.assertEqual(2, requirement["latest_version_no"])
            self.assertEqual("pending", requirement["latest_review_status"])

            activated = store.review_requirement_version(requirement["latest_version_id"], "activate")
            self.assertIsNotNone(activated)
            self.assertEqual("active", activated["status"])
            self.assertEqual(2, activated["current_version_no"])
            versions = store.list_requirement_versions(requirement["requirement_id"])
            self.assertEqual(["active", "superseded"], [item["review_status"] for item in versions])
            brain = store.get_project_brain(project["id"])
            self.assertEqual(1, sum(item["status"] == "active" for item in brain["rules"]))
            self.assertEqual(1, sum(item["status"] == "superseded" for item in brain["rules"]))

    def test_rejected_change_keeps_current_version(self) -> None:
        temporary, store = self._store("rejected-")
        with temporary:
            project = store.create_project("拒绝需求变更")
            first = store.import_requirement(project["id"], {"title": "订单规则", "module": "交付订单", "content": "订单不得重复。"})
            changed = store.import_requirement(project["id"], {"title": "订单规则", "module": "交付订单", "content": "订单允许重复。"})
            rejected = store.review_requirement_version(changed["requirement"]["latest_version_id"], "reject")
            self.assertIsNotNone(rejected)
            self.assertEqual(first["requirement"]["current_version_id"], rejected["current_version_id"])
            self.assertEqual(1, rejected["current_version_no"])
            self.assertEqual("rejected", store.list_requirement_versions(rejected["requirement_id"])[0]["review_status"])

    def test_schema_upgrade_reaches_version_six(self) -> None:
        temporary, store = self._store("schema-")
        with temporary:
            with store._connect() as conn:
                version = conn.execute("SELECT MAX(schema_version) FROM schema_meta").fetchone()[0]
            self.assertEqual(6, version)


if __name__ == "__main__":
    unittest.main()
