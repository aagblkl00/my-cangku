# Lodestar 分发与运行说明

## 产品形态

Lodestar 为 Windows 桌面客户端：Tauri 2 桌面壳 + React 界面 + Python 侧车进程（Playwright 执行引擎）。

- 安装包：NSIS，文件名形如 `Lodestar_<版本>_x64-setup.exe`，当前用户安装模式
- 侧车可执行文件：`lodestar-sidecar`（PyInstaller 打包，随安装包分发）
- 发布渠道：GitHub Releases（https://github.com/aagblkl00/my-cangku/releases）

## 运行与端口

- 桌面端由 `backend.launcher` 启动本地服务，只监听 `127.0.0.1`
- 默认端口 8765；被占用时自动选择其他本地端口，并写入数据目录的 `runtime.json`
- 可用环境变量：`AUTOMATION_STUDIO_DATA_DIR`（数据目录）、`AUTOMATION_STUDIO_PORT`（端口）、`AUTOMATION_STUDIO_HOST`（默认 127.0.0.1）

## 用户数据

生产模式数据默认目录：`D:\Lodestar\data`

包含 `studio.db`、`runs`、`reports`、`screenshots`、`logs`、`traces`、`downloads`、`browsers`。程序安装目录只保存程序与前端资源，升级不会覆盖用户数据。

## 项目包导出 / 导入

- 导出：`GET /api/projects/{project_id}/export`，返回 `.automationstudio` ZIP（含 `project.json`）
- 密码、Token、Secret、API Key 字段导出为 `${PASSWORD}`
- 导入：`POST /api/projects/import`，请求体 `{ "content_base64": "...", "name": "可选的新项目名称" }`
- 导入创建新项目，不覆盖现有项目，并自动重映射环境、元素、流程、用例和回归计划编号

## Windows 打包（发布方）

需要 Rust 工具链与 Node.js：

```powershell
cd frontend
npm install
npm run tauri build
```

安装包输出：`frontend/src-tauri/target/release/bundle/nsis/`。便携布局为 `app/Lodestar.exe` + 同级 `data/`。

- 侧车进程用 PyInstaller 构建（依赖见 `requirements-build.txt`），产物放在 `frontend/src-tauri/binaries/lodestar-sidecar`
- 正式包不得包含 `data/studio.db`、`runs`、`reports`、`test_fixture` 或真实凭据
- 发布到 Releases 时，在 Release 说明中附带安装包 SHA-256 校验值

## 代码签名与安全提示

当前安装包未做代码签名，用户首次下载/运行会遇到 SmartScreen「未知发布者」提示；处理方法见 README「安全说明」与《安装说明.txt》。后续接入 OV/EV 代码签名证书后可显著减少此类提示。