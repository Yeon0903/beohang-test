// 버항 YouTube IFrame Player: shared instance and visible diagnostics.
(function(){
 'use strict';
 let player=null, ready=false, activeId='', requestedId='', volume=65, muted=false;
 let apiFailed=false, loadingTimer=null;
 // 유튜브 주소/ID를 모두 11자리 영상 ID로 통일합니다.
 function normalizeVideoId(value){
   const raw=String(value??'').trim();
   if(/^[A-Za-z0-9_-]{11}$/.test(raw))return raw;
   try{
     const url=new URL(raw);const host=url.hostname.toLowerCase().replace(/^www\./,'');
     let id='';
     if(host==='youtu.be')id=url.pathname.split('/')[1]||'';
     else if(['youtube.com','m.youtube.com','music.youtube.com','youtube-nocookie.com'].includes(host)){
       id=url.pathname==='/watch'?(url.searchParams.get('v')||''):(url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/]+)/)?.[1]||'');
     }
     return /^[A-Za-z0-9_-]{11}$/.test(id)?id:'';
   }catch{return ''}
 }
 const frame=()=>document.getElementById('expandedVideoFrame');
 const notice=()=>document.getElementById('videoPlaybackNotice');
 const originalUrl=()=>activeId?'https://www.youtube.com/watch?v='+encodeURIComponent(activeId):'';
 function report(message, options={}){
   const target=notice(); if(!target)return;
   target.replaceChildren();
   const span=document.createElement('span');span.textContent=message;target.appendChild(span);
   if(options.retry){const b=document.createElement('button');b.type='button';b.textContent=' 다시 시도';b.className='yt-diagnostic-btn';b.onclick=()=>{state.reset();state.playTrack(activeId)};target.appendChild(b)}
   if(options.open&&activeId){const a=document.createElement('a');a.textContent=' 원본 유튜브에서 보기 ↗';a.href=originalUrl();a.target='_blank';a.rel='noopener noreferrer';a.className='yt-diagnostic-link';target.appendChild(a)}
 }
 function clearTimer(){if(loadingTimer){clearTimeout(loadingTimer);loadingTimer=null}}
 function watchLoading(){clearTimer();loadingTimer=setTimeout(()=>{
   if(!ready)report('유튜브 플레이어가 준비되지 않았어요. 광고 차단 확장 프로그램이나 영상 삽입 제한이 원인일 수 있어요.',{retry:true,open:true});
 },10000)}
 function initialize(){
  const target=frame();
  if(!target||!activeId)return;
  if(!normalizeVideoId(activeId)){report('등록된 영상 주소가 올바르지 않아요. 유튜브 공유 링크를 다시 확인해 주세요.',{open:false});return;}
  if(player)return;
  if(!window.YT||typeof YT.Player!=='function'){report('유튜브 재생 모듈을 불러오는 중이에요…',{open:true});watchLoading();return}
  target.replaceChildren();const node=document.createElement('div');node.id='beohangYoutubePlayer';node.style.cssText='width:100%;height:100%';target.appendChild(node);
  ready=false;report('유튜브 영상을 준비하고 있어요…',{open:true});watchLoading();
  try{
   player=new YT.Player(node,{height:'100%',width:'100%',videoId:activeId,playerVars:{playsinline:1,rel:0,enablejsapi:1,origin:location.origin},events:{
    onReady(){ready=true;clearTimer();try{player.setVolume(volume);if(muted)player.mute();if(requestedId){const id=requestedId;requestedId='';player.loadVideoById(id)}}catch(e){report('영상 시작 중 오류: '+e.message,{retry:true,open:true});return}report('영상이 시작되지 않으면 동영상의 ▶ 버튼을 눌러주세요.',{open:true})},
    onStateChange(e){if(e.data===YT.PlayerState.PLAYING){report('');const el=document.getElementById('play');if(el)el.textContent='⏸'}else if(e.data===YT.PlayerState.PAUSED){const el=document.getElementById('play');if(el)el.textContent='▶'}else if(e.data===YT.PlayerState.ENDED){if(typeof autoAdvance==='function')autoAdvance()}},
    onError(e){clearTimer();const el=document.getElementById('play');if(el)el.textContent='▶';const msg={2:'영상 주소 형식에 문제가 있어요.',5:'브라우저에서 재생할 수 없는 영상 형식이에요.',100:'삭제되었거나 비공개 영상이에요.',101:'영상 게시자가 외부 재생을 허용하지 않았어요.',150:'영상 게시자가 외부 재생을 허용하지 않았어요.',153:'재생 요청에 필요한 출처 정보가 없어 유튜브가 차단했어요.'};report('유튜브 오류 '+e.data+' — '+(msg[e.data]||'재생이 차단됐어요.'),{retry:true,open:true})}
   }});
  }catch(e){player=null;report('플레이어 생성 실패: '+e.message,{retry:true,open:true})}
 }
 const state={
  reset(){clearTimer();ready=false;const old=player;player=null;try{old?.destroy()}catch(e){};const t=frame();if(t)t.replaceChildren()},
  mount(){initialize()},
  validate:normalizeVideoId,
  playTrack(id){const normalized=normalizeVideoId(id);if(!normalized){report('영상 ID가 잘못되었습니다. 유튜브 동영상 주소를 다시 등록해 주세요.');return;}id=normalized;const changed=activeId!==id;activeId=id;
   if(changed)requestedId=id;
   if(!player){initialize();return}
   if(!ready){report('유튜브 플레이어를 준비하고 있어요…',{open:true});watchLoading();return}
   try{requestedId='';player.loadVideoById(id);report('영상이 시작되지 않으면 동영상의 ▶ 버튼을 눌러주세요.',{open:true})}catch(e){report('재생 요청 실패: '+e.message,{retry:true,open:true})}
  },
  setVolume(v){volume=Math.max(0,Math.min(100,Number(v)||0));muted=volume===0;try{if(player&&ready){player.setVolume(volume);if(muted)player.mute();else player.unMute()}}catch(e){}},
  toggleMute(){muted=!muted;try{if(player&&ready){if(muted)player.mute();else player.unMute()}}catch(e){}return muted},
  pause(){try{if(ready)player.pauseVideo()}catch(e){}},
  stop(){try{if(ready)player.stopVideo()}catch(e){}},
  toggle(){if(!activeId)return;if(!ready){state.playTrack(activeId);return}try{if(player.getPlayerState()===YT.PlayerState.PLAYING)player.pauseVideo();else player.playVideo()}catch(e){report('재생 요청 실패: '+e.message,{retry:true,open:true})}}
 };
 window.beohangYT=state;
 window.onYouTubeIframeAPIReady=()=>{if(activeId)initialize()};
 const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.async=true;script.onerror=()=>{apiFailed=true;report('유튜브 API 연결 실패. 브라우저 확장 프로그램이나 네트워크 차단을 확인해 주세요.',{retry:true,open:true})};document.head.appendChild(script);
})();
