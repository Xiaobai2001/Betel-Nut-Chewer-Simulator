# 纯静态访客版：Windows Server + IIS

> 需要注册、登录和 MySQL 统计时，请使用 [账号网页版部署](accounts-server.md)。本文静态方案不运行账号接口。

这一阶段只发布网页版，EXE / APK 与 OTA 留待后续。本包包含网页、IIS 配置、部署和回滚脚本，不包含客户端安装包；服务器无需安装 Node.js、Python、Java 或数据库。

## 1. 上传并完整解压

将 `ChewSimulator-1.4.0-WebServer.zip` 上传到服务器，通过资源管理器完整解压到 `C:\Deploy\ChewSimulatorWeb`。最终应当是以下结构，不能多套一层目录：

```text
C:\Deploy\ChewSimulatorWeb\
├── site\
│   ├── index.html
│   ├── web.config
│   └── ...
├── Deploy-Site.ps1
├── Rollback-Site.ps1
└── README.md
```

也可以直接复制已解压的部署目录。**IIS 只公开 site/，不要把整个开发项目作为网站根目录。** 本包没有 download.html，访问根路径即可开始体验。

## 2. 在服务器运行部署

通过 VNC 进入 Windows Server，右键 Windows PowerShell，选择“以管理员身份运行”，粘贴：

```powershell
Set-Location 'C:\Deploy\ChewSimulatorWeb'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Deploy-Site.ps1 -Port 8080 -OpenFirewall
```

脚本会校验文件、按需安装 IIS、创建名为 ChewSimulator 的站点，将网页复制到 `C:\Sites\ChewSimulator\releases\` 的新版本目录，并开放 Windows 防火墙 TCP 8080。若要求重启，重启服务器后再次运行同一命令。关闭 VNC 或 PowerShell 后，IIS 仍可持续提供网页。

端口被占用或同名站点属于其他目录时脚本会停止。可改用 `-Port 8081`；之后安全组与访问地址也使用 8081。脚本保留前一版，便于回滚。

## 3. 放行云平台安全组

在云服务器控制台找到这台实例对应的安全组，添加入方向允许规则：协议 TCP，目标端口 8080。公开网页的来源可设为 `0.0.0.0/0`。这是云平台的设置，与 Windows 防火墙是两处独立设置。

## 4. 按顺序验证

先在服务器浏览器打开 `http://127.0.0.1:8080/`，也可在服务器 PowerShell 中检查：

```powershell
(Invoke-WebRequest -Uri 'http://127.0.0.1:8080/' -UseBasicParsing -TimeoutSec 15).StatusCode
(Invoke-WebRequest -Uri 'http://127.0.0.1:8080/release-manifest.json' -UseBasicParsing -TimeoutSec 15).Content
```

首页应返回 200，版本清单显示 1.4.0。然后在自己的电脑或手机浏览器访问 `http://SERVER_IP:8080/`，将 SERVER_IP 换成服务器公网 IP。

验收咀嚼形变、吐渣、换包、点烟与吸吐烟、明亮全屏、旋转与退出。在电脑可使用空格咀嚼、L 点烟、I 吸入、O 吐烟、F 全屏、Esc 退出；手机使用页面按钮。

## 5. 后续网页更新

开发电脑修改网页后，在项目根目录运行 `npm.cmd run prepare:web`。把新 ZIP 解压到服务器的一个新上传目录，从新目录运行相同部署命令，再刷新浏览器。此流程仅更新网页版，不会改变已安装的 EXE / APK。

退回上一版时，在服务器管理员 PowerShell 中运行：

```powershell
Set-Location 'C:\Deploy\ChewSimulatorWeb'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Rollback-Site.ps1
```

## 排查

- 服务器本机也打不开：保留部署脚本的红色报错，检查 IIS 站点状态与 8080 端口。
- 本机能打开，外网打不开：核对公网 IP、云平台安全组与 Windows 防火墙。
- 500.19：检查 IIS 静态内容功能和配置节锁定情况。
- 页面仍是旧版：强制刷新；确认站点指向新的 releases 目录。

公网 HTTP 支持在线体验；离线缓存和 PWA 安装依赖 HTTPS 等浏览器条件，本阶段不要求这两项。部署包在开发电脑校验，服务器实际发布及公网验收由你执行。
