"""Build the offline Android WebView application using official Android tools."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / '.build' / 'android'
BUILD.mkdir(parents=True, exist_ok=True)
BASE = 'https://dl.google.com/android/repository/'

def run(args):
    # aapt2 on Windows mishandles non-ASCII absolute paths. Relative paths work.
    command = [str(a.relative_to(ROOT)) if isinstance(a, Path) and a.is_relative_to(ROOT) else str(a) for a in args]
    subprocess.run(command, check=True, cwd=ROOT)

def get_sdk(package, host=None):
    marker = BUILD / (package.replace(';', '-') + '.json')
    if marker.exists():
        return Path(json.loads(marker.read_text())['path'])
    print('Preparing ' + package, flush=True)
    repo = ET.fromstring(urllib.request.urlopen(BASE + 'repository2-1.xml', timeout=60).read())
    candidates = [p for p in repo.findall('remotePackage') if p.attrib['path'] == package]
    package_info = candidates[-1]
    archive = next(a for a in package_info.findall('./archives/archive') if a.findtext('host-os') == host)
    url = archive.findtext('complete/url')
    checksum = archive.findtext('complete/checksum')
    dest = BUILD / url
    if not dest.exists() or hashlib.sha1(dest.read_bytes()).hexdigest() != checksum:
        with urllib.request.urlopen(BASE + url, timeout=180) as response, dest.open('wb') as output:
            shutil.copyfileobj(response, output)
    if hashlib.sha1(dest.read_bytes()).hexdigest() != checksum:
        raise RuntimeError('SDK archive checksum mismatch')
    folder = BUILD / package.replace(';', '-')
    with zipfile.ZipFile(dest) as zipped:
        zipped.extractall(folder)
    wanted = 'android.jar' if package.startswith('platforms') else 'aapt2.exe'
    result = next(folder.rglob(wanted)).parent
    marker.write_text(json.dumps({'path': str(result)}))
    return result

platform = get_sdk('platforms;android-35')
sdk = get_sdk('build-tools;35.0.0', 'windows')
java_home = Path(os.environ.get('JAVA_HOME', 'C:/Program Files/Java/jdk-26'))
java = java_home / 'bin/java.exe'
javac = java_home / 'bin/javac.exe'
keytool = java_home / 'bin/keytool.exe'
android_jar = platform / 'android.jar'
classes = BUILD / 'classes'
dex = BUILD / 'dex'
classes.mkdir(exist_ok=True)
dex.mkdir(exist_ok=True)
resources = ROOT / 'android/res'
(resources / 'drawable').mkdir(parents=True, exist_ok=True)
shutil.copy2(ROOT / 'app/assets/icon.png', resources / 'drawable/icon.png')
run([javac, '-encoding', 'UTF-8', '-source', '8', '-target', '8', '-bootclasspath', android_jar, '-d', classes, ROOT / 'android/src/com/chewsimulator/app/MainActivity.java'])
run([java, '-cp', sdk / 'lib/d8.jar', 'com.android.tools.r8.D8', '--lib', android_jar, '--min-api', '23', '--output', dex, *classes.rglob('*.class')])
run([sdk / 'aapt2.exe', 'compile', '--dir', resources, '-o', BUILD / 'resources.zip'])
unsigned = BUILD / 'unsigned.apk'
run([sdk / 'aapt2.exe', 'link', '-I', android_jar, '--manifest', ROOT / 'android/AndroidManifest.xml', '--min-sdk-version', '23', '--target-sdk-version', '35', '-o', unsigned, BUILD / 'resources.zip'])
with zipfile.ZipFile(unsigned, 'a', compression=zipfile.ZIP_DEFLATED) as apk:
    apk.write(dex / 'classes.dex', 'classes.dex')
    for item in (ROOT / 'app').rglob('*'):
        if item.is_file() and item.suffix != '.ico':
            apk.write(item, 'assets/app/' + item.relative_to(ROOT / 'app').as_posix())
aligned = BUILD / 'aligned.apk'
run([sdk / 'zipalign.exe', '-f', '-p', '4', unsigned, aligned])
signing = ROOT / '.private/android-signing'
signing.mkdir(parents=True, exist_ok=True)
key = signing / 'release.jks'
secret_file = signing / 'password.txt'
if not key.exists():
    if os.environ.get('CHEW_CREATE_SIGNING_KEY') != '1':
        raise RuntimeError('Restore the original .private/android-signing key and password for an upgrade. Set CHEW_CREATE_SIGNING_KEY=1 only for a separate new app.')
    password = secrets.token_urlsafe(24)
    secret_file.write_text(password, encoding='utf-8')
    run([keytool, '-genkeypair', '-keystore', key, '-storepass:file', secret_file, '-keypass:file', secret_file, '-alias', 'chewsimulator', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000', '-dname', 'CN=Chew Simulator, O=Local App, C=CN'])
out = ROOT / '.build/releases/android/ChewSimulator-Android.apk'
out.parent.mkdir(parents=True, exist_ok=True)
run([java, '-jar', sdk / 'lib/apksigner.jar', 'sign', '--ks', key, '--ks-pass', 'file:' + str(secret_file), '--out', out, aligned])
run([java, '-jar', sdk / 'lib/apksigner.jar', 'verify', '--verbose', out])
run([sdk / 'aapt2.exe', 'dump', 'badging', out])
print('APK ready: ' + str(out), flush=True)
