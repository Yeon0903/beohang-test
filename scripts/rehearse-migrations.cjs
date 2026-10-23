// Synthetic in-memory PostgreSQL rehearsal only. No URL/keys/live accounts, no network or deployment.
const assert=require('node:assert/strict');const crypto=require('node:crypto');const fs=require('node:fs');const path=require('node:path');
const {fixture,sql}=require('../tests/helpers/security-db.cjs');const {callLogin}=require('../tests/helpers/login-rehearsal.cjs');
const {compare}=require('./db-compatibility.cjs');
const manifest=require('../config/migration-allowlist.json');
const preserved=['auth.users','public.virhang_users','public.virhang_account_libraries','public.virhang_published_tracks','public.virhang_artist_identities','public.virhang_song_singers','public.virhang_rank_listens','public.virhang_login_attempts'];
async function snapshot(db){
 const result={};
 for(const t of preserved)result[t]=(await db.query(`SELECT to_jsonb(t) AS row FROM ${t} t ORDER BY to_jsonb(t)::text`)).rows.map(x=>x.row);
 return result;
}
async function sharedReport(db){const results=await db.exec(sql('supabase/verification/security_shareable_05.sql'));return results.flatMap(r=>r.rows||[]).find(x=>x.virhang_shareable_report)?.virhang_shareable_report;}
async function rehearse(){
 const f=await fixture({applyPatches:false});
 try{
  // Model the user's existing development no-op without copying any real DB definition/data.
  await f.db.exec(`CREATE TABLE public.virhang_login_attempts(username text PRIMARY KEY,attempt_count integer NOT NULL,window_started timestamptz NOT NULL DEFAULT now());
   INSERT INTO public.virhang_login_attempts VALUES('rehearsal',2,now());
   CREATE FUNCTION public.virhang_check_login_limit(p_username text) RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT true $$;
   REVOKE ALL ON FUNCTION public.virhang_check_login_limit(text) FROM PUBLIC,anon,authenticated;
   GRANT EXECUTE ON FUNCTION public.virhang_check_login_limit(text) TO service_role;`);
  const before=await snapshot(f.db);const beforeReport=await sharedReport(f.db);
  const baselineLogin=await callLogin(f,{legacy:true});assert.equal(baselineLogin.status,200);
  const unsafeOrder=await callLogin(f);assert.equal(unsafeOrder.status,503);
  const stages=[];
  for(const item of manifest.migrations){
   const bytes=fs.readFileSync(path.resolve(__dirname,'../supabase/migrations',item.file));
   assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.sha256);
   await f.db.exec(bytes.toString());
   assert.deepEqual(await snapshot(f.db),before,'Existing data changed by '+item.file);
   const login=await callLogin(f,{legacy:true});assert.equal(login.status,200);
   stages.push({migration:item.file,originalRowsUnchanged:true,legacyHandlerStatus:login.status});
  }
  const mismatch=await callLogin(f,{environment:'staging'});assert.equal(mismatch.status,503);
  await f.db.exec("UPDATE virhang_private.login_security SET environment='staging',developer_bypass=true WHERE singleton");
  const transitioned=await callLogin(f,{environment:'staging'});assert.equal(transitioned.status,200);
  const wrongPassword=await callLogin(f,{password:'wrong-rehearsal'});assert.equal(wrongPassword.status,401);
  await f.actor('authenticated',f.users.superadmin,async()=>{
   const p=await f.db.query('SELECT * FROM public.virhang_my_profile()');assert.equal(p.rows[0].role,'super_admin');
   await f.db.query("SELECT public.virhang_admin_streamer_account('viewer','lookup')");
  });
  assert.deepEqual(await snapshot(f.db),before);
  const afterReport=await sharedReport(f.db);
  return {scope:'synthetic PGlite rehearsal; Auth is mocked, no Supabase/HTTP calls',baselineAuthority:'test fixture; not the actual staging schema',
   tables:Object.fromEntries(Object.entries(before).map(([k,v])=>[k,{rows:v.length,preserved:true}])),
   stages,unsafeNewHandlerBeforeSQL:unsafeOrder.status,environmentMismatch:mismatch.status,
   newHandlerAfterStagingSetup:transitioned.status,wrongPassword:wrongPassword.status,superAdminRolePreserved:true,
   beforeComparison:compare(beforeReport),afterComparison:compare(afterReport),beforeReport,afterReport,
   actualSupabaseCompatibility:'pending sanitized live report and private definition/RLS review',readyToDeploy:false};
 }finally{await f.db.close();}
}
if(require.main===module)rehearse().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={rehearse,snapshot,sharedReport};
