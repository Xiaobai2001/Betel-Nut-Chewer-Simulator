# GitHub 源码与发布包

目标仓库：https://github.com/Xiaobai2001/Betel-Nut-Chewer-Simulator

Git 仓库保存源码、构建工具、测试、文档与部署脚本。GitHub Releases 保存已验证的 EXE、APK、离线网页 ZIP、Windows Server 部署 ZIP，以及 SHA-256 清单。

`成品/GitHub发布/*-Source.zip` 是源码备份，不含密钥与构建目录。正常开发直接提交 Git，无需反复上传 ZIP。

## 生成发布文件

当前 1.5.3 发布账号网页版与微信原生源码：运行 `npm.cmd run prepare:accounts`，上传 `成品/账号网页版部署/` 内的 WebAccounts.zip、对应 .sha256 和 Source.zip 到 v1.5.3 Release，说明见 `docs/release-notes.md`。另运行 `npm.cmd run prepare:wechat`，上传 `成品/微信小程序-1.5.3/` 的 WeChat.zip 与 SHA256SUMS.txt。不要把 1.1.1 EXE / APK 重命名成 1.5.3。数据库连接配置在 `.private/server.json`，不进 Git 或 ZIP。

以下完整客户端构建流程留待以后重新构建 EXE / APK 时使用：

在 **开发电脑的项目根目录**，先构建当前版本的 Windows / Android，随后运行：

```powershell
npm.cmd run package:delivery
npm.cmd run prepare:publish
python tools/prepare_publish.py --check-source
git status --short
```

发布文件在 `成品/GitHub发布/release-assets/`。新版本先统一 package.json、package-lock.json、Android versionName，并递增 versionCode；升级 APK 必须用原签名。

## 提交与发布

本地仓库首次关联后，在 **开发电脑的项目根目录**运行：

```powershell
git status --short
git add app src server desktop android tools tests docs deploy .github README.md package.json package-lock.json requirements-build.txt .gitignore .gitattributes
git diff --cached --stat
git commit -m 'Update simulator release'
git push origin main
```

在仓库 Releases 页面创建匹配版本的发布，例如 `v1.1.1`，上传 release-assets/ 下全部文件，发布说明使用相邻的 RELEASE_NOTES.md。不要把 EXE / APK 提交进 Git 历史。

`.github/workflows/validate.yml` 在 main 提交和 Pull Request 上运行源码构建、状态测试及敏感文件导出检查，不需要 Android 签名密钥，也不会自动发布服务器。

## 本地签名

`.private/android-signing/release.jks` 和 `password.txt` 是覆盖升级 APK 所需的原签名。它们被 Git 忽略，也不进入源码 ZIP。不要用新密钥替换原密钥，否则原来安装的版本无法按原签名覆盖升级。

当前项目尚未实现自动更新客户端；GitHub Releases 是 HTTPS 下载渠道之一，创建 Release 本身不会让现有客户端自动升级。
