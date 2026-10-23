// Local PGlite ONLY. Models supplied catalog facts with synthetic definitions/rows, never accesses a live DB.
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {liveShapeFixture}=require('../tests/helpers/live-shape-db.cjs');
const {sql}=require('../tests/helpers/security-db.cjs');const {callLogin}=require('../tests/helpers/login-rehearsal.cjs');
const {sharedReport}=require('./rehearse-migrations.cjs');const {compare}=require('./db-compatibility.cjs');
const manifest=require('../config/migration-allowlist.json');
const preserved=['auth.users','public.virhang_users','public.virhang_account_libraries','public.virhang_published_tracks','public.virhang_rank_listens','public.virhang_login_attempts','public.virhang_tracks','public.virhang_playlists'];
async function oldRows(db){
 const out={};
 for(const t of preserved){
  // Only the two intentionally NEW track columns are excluded; every preexisting field must match.
  const row=t==='public.virhang_published_tracks'?"to_jsonb(t)-ARRAY['is_deleted','deleted_at']":"to_jsonb(t)";
  out[t]=(await db.query(`SELECT ${row} AS row FROM ${t} t ORDER BY (${row})::text`)).rows.map(x=>x.row);
 }
 return out;
}
function reviewedSources(){
 const joint='V3.0_JOINT_SINGERS_LATE_SIGNUP.sql';
 const files=[{file:joint,sha256:'10a6e0cf32c55e24a5bc57d5d172907ebfc023d4458a8b6a2f6f66da927b362a'},...manifest.migrations.map(x=>({...x,file:'supabase/migrations/'+x.file}))];
 return files.map(x=>{
  const body=sql(x.file);assert.equal(crypto.createHash('sha256').update(body).digest('hex'),x.sha256);
  // Strip ONLY each file's outer transaction to model one atomic local transition.
  assert.match(body,/^BEGIN;$/m);assert.match(body,/COMMIT;\s*$/);
  return body.replace(/^BEGIN;\r?\n/m,'').replace(/COMMIT;\s*$/,'');
 });
}
async function applyAtomicLocal(db){
 // Never export this as an approved live migration: existing policy/function bodies are unknown.
 await db.exec('BEGIN; SET LOCAL lock_timeout=\'5s\'; SET LOCAL statement_timeout=\'30s\';\n'+reviewedSources().join('\n')+'\nCOMMIT;');
}
async function rehearseLiveShape(liveReport){
 const f=await liveShapeFixture();
 try{
  const before=await oldRows(f.db);const beforeReport=await sharedReport(f.db);
  if(liveReport){
   assert.deepEqual(beforeReport,liveReport,'Synthetic catalog differs from supplied report; do not infer live compatibility');
  }
  let directPatchError;
  try{await f.db.exec(sql('supabase/migrations/202610230001_admin_null_guards.sql'));throw new Error('001 unexpectedly succeeded');}
  catch(e){if(!e.message.includes('Missing prerequisite functions'))throw e;directPatchError=e.code;await f.db.exec('ROLLBACK');}
  assert.deepEqual(await oldRows(f.db),before);
  const legacyBefore=await callLogin(f,{legacy:true});assert.equal(legacyBefore.status,200);
  const earlyNew=await callLogin(f);assert.equal(earlyNew.status,503);
  await applyAtomicLocal(f.db);
  assert.deepEqual(await oldRows(f.db),before);
  const newState=(await f.db.query('SELECT bool_and(NOT is_deleted AND deleted_at IS NULL) AS ok FROM public.virhang_published_tracks')).rows[0].ok;assert.equal(newState,true);
  const unlinked=(await f.db.query('SELECT bool_and(verified_user_id IS NULL AND verified_by IS NULL AND verified_at IS NULL) AS ok FROM public.virhang_artist_identities')).rows[0].ok;assert.equal(unlinked,true);
  const credits=(await f.db.query('SELECT count(*)::int AS n FROM public.virhang_song_singers')).rows[0].n;
  const legacyAfter=await callLogin(f,{legacy:true});assert.equal(legacyAfter.status,200);
  const newMismatch=await callLogin(f);assert.equal(newMismatch.status,503);
  await f.db.exec("UPDATE virhang_private.login_security SET environment='staging',developer_bypass=true WHERE singleton");
  const newAfter=await callLogin(f);assert.equal(newAfter.status,200);
  await f.db.query("UPDATE public.virhang_artist_identities SET verified_user_id=$1,verified_by=$2,verified_at=now() WHERE artist_key='아이네'",[f.users.contributor,f.users.superadmin]);
  const linkedBefore=(await f.db.query('SELECT to_jsonb(t) AS row FROM public.virhang_artist_identities t ORDER BY artist_key')).rows;
  await applyAtomicLocal(f.db);
  assert.deepEqual((await f.db.query('SELECT to_jsonb(t) AS row FROM public.virhang_artist_identities t ORDER BY artist_key')).rows,linkedBefore);
  assert.deepEqual(await oldRows(f.db),before);
  await f.actor('authenticated',f.users.superadmin,async()=>{
   assert.equal((await f.db.query('SELECT * FROM public.virhang_my_profile()')).rows[0].role,'super_admin');
   await f.db.query("SELECT public.virhang_admin_streamer_account('viewer','lookup')");
  });
  const afterReport=await sharedReport(f.db);const afterComparison=compare(afterReport);
  assert.deepEqual(afterComparison.blockers,['Profile PK/username uniqueness/Auth FK needs reconciliation']);
  return {scope:'synthetic catalog-shaped PGlite only; Auth mocked; no live DB requests',suppliedCatalogMatched:!!liveReport,
   beforeComparison:compare(beforeReport),direct001SQLSTATE:directPatchError,direct001RollbackPreservedRows:true,
   atomicSequence:['joint-singer source','001','002','003','004'],
   preservedTables:Object.fromEntries(Object.entries(before).map(([k,v])=>[k,{syntheticRows:v.length,allExistingFieldsPreserved:true}])),
   addedTrackDefaultsSafe:newState,noAutomaticAccountLinks:unlinked,syntheticCredits:credits,repeatPreservedLinksAndRows:true,superAdminRolePreserved:true,
   login:{legacyBefore:legacyBefore.status,newBeforeSQL:earlyNew.status,legacyAfter:legacyAfter.status,newWrongEnvironment:newMismatch.status,newAfterStagingSetup:newAfter.status},
   afterComparison,authForeignKeyAutoAdded:false,readyToApply:false};
 }finally{await f.db.close();}
}
if(require.main===module){
 const input=process.argv[2]?JSON.parse(fs.readFileSync(path.resolve(process.argv[2]),'utf8')):undefined;
 rehearseLiveShape(input).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
}
module.exports={liveShapeFixture,oldRows,applyAtomicLocal,rehearseLiveShape};
