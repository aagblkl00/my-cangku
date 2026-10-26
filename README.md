# Lodestar 自动化测试工作台

桌面化的自动化测试 IDE：以真实业务链路为中心，把测试用例、流程录制、执行证据、缺陷草稿和 CI 门禁串成一条可持续演进的测试闭环。数据与运行产物保存在本机，界面为 Windows 桌面客户端形态（单层标题栏、多编辑器标签、命令中心、托盘常驻）。

## 功能特性

- 项目与测试环境：项目隔离、环境地址、只读模式、请求域名白名单
- 测试用例：Excel / CSV / JSON 导入校验，执行准备度检查
- 自动化流程：可见浏览器录制、步骤编排、变量替换、丰富断言、断点与单步调试
- 执行中心：Playwright 执行，截图 / DOM / Console / Network / Trace 证据链，HTML 报告
- 元素资产：定位器维护与健康检查，主定位器失效时自动降级备用定位器，AI 辅助修复并人工确认
- 缺陷草稿：只根据真实失败证据生成 TAPD 五字段，不做无证据推断
- 持续集成：Jenkins / GitLab CI / GitHub Actions 命令生成，统一退出码与 JUnit 报告门禁
- AI 协作台：支持本地模型或外部 API，失败归因、需求大脑、流程生成与诊断

## 技术架构

- 桌面壳：Tauri 2 + React + TypeScript（Windows）
- 执行引擎：Python sidecar（Playwright）+ SQLite
- 界面：Windows 11 风格单层标题栏、命令中心（Ctrl+K）、应用菜单、多编辑器标签

## 目录结构

```
backend/                  Python 服务与 Playwright 执行引擎
frontend/                 React 桌面界面
frontend/src-tauri/       Tauri 桌面壳与打包配置
tests/                    后端测试
```

## 本地开发

```powershell
# 终端一：后端
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m playwright install chromium
.\.venv\Scripts\python.exe -m backend.app

# 终端二：前端
cd frontend
npm install
npm run dev
```

浏览器打开 http://127.0.0.1:5173/（网页界面仅用于开发调试，发布版为纯桌面客户端）。

## 打包（Windows）

需要 Rust 工具链与 Node.js：

```powershell
cd frontend
npm install
npm run tauri build
```

安装包输出在 `frontend/src-tauri/target/release/bundle/nsis/`。便携布局为 `app/Lodestar.exe` + 同级 `data/` 数据目录。

## 开源与许可

- 代码以 MIT 协议开源，见 `LICENSE`。
- `frontend/src-tauri/icons/` 与 `frontend/public/brand/` 中的品牌图标、壁纸为项目自备素材，对外分发前请确认这些图片的使用权利。