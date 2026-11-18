# 账号网页版 1.5.1：Windows Server + MySQL

本版包含访客注册、登录、槟榔与香烟用量、可视包装、戒除成就、现实打卡，以及全屏底部操作区。仅发布网页版；旧 EXE / APK 仍是 1.1.1 离线版，没有账号或 OTA。

## 最短部署步骤（全部在云服务器操作）

1. 安装官方 **Node.js 24 LTS（Windows x64）**，安装后重新打开 PowerShell。服务器需要能访问 npm 下载依赖。已有 MySQL 8.0.33 可继续使用。
2. 上传并完整解压 `ChewSimulator-1.5.1-WebAccounts.zip` 到 **`C:\ChewSimulator`**。目录内应直接看到 `app`、`server` 和 `Install-Accounts.ps1`。
3. 以管理员身份打开 **Windows PowerShell**，逐行运行：

```powershell
cd C:\ChewSimulator
powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-Accounts.ps1
```

按提示输入：

| 提示 | 当前服务器填写 |
| --- | --- |
| Public URL | `http://101.201.68.203:8081`（末尾不要加 /） |
| MySQL admin user | 回车，默认 `root` |
| Local MySQL port | 回车，默认 `3306` |
| MySQL admin password | 你设置的数据库管理密码；输入时不显示字符 |

Public URL 是必填项，括号里的地址只是示例，不是回车默认值。若旧安装包出现 `Set CHEW_PUBLIC_ORIGIN to the full public origin`，说明网址为空或格式不正确，发生在连接数据库之前。在当前解压目录的管理员 PowerShell 中运行下面两行即可重试，无需重新下载：

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\Install-Accounts.ps1 -PublicOrigin 'http://101.201.68.203:8081'
```

新版安装脚本会在询问数据库密码之前检查网址，空值或错误格式会重新提示；网址末尾的 / 会自动去除。

脚本自动安装后台依赖，创建 `chew_simulator` 数据库和表、随机密码的专用数据库账号，保存私有配置，设置 Windows 开机任务并启动。账号表与统计表不会因重复安装而清空。已有 1.2.0 的服务器也要重新运行本脚本，输入管理凭据初始化新增表，不能只更新 HTML。网页注册的账号不是 MySQL 用户。

4. 在**阿里云控制台**的实例安全组放行入方向 **TCP 8081**。Windows 防火墙由安装脚本设置。MySQL 3306 只供本机后台使用，不需要为此开放公网。
5. 在你自己的电脑访问 **http://101.201.68.203:8081/**，点右上角“登录 / 注册”，自行注册后开始体验。

这次使用 **8081**。原 IIS 的 **8080** 网站保留；继续访问旧地址会看到旧版。**不要只把 app 文件复制到 IIS，静态 IIS 不能运行账号接口。** 新版由 Node 同时提供网页与 API，不需要 IIS 反向代理。

目前公网 HTTP 可用于个人测试，账号框会提示使用独立测试密码。正式开放账号前配置 HTTPS；获得 HTTPS 后把配置中的 `publicOrigin` 改为实际地址并重启后台，Cookie 会自动启用 Secure。若加反向代理，需单独评估代理下的限流和 TLS 配置。

## 文件和持久数据

```text
C:\ChewSimulator\
├── app\                       公开网页文件（唯一静态目录）
├── server\                    Node 后台、依赖锁和建表文件
├── .private\server.json        安装时生成的数据库连接配置
├── Install-Accounts.ps1        安装、升级后启动、设置开机运行
├── Reset-Password.ps1          维护者重置网站账号密码
├── docs\accounts-server.md     本文
└── README.md
```

MySQL 数据库名称为 `chew_simulator`，表为 `chew_users`、`chew_sessions`、`chew_runs`、`chew_daily`、`chew_activity_daily`、`chew_checkins`。不修改 MySQL root 密码，不改其他数据库。实际数据库密码只存在 `.private/server.json`，文件夹限制为管理员、SYSTEM 和安装者访问。不要上传该目录到 GitHub，不要把整个安装目录设置为 IIS 根目录。

网站密码使用带随机盐的 scrypt 哈希；登录会话保留 14 天，可退出撤销。浏览器不保存明文密码。注册、登录和上传有基本 IP 限流（注册每小时 5 次，登录每 15 分钟 15 次）；重启会清空内存限流，不适合作为大规模公开服务的完整防滥用措施。

## 统计口径与断网

- 有效“嚼一口”计 1 次，自动咀嚼同样计数。
- 每颗的第一口计入“开始嚼的颗数”；达到 100%（15 口）计入“嚼完的颗数”。
- “吐出整颗”计入“吐出的颗数”，即使未嚼完。吐渣单独保存，不算完成 1 颗。
- 登录前的访客记录不合并；切换账号重置当前模拟。刷新页面也开始一颗新的模拟，已保存的累计统计保留。
- 今日和近 7 天按北京时间。**断网补传按服务器接收日期归属**，不按浏览器自行上报时间回填。
- 登录后断网的操作以逐条不可变事件暂存在浏览器 localStorage，恢复后自动补传。关闭后可在同一浏览器、同一网址、同一账号下恢复；不要清除浏览器数据。浏览器禁止存储时会提示保留页面。
- 页面和标签页各自生成不同操作流水，服务器事务校验顺序并去重。错误或过期登录不把原账号记录写入新账号。
- 这是虚拟操作统计，客户端仍可模拟合法操作请求，不提供防作弊排行。

详细统计、包装折算和成就口径见随包的 `docs/progress.md`。现实打卡需联网保存；模拟操作继续支持离线暂存。

## 自动运行、停止和检查

计划任务名：`ChewSimulatorAccounts`，以 SYSTEM 身份随 Windows 启动，退出 VNC 或关闭 PowerShell 不影响运行。失败后每分钟重试，最多 999 次。MySQL 本身也需要设置为“自动启动”；先确认正确的 MySQL 8.0 服务，不要改错其他版本。

在**服务器管理员 PowerShell**中：

```powershell
Get-ScheduledTask -TaskName ChewSimulatorAccounts
Get-ScheduledTaskInfo -TaskName ChewSimulatorAccounts
Invoke-RestMethod http://127.0.0.1:8081/api/health
```

正常健康检查返回 `ok: true` 和 `version: 1.5.1`。用公网地址测试注册和登录；如果配置的是公网 URL，从 localhost 页面提交注册会被来源校验拒绝，这是预期行为。

停止、启动：

```powershell
Stop-ScheduledTask -TaskName ChewSimulatorAccounts
Start-ScheduledTask -TaskName ChewSimulatorAccounts
```

修改配置后也用以上两行重启。数据库用户、密码和网站地址都在 `.private/server.json`；一般不需要手工修改。

## 直接更新已有账号版（推荐）

**在云服务器上操作。不要先把新文件覆盖进旧安装目录，也不要删除数据库或 `.private`。**

1. 将 `ChewSimulator-1.5.1-WebAccounts.zip` 完整解压到新的临时目录，例如 **`C:\ChewUpdate`**，直接看到 `Update-Accounts.ps1`、`app` 和 `server`。旧服务仍在原目录。
2. 以管理员身份打开 PowerShell，逐行运行：

```powershell
cd C:\ChewUpdate
powershell -NoProfile -ExecutionPolicy Bypass -File .\Update-Accounts.ps1
```

3. 脚本从已有 `ChewSimulatorAccounts` 任务识别原安装目录，检查原 `.private/server.json`，停止该任务，使用原配置备份账号库及原应用文件。备份失败就停止更新。随后只把新版应用复制回原安装目录，再运行安装器。
4. 提示时输入 MySQL 管理账号、端口和密码（密码隐藏）。旧网站地址和服务数据库配置继续使用，不用重新填写网址。安装器新增缺少的表，不重建、不清空账号和记录。
5. 出现 `Update complete` 后，访问原网址，按 **Ctrl+F5** 刷新。`/api/health` 应显示 `1.5.1`，用原账号登录核对 ID、统计、成就和打卡。

备份位于**原安装目录**的 `.private/backups/时间/`，含 `database.sql`、`server.json` 和旧应用。该目录含账号密码哈希与数据库配置，必须保持私有，不上传 GitHub 或放进 app/。SQL 备份保留原始 ID 与 AUTO_INCREMENT，只能由维护者导入一个**空数据库**进行恢复，再修改原私有配置指向恢复的库；不要直接往正在使用的库重复导入。

更新失败会尝试恢复旧应用文件和依赖并启动原任务，保留备份和错误信息；不会自动覆盖或回滚数据库。若依赖下载/启动仍失败，按错误提示处理。新表采用增量创建，旧版本可继续读取旧表。**只有正常显示完成并验证页面后，才算服务器更新成功。**

账号 ID 由同一个 MySQL 数据库主键自增分配，用户名唯一；并发注册也不复用 ID。大整数 ID 以精确字符串返回，避免 JavaScript 精度导致冲突。后续更新继续使用此更新入口、原配置和原数据库；跨服务器迁移需迁移整个数据库，不能拼接两套独立数据库的自增 ID。

1.3.0 新增活动统计和现实打卡，1.4.0 新增花费设置表，1.5.0 新增小程序 Bearer API，不新增表；原账号、密码、会话、统计和打卡保留。旧待上传事件继续按原协议补传。未同步前勿清浏览器数据，访问地址（协议、IP/域名、端口）应保持一致；修改地址前先同步旧地址下的待上传记录。

需要退回纯静态体验时停止账号任务，再使用原 8080 网站；MySQL 数据仍保留。

## 忘记网站密码

没有短信/邮件找回。网站维护者在服务器管理员 PowerShell 中运行（将 alice 换为网站账号）：

```powershell
cd C:\ChewSimulator
powershell -NoProfile -ExecutionPolicy Bypass -File .\Reset-Password.ps1 -Username alice
```

按提示输入新密码，至少 8 位。原登录会话会撤销，统计保留。这不会更改 MySQL 密码。

## 常见问题

- **Node / npm 无法识别**：安装 Node.js 24 LTS 后重新打开 PowerShell。
- **npm ci 下载失败**：检查服务器互联网/DNS；解决后重新运行安装脚本，不需要删除数据库。
- **Access denied**：确认填写的是 MySQL 管理账号及密码，并且 MySQL 正在 3306 监听。不要把网站登录密码填在数据库处。
- **端口占用**：默认不会抢占旧 IIS。若 8081 已被占用，可在首次安装时加 `-Port 8082`，Public URL 和安全组也改成 8082。
- **本机健康检查成功，公网打不开**：检查阿里云安全组 TCP 8081、服务器 Windows 防火墙和 IP。
- **页面打开但提示账号服务未连接**：检查是否仍访问旧 8080 或直接打开 HTML；账号版必须通过新 Node 地址访问。
- **注册提示从配置的网站地址提交**：地址栏必须与 `.private/server.json` 的 `publicOrigin` 完全一致（协议、IP/域名、端口）。
- **启动失败**：先停止计划任务，在 `C:\ChewSimulator` 中执行 `node server/index.cjs`，查看错误代码；检查 MySQL 已启动、配置文件存在、Node 路径有效。排查后 Ctrl+C，并重新启动计划任务。
- **外观仍是旧版**：核对端口，强制刷新页面。服务工作线程不缓存 /api/；HTTP 公网浏览器一般不支持离线页面缓存，但已打开页面的事件仍可暂存。
- **取消开机运行**：`Disable-ScheduledTask -TaskName ChewSimulatorAccounts`；这不会停止当前实例，如需停止再执行 Stop-ScheduledTask。

部署包已在开发电脑做真实 MySQL 8.0.33 接口与浏览器验证。开机计划任务、防火墙和公网访问需要在你的 Windows Server 上最终验收；未远程修改你的服务器。
