from pathlib import Path
import hashlib
import shutil
import zipfile

root = Path(__file__).resolve().parent.parent
out = root / '成品/本机运行'
web = out / '网页版'
web.mkdir(parents=True, exist_ok=True)
shutil.copytree(root / 'app', web, dirs_exist_ok=True)
for source, name in [
    ('.build/releases/windows/ChewSimulator-Windows.exe', '嚼槟榔模拟器-Windows.exe'),
    ('.build/releases/android/ChewSimulator-Android.apk', '嚼槟榔模拟器-Android.apk'),
    ('docs/usage.md', '使用说明.md'),
    ('docs/validation.md', '验证记录.md')
]:
    shutil.copy2(root / source, out / name)
zip_path = out / '嚼槟榔模拟器-网页版.zip'
with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for file in web.rglob('*'):
        if file.is_file():
            archive.write(file, file.relative_to(out))
    archive.write(out / '使用说明.md', '使用说明.md')
checksums = []
preview = root / '.build/test-results/desktop-fresh.png'
if preview.exists():
    shutil.copy2(preview, out / '界面预览.png')
immersive_preview = root / '.build/test-results/immersive-fresh.png'
if immersive_preview.exists():
    shutil.copy2(immersive_preview, out / '沉浸模式预览.png')
for file in out.iterdir():
    if file.is_file() and file.suffix in ['.exe', '.apk', '.zip']:
        checksums.append(hashlib.sha256(file.read_bytes()).hexdigest() + '  ' + file.name)
(out / 'SHA256.txt').write_text('\n'.join(checksums) + '\n', encoding='utf-8')
print('Delivery files prepared.')
