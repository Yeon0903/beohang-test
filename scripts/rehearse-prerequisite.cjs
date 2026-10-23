// Actual 000..004 files, isolated PGlite + synthetic rows only. No DB URL, keys, network or deployment.
const assert=require('node:assert/strict');const crypto=require('node:crypto');
const {sql}=require('../tests/helpers/security-db.cjs');const {liveShapeFixture}=require('../tests/helpers/live-shape-db.cjs');
const {oldRows}=require('./rehearse-live-shape.cjs');const {sharedReport}=require('./rehearse-migrations.cjs');
const {callLogin}=require('../tests/helpers/login-rehearsal.cjs');const {compare}=require('./db-compatibility.cjs');
const manifest=require('../config/migration-allowlist.json');
async function applyFile(db,item){
 const body=sql('supabase/migrations/'+item.file);
 assert.equal(crypto.createHash('sha256').update(body).digest('hex'),item.sha256,'Allowlist hash mismatch');
 await db.exec(body);
}
async function rehearsePrerequisite(){
 const f=await liveShapeFixture({integrityConfirmed:true});
 try{
  const before=await oldRows(f.db);const pre=compare(await sharedReport(f.db));const stages=[];
  const legacyBefore=await callLogin(f,{legacy:true,enforceServiceLookup:true});assert.equal(legacyBefore.status,200);
  for(const item of [...manifest.prerequisites,...manifest.migrations]){
   await applyFile(f.db,item);
   assert.deepEqual(await oldRows(f.db),before,'Existing fields changed by '+item.file);
   const login=await callLogin(f,{legacy:true,enforceServiceLookup:true});assert.equal(login.status,200);
   // Test the actual separately committed boundary; do not hide a weak stage in one giant transaction.
   await f.actor('authenticated',f.users.profileless,()=>assert.rejects(
    ()=>f.db.query("SELECT public.virhang_admin_link_artist('아이네','contributor','link')"),e=>e.code==='42501'));
   await f.actor('anon',null,()=>assert.rejects(()=>f.db.query('SELECT verified_user_id FROM public.virhang_artist_identities'),e=>e.code==='42501'));
   const noDelete=(await f.db.query("SELECT NOT has_table_privilege('authenticated','public.virhang_published_tracks','DELETE') AS ok")).rows[0].ok;assert.equal(noDelete,true);
   stages.push({file:item.file,allExistingFieldsPreserved:true,legacyLoginStatus:login.status,profilelessAdminDenied:true,verificationIdsPrivate:true,noDirectDelete:true});
  }
  const mismatch=await callLogin(f,{enforceServiceLookup:true});assert.equal(mismatch.status,503);
  await f.db.exec("UPDATE virhang_private.login_security SET environment='staging',developer_bypass=true WHERE singleton");
  const newLogin=await callLogin(f,{enforceServiceLookup:true});assert.equal(newLogin.status,200);
  const unconfirmed=await callLogin(f,{enforceServiceLookup:true,emailConfirmed:false});assert.equal(unconfirmed.status,401);
  await f.db.query("UPDATE public.virhang_artist_identities SET verified_user_id=$1,verified_by=$2,verified_at=now() WHERE artist_key='아이네'",[f.users.contributor,f.users.superadmin]);
  const links=(await f.db.query('SELECT to_jsonb(t) AS row FROM public.virhang_artist_identities t ORDER BY artist_key')).rows;
  // 000 is safe to repeat before or after all patches; preserve manual verification + staging config.
  for(const item of [...manifest.prerequisites,...manifest.migrations])await applyFile(f.db,item);
  assert.deepEqual((await f.db.query('SELECT to_jsonb(t) AS row FROM public.virhang_artist_identities t ORDER BY artist_key')).rows,links);
  assert.deepEqual(await oldRows(f.db),before);
  assert.equal((await callLogin(f,{enforceServiceLookup:true})).status,200);
  const profileless=(await f.db.query('SELECT count(*)::int AS n FROM public.virhang_users WHERE id=$1',[f.users.profileless])).rows[0].n;assert.equal(profileless,0);
  await f.actor('authenticated',f.users.superadmin,async()=>{
   assert.equal((await f.db.query('SELECT * FROM public.virhang_my_profile()')).rows[0].role,'super_admin');
   await f.db.query("SELECT public.virhang_admin_streamer_account('viewer','lookup')");
  });
  return {scope:'synthetic PGlite matching supplied catalog + confirmed integrity facts; Auth/email/JWT mocked',
   beforeComparison:pre,stages,preservedTables:Object.keys(before),
   repeatPreservedAllExistingFieldsAndVerifiedLinks:true,profilelessAuthNotRepaired:true,superAdminPreserved:true,
   login:{legacyBefore:legacyBefore.status,newEnvironmentMismatch:mismatch.status,newConfigured:newLogin.status,unconfirmedEmail:unconfirmed.status,serviceLookupPrivilegesEnforced:true},
   afterComparison:compare(await sharedReport(f.db)),authForeignKeyDeferred:true,isolatedVerificationPassed:true,liveDeploymentVerified:false};
 }finally{await f.db.close();}
}
if(require.main===module)rehearsePrerequisite().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
module.exports={rehearsePrerequisite,applyFile};
