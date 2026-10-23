const {describe,test,before,beforeEach,after}=require('node:test');const assert=require('node:assert/strict');
const {fixture}=require('./helpers/security-db.cjs');const {pathToFileURL}=require('node:url');const path=require('node:path');
let f;const denied=fn=>assert.rejects(fn,e=>e.code==='42501');
describe('environment-specific login limits in local PostgreSQL',()=>{
 before(async()=>{f=await fixture();});after(()=>f.db.close());
 beforeEach(async()=>{await f.db.exec("UPDATE virhang_private.login_security SET environment='production',developer_bypass=false; DELETE FROM virhang_private.login_attempts;");});
 const limit=async(name,tries)=>{
  const answers=[];
  await f.actor('service_role',null,async()=>{for(let i=0;i<tries;i++)answers.push((await f.db.query('SELECT public.virhang_check_login_limit($1) AS ok',[name])).rows[0].ok);});return answers;
 };
 const staging=()=>f.db.exec("UPDATE virhang_private.login_security SET environment='staging',developer_bypass=true");
 test('production always limits ordinary accounts to five attempts',async()=>assert.deepEqual(await limit('viewer',6),[true,true,true,true,true,false]));
 for(const name of ['admin','superadmin'])test(`${name} remains limited even in relaxed staging`,async()=>{await staging();assert.deepEqual(await limit(name,6),[true,true,true,true,true,false]);});
 for(const name of ['viewer','streamer'])test(`staging convenience is preserved for ${name}`,async()=>{await staging();assert.ok((await limit(name,20)).every(Boolean));});
 for(const name of ['unknownuser','profileless','nullrole'])test(`staging does not exempt ${name}`,async()=>{await staging();assert.equal((await limit(name,6))[5],false);});
 test('production config cannot enable developer bypass',()=>assert.rejects(()=>f.db.exec('UPDATE virhang_private.login_security SET developer_bypass=true'),e=>e.code==='23514'));
 test('window expires after 15 minutes',async()=>{
  await f.db.query("INSERT INTO virhang_private.login_attempts(username,attempt_count,window_started) VALUES('viewer',5,now()-interval '16 minutes')");assert.equal((await limit('viewer',1))[0],true);
 });
 for(const who of ['viewer','admin','profileless'])test(`${who} cannot inspect/change policy, counters or invoke limiter`,async()=>{
  await denied(()=>f.actor('authenticated',f.users[who],()=>f.db.query('SELECT * FROM virhang_private.login_security')));
  await denied(()=>f.actor('authenticated',f.users[who],()=>f.db.query("SELECT public.virhang_check_login_limit('viewer')")));
  await denied(()=>f.actor('authenticated',f.users[who],()=>f.db.query('SELECT public.virhang_login_policy()')));
 });
 test('legacy unlimited function overwrite is detected by fingerprint',async()=>{
  await f.db.exec('BEGIN');try{
   await f.db.exec("CREATE OR REPLACE FUNCTION public.virhang_check_login_limit(p_username text) RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT true $$");
   await f.db.exec('SET LOCAL ROLE service_role');
   assert.equal((await f.db.query('SELECT public.virhang_login_policy() AS policy')).rows[0].policy.limiter_integrity,false);
  }finally{await f.db.exec('ROLLBACK');}
 });
 test('server policy fails closed for missing, mismatched or unsafe config',async()=>{
  const {acceptsLoginPolicy:ok}=await import(pathToFileURL(path.resolve(__dirname,'../supabase/functions/virhang-username-login/login-policy.mjs')));
  const policy={environment:'production',developer_bypass:false,limiter_integrity:true,privileged_accounts_limited:true};
  assert.equal(ok(undefined,policy),true);assert.equal(ok('production',null),false);
  assert.equal(ok('unknown',policy),false);assert.equal(ok('staging',policy),false);
  assert.equal(ok('production',{...policy,developer_bypass:true}),false);
  assert.equal(ok('production',{...policy,limiter_integrity:false}),false);
  assert.equal(ok('staging',{...policy,environment:'staging',developer_bypass:true}),true);
 });
});
