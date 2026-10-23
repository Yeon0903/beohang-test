const {describe,test,before,after}=require('node:test');const assert=require('node:assert/strict');
const {fixture,sql}=require('./helpers/security-db.cjs');
let f;const deny=fn=>assert.rejects(fn,e=>e.code==='42501');
describe('patch 02 server track validation and RLS',()=>{
 before(async()=>{f=await fixture();});after(()=>f.db.close());
 test('migration can be applied twice without rewriting history',async()=>{
  await f.db.exec(sql('supabase/migrations/202610230002_track_validation_and_soft_delete.sql'));
  assert.equal((await f.db.query('SELECT id FROM public.virhang_rank_listens')).rows[0].id,f.event);
 });
 for(const who of ['streamer','admin','superadmin'])test(`${who} registers valid music`,()=>f.actor('authenticated',f.users[who],async()=>{
  const r=await f.insert({description:'정상 설명\n다음 줄',artwork_url:'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',details:['발라드','R&B']});assert.equal(r.rows[0].created_by,f.users[who]);
 }));
 for(const who of ['viewer','profileless','nullrole'])test(`${who} cannot publish or change another track`,async()=>{
  await deny(()=>f.actor('authenticated',f.users[who],()=>f.insert()));
  await f.actor('authenticated',f.users[who],async()=>assert.equal((await f.db.query('UPDATE public.virhang_published_tracks SET title=$1 WHERE id=$2 RETURNING id',['불허',f.track])).rows.length,0));
 });
 test('unauthenticated publisher is rejected',()=>deny(()=>f.actor('anon',null,()=>f.insert())));
 test('ordinary owner and verified co-singer can edit',async()=>{
  for(const who of ['streamer','contributor','admin','superadmin'])await f.actor('authenticated',f.users[who],async()=>{
   assert.equal((await f.db.query('UPDATE public.virhang_published_tracks SET title=$1 WHERE id=$2 RETURNING id',['안전한 수정',f.track])).rows.length,1);
  });
  await f.actor('authenticated',f.users.outsider,async()=>assert.equal((await f.db.query('UPDATE public.virhang_published_tracks SET title=$1 WHERE id=$2 RETURNING id',['불허',f.track])).rows.length,0));
 });
 const invalid=[
 ['title',''],['title',' '.repeat(5)],['title','가'.repeat(81)],['title',null],['title','<script>alert(1)</script>'],
 ['singer','a'.repeat(51)],['singer','<img src=x onerror=alert(1)>'],['album','a'.repeat(81)],
 ['genre','INVALID'],['genre',null],['song_type','invalid'],['description','a'.repeat(1201)],['description','<svg onload=alert(1)>'],
 ['lyrics','a'.repeat(50001)],['lyrics','<iframe src=x>'],['title','bad\u0001text'],
 ['details',['임의태그']],['details',[null]],['details',Array(10).fill('록')],['details',null],
 ['artwork_url','javascript:alert(1)'],['artwork_url','data:image/svg+xml,<svg/>'],['artwork_url','http://example.com/x.png'],
 ['artwork_url','https://example.com/x"><img src=x>'],['artwork_url','https://user:pass@example.com/a'],['artwork_url','https://example.com/a%0a.png'],['artwork_url','https://example.com/'+ 'x'.repeat(2000)],
 ['source_url','https://youtube.com.evil.invalid/watch?v=dQw4w9WgXcQ'],['source_url','javascript:alert(1)'],
 ['source_url','https://www.youtube.com/watch?v=bad'],['source_url','https://user@www.youtube.com/watch?v=dQw4w9WgXcQ'],
 ['source_url','https://www.youtube.com:8080/watch?v=dQw4w9WgXcQ'],['source_url','https://example.com/clip/x'],
 ['original_url','https://example.com/watch?v=dQw4w9WgXcQ'],['original_url','https://vod.sooplive.com/player/123'],
 ['platform','soop'],['is_deleted',true],['created_by',null]
 ];
 for(const [key,value] of invalid)test(`invalid ${key}: ${String(value).slice(0,45)} rejected on INSERT`,()=>assert.rejects(()=>f.actor('authenticated',f.users.streamer,()=>f.insert({[key]:value}))));
 test('invalid metadata is rejected on UPDATE as well',()=>assert.rejects(()=>f.actor('authenticated',f.users.contributor,()=>f.db.query('UPDATE public.virhang_published_tracks SET artwork_url=$1 WHERE id=$2',['javascript:alert(1)',f.track])),e=>e.code==='22023'));
 test('track identity, owner and creation time are immutable',async()=>{
  for(const [key,value] of [['created_by',f.users.contributor],['created_at','2000-01-01'],['id',f.users.viewer]])await deny(()=>f.actor('authenticated',f.users.streamer,()=>f.db.query(`UPDATE public.virhang_published_tracks SET ${key}=$1 WHERE id=$2`,[value,f.track])));
  await deny(()=>f.actor('authenticated',f.users.streamer,()=>f.insert({created_by:f.users.admin})));
 });
 const validUrls=[['youtube','https://youtu.be/dQw4w9WgXcQ'],['youtube','https://www.youtube.com/shorts/dQw4w9WgXcQ'],['youtube','https://m.youtube.com/watch?v=dQw4w9WgXcQ'],['soop','https://vod.sooplive.com/player/123/playlist/456'],['soop','https://vod.afreecatv.com/player/123'],['soop','https://clip.sooplive.com/player/123']];
 for(const [platform,url] of validUrls)test('supported source remains valid: '+url,()=>f.actor('authenticated',f.users.streamer,()=>f.insert({platform,source_url:url})));
 test('maximum-length plain text and existing genres remain accepted',()=>f.actor('authenticated',f.users.streamer,()=>f.insert({title:'가'.repeat(80),singer:'가'.repeat(50),album:'가'.repeat(80),description:'가'.repeat(1200),lyrics:'가'.repeat(50000),genre:'보컬로이드',details:['발라드','록','댄스','랩','힙합','R&B','재즈','어쿠스틱','기타']})));
 for(const who of ['viewer','streamer','contributor','admin','superadmin'])test(`${who} cannot physically delete tracks`,()=>deny(()=>f.actor('authenticated',f.users[who],()=>f.db.query('DELETE FROM public.virhang_published_tracks WHERE id=$1',[f.track]))));
 test('soft delete preserves credits/listens and is hidden from anon/ranking',async()=>{
  await f.db.exec('BEGIN');
  try{
   await f.db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[f.users.contributor]);await f.db.exec('SET LOCAL ROLE authenticated');
   await f.db.query('UPDATE public.virhang_published_tracks SET is_deleted=true,deleted_at=$1 WHERE id=$2',['2000-01-01',f.track]);
   await f.db.exec('RESET ROLE');
   assert.equal((await f.db.query('SELECT count(*)::int n FROM public.virhang_rank_listens WHERE id=$1',[f.event])).rows[0].n,1);
   assert.equal((await f.db.query('SELECT count(*)::int n FROM public.virhang_song_singers WHERE track_id=$1',[f.track])).rows[0].n,3);
   const row=(await f.db.query('SELECT deleted_at FROM public.virhang_published_tracks WHERE id=$1',[f.track])).rows[0];assert.notEqual(row.deleted_at,'2000-01-01');
   await f.db.query("SELECT set_config('request.jwt.claim.sub','',true)");await f.db.exec('SET LOCAL ROLE anon');
   assert.equal((await f.db.query('SELECT id FROM public.virhang_published_tracks WHERE id=$1',[f.track])).rows.length,0);
   assert.equal((await f.db.query("SELECT * FROM public.virhang_rank_get('alltime')")).rows.length,0);
  }finally{await f.db.exec('ROLLBACK');}
 });
 test('only an administrator restores a deleted track',async()=>{
  await f.db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[f.users.streamer]);await f.db.query('UPDATE public.virhang_published_tracks SET is_deleted=true WHERE id=$1',[f.track]);
  try{
   await deny(()=>f.actor('authenticated',f.users.contributor,()=>f.db.query('UPDATE public.virhang_published_tracks SET is_deleted=false WHERE id=$1',[f.track])));
   await f.actor('authenticated',f.users.admin,async()=>{const r=await f.db.query('UPDATE public.virhang_published_tracks SET is_deleted=false WHERE id=$1 RETURNING deleted_at',[f.track]);assert.equal(r.rows[0].deleted_at,null);});
  }finally{await f.db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[f.users.admin]);await f.db.query('UPDATE public.virhang_published_tracks SET is_deleted=false WHERE id=$1',[f.track]);}
 });
 test('legacy invalid metadata can be hidden but must be corrected on restore',async()=>{
  await f.db.exec('BEGIN');try{
   await f.db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[f.users.streamer]);await f.db.exec('SET LOCAL ROLE authenticated');
   await f.db.query('UPDATE public.virhang_published_tracks SET is_deleted=true WHERE id=$1',[f.legacyTrack]);
   await f.db.exec('SAVEPOINT restore_attempt');await f.db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[f.users.admin]);
   await assert.rejects(()=>f.db.query('UPDATE public.virhang_published_tracks SET is_deleted=false WHERE id=$1',[f.legacyTrack]),e=>e.code==='22023');
   await f.db.exec('ROLLBACK TO SAVEPOINT restore_attempt');await f.db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[f.users.admin]);
   await f.db.query("UPDATE public.virhang_published_tracks SET is_deleted=false,artwork_url='' WHERE id=$1",[f.legacyTrack]);
  }finally{await f.db.exec('ROLLBACK');}
 });
 test('two fresh 30-second listens for the same viewer/track count independently',async()=>{
  await f.db.exec('BEGIN');try{
   const ids=['10000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000902'];
   for(const id of ids)await f.db.query("INSERT INTO public.virhang_rank_listens(id,user_id,track_id,started_at) VALUES($1,$2,$3,now()-interval '31 seconds')",[id,f.users.viewer,f.track]);
   await f.db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[f.users.viewer]);await f.db.exec('SET LOCAL ROLE authenticated');
   for(const id of ids)assert.equal((await f.db.query('SELECT public.virhang_rank_finish($1) AS ok',[id])).rows[0].ok,true);
   assert.equal((await f.db.query('SELECT public.virhang_rank_finish($1) AS ok',[ids[0]])).rows[0].ok,false);
   assert.equal((await f.db.query("SELECT score FROM public.virhang_rank_get('alltime') WHERE track_id=$1",[f.track])).rows[0].score,3);
  }finally{await f.db.exec('ROLLBACK');}
 });
 test('profileless account cannot start listening events',()=>deny(()=>f.actor('authenticated',f.users.profileless,()=>f.db.query('SELECT public.virhang_rank_start($1)',[f.track]))));
 test('same track still starts a fresh eligible playback for a viewer',()=>f.actor('authenticated',f.users.viewer,async()=>{const a=await f.db.query('SELECT public.virhang_rank_start($1) AS id',[f.track]);const b=await f.db.query('SELECT public.virhang_rank_start($1) AS id',[f.track]);assert.notEqual(a.rows[0].id,b.rows[0].id);}));
});
