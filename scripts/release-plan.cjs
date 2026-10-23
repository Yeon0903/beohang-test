// Validate an approved migration allowlist and project binding. Never executes SQL or deploys.
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
function plan(environment,projectRef,config,repoRoot=root){
 if(!['staging','production'].includes(environment))throw new Error('Choose staging or production explicitly');
 const refs=['staging','production'].map(e=>config?.[e]?.projectRef);
 if(refs.some(r=>!/^[a-z]{20}$/.test(r||''))||refs[0]===refs[1])throw new Error('Bind two distinct real project refs in a local config');
 if(config[environment].projectRef!==projectRef)throw new Error('Project/environment mismatch');
 const manifest=JSON.parse(fs.readFileSync(path.join(repoRoot,'config/migration-allowlist.json'),'utf8'));
 const files=fs.readdirSync(path.join(repoRoot,'supabase/migrations')).sort();
 if(files.length!==manifest.migrations.length)throw new Error('Unreviewed migration files');
 const steps=manifest.migrations.map(item=>{
  if(!/^\d{12}_[a-z0-9_]+\.sql$/.test(item.file)||!files.includes(item.file))throw new Error('Invalid migration path');
  const body=fs.readFileSync(path.join(repoRoot,'supabase/migrations',item.file));
  if(crypto.createHash('sha256').update(body).digest('hex')!==item.sha256)throw new Error('Migration changed since review: '+item.file);
  if(/DISABLE_RATE_LIMIT_DEV|SELECT\s+true\s*;|developer_bypass\s*=\s*true/i.test(body.toString()))throw new Error('Developer relaxation is forbidden in shared migrations');
  return item.file;
 });
 return {environment,projectRef,mode:'review-only; no SQL execution',requiresSchemaReview:true,migrations:steps,developerBypass:false};
}
if(require.main===module){
 try{
  const [environment,projectRef,configPath]=process.argv.slice(2);
  if(!configPath)throw new Error('Usage: node scripts/release-plan.cjs staging|production PROJECT_REF CONFIG_PATH');
  console.log(JSON.stringify(plan(environment,projectRef,JSON.parse(fs.readFileSync(configPath,'utf8'))),null,2));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={plan};
