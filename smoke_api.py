import json
import time
import urllib.request

BASE = "http://127.0.0.1:8765/api"


def request(path: str, data: dict | None = None):
    body = json.dumps(data, ensure_ascii=False).encode() if data else None
    req = urllib.request.Request(BASE + path, data=body, headers={"Content-Type": "application/json"}, method="POST" if data else "GET")
    with urllib.request.urlopen(req, timeout=10) as response:
        return json.load(response)


for element in [
    {"project_id": "project-demo", "element_id": "u-api", "name": "用户名", "locator_type": "label", "locator_value": "用户名"},
    {"project_id": "project-demo", "element_id": "p-api", "name": "密码", "locator_type": "label", "locator_value": "密码"},
    {"project_id": "project-demo", "element_id": "b-api", "name": "登录", "locator_type": "testid", "locator_value": "login-button"},
    {"project_id": "project-demo", "element_id": "m-api", "name": "提示", "locator_type": "css", "locator_value": "#message"},
]:
    request("/elements", element)

flow = request("/flows", {"project_id": "project-demo", "name": "API本地验证", "environment_id": "env-demo", "steps": [
    {"id": "a1", "name": "打开", "action": "open", "value": "http://127.0.0.1:8877/"},
    {"id": "a2", "name": "用户名", "action": "fill", "element_id": "u-api", "value": "alice"},
    {"id": "a3", "name": "密码", "action": "fill", "element_id": "p-api", "value": "secret"},
    {"id": "a4", "name": "登录", "action": "click", "element_id": "b-api", "screenshot": True},
    {"id": "a5", "name": "断言", "action": "assert_text", "element_id": "m-api", "expected": "保存成功"},
]})
run = request("/runs", {"flow_id": flow["flow_id"], "environment_id": "env-demo", "browser": "chromium"})
print(run["run_id"])
for _ in range(30):
    time.sleep(0.5)
    current = next(item for item in request("/runs") if item["run_id"] == run["run_id"])
    print(current["status"])
    if current["status"] != "RUNNING":
        print(json.dumps(current, ensure_ascii=False))
        break
