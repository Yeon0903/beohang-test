const {describe,test,before,after}=require('node:test');const assert=require('node:assert/strict');
const {liveShapeFixture}=require('./helpers/live-shape-db.cjs');const {sql,id}=require('./helpers/security-db.cjs');
const {oldRows}=require('../scripts/rehearse-live-shape.cjs');const {sharedReport}=require('../scripts/rehearse-migrations.cjs');
const {rehearsePrerequisite,applyFile}=require('../scripts/rehearse-prerequisite.cjs');const {plan}=require('../scripts/release-plan.cjs');
const manifest=require('../config/migration-allowlist.json');const migration=manifest.prerequisites[0];
const baseInsert=`INSERT INTO public.virhang_published_tracks(title,singer,genre,song_type,platform,source_url)
 VALUES('검증 곡','체비, 아이네','K-POP','커버곡','youtube','https://www.youtube.com/watch?v=dQw4w9WgXcQ') RETURNING id`;
async function credits(db){return (await db.query('SELECT to_jsonb(t) AS row FROM public.virhang_song_singers t ORDER BY track_id,artist_key')).rows;}
async function commitAs(f,user,fn){
 await f.db.exec('BEGIN');try{
  await f.db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);await f.db.exec('SET LOCAL ROLE authenticated');
  const result=await fn();await f.db.exec('COMMIT');return result;
 }catch(e){await f.db.exec('ROLLBACK');throw e;}
}
describe('new standalone hardened prerequisite 000 and original 001..004',()=>{
 let standalone,complete,result;
 before(async()=>{
  result=await rehearsePrerequisite();
  standalone=await liveShapeFixture({integrityConfirmed:true});await applyFile(standalone.db,migration);
  complete=await liveShapeFixture({integrityConfirmed:true});
  for(const item of [...manifest.prerequisites,...manifest.migrations])await applyFile(complete.db,item);
  await commitAs(complete,complete.users.superadmin,()=>complete.db.query("SELECT public.virhang_admin_link_artist('아이네','contributor','link')"));
 });
 after(async()=>{await standalone?.db.close();await complete?.db.close();});
 test('confirmed integrity facts remain true and Auth FK is deliberately not added',async()=>{
  const r=(await complete.db.query(sql('supabase/verification/security_integrity_06.sql'))).rows[0].virhang_integrity_report;
  assert.equal(r.role_not_null,true);assert.equal(r.role_has_check_constraint,true);assert.equal(r.role_default_is_viewer,true);
  assert.equal(r.any_profile_invalid_username,false);assert.equal(r.any_profile_null_or_unknown_role,false);
  assert.equal(r.any_profile_without_auth_user,false);assert.equal(r.any_auth_user_without_profile,true);
  assert.equal(r.super_admin_profile_present,true);assert.equal(r.exact_auth_id_fk_exists,false);assert.equal(r.service_role_profile_lookup_select,true);
 });
 test('000 alone creates all missing joint-singer and soft-delete objects',async()=>{
  const r=await sharedReport(standalone.db);
  for(const name of ['public.virhang_artist_identities','public.virhang_song_singers'])assert.equal(r.tables.find(x=>x.name===name).exists,true);
  const cols=r.tables.find(x=>x.name==='public.virhang_published_tracks').columns;assert.equal(cols.is_deleted,'boolean');assert.equal(cols.deleted_at,'timestamp with time zone');
  assert.equal(r.triggers.find(x=>x.name==='virhang_song_singers_sync').enabled,true);
 });
 test('every separately committed file has admin denial, private verification IDs and no direct DELETE',()=>{
  assert.equal(result.stages.length,5);assert.ok(result.stages.every(x=>x.profilelessAdminDenied&&x.verificationIdsPrivate&&x.noDirectDelete));
  assert.equal(result.stages[0].file,migration.file);
 });
 test('all old fields in eight tables, the superadmin and profileless Auth account survive',()=>{
  assert.equal(result.preservedTables.length,8);assert.ok(result.stages.every(x=>x.allExistingFieldsPreserved));
  assert.equal(result.superAdminPreserved,true);assert.equal(result.profilelessAuthNotRepaired,true);
 });
 test('no name-based account linking or role assignment occurs',async()=>{
  assert.equal((await standalone.db.query('SELECT count(*)::int AS n FROM public.virhang_artist_identities WHERE verified_user_id IS NOT NULL OR verified_by IS NOT NULL OR verified_at IS NOT NULL')).rows[0].n,0);
  assert.equal((await standalone.db.query('SELECT role FROM public.virhang_users WHERE id=$1',[standalone.users.contributor])).rows[0].role,'streamer');
 });
 test('full sequence rerun preserves verification links, old rows and staging login configuration',()=>{
  assert.equal(result.repeatPreservedAllExistingFieldsAndVerifiedLinks,true);
  assert.deepEqual(result.login,{legacyBefore:200,newEnvironmentMismatch:503,newConfigured:200,unconfirmedEmail:401,serviceLookupPrivilegesEnforced:true});
 });
 test('admin and superadmin keep normal streamer lookup and artist link/unlink paths',async()=>{
  for(const user of [standalone.users.admin,standalone.users.superadmin])await standalone.actor('authenticated',user,async()=>{
   assert.equal((await standalone.db.query("SELECT * FROM public.virhang_admin_streamer_account('viewer','lookup')")).rows[0].role,'viewer');
   await standalone.db.query("SELECT public.virhang_admin_link_artist('아이네','contributor','link')");
   await standalone.db.query("SELECT public.virhang_admin_link_artist('아이네',NULL,'unlink')");
  });
 });
 test('viewer, streamer and profileless cannot link artists',async()=>{
  for(const user of [standalone.users.viewer,standalone.users.streamer,standalone.users.profileless])await standalone.actor('authenticated',user,()=>assert.rejects(
   ()=>standalone.db.query("SELECT public.virhang_admin_link_artist('아이네','contributor','link')"),e=>e.code==='42501'));
 });
 test('highest-admin role cannot be demoted through streamer admin RPC',async()=>{
  await complete.actor('authenticated',complete.users.admin,()=>assert.rejects(
   ()=>complete.db.query("SELECT public.virhang_admin_streamer_account('superadmin','revoke')"),e=>e.code==='42501'));
 });
 test('verified co-singer can edit original track without changing ownership or listen history',async()=>{
  const before=await oldRows(complete.db);
  await complete.actor('authenticated',complete.users.contributor,async()=>{
   const r=await complete.db.query("UPDATE public.virhang_published_tracks SET title='공동 가수 수정' WHERE id=$1 RETURNING id,created_by",[complete.track]);
   assert.equal(r.rows[0].id,complete.track);assert.equal(r.rows[0].created_by,complete.users.streamer);
  });
  assert.deepEqual(await oldRows(complete.db),before);
 });
 test('owner/co-singer cannot silently remove a verified participant',async()=>{
  for(const user of [complete.users.streamer,complete.users.contributor])await complete.actor('authenticated',user,()=>assert.rejects(
   ()=>complete.db.query("UPDATE public.virhang_published_tracks SET singer='체비, 비챤' WHERE id=$1",[complete.track]),e=>e.code==='42501'));
 });
 test('unlinked streamer has no edit access and cannot spoof owner argument',async()=>{
  await complete.actor('authenticated',complete.users.outsider,async()=>{
   const r=await complete.db.query("UPDATE public.virhang_published_tracks SET title='금지' WHERE id=$1 RETURNING id",[complete.track]);assert.equal(r.rows.length,0);
   const ok=await complete.db.query('SELECT public.virhang_can_manage_published_track($1,$2) AS ok',[complete.track,complete.users.outsider]);assert.equal(ok.rows[0].ok,false);
  });
 });
 test('normal streamer insert synchronizes distinct credits without identity matching',async()=>{
  await standalone.actor('authenticated',standalone.users.streamer,async()=>{
   const r=await standalone.db.query(baseInsert);const c=await standalone.db.query('SELECT count(*)::int AS n FROM public.virhang_song_singers WHERE track_id=$1',[r.rows[0].id]);assert.equal(c.rows[0].n,2);
  });
 });
 test('guest, viewer and profileless cannot publish',async()=>{
  for(const [role,user] of [['anon',null],['authenticated',standalone.users.viewer],['authenticated',standalone.users.profileless]])await standalone.actor(role,user,()=>assert.rejects(()=>standalone.db.query(baseInsert),e=>e.code==='42501'));
 });
 test('direct DELETE is denied to owner, co-singer, admin and superadmin before and after all patches',async()=>{
  for(const f of [standalone,complete])for(const user of [f.users.streamer,f.users.contributor,f.users.admin,f.users.superadmin])await f.actor('authenticated',user,()=>assert.rejects(
   ()=>f.db.query('DELETE FROM public.virhang_published_tracks WHERE id=$1',[f.track]),e=>e.code==='42501'));
 });
 test('soft deletion preserves credits/listens and admin can restore a valid song',async()=>{
  const c=await credits(complete.db);const n=(await complete.db.query('SELECT count(*)::int AS n FROM public.virhang_rank_listens')).rows[0].n;
  await complete.actor('authenticated',complete.users.superadmin,async()=>{
   await complete.db.query('UPDATE public.virhang_published_tracks SET is_deleted=true WHERE id=$1',[complete.track]);
   assert.deepEqual(await credits(complete.db),c);
   await complete.db.query('UPDATE public.virhang_published_tracks SET is_deleted=false WHERE id=$1',[complete.track]);
  });
  assert.equal((await complete.db.query('SELECT count(*)::int AS n FROM public.virhang_rank_listens')).rows[0].n,n);
 });
 test('legacy invalid artwork remains intact and can be hidden without rewriting it',async()=>{
  await standalone.actor('authenticated',standalone.users.streamer,async()=>{
   const r=await standalone.db.query('UPDATE public.virhang_published_tracks SET is_deleted=true WHERE id=$1 RETURNING artwork_url',[standalone.legacyTrack]);assert.equal(r.rows[0].artwork_url,'javascript:legacy');
  });
 });
 for(const [field,value] of [['title','x'.repeat(81)],['title',null],['singer','x'.repeat(51)],['genre','invalid'],['description','<script>x</script>'],['artwork_url','javascript:alert(1)'],['source_url','https://evil.invalid/watch?v=dQw4w9WgXcQ'],['original_url','https://youtube.com.evil.invalid/watch?v=dQw4w9WgXcQ']]){
  test('000 rejects invalid track '+field+' ('+(value===null?'null':typeof value)+')',async()=>{
   await standalone.actor('authenticated',standalone.users.streamer,()=>assert.rejects(
    ()=>standalone.db.query(`UPDATE public.virhang_published_tracks SET ${field}=$1 WHERE id=$2`,[value,standalone.track]),e=>e.code==='22023'));
  });
 }
 test('verification UUIDs and direct credit writes are denied even to authenticated admins',async()=>{
  for(const [role,user] of [['anon',null],['authenticated',standalone.users.superadmin]])await standalone.actor(role,user,()=>assert.rejects(
   ()=>standalone.db.query('SELECT verified_user_id,verified_by FROM public.virhang_artist_identities'),e=>e.code==='42501'));
  await standalone.actor('authenticated',standalone.users.admin,()=>assert.rejects(
   ()=>standalone.db.query('DELETE FROM public.virhang_song_singers'),e=>e.code==='42501'));
 });
 test('original account and library privacy remain intact after all patches',async()=>{
  await complete.actor('authenticated',complete.users.outsider,async()=>{
   assert.equal((await complete.db.query('SELECT * FROM public.virhang_account_libraries')).rows.length,0);
   await assert.rejects(()=>complete.db.query("UPDATE public.virhang_users SET role='super_admin'"),e=>e.code==='42501');
  });
 });
 test('review plan includes 000 first without changing the four original patch entries',()=>{
  const config={staging:{projectRef:'s'.repeat(20)},production:{projectRef:'p'.repeat(20)}};
  const p=plan('staging',config.staging.projectRef,config);assert.deepEqual(p.prerequisites,[migration.file]);
  assert.deepEqual(p.executionOrder,[migration.file,...manifest.migrations.map(x=>x.file)]);assert.equal(p.requiresSeparateApplyApproval,true);
 });
 test('000 has exactly one outer BEGIN and COMMIT',()=>{
  const body=sql('supabase/migrations/'+migration.file);assert.equal((body.match(/^BEGIN;$/gm)||[]).length,1);assert.equal((body.match(/^COMMIT;$/gm)||[]).length,1);
 });
 test('postcheck executes READ ONLY after 000 and after all patches without revealing accounts',async()=>{
  for(const f of [standalone,complete]){
   await f.db.exec('BEGIN READ ONLY');let r;
   try{r=(await f.db.query(sql('supabase/verification/security_prerequisite_07.sql'))).rows[0].virhang_prerequisite_report;}
   finally{await f.db.exec('COMMIT');}
   for(const key of ['super_admin_present','auth_only_accounts_present','sync_trigger_active','write_guard_active','service_profile_lookup_select'])assert.equal(r[key],true,key);
   for(const key of ['profile_orphans_present','invalid_profile_roles_present','missing_credit_present','invalid_soft_delete_state_present','client_direct_delete_granted','client_truncate_granted','client_verification_ids_readable','client_credit_writes_granted','client_trigger_rpc_executable'])assert.equal(r[key],false,key);
   assert.ok(!JSON.stringify(r).includes(f.users.superadmin));
  }
 });
});

test('NULL role fault injection cannot bypass new admin guards',async()=>{
 const f=await liveShapeFixture({integrityConfirmed:true});try{
  await applyFile(f.db,migration);
  await f.db.exec('ALTER TABLE public.virhang_users DROP CONSTRAINT fixture_allowed_roles; ALTER TABLE public.virhang_users ALTER COLUMN role DROP NOT NULL');
  await f.db.query('UPDATE public.virhang_users SET role=NULL WHERE id=$1',[f.users.nullrole]);
  for(const call of ["SELECT public.virhang_admin_streamer_account('viewer','grant')","SELECT public.virhang_admin_link_artist('아이네','contributor','link')"])await f.actor('authenticated',f.users.nullrole,()=>assert.rejects(()=>f.db.query(call),e=>e.code==='42501'));
 }finally{await f.db.close();}
});
test('a failure immediately before final COMMIT rolls back new tables, policies, functions, grants and old data',async()=>{
 const f=await liveShapeFixture({integrityConfirmed:true});try{
  const before=await oldRows(f.db),catalog=await sharedReport(f.db);
  const original=(await f.db.query("SELECT pg_get_functiondef('public.virhang_admin_streamer_account(text,text)'::regprocedure) AS source")).rows;
  const body=sql('supabase/migrations/'+migration.file).replace(/COMMIT;\s*$/,'SELECT 1/0; COMMIT;');
  await assert.rejects(()=>f.db.exec(body),e=>e.code==='22012');await f.db.exec('ROLLBACK');
  assert.deepEqual(await oldRows(f.db),before);assert.deepEqual(await sharedReport(f.db),catalog);
  assert.deepEqual((await f.db.query("SELECT pg_get_functiondef('public.virhang_admin_streamer_account(text,text)'::regprocedure) AS source")).rows,original);
 }finally{await f.db.close();}
});
test('existing incompatible partial artist schema is rejected without repair or partial migration',async()=>{
 const f=await liveShapeFixture({integrityConfirmed:true});try{
  await f.db.exec('CREATE TABLE public.virhang_artist_identities(artist_key integer PRIMARY KEY)');const before=await oldRows(f.db),catalog=await sharedReport(f.db);
  await assert.rejects(()=>applyFile(f.db,migration));await f.db.exec('ROLLBACK');
  assert.deepEqual(await oldRows(f.db),before);assert.deepEqual(await sharedReport(f.db),catalog);
 }finally{await f.db.close();}
});
test('repeat preserves manual credits that do not appear in the original singer string',async()=>{
 const f=await liveShapeFixture({integrityConfirmed:true});try{
  await applyFile(f.db,migration);
  await f.db.exec("INSERT INTO public.virhang_artist_identities(artist_key,display_name) VALUES('manual-credit','수동 참여')");
  await f.db.query("INSERT INTO public.virhang_song_singers(track_id,artist_key) VALUES($1,'manual-credit')",[f.track]);const before=await credits(f.db);
  await applyFile(f.db,migration);assert.deepEqual(await credits(f.db),before);
 }finally{await f.db.close();}
});
test('an existing verified-user DEFAULT is rejected instead of automatically linking new singers',async()=>{
 const f=await liveShapeFixture({integrityConfirmed:true});try{
  await applyFile(f.db,migration);
  await f.db.exec("ALTER TABLE public.virhang_artist_identities ALTER COLUMN verified_user_id SET DEFAULT '"+f.users.streamer+"'::uuid");
  const before=await oldRows(f.db),c=await credits(f.db);
  await assert.rejects(()=>applyFile(f.db,migration),e=>e.code==='55000');await f.db.exec('ROLLBACK');
  assert.deepEqual(await oldRows(f.db),before);assert.deepEqual(await credits(f.db),c);
  assert.equal((await f.db.query('SELECT count(*)::int AS n FROM public.virhang_artist_identities WHERE verified_user_id IS NOT NULL')).rows[0].n,0);
 }finally{await f.db.close();}
});

describe('signup timing from stored trigger source; no real mail/Auth requests',()=>{
 let f;before(async()=>{f=await liveShapeFixture({integrityConfirmed:true});await applyFile(f.db,migration);});after(async()=>{await f?.db.close();});
 test('username metadata creates viewer before email confirmation, ignoring requested admin role',async()=>{
  const uid=id(500);await f.db.query("INSERT INTO auth.users(id,raw_user_meta_data) VALUES($1,$2)",[uid,{username:'pendingfake',role:'super_admin'}]);
  const p=(await f.db.query('SELECT role FROM public.virhang_users WHERE id=$1',[uid])).rows[0];assert.equal(p.role,'viewer');
  assert.equal((await f.db.query('SELECT email_confirmed_at FROM auth.users WHERE id=$1',[uid])).rows[0].email_confirmed_at,null);
 });
 test('email confirmation UPDATE does not create another profile or change its role',async()=>{
  const uid=id(501);await f.db.query("INSERT INTO auth.users(id,raw_user_meta_data) VALUES($1,$2)",[uid,{username:'confirmfake'}]);
  const before=(await f.db.query('SELECT to_jsonb(p) AS row FROM public.virhang_users p WHERE id=$1',[uid])).rows;
  await f.db.query('UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1',[uid]);
  assert.deepEqual((await f.db.query('SELECT to_jsonb(p) AS row FROM public.virhang_users p WHERE id=$1',[uid])).rows,before);
 });
 test('missing username leaves Auth-only row intact before and after email confirmation',async()=>{
  const uid=id(502);await f.db.query('INSERT INTO auth.users(id) VALUES($1)',[uid]);await f.db.query('UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1',[uid]);
  assert.equal((await f.db.query('SELECT id FROM public.virhang_users WHERE id=$1',[uid])).rows.length,0);
  await f.actor('authenticated',uid,async()=>{assert.deepEqual((await f.db.query('SELECT * FROM public.virhang_my_profile()')).rows,[]);assert.equal((await f.db.query('SELECT public.virhang_can_publish() AS ok')).rows[0].ok,false);});
 });
 test('invalid signup username aborts Auth INSERT as well as profile creation',async()=>{
  const uid=id(503);await assert.rejects(()=>f.db.query('INSERT INTO auth.users(id,raw_user_meta_data) VALUES($1,$2)',[uid,{username:'bad-name'}]),e=>e.code==='22023');
  assert.equal((await f.db.query('SELECT id FROM auth.users WHERE id=$1',[uid])).rows.length,0);
 });
 test('duplicate signup username aborts both inserts without orphan cleanup',async()=>{
  const uid=id(504);await assert.rejects(()=>f.db.query('INSERT INTO auth.users(id,raw_user_meta_data) VALUES($1,$2)',[uid,{username:'viewer'}]),e=>e.code==='23505');
  assert.equal((await f.db.query('SELECT id FROM auth.users WHERE id=$1',[uid])).rows.length,0);
 });
});
