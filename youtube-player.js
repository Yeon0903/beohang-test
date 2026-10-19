// YouTube IFrame Player API. Only videos that permit embedding can play.
(function(){
 let player=null, ready=false, pending=null, activeId=null, volume=65, muted=false;
 const frame=()=>document.getElementById('expandedVideoFrame');
 const state={
  mount(){const f=frame();if(!f||!window.YT||!YT.Player)return;
   if(player)return;
   f.innerHTML='<div id="ytV2Player"></div>';
   player=new YT.Player('ytV2Player',{height:'100%',width:'100%',videoId:pending||undefined,playerVars:{playsinline:1,rel:0,autoplay:1,enablejsapi:1,origin:location.origin.startsWith('http')?location.origin:undefined},events:{
    onReady(){ready=true;try{player.setVolume(volume);if(muted)player.mute();}catch(e){}if(pending){const id=pending;pending=null;state.playTrack(id);}},
    onStateChange(e){if(e.data===YT.PlayerState.UNSTARTED){state.showNotice('영상이 시작되지 않는다면 아래의 ▶ 버튼을 눌러주세요.');}if(e.data===YT.PlayerState.ENDED){if(typeof autoAdvance==='function')autoAdvance();}if(e.data===YT.PlayerState.PLAYING){document.getElementById('play').textContent='⏸';}if(e.data===YT.PlayerState.PAUSED){document.getElementById('play').textContent='▶';}},
    onError(e){document.getElementById('play').textContent='▶';state.showNotice('유튜브 재생 오류 코드: '+String(e.data)+'. 오류 101/150은 보통 외부 삽입이 허용되지 않은 경우예요. 원본 영상: https://www.youtube.com/watch?v='+encodeURIComponent(activeId||'')); }
   }});
  },
  playTrack(id){if(!id)return;activeId=id;const msg=document.getElementById('videoPlaybackNotice');if(msg)msg.textContent='';
   if(!player||!ready){pending=id;state.mount();return;}
   try{player.loadVideoById(id);}catch(e){console.warn(e)}
  },
  showNotice(text){const msg=document.getElementById('videoPlaybackNotice');if(msg)msg.textContent=text;},
  setVolume(v){volume=Math.max(0,Math.min(100,Number(v)||0));muted=volume===0;try{if(player&&ready){player.setVolume(volume);if(muted)player.mute();else player.unMute()}}catch{}},
  toggleMute(){muted=!muted;try{if(player&&ready){if(muted)player.mute();else {player.unMute();player.setVolume(volume||65)}}}catch{};return muted},
  pause(){try{if(player&&ready)player.pauseVideo()}catch{}},
  stop(){try{if(player&&ready)player.stopVideo()}catch{}},
  toggle(){if(!player||!ready){if(activeId)state.playTrack(activeId);return;}try{const stateCode=player.getPlayerState();if(stateCode===YT.PlayerState.PLAYING)player.pauseVideo();else player.playVideo();}catch{}},
 };
 window.beohangYT=state;
 window.onYouTubeIframeAPIReady=()=>{if(pending)state.mount()};
 const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';document.head.appendChild(script);
})();
