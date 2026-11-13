import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function createUpdateManifest({version,tag,repository,publishedAt,signatures}){
  if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))throw new Error(`Geçersiz sürüm: ${version}`);
  if(!/^v[0-9A-Za-z.-]+$/.test(tag))throw new Error(`Geçersiz etiket: ${tag}`);
  if(!/^[\w.-]+\/[\w.-]+$/.test(repository))throw new Error(`Geçersiz depo: ${repository}`);
  for(const [platform,signature] of Object.entries(signatures)){
    if(!signature?.trim())throw new Error(`${platform} imzası boş`);
  }
  const base=`https://github.com/${repository}/releases/download/${tag}`;
  return {
    version,
    notes:`Mutfak Sync ${version} güvenli güncellemesi. Ayrıntılar için sürüm notlarına bakın.`,
    pub_date:publishedAt,
    platforms:{
      'darwin-aarch64':{
        signature:signatures['darwin-aarch64'].trim(),
        url:`${base}/mutfak-sync-${version}-darwin-aarch64.app.tar.gz`,
      },
      'windows-x86_64':{
        signature:signatures['windows-x86_64'].trim(),
        url:`${base}/mutfak-sync-${version}-windows-x86_64-setup.exe`,
      },
    },
  };
}

async function main(){
  const [releaseDir,version,tag,repository]=process.argv.slice(2);
  if(!releaseDir||!version||!tag||!repository)throw new Error('Kullanım: create-update-manifest.mjs <release-dir> <version> <tag> <owner/repo>');
  const signatures={
    'darwin-aarch64':await readFile(path.join(releaseDir,`mutfak-sync-${version}-darwin-aarch64.app.tar.gz.sig`),'utf8'),
    'windows-x86_64':await readFile(path.join(releaseDir,`mutfak-sync-${version}-windows-x86_64-setup.exe.sig`),'utf8'),
  };
  const manifest=createUpdateManifest({
    version,
    tag,
    repository,
    publishedAt:process.env.RELEASE_PUBLISHED_AT||new Date().toISOString(),
    signatures,
  });
  await writeFile(path.join(releaseDir,'latest.json'),`${JSON.stringify(manifest,null,2)}\n`,'utf8');
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
}
