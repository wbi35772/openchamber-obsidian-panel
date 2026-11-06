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
| Brain 项目下拉 | 已修 | 仅在选项内容变化时重建，刷新不再关闭展开的下拉 |
| 新建知识库项目 → 注册进 OpenChamber | 已通 | `project/init` 后调 `project/register` 写 `settings.json`；提示 Ctrl+R 刷新左栏 |
| 右栏内联新建任务 | 已加 | 空任务列表直接出标题输入框，Enter/创建写 `task/create` |
| 仓库标签切换（多 vault） | 已修 | `#vaults` 不再被误隐藏；点击走 `/obsidian/select` |
| 全屏 Brain 页 | 可用 | 项目/任务 CRUD、会话同步、派发 |
| 左侧紧凑 Brain 状态区 | 已修 | 不再依赖宿主 `ready`；无 `ready` 也能出项目选项并新建 |
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
5. **项目下拉点不开**：`renderProjects()` 每次渲染都 `replaceChildren` 重建整个 `<select>`，
   而窗口获得焦点与 10 秒定时刷新都会触发 `render()`，原生下拉刚展开就被销毁。
   改为按选项签名重建（内容不变则不动 DOM），`value`/`disabled` 也只在变化时写。
6. **左侧状态区「选择项目」空、无「＋ 新建项目…」**：状态区 iframe 从未收到宿主
   `ready` 推送，而 `refresh()` 和首次 `render()` 都被 `ready` 门禁挡住，导致下拉
   只有空壳、点击无反应。改为面板创建即渲染、`refresh` 不再等 `ready`、
   `host.listProjects()` 无条件尝试（失败吞掉）、`onReady` 先落 `ready` 再
   try/catch 应用主题；`hello` 补发最多 60 次。另加 `freshProject`：新建项目
   在 projects 列表尚未刷新时不会被 `resolveProject` 清空。
7. **新建项目不进 OpenChamber 左栏**：`project/init` 只写 Obsidian，宿主项目列表
   存在 `~/.config/openchamber/settings.json` 的 `projects`。服务端新增
   `POST /obsidian/rest/project/register`：读 `desktopLocalPort` → `GET/PUT
   /api/config/settings`，按目录去重、补 `path_<base64url>` id，保留当前
   `activeProjectId`。Brain 新建时自动注册并选中；因宿主没有 settings 广播，
   注册后在下拉下方提示「按 Ctrl+R 刷新后出现在左侧」。
8. **右栏不能建任务**：空任务列表增加内联「任务标题」输入，直接调
   `task/create`（文件夹取当前项目 `任务/`），成功后重新拉取任务。

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
  - 左侧紧凑 Brain（`brain/section.html`）：项目下拉展开 1.2 秒后选项节点保持不变，
    选择 `vault:test` 后 `settings` 持久化并重新拉取任务；
  - **无 `ready` 场景**（假宿主只回 REST、从不推 `ready`，加载 `brain/section.html`）：
    项目下拉出现 `初始配置 / test / ＋ 新建项目…` 并默认选中 `oc:p1`；
    选 `＋ 新建项目…` 出现名称 + 目录两行输入，建「新建演示」后选项与选中值同步、
    `project/init` 与 `project/register` 请求体正确；下拉下方出现 Ctrl+R 提示；
    切到 `vault:test` 后提示自动清除并重新拉任务；
  - 空任务列表出现内联「任务标题」输入，Enter/创建调用 `task/create`；
  - `boot-error` 为空。
- **注册路由实测**（独立 `createService` + 运行中的宿主）：
  `POST /obsidian/rest/project/register` 返回 200，项目以
  `path_<base64url>` id 写入 `settings.json`；第二次调用不产生重复；
  当前 `activeProjectId` 保持不变；测试后恢复原 6 个项目。
- 安装目录 7 个文件 SHA256 与仓库一致：`package.json`、`panel/index.html`、
  `panel/main.js`、`brain/index.html`、`brain/main.js`、`brain/section.html`、
  `brain/section.js`、`service/main.js`（`manifest` 由 `package.json` 承担）。
- **尚未在宿主 Electron 内实测**（无 CDP 可挂载），需要 `Ctrl+R` 后人工确认。

## 待用户实测（下轮开场）

1. `Ctrl+R` 后默认是否为「上下」布局。
2. 点任务行是否出现操作栏，状态下拉/派发/写入对话/打开是否都能点。
3. Obsidian 工具条是否出现 `brain / 归纳` 两个仓库标签并可切换。
4. 左侧「Brain 任务」里的「选择项目」下拉能否展开、选中后任务列表是否跟着切换。
5. 用「＋ 新建项目…」建一个项目：左栏是否出现该项目（若没有，再按一次 `Ctrl+R`）、
   下拉下方是否出现 Ctrl+R 提示、提示是否在切换项目后消失。
6. 空项目里点「＋ 新建任务」输入标题回车，任务是否出现。
7. Obsidian 画面输入：鼠标点击、滚轮、键盘、中文输入法、粘贴、右键。
8. 顶栏是否出现红色报错条（若出现，把文字发来）。

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

## 2026-11-06 变更记录

- 左侧 Brain 项目下拉新增「＋ 新建项目…」，可填名称与目录；创建后调用 project/register 写入 OpenChamber 设置，并自动选中、跨定时刷新保持选择。
- 任务区支持连续新建：有任务时底部保留「＋ 新建任务」，空任务区也能直接建任务。
- 新建项目要出现在 OpenChamber 左侧项目列表，仍需 Ctrl+R（宿主不广播设置变更，见上文）。

- 2026-11-06：manifest 增加 contributes.capabilities ["sessions","prompt"]，并向宿主授予 prompt/sessions/service；修复「派发到 Agent」报 capability 未授权。

## 2026-11-06 会话归档

- 新增 POST /obsidian/rest/session/archive：按 OpenChamber 导出格式拉取会话消息，写入 `会话记录/<项目>/<标题>-<日期>.md`，并把 archive_path、archived_at、session_updated 回写到任务卡。
- 归档正文按「用户回合 + 助手回复」分组；助手回复保留正文，并把工具调用折叠进 `<details>`，避免只有一行正文的会话丢失过程记录。
- 任务卡新增「归档会话 / 更新归档 / 打开归档」；刷新时每 60 秒自动检查已派发任务，会话空闲且有新内容时自动归档，可用 frontmatter `auto_archive: false` 关闭。
- 已用真实接口和真实 vault 冒烟：2735 条消息、48 个回合、约 451 KB；假宿主验证了自动归档与手动归档两条路径。
