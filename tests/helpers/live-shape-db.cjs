// Reproduce only the catalog facts supplied on 2026-10-23. All rows and unseen definitions are synthetic.
// This is NOT a dump, a production baseline, or proof that live function bodies/policies match these sources.
const {PGlite}=require('@electric-sql/pglite');
const {sql,users,track,id}=require('./security-db.cjs');
const legacyTrack=id(101),event=id(200);
async function liveShapeFixture(){
 const db=new PGlite();
 await db.exec(`
 CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
 CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
 CREATE TABLE public.virhang_users(id uuid PRIMARY KEY,username text UNIQUE,display_name text,role text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
 ALTER TABLE public.virhang_users ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON public.virhang_users FROM PUBLIC,anon,authenticated;
 `);
 for(const [name,uuid] of Object.entries(users)){
  await db.query('INSERT INTO auth.users(id) VALUES($1)',[uuid]);
  if(name!=='profileless')await db.query('INSERT INTO public.virhang_users(id,username,role) VALUES($1,$2,$3)',[uuid,name,name==='nullrole'?null:['contributor','outsider'].includes(name)?'streamer':name==='superadmin'?'super_admin':name]);
 }
 for(const file of ['V2.4_DATABASE_SETUP.sql','V2.6.8_ADMIN_STREAMER_SETUP.sql','V2.6.9_PUBLISHED_TRACKS_SETUP.sql','V2.6_DATABASE_MIGRATION.sql','V3.0_RANKING_BACKEND_SETUP.sql'])await db.exec(sql(file));
 await db.exec(`
 CREATE TABLE public.virhang_tracks(id uuid PRIMARY KEY,title text,genre text,artwork_url text,created_at timestamptz DEFAULT now());
 CREATE TABLE public.virhang_playlists(id uuid PRIMARY KEY,user_id uuid,created_at timestamptz DEFAULT now());
 ALTER TABLE public.virhang_tracks ENABLE ROW LEVEL SECURITY;
 ALTER TABLE public.virhang_playlists ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON public.virhang_tracks,public.virhang_playlists FROM PUBLIC,anon,authenticated;
 CREATE TABLE public.virhang_login_attempts(username text PRIMARY KEY,attempt_count integer NOT NULL,window_started timestamptz NOT NULL DEFAULT now());
 ALTER TABLE public.virhang_login_attempts ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON public.virhang_login_attempts FROM PUBLIC,anon,authenticated;
 INSERT INTO public.virhang_login_attempts VALUES('rehearsal',2,now());
 CREATE FUNCTION public.virhang_check_login_limit(p_username text) RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT true $$;
 REVOKE ALL ON FUNCTION public.virhang_check_login_limit(text) FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION public.virhang_check_login_limit(text) TO service_role;
 `);
 for(const [uuid,title,art] of [[track,'살별',''],[legacyTrack,'기존 곡','javascript:legacy']])await db.query(`INSERT INTO public.virhang_published_tracks(id,created_by,title,singer,genre,song_type,platform,source_url,artwork_url)
 VALUES($1,$2,$3,'체비, 아이네, 비챤','K-POP','커버곡','youtube','https://www.youtube.com/watch?v=dQw4w9WgXcQ',$4)`,[uuid,users.streamer,title,art]);
 await db.query("INSERT INTO public.virhang_rank_listens(id,user_id,track_id,started_at,finished_at) VALUES($1,$2,$3,now()-interval '1 minute',now())",[event,users.viewer,track]);
 await db.query("INSERT INTO public.virhang_account_libraries(user_id,likes,playlists) VALUES($1,'[]','[{\"id\":\"synthetic-private\",\"ids\":[]}]')",[users.viewer]);
 await db.query("INSERT INTO public.virhang_tracks(id,title) VALUES($1,'보존할 기존 테이블')",[id(300)]);
 await db.query('INSERT INTO public.virhang_playlists(id,user_id) VALUES($1,$2)',[id(301),users.viewer]);
 return {db,users,track,legacyTrack,event,
  async actor(role,user,fn){
   await db.exec('BEGIN');
   try{await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user||'']);await db.exec(`SET LOCAL ROLE ${role}`);return await fn();}
   finally{await db.exec('ROLLBACK');}
  }
 };
}
module.exports={liveShapeFixture};
