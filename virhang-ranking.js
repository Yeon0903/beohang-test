/* V3 alpha: every fresh playback can count after 30 s, including repeat sessions. */
(()=>{'use strict';
 const client=()=>window.virhangAuth?.getClient?.();
 const modes=['realtime','daily','weekly','monthly','yearly','alltime','new'];
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 let chosen=null, session=null, generation=0, opening=false, lastMediaTime=null, lastAt=0, accumulated=0, finishing=false;
 function clearSession(){generation++;session=null;opening=false;lastMediaTime=null;lastAt=0;accumulated=0;finishing=false;}
 async function begin(){
   if(opening||session||!chosen)return;
   const c=client(),user=window.virhangAuth?.user;
   if(!c||!user||chosen.platform!=='youtube'||!uuid.test(String(chosen.id)))return;
   const currentGeneration=++generation;opening=true;
   try{
     const {data,error}=await c.rpc('virhang_rank_start',{p_track_id:String(chosen.id)});
     if(error)throw error;
     if(currentGeneration!==generation || window.virhangCurrentTrack?.()?.id!==chosen.id)return;
     session={id:chosen.id,token:data};lastMediaTime=null;lastAt=0;accumulated=0;
   }catch(e){console.warn('랭킹 재생 시작 기록 실패:',e.message)}
   finally{if(currentGeneration===generation)opening=false;}
 }
 window.addEventListener('virhang:track-selected',e=>{
   chosen=e.detail||null;clearSession();begin();
 });
 window.addEventListener('virhang:session-changed',()=>{clearSession();chosen=null;});
 window.addEventListener('beohang:player-state',e=>{if(!e.detail?.playing)lastAt=0;});
 window.addEventListener('beohang:progress',async e=>{
   if(!chosen||!window.virhangYTPlaying)return;
   const t=Number(e.detail?.seconds);if(!Number.isFinite(t)||t<0)return;
   // Playback position returned near the beginning: a new playback/loop session.
   // A seek also causes this, but server requires 30s of real elapsed time and the client
   // only accumulates forward playback progress (never jumped time).
   if(lastMediaTime!==null && lastMediaTime-t>10 && t<5){clearSession();begin();}
   if(!session){if(!opening && lastMediaTime===null)begin();lastMediaTime=t;return;}
   if(finishing)return;
   const now=Date.now();
   if(lastAt && now-lastAt<1600 && lastMediaTime!==null && t>lastMediaTime && t-lastMediaTime<2){accumulated+=t-lastMediaTime;}
   lastMediaTime=t;lastAt=now;
   if(accumulated<30)return;
   finishing=true;const pending=session;session=null;
   try{const c=client();if(c){const {error}=await c.rpc('virhang_rank_finish',{p_event_id:pending.token});if(error)throw error;}}
   catch(e){console.warn('랭킹 집계 실패:',e.message)}
   finally{finishing=false;}
 });
 async function get(mode){if(!modes.includes(mode))return;const c=client();if(!c)return;
   try{const {data,error}=await c.rpc('virhang_rank_get',{p_mode:mode});if(error)throw error;
    window.virhangSetVerifiedRankings?.(mode,(data||[]).map(v=>({...v,track_id:String(v.track_id)})));
   }catch(e){console.warn('랭킹 조회 실패:',e.message)} }
 window.virhangLoadRanking=get;
 window.addEventListener('load',()=>{for(const m of modes)get(m)});
 window.addEventListener('virhang:ranking-mode',e=>get(e.detail));
})();
