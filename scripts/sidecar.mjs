import {readFileSync,mkdirSync,writeFileSync,chmodSync,mkdtempSync,copyFileSync,rmSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const spec=JSON.parse(readFileSync(new URL('./rclone-checksums.json',import.meta.url),'utf8'));
const targets={
 'aarch64-apple-darwin':['osx-arm64','rclone'],
 'x86_64-apple-darwin':['osx-amd64','rclone'],
 'x86_64-pc-windows-msvc':['windows-amd64','rclone.exe'],
 'x86_64-unknown-linux-gnu':['linux-amd64','rclone'],
};
const target=process.argv[2]||(process.platform==='darwin'?(process.arch==='arm64'?'aarch64-apple-darwin':'x86_64-apple-darwin'):process.platform==='win32'?'x86_64-pc-windows-msvc':'x86_64-unknown-linux-gnu');
if(!targets[target])throw new Error(`Desteklenmeyen hedef: ${target}`);
const [platform,exe]=targets[target],stem=`rclone-v${spec.version}-${platform}`,archive=`${stem}.zip`;
const temp=mkdtempSync(join(tmpdir(),'mutfak-sidecar-'));
const output=resolve('src-tauri/binaries',`rclone-${target}${exe.endsWith('.exe')?'.exe':''}`);
try{
 execFileSync('curl',['--fail','--location','--silent','--show-error','--max-time','180',`https://github.com/rclone/rclone/releases/download/v${spec.version}/${archive}`,'--output',join(temp,archive)],{stdio:'inherit'});
 const actual=createHash('sha256').update(readFileSync(join(temp,archive))).digest('hex');
 if(actual!==spec.sha256[archive])throw new Error('Rclone SHA256 doğrulaması başarısız');
 if(process.platform==='win32'){
  execFileSync('powershell',['-NoProfile','-NonInteractive','-Command','Expand-Archive -LiteralPath $env:MUTFAK_ZIP -DestinationPath $env:MUTFAK_EXTRACT'],{env:{...process.env,MUTFAK_ZIP:join(temp,archive),MUTFAK_EXTRACT:temp},stdio:'inherit'});
 }else{execFileSync('unzip',['-q',join(temp,archive),'-d',temp]);}
 mkdirSync(resolve('src-tauri/binaries'),{recursive:true});
 copyFileSync(join(temp,stem,exe),output);if(process.platform!=='win32')chmodSync(output,0o755);
 // Retain the upstream license with every distribution.
 mkdirSync('docs/licenses',{recursive:true});
 execFileSync('curl',['--fail','--location','--silent','--show-error',`https://raw.githubusercontent.com/rclone/rclone/v${spec.version}/COPYING`,'--output','docs/licenses/rclone-LICENSE.txt'],{stdio:'inherit'});
 const samePlatform=(process.platform==='linux'&&process.arch==='x64'&&platform==='linux-amd64')||(process.platform==='darwin'&&((process.arch==='arm64'&&platform==='osx-arm64')||(process.arch==='x64'&&platform==='osx-amd64')))||(process.platform==='win32'&&process.arch==='x64'&&platform==='windows-amd64');
 if(samePlatform){const v=execFileSync(output,['version'],{encoding:'utf8'});if(!v.startsWith(`rclone v${spec.version}`))throw new Error('Rclone sürümü uyuşmuyor');console.log(v);}
 console.log(`Doğrulandı: ${output}`);
}finally{rmSync(temp,{recursive:true,force:true});}
