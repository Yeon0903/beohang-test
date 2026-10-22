/* Public track discovery and role-aware publish control; database RLS is authoritative. */
(()=>{'use strict';
 let role='';let manageable=new Set();const add=document.getElementById('add');
 const client=()=>window.virhangAuth?.getClient?.();
 window.virhangCanManageTrack=id=>manageable.has(String(id));
 window.virhangCanPublish=()=>['streamer','admin','super_admin'].includes(role);
 const labels={viewer:'일반 회원',streamer:'스트리머',admin:'관리자',super_admin:'최고관리자'};
 function fromRow(r){const m=window.virhangMedia.parse(r.source_url);return {id:r.id,title:r.title,singer:r.singer,genre:r.genre,details:r.details||[],type:r.song_type,album:r.album||'',platform:r.platform,video:m?.platform==='youtube'?m.video:r.source_url,originalUrl:r.source_url,artwork:r.artwork_url||'',symbol:r.platform==='soop'?'🐬':'🎵',bg:'linear-gradient(135deg,#b3eceb,#dfcef9)',views:0,likes:0,description:r.description||'',lyrics:r.lyrics||''};}
 async function refresh(){const c=client();if(!c)return;try{const {data,error}=await c.from('virhang_published_tracks').select('*').order('created_at',{ascending:false}).limit(300);if(error)throw error;window.virhangSetSharedTracks?.((data||[]).map(fromRow));await refreshManageable();}catch(e){console.warn('공개 노래 조회 실패 (V2.6.9 SQL 적용 여부 확인)',e.message);}}
 window.virhangRefreshShared=refresh;
 async function refreshManageable(){manageable=new Set();if(!window.virhangAuth?.user||!client())return;try{const {data,error}=await client().rpc('virhang_my_manageable_track_ids');if(error)throw error;manageable=new Set((data||[]).map(x=>String(x.track_id)));}catch(e){console.warn('곡 관리 권한 조회 실패 (공동가수 SQL 적용 확인)',e.message)}}
 window.virhangRefreshManageable=refreshManageable;
 async function sync(){const auth=window.virhangAuth;role='';if(auth?.user&&client()){try{const {data,error}=await client().rpc('virhang_my_profile');if(!error&&auth.user)role=data?.[0]?.role||'';}catch(_){}}
  add.hidden=!window.virhangCanPublish();
  const title=document.getElementById('virAuthMember');if(title&&role){const p=title.querySelectorAll('p');if(p[1])p[1].textContent='🐠 '+(labels[role]||'회원');}
 }
 window.addEventListener('virhang:session-changed',()=>{sync();refreshManageable();});
 window.addEventListener('load',()=>{sync();refresh();});
})();
