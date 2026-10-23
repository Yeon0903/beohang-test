// Scan supplied Git history range as well as tracked working files. Output only path/type, never values.
const fs=require('node:fs');const cp=require('node:child_process');
const patterns=[
 ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
 ['Supabase secret',/sb_secret_[A-Za-z0-9_-]{16,}/],
 ['GitHub token',/(?:gh[pousr]_[A-Za-z0-9]{24,}|github_pat_[A-Za-z0-9_]{30,})/],
 ['literal server secret',/(?:SUPABASE_SERVICE_ROLE_KEY|SOOP_CLIENT_SECRET)\s*[:=]\s*['"][^'"\n]{16,}['"]/],
 ['JWT service-role key',/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/]
];
function scanText(label,body){return patterns.filter(([,rx])=>rx.test(body)).map(([kind])=>({file:label,kind}));}
function scanGit(range){
 const matches=[];
 for(const name of cp.execFileSync('git',['ls-files','-z']).toString().split('\0').filter(Boolean)){
  if(/^\.env(?:\.|$)/.test(name)&&name!=='.env.example')matches.push({file:name,kind:'tracked environment file'});
  if(fs.existsSync(name))matches.push(...scanText(name,fs.readFileSync(name,'utf8')));
 }
 const commits=cp.execFileSync('git',['rev-list',range]).toString().trim().split('\n').filter(Boolean);
 for(const commit of commits)matches.push(...scanText(commit,cp.execFileSync('git',['show','--format=','--no-ext-diff',commit],{maxBuffer:16*1024*1024}).toString()));
 return {scope:`tracked working tree and ${commits.length} commits in ${range}`,matches};
}
if(require.main===module){
 const result=process.argv[2]==='--stdin'?{scope:'supplied file contents and Git history',matches:JSON.parse(fs.readFileSync(0,'utf8')).flatMap(x=>scanText(x.file,x.body))}:scanGit(process.argv[2]||'32abcd9..HEAD');
 console.log(JSON.stringify(result,null,2));process.exitCode=result.matches.length?1:0;
}
module.exports={scanText};
