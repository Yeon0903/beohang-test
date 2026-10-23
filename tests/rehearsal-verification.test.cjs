const {describe,test,before}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {rehearse,snapshot,sharedReport}=require('../scripts/rehearse-migrations.cjs');
const {renderSQL,compare}=require('../scripts/db-compatibility.cjs');
const {fixture,sql}=require('./helpers/security-db.cjs');
describe('real SQL migration rehearsal with synthetic users only',()=>{
 let result;before(async()=>{result=await rehearse();});
 test('all eight existing tables match exactly after every patch',()=>{
  assert.equal(result.stages.length,4);assert.ok(result.stages.every(s=>s.originalRowsUnchanged));
  assert.equal(Object.keys(result.tables).length,8);assert.ok(Object.values(result.tables).every(t=>t.preserved));
 });
 test('old handler stays successful during SQL migration and privileged role survives',()=>{
  assert.ok(result.stages.every(s=>s.legacyHandlerStatus===200));assert.equal(result.superAdminRolePreserved,true);
 });
 test('unsafe deployment order reproduces 503 and correct transition returns 200',()=>{
  assert.equal(result.unsafeNewHandlerBeforeSQL,503);assert.equal(result.environmentMismatch,503);assert.equal(result.newHandlerAfterStagingSetup,200);assert.equal(result.wrongPassword,401);
 });
 test('catalog comparison is provisional even after all SQL patches',()=>{
  assert.equal(result.afterComparison.blockers.length,0);assert.equal(result.afterComparison.readyToApply,false);
 });
 test('missing fields, argument drift and wrong return types block reconciliation',()=>{
  const r=structuredClone(result.afterReport);r.tables.find(t=>t.name==='public.virhang_users').columns.display_name='integer';
  r.functions[0].argument_names_compatible=false;
  const out=compare(r);assert.equal(out.schemaPreconditions,'blocked');assert.ok(out.blockers.length>=2);
 });
 test('checked-in shareable SQL matches the contract generator',()=>{
  assert.equal(renderSQL(),fs.readFileSync(path.resolve(__dirname,'../supabase/verification/security_shareable_05.sql'),'utf8'));
 });
 test('SQL Editor exported row wrapper is accepted without echoing input',()=>{
  const out=compare([{virhang_shareable_report:result.afterReport}]);assert.equal(out.blockers.length,0);assert.equal(out.readyToApply,false);
 });
 test('report contains no account rows or configuration values',()=>{
  const text=JSON.stringify(result.afterReport);assert.ok(!text.includes('fixture-only'));assert.ok(!text.includes('synthetic-access'));assert.ok(!text.includes('proconfig'));
  assert.ok(!text.includes('10000000-0000-4000-8000-'));
 });
});
test('patch 003 failure rolls back partial grants/functions without changing data',async()=>{
 const f=await fixture({applyPatches:false});try{
  await f.db.exec('ALTER TABLE public.virhang_users RENAME COLUMN display_name TO incompatible_name');
  // Snapshot only tables present in this pre-patch scenario; fixture has no legacy counter.
  const before=(await f.db.query('SELECT to_jsonb(t) AS row FROM public.virhang_users t ORDER BY id')).rows;
  const privilege=(await f.db.query("SELECT has_table_privilege('authenticated','public.virhang_users','UPDATE') AS ok")).rows[0].ok;
  await assert.rejects(()=>f.db.exec(sql('supabase/migrations/202610230003_profile_and_library_privacy.sql')),e=>e.code==='42703');
  await f.db.exec('ROLLBACK');
  assert.deepEqual((await f.db.query('SELECT to_jsonb(t) AS row FROM public.virhang_users t ORDER BY id')).rows,before);
  assert.equal((await f.db.query("SELECT has_table_privilege('authenticated','public.virhang_users','UPDATE') AS ok")).rows[0].ok,privilege);
  assert.equal((await f.db.query("SELECT to_regprocedure('public.virhang_has_valid_profile()') AS fn")).rows[0].fn,null);
 }finally{await f.db.close();}
});
test('03 inventory does not return arbitrary function configuration values',async()=>{
 const f=await fixture();try{
  await f.db.exec("ALTER FUNCTION public.virhang_my_profile() SET virhang.synthetic_setting='not-for-sharing'");
  await f.db.exec('BEGIN READ ONLY');
  await sharedReport(f.db);
  await f.db.exec('COMMIT');
  const r=await f.db.exec(sql('supabase/verification/security_preflight_03.sql'));
  assert.ok(!JSON.stringify(r).includes('not-for-sharing'));
 }finally{await f.db.close();}
});
