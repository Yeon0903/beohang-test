const {describe,test,before,after}=require('node:test');const assert=require('node:assert/strict');
const {fixture,sql,id}=require('./helpers/security-db.cjs');
let f;const denied=fn=>assert.rejects(fn,e=>e.code==='42501');
describe('patch 02 private profile and library boundaries',()=>{
 before(async()=>{f=await fixture();});after(()=>f.db.close());
 test('privacy migration is repeatable',()=>f.db.exec(sql('supabase/migrations/202610230003_profile_and_library_privacy.sql')));
 for(const who of ['viewer','streamer','admin','superadmin'])test(`${who} only reads own approved profile columns`,()=>f.actor('authenticated',f.users[who],async()=>{
  const r=await f.db.query('SELECT id,username,role FROM public.virhang_users');assert.deepEqual(r.rows.map(x=>x.id),[f.users[who]]);
 }));
 for(const who of ['profileless','nullrole'])test(`${who} cannot read own profile or another member profile`,()=>f.actor('authenticated',f.users[who],async()=>{
  assert.equal((await f.db.query('SELECT id,role FROM public.virhang_users')).rows.length,0);
 }));
 test('private profile columns cannot be selected even with legacy grants',()=>denied(()=>f.actor('authenticated',f.users.viewer,()=>f.db.query('SELECT private_note FROM public.virhang_users'))));
 test('anonymous profile reads are denied',()=>denied(()=>f.actor('anon',null,()=>f.db.query('SELECT username FROM public.virhang_users'))));
 for(const who of ['viewer','streamer','profileless','admin'])test(`${who} cannot directly elevate or delete a member`,async()=>{
  await denied(()=>f.actor('authenticated',f.users[who],()=>f.db.query("UPDATE public.virhang_users SET role='super_admin' WHERE id=$1",[f.users.viewer])));
  await denied(()=>f.actor('authenticated',f.users[who],()=>f.db.query('DELETE FROM public.virhang_users WHERE id=$1',[f.users.viewer])));
 });
 test('signup ignores a client-supplied privileged role',async()=>{
  await f.db.exec('BEGIN');try{
   await f.db.query('INSERT INTO auth.users(id,raw_user_meta_data) VALUES($1,$2)',[id(900),{username:'signupfixture',role:'super_admin'}]);
   assert.equal((await f.db.query('SELECT role FROM public.virhang_users WHERE id=$1',[id(900)])).rows[0].role,'viewer');
  }finally{await f.db.exec('ROLLBACK');}
 });
 test('owner can read/update/upsert own library',()=>f.actor('authenticated',f.users.viewer,async()=>{
  assert.equal((await f.db.query('SELECT user_id FROM public.virhang_account_libraries')).rows.length,1);
  const data=[{id:'pl-test',name:'테스트 목록',ids:[]}];
  await f.db.query('INSERT INTO public.virhang_account_libraries(user_id,playlists) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET playlists=excluded.playlists',[f.users.viewer,JSON.stringify(data)]);
  assert.deepEqual((await f.db.query('SELECT playlists FROM public.virhang_account_libraries')).rows[0].playlists,data);
 }));
 for(const who of ['streamer','admin','superadmin','profileless'])test(`${who} cannot read/update someone else's library`,()=>f.actor('authenticated',f.users[who],async()=>{
  assert.equal((await f.db.query('SELECT user_id FROM public.virhang_account_libraries')).rows.length,0);
  assert.equal((await f.db.query("UPDATE public.virhang_account_libraries SET playlists='[]' WHERE user_id=$1 RETURNING user_id",[f.users.viewer])).rows.length,0);
 }));
 test('forged library owner cannot be inserted',()=>denied(()=>f.actor('authenticated',f.users.streamer,()=>f.db.query("INSERT INTO public.virhang_account_libraries(user_id) VALUES($1)",[f.users.admin]))));
 for(const who of ['profileless','nullrole'])test(`${who} cannot create even own library`,()=>denied(()=>f.actor('authenticated',f.users[who],()=>f.db.query('INSERT INTO public.virhang_account_libraries(user_id) VALUES($1)',[f.users[who]]))));
 test('library ownership cannot be transferred',()=>denied(()=>f.actor('authenticated',f.users.viewer,()=>f.db.query('UPDATE public.virhang_account_libraries SET user_id=$1 WHERE user_id=$2',[f.users.streamer,f.users.viewer]))));
 test('browser cannot read private artist verification UUIDs',async()=>{
  await f.actor('anon',null,async()=>assert.equal((await f.db.query('SELECT artist_key,display_name FROM public.virhang_artist_identities')).rows.length,3));
  await denied(()=>f.actor('authenticated',f.users.admin,()=>f.db.query('SELECT verified_user_id,verified_by FROM public.virhang_artist_identities')));
 });
 test('administrator RPC remains authorized after direct table writes are removed',()=>f.actor('authenticated',f.users.admin,async()=>{
  assert.equal((await f.db.query("SELECT * FROM public.virhang_admin_streamer_account('viewer','grant')")).rows[0].role,'streamer');
  await f.db.query("SELECT public.virhang_admin_link_artist('체비','streamer','link')");
 }));
 test('ordinary/profileless accounts still cannot invoke admin RPCs',async()=>{
  for(const who of ['viewer','profileless'])await denied(()=>f.actor('authenticated',f.users[who],()=>f.db.query("SELECT public.virhang_admin_streamer_account('viewer','grant')")));
 });
});
