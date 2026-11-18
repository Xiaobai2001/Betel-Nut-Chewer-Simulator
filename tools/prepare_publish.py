"""Export allowlisted source and a standalone Windows Server package."""
from __future__ import annotations
import argparse
import hashlib
import html
import json
import re
import shutil
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIRS = ('wechat', 'app', 'src', 'server', 'desktop', 'android', 'tools', 'tests', 'docs', 'deploy', '.github')
SOURCE_FILES = ('README.md', '.gitignore', '.gitattributes', 'package.json', 'package-lock.json', 'requirements-build.txt', '打开网页版.html')
FORBIDDEN_PARTS = {'project.private.config.json', '.git', '.private', '.build', 'node_modules', 'signing', 'android-signing', '__pycache__'}
FORBIDDEN_SUFFIXES = {'.jks', '.keystore', '.p12', '.pfx', '.pem', '.key', '.pyc', '.exe', '.apk', '.zip'}

def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as file:
        for block in iter(lambda: file.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()

def source_files() -> list[Path]:
    selected = [ROOT / name for name in SOURCE_FILES if (ROOT / name).is_file()]
    for folder in SOURCE_DIRS:
        base = ROOT / folder
        if not base.is_dir():
            continue
        for path in base.rglob('*'):
            relative = path.relative_to(ROOT)
            if any(part in FORBIDDEN_PARTS for part in relative.parts):
                continue
            if path.is_symlink() or not path.resolve().is_relative_to(ROOT):
                raise RuntimeError(f'Linked file is not allowed: {relative}')
            if path.is_file():
                if path.suffix.lower() in FORBIDDEN_SUFFIXES or path.name.startswith('.env') or path.name.lower() == 'password.txt':
                    raise RuntimeError(f'Private or generated file in source export: {relative}')
                selected.append(path)
    pattern = re.compile(rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)')
    for path in selected:
        if pattern.search(path.read_bytes()):
            raise RuntimeError(f'Credential-like material found in {path.relative_to(ROOT)}')
    return sorted(set(selected))

def write_zip(folder: Path, target: Path, prefix: str = '') -> None:
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(folder.rglob('*')):
            if path.is_file():
                archive.write(path, prefix + path.relative_to(folder).as_posix())

def install_output(stage: Path, name: str) -> Path:
    delivery = (ROOT / '成品').resolve()
    target = delivery / name
    if name not in {'云服务器部署', 'GitHub发布', '网页服务器部署', '账号网页版部署', '微信小程序'} or target.parent != delivery or target.is_symlink():
        raise RuntimeError('Unexpected publication directory')
    if target.exists():
        backup = ROOT / '.build/backups/publication' / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '-' + name)
        if not backup.resolve().is_relative_to((ROOT / '.build/backups').resolve()):
            raise RuntimeError('Invalid backup path')
        backup.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(target), str(backup))
    delivery.mkdir(exist_ok=True)
    if not stage.resolve().is_relative_to((ROOT / '.build').resolve()):
        raise RuntimeError('Stage must be within .build')
    shutil.move(str(stage), str(target))
    return target

def prepare_site(server: Path, guide: str) -> Path:
    site = server / 'site'
    shutil.copytree(ROOT / 'app', site)
    shutil.copy2(ROOT / 'deploy/windows-server/web.config', site / 'web.config')
    for script in ['Deploy-Site.ps1', 'Rollback-Site.ps1']:
        shutil.copy2(ROOT / 'deploy/windows-server' / script, server / script)
    shutil.copy2(ROOT / 'docs' / guide, server / 'README.md')
    return site

def write_manifest(site: Path, version: str) -> None:
    public_files = sorted(p for p in site.rglob('*') if p.is_file() and p.name != 'release-manifest.json')
    manifest = {'format': 'chew-static-release-v1', 'version': version, 'files': [{'path': p.relative_to(site).as_posix(), 'sha256': sha256(p)} for p in public_files]}
    (site / 'release-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')

def write_delivery_index() -> None:
    (ROOT / '成品/README.md').write_text('''# 交付文件导航

- `微信小程序/`：原生小程序源码与 ZIP，导入内层 `微信小程序源码/`；详细步骤见其中 README。
- `账号网页版部署/`：当前 1.5.0，使用 Node.js + MySQL，上传 WebAccounts.zip 并按 README 操作；支持账号、统计、成就与现实戒除省钱估算。旧账号版请在新目录解压后运行 Update-Accounts.ps1。
- `网页服务器部署/`：纯静态 IIS 包，仅访客模拟，不运行账号后台。
- `本机运行/`：本机双击的 EXE、安卓 APK 和离线网页版。
- `云服务器部署/`：包含网页和客户端安装包下载的完整部署包，留待后续使用。
- `GitHub发布/`：源码 ZIP 与 release-assets/ 安装包。源码提交到 Git，安装包放在 GitHub Releases。

账号版由 Node 只公开 app/，不要把整个安装目录设为 IIS 根目录。旧静态包只公开 site/。服务器由用户自行部署；生成部署包不代表已经在公网运行。旧 EXE / APK 仍为 1.1.1，没有账号和 OTA。
''', encoding='utf-8')

def main() -> None:
    parser = argparse.ArgumentParser()
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--check-source', action='store_true')
    modes.add_argument('--web-only', action='store_true', help='Export a small IIS package without requiring EXE/APK builds')
    modes.add_argument('--accounts', action='store_true', help='Export the Node/MySQL web server without EXE/APK')
    args = parser.parse_args()
    files = source_files()
    print(f'Source allowlist passed: {len(files)} files; private keys, caches and binaries excluded.')
    if args.check_source:
        return
    version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise RuntimeError('Expected a stable x.y.z version')
    build = ROOT / '.build'
    build.mkdir(exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix='publish-', dir=build))
    if args.accounts:
        delivery = stage / 'accounts'
        delivery.mkdir()
        for source in files:
            relative = source.relative_to(ROOT)
            if relative.parts[0] in {'app', 'server'}:
                destination = delivery / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, destination)
        for name in ['Install-Accounts.ps1', 'Reset-Password.ps1', 'Update-Accounts.ps1']:
            shutil.copy2(ROOT / 'deploy/windows-server' / name, delivery / name)
        (delivery / 'docs').mkdir()
        shutil.copy2(ROOT / 'docs/accounts-server.md', delivery / 'README.md')
        shutil.copy2(ROOT / 'docs/accounts-server.md', delivery / 'docs/accounts-server.md')
        shutil.copy2(ROOT / 'docs/progress.md', delivery / 'docs/progress.md')
        write_manifest(delivery / 'app', version)
        archive = stage / f'ChewSimulator-{version}-WebAccounts.zip'
        write_zip(delivery, archive)
        shutil.copy2(archive, delivery / archive.name)
        (delivery / (archive.name + '.sha256')).write_text(sha256(archive) + '  ' + archive.name + '\n', encoding='utf-8')
        with zipfile.ZipFile(delivery / f'ChewSimulator-{version}-Source.zip', 'w', zipfile.ZIP_DEFLATED) as source_zip:
            for source in files:
                source_zip.write(source, 'Betel-Nut-Chewer-Simulator/' + source.relative_to(ROOT).as_posix())
        print(f'Prepared: {install_output(delivery, "账号网页版部署").relative_to(ROOT)} ({archive.stat().st_size:,} byte ZIP)')
        write_delivery_index()
        return
    if args.web_only:
        server = stage / 'server'
        site = prepare_site(server, 'windows-web.md')
        write_manifest(site, version)
        archive = stage / f'ChewSimulator-{version}-WebServer.zip'
        write_zip(server, archive)
        shutil.copy2(archive, server / archive.name)
        (server / (archive.name + '.sha256')).write_text(sha256(archive) + '  ' + archive.name + '\n', encoding='utf-8')
        print(f'Prepared: {install_output(server, "网页服务器部署").relative_to(ROOT)} ({archive.stat().st_size:,} byte ZIP)')
        write_delivery_index()
        return
    binaries = {'windows': ROOT / '.build/releases/windows/ChewSimulator-Windows.exe', 'android': ROOT / '.build/releases/android/ChewSimulator-Android.apk'}
    for path in binaries.values():
        if not path.is_file():
            raise RuntimeError(f'Build missing: {path.relative_to(ROOT)}')
    with zipfile.ZipFile(binaries['android']) as apk:
        for path in (ROOT / 'app').rglob('*'):
            if path.is_file() and path.suffix != '.ico':
                asset = 'assets/app/' + path.relative_to(ROOT / 'app').as_posix()
                if apk.read(asset) != path.read_bytes():
                    raise RuntimeError(f'APK resources are stale. Rebuild Android: {asset}')
    server, github = stage / 'server', stage / 'github'
    assets = github / 'release-assets'
    assets.mkdir(parents=True)
    site = prepare_site(server, 'windows-server.md')
    downloads = site / 'downloads' / version
    downloads.mkdir(parents=True)
    names = {'windows': f'ChewSimulator-{version}-Windows.exe', 'android': f'ChewSimulator-{version}-Android.apk'}
    for platform, source in binaries.items():
        shutil.copy2(source, downloads / names[platform]); shutil.copy2(source, assets / names[platform])
    web_zip_name = f'ChewSimulator-{version}-Web.zip'
    write_zip(ROOT / 'app', assets / web_zip_name, 'web/')
    shutil.copy2(assets / web_zip_name, downloads / web_zip_name)
    catalog = {'version': version, 'installation': 'manual-download', 'otaAvailable': False, 'platforms': {key: {'path': f'downloads/{version}/{name}', 'sha256': sha256(downloads / name), 'bytes': (downloads / name).stat().st_size} for key, name in names.items()}}
    (site / 'downloads.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (site / 'download.html').write_text(f'''<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>嚼槟榔模拟器 · 下载</title><style>body{{margin:0;padding:50px 22px;background:#f7f8f4;color:#36452d;font:15px/1.9 "Microsoft YaHei",sans-serif}}main{{max-width:680px;margin:auto;background:white;border:1px solid #e1e8d7;border-radius:20px;padding:32px}}h1{{font-size:28px}}a{{display:block;background:#edf3e4;color:#4c623c;padding:12px 18px;border-radius:9px;margin:13px 0;text-decoration:none}}p{{color:#849373;font-size:13px}}small{{color:#9ba58e}}</style></head><body><main><small>THE CHEW SIMULATOR / {html.escape(version)}</small><h1>把体验，留在屏幕里。</h1><a href="./">直接进入网页版 →</a><a download href="downloads/{version}/{names['windows']}">下载 Windows 免安装版 EXE</a><a download href="downloads/{version}/{names['android']}">下载安卓 APK</a><a download href="downloads/{version}/{web_zip_name}">下载离线网页版 ZIP</a><p>当前版本需手动下载安装，尚未接入 OTA。安卓安装需要确认；Windows 版适用于 64 位 Windows 10/11。</p><p>槟榔致癌，吸烟有害健康。本软件仅为虚拟视觉模拟，建议戒槟榔、戒烟。</p></main></body></html>''', encoding='utf-8')
    write_manifest(site, version)
    write_zip(server, assets / f'ChewSimulator-{version}-WindowsServer.zip')
    with zipfile.ZipFile(github / f'ChewSimulator-{version}-Source.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            archive.write(path, 'Betel-Nut-Chewer-Simulator/' + path.relative_to(ROOT).as_posix())
    (assets / 'SHA256SUMS.txt').write_text('\n'.join(sha256(p) + '  ' + p.name for p in sorted(assets.iterdir())) + '\n', encoding='utf-8')
    shutil.copy2(ROOT / 'docs/release-notes.md', github / 'RELEASE_NOTES.md')
    shutil.copy2(ROOT / 'docs/github.md', github / 'README.md')
    for folder, name in [(server, '云服务器部署'), (github, 'GitHub发布')]:
        print(f'Prepared: {install_output(folder, name).relative_to(ROOT)}')
    write_delivery_index()

if __name__ == '__main__':
    main()
