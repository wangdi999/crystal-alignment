"""试玩包只放一个 HTML 文件；源码、记录与说明保留在开发项目。"""
import hashlib,json,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
file=ROOT/'dist/crystal-alignment.html'
archive=ROOT/'dist/crystal-alignment.zip'
report=json.loads((ROOT/'artifacts/browser-report.json').read_text(encoding='utf-8'))
assert not report['errors']
assert not json.loads((ROOT/'artifacts/rogue-browser-report.json').read_text(encoding='utf-8'))['errors']
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as output:
    output.writestr('晶核归位.html',file.read_bytes())
with zipfile.ZipFile(archive) as output:
    assert output.namelist()==['晶核归位.html'] and output.testzip() is None
    assert hashlib.sha256(output.read('晶核归位.html')).digest()==hashlib.sha256(file.read_bytes()).digest()
(ROOT/'artifacts/package-report.json').write_text(json.dumps({'html_bytes':file.stat().st_size,'zip_bytes':archive.stat().st_size,'zip_crc':'通过','files':['晶核归位.html'],'sha256':hashlib.sha256(file.read_bytes()).hexdigest()},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'试玩文件 {file.stat().st_size/1024:.1f} KB，压缩包 {archive.stat().st_size/1024:.1f} KB。')
