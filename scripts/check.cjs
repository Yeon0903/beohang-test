// Local static checks only. This command never merges, deploys, or connects to a DB.
const fs=require('node:fs');const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
let count=0;
for(const file of fs.readdirSync(root).filter(x=>x.endsWith('.js'))){new vm.Script(fs.readFileSync(path.join(root,file),'utf8'),{filename:file});count++;}
for(const file of ['index.html','auth/callback.html']){
 const html=fs.readFileSync(path.join(root,file),'utf8');
 for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(match[1].trim()){new vm.Script(match[1],{filename:file});count++;}
}
console.log(`Syntax checks passed: ${count} scripts. No deployment performed.`);
