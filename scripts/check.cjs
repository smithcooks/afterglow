const {spawnSync}=require('node:child_process');const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'..');let failed=false;
for(const folder of ['src','ui','scripts','tests'])for(const file of fs.readdirSync(path.join(root,folder))){if(!/\.(c?js)$/.test(file))continue;const result=spawnSync(process.execPath,['--check',path.join(root,folder,file)],{encoding:'utf8'});if(result.status){failed=true;console.error(result.stderr);}}
if(!failed)console.log('All JavaScript files parse successfully.');process.exitCode=failed?1:0;
