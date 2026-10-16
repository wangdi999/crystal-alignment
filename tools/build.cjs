// 将源码合并成一个完全离线的 HTML 文件，试玩包不包含说明或测试材料。
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
html=html.replace('<link rel="stylesheet" href="styles.css">',()=>`<style>${fs.readFileSync(path.join(root,'styles.css'),'utf8')}</style>`);
html=html.replace('<link rel="stylesheet" href="rogue.css">',()=>`<style>${fs.readFileSync(path.join(root,'rogue.css'),'utf8')}</style>`);
for(const file of ['engine.js','rogue.js','app.js','rogue-app.js'])html=html.replace(`<script src="${file}"></script>`,()=>`<script>\n${fs.readFileSync(path.join(root,file),'utf8')}\n</script>`);
const file=path.resolve(root,'dist/crystal-alignment.html');
fs.mkdirSync(path.dirname(file),{recursive:true});
fs.writeFileSync(file,html,'utf8');
fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
fs.writeFileSync(path.join(root,'artifacts/build.json'),JSON.stringify({file:path.basename(file),bytes:Buffer.byteLength(html),note:'所有界面与规则内嵌，无需网络或本地服务。'},null,2));
console.log(`单文件试玩版：${file}（${(Buffer.byteLength(html)/1024).toFixed(1)} KB）`);
