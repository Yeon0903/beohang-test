const {test,before,after,describe}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const db=new PGlite();
const root=path.join(__dirname,'..');
const sql=file=>readFileSync(path.join(root,file),'utf8');
const migration='supabase/migrations/202610230001_admin_null_guards.sql';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const people={admin:id(1),super_admin:id(2),viewer:id(3),streamer:id(4),profileless:id(5),null_role:id(6),other_streamer:id(7),unknown_role:id(8)};
const track=id(100);
// All tests use the embedded, in-memory PostgreSQL engine. No URL or credentials.
async function asActor(role,user,action){
 await db.exec('BEGIN');
 try{
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user||'']);
  await db.exec(`SET LOCAL ROLE ${role}`);
  return await action();
 }finally{await db.exec('ROLLBACK');}
}
const rpc=(name,args)=>db.query(`SELECT * FROM public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);
const denied=fn=>assert.rejects(fn,e=>e.code==='42501');
describe('admin RPCs in local PostgreSQL',()=>{
before(async()=>{
 await db.exec(`
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users(id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
   $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
  CREATE TABLE public.virhang_users(
   id uuid PRIMARY KEY REFERENCES auth.users(id), username text UNIQUE,
   display_name text, role text, updated_at timestamptz DEFAULT now()
  );
  ALTER TABLE public.virhang_users ENABLE ROW LEVEL SECURITY;
  GRANT SELECT ON public.virhang_users TO authenticated;
  CREATE POLICY fixture_own_profile ON public.virhang_users FOR SELECT TO authenticated USING(id=auth.uid());
 `);
 for(const [role,uuid] of Object.entries(people)){
  await db.query('INSERT INTO auth.users VALUES ($1)',[uuid]);
  if(role!=='profileless')await db.query('INSERT INTO public.virhang_users(id,username,role) VALUES ($1,$2,$3)',[uuid,role.replaceAll('_',''),role==='null_role'?null:role==='other_streamer'?'streamer':role]);
 }
 await db.exec(sql('V2.6.8_ADMIN_STREAMER_SETUP.sql'));
 await db.exec(sql('V2.6.9_PUBLISHED_TRACKS_SETUP.sql'));
 await db.query(`INSERT INTO public.virhang_published_tracks(id,created_by,title,singer,platform,source_url,genre,song_type)
 VALUES($1,$2,'살별','체비, 아이네, 비챤','youtube','https://www.youtube.com/watch?v=dQw4w9WgXcQ','K-POP','커버곡')`,[track,people.streamer]);
 await db.exec(sql('V3.0_JOINT_SINGERS_LATE_SIGNUP.sql'));
 // Prove that this fixture detects the original missing-profile privilege bypass.
 await asActor('authenticated',people.profileless,()=>rpc('virhang_admin_streamer_account',['viewer','grant']));
 await asActor('authenticated',people.profileless,()=>rpc('virhang_admin_link_artist',['체비',null,'unlink']));
 await asActor('authenticated',people.null_role,()=>rpc('virhang_admin_link_artist',['체비','streamer','link']));
 await db.exec(sql(migration));
 await db.exec(sql(migration)); // repeat application is safe
 await db.query("UPDATE public.virhang_artist_identities SET verified_user_id=$1,verified_by=$2 WHERE artist_key='아이네'",[people.other_streamer,people.admin]);
});
after(()=>db.close());
for(const who of ['viewer','streamer','profileless','null_role','unknown_role']){
 test(`${who} cannot directly invoke either admin RPC`,async()=>{
  await denied(()=>asActor('authenticated',people[who],()=>rpc('virhang_admin_streamer_account',['viewer','grant'])));
  await denied(()=>asActor('authenticated',people[who],()=>rpc('virhang_admin_link_artist',['체비','streamer','link'])));
 });
}
test('anonymous role has no admin EXECUTE privilege',async()=>{
 for(const [name,args] of [['virhang_admin_streamer_account',['viewer','lookup']],['virhang_admin_link_artist',['체비','streamer','link']]])
  await denied(()=>asActor('anon',null,()=>rpc(name,args)));
});
test('authenticated role without auth.uid cannot invoke management RPCs',async()=>{
 await denied(()=>asActor('authenticated',null,()=>rpc('virhang_admin_streamer_account',['viewer','grant'])));
 await denied(()=>asActor('authenticated',null,()=>rpc('virhang_admin_link_artist',['체비','streamer','link'])));
});
for(const who of ['admin','super_admin'])test(`${who} can look up, grant and revoke streamer without changing identity`,async()=>{
 await asActor('authenticated',people[who],async()=>{
  assert.equal((await rpc('virhang_admin_streamer_account',['viewer','lookup'])).rows[0].role,'viewer');
  assert.equal((await rpc('virhang_admin_streamer_account',['viewer','grant'])).rows[0].role,'streamer');
  assert.equal((await rpc('virhang_admin_streamer_account',['viewer','revoke'])).rows[0].role,'viewer');
 });
});
test('admin target, null role target and null/unknown actions are rejected',async()=>{
 for(const target of ['admin','superadmin','nullrole'])
  await denied(()=>asActor('authenticated',people.admin,()=>rpc('virhang_admin_streamer_account',[target,'grant'])));
 await denied(()=>asActor('authenticated',people.admin,()=>rpc('virhang_admin_streamer_account',['nullrole','revoke'])));
 for(const action of [null,'promote_admin'])await assert.rejects(()=>asActor('authenticated',people.admin,()=>rpc('virhang_admin_streamer_account',['viewer',action])),e=>e.code==='22023');
 for(const action of [null,'invalid'])await assert.rejects(()=>asActor('authenticated',people.admin,()=>rpc('virhang_admin_link_artist',['체비','streamer',action])),e=>e.code==='22023');
 await assert.rejects(()=>asActor('authenticated',people.admin,()=>rpc('virhang_admin_link_artist',[null,'streamer','link'])));
});
test('admin can link/unlink verified streamer, preserving track ID and credits',async()=>{
 await asActor('authenticated',people.admin,async()=>{
  await rpc('virhang_admin_link_artist',['체비','streamer','link']);
  assert.equal((await db.query("SELECT verified_user_id FROM public.virhang_artist_identities WHERE artist_key='체비'")).rows[0].verified_user_id,people.streamer);
  assert.equal((await db.query('SELECT id FROM public.virhang_published_tracks')).rows[0].id,track);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.virhang_song_singers')).rows[0].n,3);
  await rpc('virhang_admin_link_artist',['체비',null,'unlink']);
  assert.equal((await db.query("SELECT verified_user_id FROM public.virhang_artist_identities WHERE artist_key='체비'")).rows[0].verified_user_id,null);
 });
});
test('non-streamer or NULL-role targets cannot receive artist ownership',async()=>{
 for(const target of ['viewer','nullrole'])await assert.rejects(()=>asActor('authenticated',people.admin,()=>rpc('virhang_admin_link_artist',['체비',target,'link'])));
});
test('revoked admin cannot use an old identity to keep invoking admin RPC',async()=>{
 await db.query("UPDATE public.virhang_users SET role='viewer' WHERE id=$1",[people.admin]);
 try{await denied(()=>asActor('authenticated',people.admin,()=>rpc('virhang_admin_streamer_account',['viewer','grant'])));}
 finally{await db.query("UPDATE public.virhang_users SET role='admin' WHERE id=$1",[people.admin]);}
});
test('RLS still allows owner edit and denies viewer/profileless/other-track management',async()=>{
 await asActor('authenticated',people.streamer,async()=>{
  const result=await db.query("UPDATE public.virhang_published_tracks SET title='수정된 살별' WHERE id=$1 RETURNING id",[track]);assert.equal(result.rows.length,1);
 });
 for(const who of ['viewer','profileless','null_role'])await asActor('authenticated',people[who],async()=>{
  assert.equal((await db.query("UPDATE public.virhang_published_tracks SET title='금지' WHERE id=$1 RETURNING id",[track])).rows.length,0);
 });
});
test('verified co-singer can edit, but non-admin cannot remove verified credits',async()=>{
 await asActor('authenticated',people.other_streamer,async()=>{
  assert.equal((await db.query("UPDATE public.virhang_published_tracks SET title='공동 가수 수정' WHERE id=$1 RETURNING id",[track])).rows.length,1);
 });
 await denied(()=>asActor('authenticated',people.streamer,()=>db.query("UPDATE public.virhang_published_tracks SET singer='체비' WHERE id=$1",[track])));
});
test('NULL-role trigger actor cannot use the administrator credit-removal exception',async()=>{
 // Privileged fixture connection isolates the trigger guard from RLS rejection.
 await db.exec('BEGIN');
 try{
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[people.null_role]);
  await denied(()=>db.query("UPDATE public.virhang_published_tracks SET singer='체비' WHERE id=$1",[track]));
 }finally{await db.exec('ROLLBACK');}
 await asActor('authenticated',people.admin,async()=>{
  assert.equal((await db.query("UPDATE public.virhang_published_tracks SET singer='체비' WHERE id=$1 RETURNING id",[track])).rows.length,1);
 });
});
test('read-only verification queries execute against the local fixture',async()=>{
 const results=await db.exec(sql('supabase/verification/security_patch_01.sql'));
 assert.equal(results.length,4);
 assert.equal(results[1].rows.length,3);
});
test('trigger RPC is not exposed and function search paths stay fixed',async()=>{
 const permissions=await db.query("SELECT has_function_privilege('authenticated','public.virhang_sync_song_singers()','EXECUTE') AS allowed");
 assert.equal(permissions.rows[0].allowed,false);
 const funcs=await db.query("SELECT proconfig FROM pg_proc WHERE proname IN ('virhang_admin_streamer_account','virhang_admin_link_artist','virhang_sync_song_singers')");
 assert.equal(funcs.rows.length,3);
 for(const row of funcs.rows)assert.ok(row.proconfig.some(x=>x==='search_path=""'));
});

});
