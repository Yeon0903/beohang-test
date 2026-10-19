// YouTube IFrame Player API. Only videos that permit embedding can play.
(function(){
 let player=null, ready=false, pending=null, activeId=null;
 const frame=()=>document.getElementById('expandedVideoFrame');
 const state={
  mount(){const f=frame();if(!f||!window.YT||!YT.Player)return;
   if(player)return;
   f.innerHTML='<div id="ytV2Player"></div>';
   player=new YT.Player('ytV2Player',{height:'100%',width:'100%',videoId:pending||undefined,playerVars:{playsinline:1,rel:0,autoplay:1,enablejsapi:1,origin:location.origin.startsWith('http')?location.origin:undefined},events:{
    onReady(){ready=true;if(pending){const id=pending;pending=null;state.playTrack(id);}},
    onStateChange(e){if(e.data===YT.PlayerState.ENDED){if(typeof autoAdvance==='function')autoAdvance();}if(e.data===YT.PlayerState.PLAYING){document.getElementById('play').textContent='⏸';}if(e.data===YT.PlayerState.PAUSED){document.getElementById('play').textContent='▶';}},
    onError(e){document.getElementById('play').textContent='▶';const msg=document.getElementById('videoPlaybackNotice');if(msg)msg.innerHTML='유튜브 재생 오류 ('+String(e.data||'알 수 없음')+'). 영상의 외부 재생 제한 또는 브라우저 제한일 수 있어요. <a target="_blank" rel="noopener" href="https://www.youtube.com/watch?v='+encodeURIComponent(activeId||'')+'">유튜브에서 영상 확인 ↗</a>'; }
   }});
  },
  playTrack(id){if(!id)return;activeId=id;const msg=document.getElementById('videoPlaybackNotice');if(msg)msg.textContent='';
   if(!player||!ready){pending=id;state.mount();return;}
   try{player.loadVideoById(id);}catch(e){console.warn(e)}
  },
  pause(){try{if(player&&ready)player.pauseVideo()}catch{}},
  stop(){try{if(player&&ready)player.stopVideo()}catch{}},
  toggle(){if(!player||!ready){if(activeId)state.playTrack(activeId);return;}try{const stateCode=player.getPlayerState();if(stateCode===YT.PlayerState.PLAYING)player.pauseVideo();else player.playVideo();}catch{}},
 };
 window.beohangYT=state;
 window.onYouTubeIframeAPIReady=()=>{if(pending)state.mount()};
 const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';document.head.appendChild(script);
})();
