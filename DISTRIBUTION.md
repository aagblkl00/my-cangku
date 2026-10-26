# Automation Studio 分发与运行说明

## 开发模式

开发模式仍可使用仓库内的 `.venv`、SQLite 和 `frontend/dist`：

```powershell
.\.venv\Scripts\python.exe -m backend.app
cd frontend
pnpm run dev
```

生产模式由 `backend.launcher` 统一启动。它只监听 `127.0.0.1`，默认使用 8765；端口被占用时会自动选择其他本地端口，并写入用户数据目录的 `runtime.json`。

## 用户数据

生产模式数据默认位于：

`%LOCALAPPDATA%\AutomationStudio`

其中包括 `studio.db`、`runs`、`reports`、`screenshots`、`logs`、`traces`、`downloads` 和 `browsers`。程序安装目录只保存程序和前端资源，升级不会覆盖用户项目。

## 项目包

项目导出接口：

`GET /api/projects/{project_id}/export`

返回 `.automationstudio` ZIP，包含 `project.json`。密码、Token、Secret 和 API Key 字段导出为 `${PASSWORD}`。导入接口：

`POST /api/projects/import`

请求体为 `{ "content_base64": "...", "name": "可选的新项目名称" }`。导入会创建新项目，不覆盖当前项目，并自动重映射环境、元素、流程、用例和回归计划编号。

## Windows 打包

1. 使用 `frontend` 的 `pnpm build` 生成 `frontend/dist`。
2. 在已安装 PyInstaller 的构建机运行 `build\windows\build.ps1`。
3. 如果安装了 Inno Setup，将进一步生成 `AutomationStudio-Setup.exe`；否则会先得到 `dist\AutomationStudio` 可分发目录。

正式包不得包含 `data\studio.db`、`runs`、`reports`、`test_fixture` 或真实凭据。

卸载程序默认保留 `%LOCALAPPDATA%\AutomationStudio`，卸载时会明确询问是否删除项目、流程、测试用例和执行记录。
