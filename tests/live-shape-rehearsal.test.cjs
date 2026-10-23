const {describe,test,before,after}=require('node:test');const assert=require('node:assert/strict');
const {liveShapeFixture,oldRows,applyAtomicLocal,rehearseLiveShape}=require('../scripts/rehearse-live-shape.cjs');
const {sharedReport}=require('../scripts/rehearse-migrations.cjs');const {compare}=require('../scripts/db-compatibility.cjs');
const {sql,id}=require('./helpers/security-db.cjs');
async function integrity(db){return (await db.query(sql('supabase/verification/security_integrity_06.sql'))).rows[0].virhang_integrity_report;}
describe('supplied catalog differences reproduced without real accounts',()=>{
 let baseline,patched,result;
 before(async()=>{
  baseline=await liveShapeFixture();patched=await liveShapeFixture();await applyAtomicLocal(patched.db);result=await rehearseLiveShape();
 });
 after(async()=>{await baseline?.db.close();await patched?.db.close();});
 test('pre-joint shape has ten blockers including missing soft-delete fields and Auth FK',async()=>{
  const report=await sharedReport(baseline.db),out=compare(report);
  assert.equal(out.blockers.length,10);assert.ok(out.blockers.some(x=>x.includes('is_deleted')));
  assert.equal(report.tables.find(x=>x.name==='public.virhang_users').policy_count,0);
  assert.equal(report.tables.find(x=>x.name==='public.virhang_users').rls,true);
  assert.equal(report.tables.find(x=>x.name==='public.virhang_users').auth_user_fk,false);
 });
 test('current frontend soft-delete filter fails on the reported schema',async()=>{
  await assert.rejects(()=>baseline.db.query('SELECT * FROM public.virhang_published_tracks WHERE is_deleted=false'),e=>e.code==='42703');
 });
 test('policy-free profiles deny direct access while owner-definer own-profile RPC works',async()=>{
  await baseline.actor('authenticated',baseline.users.superadmin,async()=>{
   assert.equal((await baseline.db.query('SELECT * FROM public.virhang_my_profile()')).rows[0].role,'super_admin');
   await assert.rejects(()=>baseline.db.query('SELECT * FROM public.virhang_users'),e=>e.code==='42501');
  });
  await baseline.db.exec('BEGIN');try{
   await baseline.db.exec('GRANT SELECT ON public.virhang_users TO authenticated');
   await baseline.db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[baseline.users.viewer]);await baseline.db.exec('SET LOCAL ROLE authenticated');
   assert.deepEqual((await baseline.db.query('SELECT * FROM public.virhang_users')).rows,[]);
  }finally{await baseline.db.exec('ROLLBACK');}
 });
 test('direct 001 fails closed and rollback preserves all existing rows',()=>{
  assert.equal(result.direct001SQLSTATE,'P0001');assert.equal(result.direct001RollbackPreservedRows,true);
 });
 test('atomic prerequisite plus unchanged patches preserve all eight old tables and privileged role',()=>{
  assert.equal(Object.keys(result.preservedTables).length,8);assert.ok(Object.values(result.preservedTables).every(x=>x.allExistingFieldsPreserved));assert.equal(result.superAdminRolePreserved,true);
 });
 test('backfill adds credits without automatically linking names to accounts',()=>{
  assert.equal(result.syntheticCredits,6);assert.equal(result.addedTrackDefaultsSafe,true);assert.equal(result.noAutomaticAccountLinks,true);
 });
 test('repeat of the complete local transaction preserves manually verified links and original data',()=>{
  assert.equal(result.repeatPreservedLinksAndRows,true);
 });
 test('Auth FK remains a real unresolved condition and is never silently synthesized',()=>{
  assert.equal(result.authForeignKeyAutoAdded,false);assert.equal(result.readyToApply,false);
  assert.deepEqual(result.afterComparison.blockers,['Profile PK/username uniqueness/Auth FK needs reconciliation']);
 });
 test('existing login survives and premature or mismatched replacement fails closed',()=>{
  assert.deepEqual(result.login,{legacyBefore:200,newBeforeSQL:503,legacyAfter:200,newWrongEnvironment:503,newAfterStagingSetup:200});
 });
 test('post-patch viewer/profileless cannot call admin and private artist UUIDs are not readable',async()=>{
  for(const user of [patched.users.viewer,patched.users.profileless])await patched.actor('authenticated',user,async()=>{
   await assert.rejects(()=>patched.db.query("SELECT public.virhang_admin_streamer_account('viewer','grant')"),e=>e.code==='42501');
  });
  await patched.actor('anon',null,async()=>{
   assert.ok((await patched.db.query('SELECT artist_key,display_name FROM public.virhang_artist_identities')).rows.length>0);
   await assert.rejects(()=>patched.db.query('SELECT verified_user_id FROM public.virhang_artist_identities'),e=>e.code==='42501');
  });
 });
 test('post-patch another member cannot read private playlists or change profile role',async()=>{
  await patched.actor('authenticated',patched.users.outsider,async()=>{
   assert.deepEqual((await patched.db.query('SELECT * FROM public.virhang_account_libraries')).rows,[]);
   await assert.rejects(()=>patched.db.query("UPDATE public.virhang_users SET role='super_admin' WHERE id=$1",[patched.users.outsider]),e=>e.code==='42501');
  });
 });
 test('integrity query works in READ ONLY and returns flags without IDs or member content',async()=>{
  const before=await oldRows(baseline.db);await baseline.db.exec('BEGIN READ ONLY');let r;
  try{r=await integrity(baseline.db);}finally{await baseline.db.exec('COMMIT');}
  assert.equal(r.exact_auth_id_fk_exists,false);assert.equal(r.any_profile_without_auth_user,false);assert.equal(r.any_auth_user_without_profile,true);
  assert.ok(!JSON.stringify(r).includes(baseline.users.viewer));assert.ok(!JSON.stringify(r).includes('synthetic-private'));
  for(const [key,value] of Object.entries(r))if(!['report_version','scope','exact_auth_fk_delete_actions','profile_definer_owner_rls_bypass'].includes(key))assert.equal(typeof value,'boolean');
  assert.ok(Object.values(r.profile_definer_owner_rls_bypass).every(x=>x===true));
  assert.deepEqual(await oldRows(baseline.db),before);
 });
});
test('integrity query detects orphaned profiles without deleting or revealing them',async()=>{
 const f=await liveShapeFixture();try{
  const orphan=id(999);await f.db.query("INSERT INTO public.virhang_users(id,username,role) VALUES($1,'orphanfake','viewer')",[orphan]);
  const before=await oldRows(f.db),r=await integrity(f.db);assert.equal(r.any_profile_without_auth_user,true);
  assert.ok(!JSON.stringify(r).includes(orphan));assert.deepEqual(await oldRows(f.db),before);
 }finally{await f.db.close();}
});
test('original joint setup alone exposes a NULL-role link path; do not commit it before hardening',async()=>{
 const f=await liveShapeFixture();try{
  await f.db.exec(sql('V3.0_JOINT_SINGERS_LATE_SIGNUP.sql'));
  await f.actor('authenticated',f.users.nullrole,async()=>{
   await f.db.query("SELECT public.virhang_admin_link_artist('아이네','contributor','link')");
   assert.equal((await f.db.query("SELECT verified_user_id FROM public.virhang_artist_identities WHERE artist_key='아이네'")).rows[0].verified_user_id,f.users.contributor);
  });
 }finally{await f.db.close();}
});
test('invalid legacy singer backfill aborts the entire local transaction with no partial schema',async()=>{
 const f=await liveShapeFixture();try{
  // Catalog 05 cannot prove the live CHECK constraints: model a possible nonconforming old row.
  await f.db.exec('ALTER TABLE public.virhang_published_tracks DROP CONSTRAINT virhang_published_tracks_singer_check');
  await f.db.query('UPDATE public.virhang_published_tracks SET singer=$1 WHERE id=$2',['x'.repeat(101),f.track]);
  const before=await oldRows(f.db);
  await assert.rejects(()=>applyAtomicLocal(f.db),e=>e.code==='23514');await f.db.exec('ROLLBACK');
  assert.deepEqual(await oldRows(f.db),before);
  const report=await sharedReport(f.db);assert.equal(report.tables.find(x=>x.name==='public.virhang_artist_identities').exists,false);
  assert.equal(report.tables.find(x=>x.name==='public.virhang_published_tracks').columns.is_deleted,undefined);
 }finally{await f.db.close();}
});
