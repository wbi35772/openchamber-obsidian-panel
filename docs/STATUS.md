# 项目状态快照（2026-11-05）

> 交接文档。用于第二天继续时快速恢复上下文：做到哪、怎么验证、下一步做什么。
> 最新代码提交见 `git log`；本文件随每次阶段性收尾更新。

## 一句话

`obsidian-panel` 扩展把「Brain 任务中枢（中文）」和「真实本地 Obsidian 窗口（英文面板 UI）」
合并进 OpenChamber 右侧同一个人工分栏面板；分栏方向可选、分隔条可拖拽；服务层同时提供
Obsidian Local REST API 桥，供 Brain 与 Agent 读写知识库。

## 当前状态

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| 右栏合并面板（Brain + Obsidian） | 可用 | 自绘分栏；Obsidian 通过 CDP 拉帧 + 输入转发 |
| 布局：上下 / 左右 手动二选一 | 已修 | 顶栏 `⇅ Stacked` / `⇄ Side by side`，默认上下 |
| 分隔条拖拽 / 键盘调整 / 双击复位 | 已修 | 方向自适应；双击回到 0.38 |
| 布局持久化 | 已修 | 新键 `panel-layout`，旧键 `layout` 故意忽略 |
| Brain 行选择 / 状态切换 / 派发 / 写入对话 / 打开 | 已修 | 刷新与用户操作拆成两个状态位 |
| 仓库标签切换（多 vault） | 已修 | `#vaults` 不再被误隐藏；点击走 `/obsidian/select` |
| 全屏 Brain 页 | 可用 | 项目/任务 CRUD、会话同步、派发 |
| 左侧紧凑 Brain 状态区 | 可用 | 与右栏共用 `createBrainPane` |
| REST 桥 + MCP（cyanheads 3.8.0） | 可用 | 12 工具已连 |
| Agent 派发到新会话 | 已通 | `start-session` 带 `projectId` + 中文 brief + 笔记 URL |
| T0 插件预装 | 完成 | Local REST API、Dataview、Templater、Breadcrumbs、Juggl、Excalidraw 等 |
| 架构节点 + Canvas 总图 | 未开始 | 20 个节点，接 Breadcrumbs/Juggl |
| Docs/Rules 注入 | 未开始 | 任务卡 → 会话规则注入 |

## 本轮修复（会话收尾前）

1. **布局方向**：补上 `split.style.flexDirection`，删除多余的 Swap 按钮；存储键迁移到
   `panel-layout`，避免历史「左右」选择覆盖默认值。
2. **Brain 点击无反应**：根因是自动刷新与交互共用 `busy` 标志，刷新期间点击被丢弃、
   控件全禁用。拆出 `refreshing`/`rerun`，刷新中仍可交互；刷新请求排队重跑。
3. **仓库标签消失**：仓库 HTML 与打包 JS 版本不一致（存在 `#layout-swap` 幽灵引用），
   初始化在空节点上 `addEventListener` 抛错，后续 UI 全部未接线。已重建并同步 8 个文件。
4. **可观测性**：顶栏新增 `#boot-error` 红条；Brain 区块节点缺失时给出明确提示而不是静默失败。

## 验证证据

- 构建：`npm run build` + 对 `panel/main.js`、`brain/section.js`、`service/main.js`
  跑 `node --check`，全过。
- 假宿主全链路（Chrome + iframe 模拟 host 协议）：
  - 启动日志 `hello → storage×2 → status → projects → workspace-read → note → tasks`；
  - 选行后操作栏出现（派发到 Agent / 写入对话 / 打开）；
  - 派发产生 `start-session`（`providerId=obsidian`、任务路径、中文 brief、`projectId`）；
  - 改状态写入 `frontmatter` 并追加 `append` 日志；
  - 点仓库标签触发 `/obsidian/select {targetId}`，状态变为 `Connected · notes`；
  - 布局按钮切换 + 拖分隔条，持久化为 `{direction:"row",ratio:0.46}`；
  - 画面点击转成 `surface-input` 指针事件；
  - `boot-error` 为空。
- 安装目录 8 个文件 SHA256 与仓库一致：`package.json`、`panel/index.html`、
  `panel/main.js`、`brain/index.html`、`brain/main.js`、`brain/section.html`、
  `brain/section.js`、`service/main.js`。
- **尚未在宿主 Electron 内实测**（无 CDP 可挂载），需要 `Ctrl+R` 后人工确认。

## 待用户实测（下轮开场）

1. `Ctrl+R` 后默认是否为「上下」布局。
2. 点任务行是否出现操作栏，状态下拉/派发/写入对话/打开是否都能点。
3. Obsidian 工具条是否出现 `brain / 归纳` 两个仓库标签并可切换。
4. Obsidian 画面输入：鼠标点击、滚轮、键盘、中文输入法、粘贴、右键。
5. 顶栏是否出现红色报错条（若出现，把文字发来）。

## 下一轮待办（按优先级）

1. **宿主实测反馈修复**（P0）：上面 5 条里任何失败项。
2. **架构图谱**（P1）：建 20 个架构节点，生成 `30-地图/架构.canvas`，
   接 Breadcrumbs/Juggl 视图；节点与 D 盘资产台账映射。
3. **Docs/Rules 注入**（P1）：派发时把项目 `AGENTS.md`/规则片段注入会话；
   Brain 侧加 Docs/Rules 标签。
4. **任务卡闭环**（P2）：派发后把 `session_id`/`session_title` 写回卡片，
   执行结果追加到 `## Agent Execution Log`。
5. **B 卷底座映射**（P2）：把 `D:\brain` 顶层结构映射到现有中文目录，不重排编号。
6. **只保留右栏 Brain 的取舍**（P2）：若不需要左侧 `statusSection`，从
   `package.json` 删除并同步。

## 架构与文件地图

```
obsidian-panel/
├─ package.json             扩展清单（panel / page / statusSection / service）
├─ panel/
│  ├─ index.html            合并面板 DOM + 全部样式
│  └─ main.js               构建产物：layout、vaults、surface 输入、Brain
├─ brain/
│  ├─ index.html|main.js    全屏 Brain
│  └─ section.html|section.js  左侧紧凑 Brain（薄入口）
├─ service/main.js          构建产物：HTTP 路由 + CDP + REST 桥
├─ src/
│  ├─ panel.js              分栏容器、帧轮询、坐标映射、输入转发
│  ├─ brainpane.js          createBrainPane(host, root)，三处共用
│  ├─ brain.js              全屏 Brain
│  ├─ section.js            createBrainPane 入口
│  ├─ service.js            HTTP 路由 + surface 桥 + vault REST 桥
│  ├─ obsidian.js           CDP 运行时、多 vault、看门狗
│  ├─ surface.js            CDP 输入分发 + 截图
│  ├─ cdp.js / window.js    CDP 客户端 / Win32 窗口
│  └─ rest.js               Local REST API 客户端（If-Match 单写队列）
└─ scripts/build.mjs        esbuild：service / panel / brain / section
```

## 关键接口

宿主代理（所有服务调用都走这里）：

```
POST http://127.0.0.1:53253/api/guests/obsidian-panel/service/request
body: { method, path, body(JSON 字符串), viewerId }
GET  http://127.0.0.1:53253/api/guests    # revision / entry / service 状态
GET  http://127.0.0.1:53253/api/guests/obsidian-panel/service/status
```

面板/桥接路由：

- `/obsidian/status|targets|select|open|launch|restart|show|pick`
- `/obsidian/rest/surface-frame|surface-input|surface-control|surface-resize|surface-clipboard`
- `/obsidian/rest/service-info`、`/obsidian/open`（http(s) 跳转页，供 startSession 使用）
- `/obsidian/rest/{projects,note,frontmatter,append,open,search,list,outline,section,write,project/init,task/create,tasks,config}`

宿主 SDK 要点：

- `connectHost()`、`onReady`（可多监听）、`serviceRequest`、`storage.get/set`
- `listProjects`/`listSessions` 依赖 `workspace-read` 回包含 `kind` + `state`
- `startSession({providerId,id,title,url,text,projectId?,navigation:'open'})`；
  `url` 只接受 http(s)，因此用 `/obsidian/open` 跳转页
- 一个扩展只能有一个 `panel`；不带 `service.surface` 时 `panel.entry` 占满面板

## 数据位置

- 源码仓库：`D:\Project\Openchamber\初始配置\obsidian-panel`
- 已安装扩展：`C:\Users\24999\.config\openchamber\extensions\obsidian-panel`
- 知识库：`D:\brain`；项目目录 `20-笔记/项目/初始配置`
- Obsidian Local REST API：`27223`（https `27224`），key 在
  `.obsidian/plugins/obsidian-local-rest-api/data.json`（不要输出到日志）
- 面板布局状态：`%LOCALAPPDATA%\OpenChamber\obsidian-panel\state.json`
- 调试端口每次重启变化：读 `/obsidian/status.debugPort`

## 构建 / 同步 / 重载

```powershell
cd 'D:\Project\Openchamber\初始配置\obsidian-panel'
npm run build
node --check panel/main.js
node --check brain/section.js
node --check service/main.js

# 同步到已安装目录（8 个文件）
$src='D:\Project\Openchamber\初始配置\obsidian-panel'
$dst='C:\Users\24999\.config\openchamber\extensions\obsidian-panel'
foreach ($f in 'package.json','panel\index.html','panel\main.js','brain\index.html','brain\main.js','brain\section.html','brain\section.js','service\main.js') {
  Copy-Item -Force (Join-Path $src $f) (Join-Path $dst $f)
}
```

然后 `Ctrl+R` 重载渲染器（宿主会重启 guest service）。

## 已知限制与坑

- 宿主 Electron 无 `DevToolsActivePort`，无法 CDP 挂 UI；验证靠假宿主 harness + 用户实测。
- PowerShell 的 `Invoke-WebRequest`/`ConvertFrom-Json` 会破坏中文路径与 JSON，探测用 Node。
- 服务进程被手动 kill 后，宿主不会自动拉起；`Ctrl+R` 恢复。
- Git 推送需 `HTTPS_PROXY=http://127.0.0.1:10809`；`socks5h://` 会 TLS 失败。
- 服务重启后端口变化，旧会话卡上的 `/obsidian/open` 链接失效，重新派发即可。
- 扩展页面 iframe 内才有 host bridge；顶层直开会报 `No host frame.`。
- 布局旧键 `layout` 中的左右选择会被忽略，这是有意行为。

## 恢复检查清单

1. `GET /api/guests` 看 `revision` 是否递增、`entry` 是否为 `panel/index.html`、name 是否 `Brain + Obsidian`。
2. `GET /api/guests/obsidian-panel/service/status` 应为 `{"status":"ready"}`。
3. 若 `stopped`：`Ctrl+R`；仍不行再查服务进程与端口占用。
4. 面板顶栏有红条时，优先读其中的错误文本，再看 `panel/main.js` 是否与 HTML 同版本。
