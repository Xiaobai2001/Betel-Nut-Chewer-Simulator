# 嚼槟榔模拟器 · Betel Nut Chewer Simulator

一个可离线运行的中文视觉模拟器，包含咀嚼形变、吐渣和吐出、三档虚拟包装、吸吐烟动画，以及戒槟榔、戒烟提醒。全屏模式采用明亮奶油白界面，支持三维旋转和缩放。

当前应用版本：**1.1.1**。Windows：Electron 便携 EXE；Android：原生 WebView APK；网页：静态 HTML/CSS/JavaScript。

> 当前 EXE / APK 尚未实现 OTA。服务器下载页提供手动下载，发布目录和校验文件不等于已经具备自动更新。

## 使用与下载

- 网页：双击 `打开网页版.html`，或打开 `app/index.html`。
- 本机成品：打包后在 `成品/本机运行/`。
- 安装包：[GitHub Releases](https://github.com/Xiaobai2001/Betel-Nut-Chewer-Simulator/releases)。安装包放在 Releases，不提交到源码仓库。
- 操作方式与快捷键：[使用说明](docs/usage.md)。

当前先上线网页版：在开发电脑运行 `npm.cmd run prepare:web`，将 `成品/网页服务器部署/` 中的 `ChewSimulator-1.1.1-WebServer.zip` 上传到 Windows Server，按[仅网页版部署步骤](docs/windows-web.md)操作。这个小包不需要构建 EXE / APK，服务器无需 Node.js 或数据库。

## 目录

```text
Betel-Nut-Chewer-Simulator/
├── app/                        三端共用的网页运行文件
├── src/                        三维场景源码
├── desktop/                    Electron 桌面入口
├── android/                    Android 源码、清单、资源
├── tools/                      构建、开发服务、发布工具
├── tests/                      状态与浏览器/桌面检查
├── deploy/windows-server/      IIS 配置、部署与回滚脚本
├── docs/                       使用、部署、GitHub、OTA、验证文档
├── .github/workflows/          源码校验 CI
├── package.json
├── package-lock.json
├── requirements-build.txt
├── .private/                   本机签名；不进入 Git 或发布包
├── .build/                     SDK、编译结果、截图、备份；不进入 Git
├── node_modules/               开发依赖；不进入 Git
└── 成品/                       自动生成；不进入 Git
    ├── 网页服务器部署/          当前阶段：仅网页的 IIS 部署 ZIP
    ├── 本机运行/
    ├── 云服务器部署/
    │   ├── site/               IIS 唯一公开的网站根目录
    │   ├── Deploy-Site.ps1
    │   └── Rollback-Site.ps1
    └── GitHub发布/
        ├── *-Source.zip
        └── release-assets/     EXE、APK、网页 ZIP、服务器 ZIP
```

## 本机开发

在**开发电脑的项目根目录**运行以下 PowerShell 命令，需要 Node.js 24：

```powershell
npm.cmd ci
npm.cmd run build:scene
npm.cmd test
npm.cmd run serve
```

访问 `http://127.0.0.1:4173/`；Ctrl+C 停止。开发服务器只监听本机，云端使用 IIS。

## 构建和整理发布文件

需要 Windows、Node.js 24、Python 3.11+、JDK（项目已在 JDK 26 上构建）。Android 工具下载自 Google 官方 SDK 并校验下载文件。升级旧 APK 前必须恢复原签名至 `.private/android-signing/`，脚本不会默默生成新签名。

在**开发电脑的项目根目录**运行：

```powershell
$env:PYTHONIOENCODING='utf-8'
npm.cmd ci
python -m pip install -r requirements-build.txt
python tools/make_icon.py
npm.cmd run build:scene
npm.cmd run build:win
npm.cmd run build:android
npm.cmd run package:delivery
npm.cmd run prepare:publish
```

EXE / APK 在 `.build/releases/`。重新生成发布包时，旧发布目录会保留到 `.build/backups/publication/`。密钥、密码、SDK 和开发依赖不会进入源码 ZIP 或服务器包。

## 发布

- 无域名和 HTTPS 的 Windows Server：[IIS 部署指南](docs/windows-server.md)。默认端口 8080，由用户在服务器上操作。
- GitHub：[源码与安装包发布](docs/github.md)。
- 后续自动更新：[OTA 接入方案](docs/ota.md)。
- 验证范围：[验证记录](docs/validation.md)。Android 尚未在实体手机验收；IIS 脚本只在开发电脑做语法及部署包检查，未在服务器实际运行。

## 健康提醒与许可

槟榔具有致癌风险，吸烟有害健康。所有动作和包装均为虚拟示意，没有商品购买入口，不替代专业医疗或戒断治疗。

项目目前未授予开源使用许可（`UNLICENSED`）；公开源码不自动等于许可他人使用或分发。Three.js 的 MIT 许可保留在 `app/THREE-LICENSE.txt`，Electron 的第三方许可随桌面运行时提供。
