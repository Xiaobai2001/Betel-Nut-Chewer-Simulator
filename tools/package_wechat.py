"""Create a direct-import native mini program package, retaining older deliveries."""
import json
import shutil
import tempfile
from pathlib import Path
from prepare_publish import ROOT, source_files, write_zip, sha256, install_output

def main():
    version=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
    files=[p for p in source_files() if p.relative_to(ROOT).parts[0]=='wechat']
    if not files: raise RuntimeError('WeChat source missing from allowlist')
    (ROOT/'.build').mkdir(exist_ok=True)
    stage=Path(tempfile.mkdtemp(prefix='wechat-',dir=ROOT/'.build'))
    output=stage/'delivery'
    project=output/'微信小程序源码'
    for source in files:
        dest=project/source.relative_to(ROOT/'wechat')
        dest.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(source,dest)
    assert (project/'project.config.json').is_file()
    archive=output/f'ChewSimulator-{version}-WeChat.zip'
    write_zip(project,archive,'微信小程序源码/')
    (output/'SHA256SUMS.txt').write_text(sha256(archive)+'  '+archive.name+'\n',encoding='utf-8')
    shutil.copy2(ROOT/'wechat/README.md',output/'先看导入说明.md')
    size=archive.stat().st_size
    final=install_output(output,f'微信小程序-{version}')
    print(f'Prepared: {final}; ZIP {size:,} bytes')

if __name__=='__main__': main()
