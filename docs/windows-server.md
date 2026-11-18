# Windows Server 手动发布（公网 IP / HTTP）

此指南用于用户自行通过 VNC 操作服务器。这里只准备部署包，不连接或修改服务器。

当前只上线网页版时，使用[仅网页版部署步骤](windows-web.md)和 `ChewSimulator-1.1.1-WebServer.zip`。本文的 WindowsServer.zip 是同时提供 EXE / APK 下载的完整包。

## 上传什么

将 `成品/云服务器部署/` 整个目录上传到服务器，例如 `C:\Deploy\ChewSimulator`。或者从 GitHub Releases 下载 `ChewSimulator-1.1.1-WindowsServer.zip` 并完整解压到该目录。

```text
C:\Deploy\ChewSimulator\
├── site\                       网页与安装包下载
├── Deploy-Site.ps1
├── Rollback-Site.ps1
└── README.md
```

**只有 `site` 是公开站点文件**。不要将整个项目目录、`.private`、`.build`、源码 ZIP 或任何签名文件设为网站根目录。

## 首次上线

在 **Windows Server 的管理员 Windows PowerShell** 中运行以下完整命令。脚本只创建 / 更新专用的 `ChewSimulator` 站点，发现同名站点在别处或端口已占用时会停止，不改默认网站。

```powershell
Set-Location 'C:\Deploy\ChewSimulator'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Deploy-Site.ps1 -SiteName ChewSimulator -SiteRoot 'C:\Sites\ChewSimulator' -Port 8080 -OpenFirewall
Invoke-WebRequest -Uri 'http://127.0.0.1:8080/release-manifest.json' -UseBasicParsing -TimeoutSec 15 | Select-Object StatusCode
```

脚本校验发布文件 SHA-256，按需安装 IIS 静态网站功能，把本次发布复制进独立版本目录，切换网站路径，并检查本机 HTTP。如果切换后验证失败，会恢复上一版路径；首次发布失败则停止刚创建的站点。不会递归删除旧版本。

`-OpenFirewall` 只添加 Windows 防火墙对应端口的入站规则。还需要在云厂商控制台给这台服务器的安全组开放 **TCP 8080**。公网请求是否到达 IIS，需要从另一台电脑验证，不能仅凭本机成功判断。

假设公网地址为 `SERVER_IP`，访问地址是：

- 网页：`http://SERVER_IP:8080/`
- 下载页：`http://SERVER_IP:8080/download.html`
- 手动下载版本信息：`http://SERVER_IP:8080/downloads.json`

如果 8080 已使用，重新指定空闲端口，例如 `-Port 8081`，防火墙、安全组和访问地址都使用该端口。

## 再次发布与回滚

将新版本部署包解压到一个新的上传目录（不要混合解压新旧文件），从该目录运行同样的部署命令。脚本保留 `C:\Sites\ChewSimulator\releases\` 下的旧版本，并记录前一版。

需要退回前一版时，在 **Windows Server 管理员 Windows PowerShell** 中运行：

```powershell
Set-Location 'C:\Deploy\ChewSimulator'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Rollback-Site.ps1 -SiteRoot 'C:\Sites\ChewSimulator'
Invoke-WebRequest -Uri 'http://127.0.0.1:8080/release-manifest.json' -UseBasicParsing -TimeoutSec 15 | Select-Object StatusCode
```

更新网页后，现有浏览器页面需要刷新。服务器不会自动升级已经安装的 EXE / APK。

## HTTP 的功能边界

公网 IP + HTTP 能运行在线模拟和下载页。Service Worker 离线缓存通常只允许 HTTPS 或 localhost，因此公网 HTTP 网页不能承诺离线缓存 / PWA 安装。已下载的本机 EXE、APK、离线网页仍能离线使用。

HTTP 没有传输身份认证，文件与同站校验值都可能被替换；当前 SHA-256 用于检查文件一致性，不是可信 OTA 的替代品。正式 OTA 应采用 HTTPS 加更新签名校验。没有自己的域名时，也可以使用 GitHub 提供 HTTPS 的发布下载地址，但还需开发客户端更新逻辑。

## 常见排查

- 本机 `127.0.0.1` 能打开、外网打不开：核对安全组、Windows 防火墙、端口和公网 IP。
- 安装包下载返回 404.3：检查站点目录内 `web.config` 是否完整，APK / EXE 的 MIME 映射已提供。
- 500.19：检查 IIS 静态内容功能及此服务器的配置节锁定策略。
- 脚本提示端口被占用：换独立端口，不停止未知服务。
- 浏览器仍看到旧页面：刷新后检查 `/release-manifest.json` 的版本。
