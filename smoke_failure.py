import json
import time
import urllib.request

BASE = "http://127.0.0.1:8765/api"


def request(path: str, data: dict | None = None):
    body = json.dumps(data, ensure_ascii=False).encode() if data else None
    req = urllib.request.Request(BASE + path, data=body, headers={"Content-Type": "application/json"}, method="POST" if data else "GET")
    with urllib.request.urlopen(req, timeout=10) as response:
        return json.load(response)


flow = request("/flows", {"project_id": "project-demo", "name": "失败证据验证", "environment_id": "env-demo", "steps": [
    {"id": "f1", "name": "打开", "action": "open", "value": "http://127.0.0.1:8877/"},
    {"id": "f2", "name": "错误定位", "action": "click", "element_id": "missing-api", "screenshot": True},
]})
request("/elements", {"project_id": "project-demo", "element_id": "missing-api", "name": "不存在按钮", "locator_type": "css", "locator_value": "#missing"})
run = request("/runs", {"flow_id": flow["flow_id"], "environment_id": "env-demo", "browser": "chromium"})
for _ in range(30):
    time.sleep(0.5)
    current = next(item for item in request("/runs") if item["run_id"] == run["run_id"])
    if current["status"] != "RUNNING":
        print(json.dumps(current, ensure_ascii=False))
        break
