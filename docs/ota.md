# OTA 接入方案与当前状态

现已具备：三端共用的网页资源、原签名 APK、Windows 便携 EXE、IIS 静态网站包、手动下载页、版本目录和 GitHub 发布结构。

**尚未实现 OTA 客户端。** EXE / APK 不会联网检查版本、下载更新、替换资源或安装升级。Android 清单尚无联网权限。downloads.json 标记 `otaAvailable: false`，仅为手动下载目录；release-manifest.json 供服务器部署脚本校验。

后续接入步骤：

1. 确定可信 HTTPS 更新地址。无域名、无 HTTPS 的服务器可以先运行 HTTP 网页；更新文件可考虑 GitHub Releases 的 HTTPS 下载渠道。HTTP 同站 SHA-256 不是防篡改签名。
2. 页面资源更新：独立资源版本、最低壳版本、更新说明、签名与校验值；临时下载、完整验证、下次启动切换；保留上一版，失败恢复，断网使用已有版本。
3. Windows 壳升级：新增 NSIS 安装版并接入 electron-updater；现有 portable 便携版单独保留，不能假定它具有同样的自动安装行为。
4. Android 壳升级：增加联网检查、下载与系统安装器调用。普通手机通常需要用户确认；保持相同包名、签名和更高 versionCode。
5. 已分发的 1.1.1 必须先手动安装一次带 OTA 的后续版本，才具备检查能力。

更新私钥不能放在公开网页、更新文件或源码中。客户端保存验证公钥。
