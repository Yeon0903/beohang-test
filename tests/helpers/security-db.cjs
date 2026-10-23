const {PGlite}=require('@electric-sql/pglite');
const {readFileSync}=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const sql=name=>readFileSync(path.join(root,name),'utf8');
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const users={admin:id(1),superadmin:id(2),viewer:id(3),streamer:id(4),profileless:id(5),nullrole:id(6),contributor:id(7),outsider:id(8)};
const track=id(100),legacyTrack=id(101),event=id(200);
async function fixture(){
 const db=new PGlite();
 await db.exec(`
 CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
 CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
 CREATE TABLE public.virhang_users(id uuid PRIMARY KEY REFERENCES auth.users(id),username text UNIQUE,display_name text,role text,updated_at timestamptz DEFAULT now(),private_note text);
 ALTER TABLE public.virhang_users ENABLE ROW LEVEL SECURITY;
 -- Deliberately unsafe legacy policies/grants, to verify that restrictive guards win.
 GRANT ALL ON public.virhang_users TO anon,authenticated;
 GRANT UPDATE(role) ON public.virhang_users TO authenticated;
 CREATE POLICY legacy_open_users ON public.virhang_users FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);
 `);
 for(const [name,uuid] of Object.entries(users)){
  await db.query('INSERT INTO auth.users(id) VALUES($1)',[uuid]);
  if(name!=='profileless')await db.query('INSERT INTO public.virhang_users(id,username,role,private_note) VALUES($1,$2,$3,$4)',[uuid,name,name==='nullrole'?null:['contributor','outsider'].includes(name)?'streamer':name==='superadmin'?'super_admin':name,'fixture-only']);
 }
 for(const file of ['V2.4_DATABASE_SETUP.sql','V2.6.8_ADMIN_STREAMER_SETUP.sql','V2.6.9_PUBLISHED_TRACKS_SETUP.sql','V2.6_DATABASE_MIGRATION.sql'])await db.exec(sql(file));
 await db.query(`INSERT INTO public.virhang_published_tracks(id,created_by,title,singer,genre,song_type,platform,source_url)
 VALUES($1,$2,'살별','체비, 아이네, 비챤','K-POP','커버곡','youtube','https://www.youtube.com/watch?v=dQw4w9WgXcQ')`,[track,users.streamer]);
 await db.query("INSERT INTO public.virhang_published_tracks(id,created_by,title,singer,genre,song_type,platform,source_url,artwork_url) VALUES($1,$2,'기존 곡','체비, 아이네, 비챤','K-POP','커버곡','youtube','https://www.youtube.com/watch?v=dQw4w9WgXcQ','javascript:legacy')",[legacyTrack,users.streamer]);
 await db.exec(sql('V3.0_JOINT_SINGERS_LATE_SIGNUP.sql'));
 await db.exec(sql('V3.0_RANKING_BACKEND_SETUP.sql'));
 await db.query("UPDATE public.virhang_artist_identities SET verified_user_id=$1,verified_by=$2 WHERE artist_key='아이네'",[users.contributor,users.admin]);
 await db.query("INSERT INTO public.virhang_rank_listens(id,user_id,track_id,started_at,finished_at) VALUES($1,$2,$3,now()-interval '1 minute',now())",[event,users.viewer,track]);
 await db.query("INSERT INTO public.virhang_account_libraries(user_id,likes,playlists) VALUES($1,'[]','[{\"id\":\"fixture\",\"name\":\"비공개\",\"ids\":[]}]')",[users.viewer]);
 await db.exec('CREATE POLICY legacy_open_libraries ON public.virhang_account_libraries FOR ALL TO authenticated USING(true) WITH CHECK(true)');
 for(const file of ['202610230001_admin_null_guards.sql','202610230002_track_validation_and_soft_delete.sql','202610230003_profile_and_library_privacy.sql','202610230004_environment_login_policy.sql'])await db.exec(sql('supabase/migrations/'+file));
 return {
 db,users,track,legacyTrack,event,
 async actor(role,user,fn){
  await db.exec('BEGIN');
  try{await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user||'']);await db.exec(`SET LOCAL ROLE ${role}`);return await fn();}
  finally{await db.exec('ROLLBACK');}
 },
 async insert(overrides={}){
  const row={title:'새 노래',singer:'체비, 아이네, 비챤',genre:'K-POP',song_type:'커버곡',platform:'youtube',source_url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',...overrides};
  const cols=Object.keys(row);return db.query(`INSERT INTO public.virhang_published_tracks(${cols.join(',')}) VALUES(${cols.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING id,created_by,created_at,is_deleted,deleted_at`,Object.values(row));
 }
 };
}
module.exports={fixture,sql,users,track,id};
