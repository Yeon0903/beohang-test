const {describe,test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {plan}=require('../scripts/release-plan.cjs');
const {scanText}=require('../scripts/secret-scan.cjs');
const config={staging:{projectRef:'s'.repeat(20)},production:{projectRef:'p'.repeat(20)}};
describe('review-only environment and migration release guards',()=>{
 test('production plan uses only approved shared migrations',()=>{
  const p=plan('production',config.production.projectRef,config);assert.equal(p.developerBypass,false);assert.equal(p.migrations.length,4);assert.match(p.mode,/no SQL execution/);
 });
 test('unknown, mismatched and unconfigured project refs fail closed',()=>{
  assert.throws(()=>plan('production',config.staging.projectRef,config));assert.throws(()=>plan('',config.staging.projectRef,config));
  assert.throws(()=>plan('production',config.production.projectRef,{...config,production:config.staging}));
  assert.throws(()=>plan('production',config.production.projectRef,require('../config/environments.example.json')));
 });
 test('adding DEV SQL or modifying a migration fails verification',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'virhang-release-'));
  try{
   fs.mkdirSync(path.join(root,'supabase/migrations'),{recursive:true});fs.mkdirSync(path.join(root,'config'));
   fs.copyFileSync(path.resolve(__dirname,'../config/migration-allowlist.json'),path.join(root,'config/migration-allowlist.json'));
   for(const name of fs.readdirSync(path.resolve(__dirname,'../supabase/migrations')))fs.copyFileSync(path.resolve(__dirname,'../supabase/migrations',name),path.join(root,'supabase/migrations',name));
   fs.writeFileSync(path.join(root,'supabase/migrations/DEV.sql'),'SELECT true;');
   assert.throws(()=>plan('production',config.production.projectRef,config,root));fs.unlinkSync(path.join(root,'supabase/migrations/DEV.sql'));
   const first=fs.readdirSync(path.join(root,'supabase/migrations'))[0];fs.appendFileSync(path.join(root,'supabase/migrations',first),'\n-- altered\n');
   assert.throws(()=>plan('production',config.production.projectRef,config,root));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 });
 test('secret scanner detects credential patterns without printing values',()=>{
  const value='sb_'+'secret_'+'A'.repeat(24);const hits=scanText('fixture.txt',value);
  assert.equal(hits.length,1);assert.ok(!JSON.stringify(hits).includes(value));
 });
});
