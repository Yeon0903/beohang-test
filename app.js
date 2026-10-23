const samples=[
{id:'d1',title:'별빛이 머무는 밤',singer:'하린',genre:'K-POP',details:['발라드'],type:'커버곡',symbol:'🌙',bg:'linear-gradient(135deg,#adc8f1,#b8e9f0)',views:125400,likes:3200},
{id:'d2',title:'솜사탕 구름',singer:'유리',genre:'J-POP',details:['댄스'],type:'커버곡',symbol:'🍬',bg:'linear-gradient(135deg,#ffcbdc,#e6c4f5)',views:98700,likes:2900},
{id:'d3',title:'푸른 파도',singer:'시온',genre:'보컬로이드',details:['록'],type:'커버곡',symbol:'🐬',bg:'linear-gradient(135deg,#bbdbff,#d4ccfa)',views:87100,likes:2400},
{id:'d4',title:'작은 별의 약속',singer:'하루',genre:'K-POP',details:['발라드','어쿠스틱'],type:'오리지널곡',symbol:'⭐',bg:'linear-gradient(135deg,#fae1ab,#ffbdc8)',views:72300,likes:2100},
{id:'d5',title:'달빛 아래 춤을',singer:'리제',genre:'POP',details:['댄스'],type:'커버곡',symbol:'🪩',bg:'linear-gradient(135deg,#cbd3ff,#e8b7e8)',views:68900,likes:1850},
{id:'d6',title:'우리의 여름',singer:'세나',genre:'K-POP',details:['록'],type:'오리지널곡',symbol:'🎸',bg:'linear-gradient(135deg,#f4cba1,#ffdec7)',views:60100,likes:1710},
{id:'d7',title:'물거품 편지',singer:'루나',genre:'POP',details:['발라드','R&B'],type:'커버곡',symbol:'🫧',bg:'linear-gradient(135deg,#b7f1e9,#b6d8ff)',views:51100,likes:1600},
{id:'d8',title:'반짝이는 꿈',singer:'모아',genre:'J-POP',details:['댄스'],type:'커버곡',symbol:'🌸',bg:'linear-gradient(135deg,#fcd5ee,#c6eafa)',views:44400,likes:1320}
];
samples.forEach(s=>{if(!s.artwork)s.artwork=svgPlaceholder(s.symbol,s.bg,s.title)});
const $=id=>document.getElementById(id);
const fromStore=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
let custom=fromStore('beohang_v1_tracks',[]).filter(t=>t&&typeof t.title==='string'&&typeof t.video==='string').map(enrichTrack);
let sharedTracks=[];
window.virhangSetSharedTracks=(tracks)=>{sharedTracks=tracks.map(enrichTrack);render();};
let likes=new Set();
let genre='전체',detail='전체',query='',sort='new',current=null,selectedNav='home',rankMode=(['realtime','daily','weekly','monthly','yearly','alltime','likes','new'].includes(localStorage.getItem('virhang_rank_mode'))?localStorage.getItem('virhang_rank_mode'):'realtime');
function all(){return [...sharedTracks,...custom,...samples].map(enrichTrack)}
const num=n=>n>=10000?(n/10000).toFixed(1)+'만':n.toLocaleString('ko-KR');
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

// Allow remote HTTPS artwork and legacy raster uploads; never trust supplied SVG/HTML.
function safeImage(value){
 const raw=String(value||'').trim();
 if(/^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-zA-Z0-9+/]+={0,2}$/i.test(raw))return raw;
 if(!raw||/[\u0000-\u0020\u007f"'<>`\\]/.test(raw))return '';
 try{const url=new URL(raw);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}
}
function safeArtBackground(value){
 const raw=String(value||'');
 // Existing covers use plain hex gradients. Do not allow CSS URLs or declarations.
 return /^linear-gradient\(\d{1,3}deg,\s*#[a-f0-9]{3}(?:[a-f0-9]{3})?\s*,\s*#[a-f0-9]{3}(?:[a-f0-9]{3})?\s*\)$/i.test(raw)?raw:'linear-gradient(135deg,#bfe8ef,#d8cef8)';
}
function thumbnailFromVideo(value){const id=(window.beohangYT&&typeof window.beohangYT.validate==='function'?window.beohangYT.validate(value):videoId(value))||(/^[A-Za-z0-9_-]{11}$/.test(String(value||'').trim())?String(value).trim():'');return id?`https://i.ytimg.com/vi/${id}/hqdefault.jpg`:''}
function svgPlaceholder(symbol,bg,title){const colors=String(bg||'linear-gradient(135deg,#bfe8ef,#d8cef8)').match(/#(?:[0-9a-fA-F]{3}){1,2}/g)||['#bfe8ef','#d8cef8'];const a=colors[0],b=colors[1]||colors[0];const text=esc(String(symbol||'🎵').slice(0,2));const safeTitle=esc(String(title||'').slice(0,18));const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${a}"/><stop offset="100%" stop-color="${b}"/></linearGradient></defs><rect width="600" height="600" rx="56" fill="url(#g)"/><circle cx="90" cy="70" r="120" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="5"/><circle cx="540" cy="560" r="150" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="5"/><text x="300" y="305" text-anchor="middle" dominant-baseline="middle" font-size="150">${text}</text><text x="300" y="515" text-anchor="middle" font-size="34" font-weight="700" fill="rgba(26,73,84,.78)">${safeTitle}</text></svg>`;return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`}
function getArtwork(track){if(!track)return '';const own=safeImage(track.artwork||track.coverImage||track.image||track.albumImage);if(own)return own;const yt=thumbnailFromVideo(track.video||track.originalUrl);if(yt)return yt;return svgPlaceholder(track.symbol||'🎵',track.bg,track.title)}
function enrichTrack(track){const t=normalizeTrack({...track});t.artwork=getArtwork(t);return t}
function artBg(track){return `background:${safeArtBackground(track.bg)}`}
function artLayer(track){
 // getArtwork validates supplied URLs; only our XML-escaped placeholder may be SVG.
 // Serialize both CSS and HTML contexts, including the enclosing style attribute.
 const url=getArtwork(track).replace(/["'()\\\n\r\f]/g,c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0'));
 const style=esc(`background-image:url("${url}")`);
 return `<span class="art-image-layer" style="${style}"></span><span class="art-symbol-fallback">${esc(track.symbol||'🎵')}</span>`;
}
function applyArtwork(el,track){if(!el||!track)return;el.style.background=safeArtBackground(track.bg);el.innerHTML=artLayer(track)}
function fileToDataUrl(file){return new Promise((resolve,reject)=>{if(!file){resolve('');return;}const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(reader.error||new Error('파일을 읽을 수 없어요.'));reader.readAsDataURL(file);});}

function normalizeTrack(s){if(Array.isArray(s.details))return s;let old=s.genre||'K-POP';if(['발라드','록','댄스','랩','힙합','R&B','재즈','어쿠스틱','기타'].includes(old))return {...s,genre:'K-POP',details:[old]};return {...s,details:[]}}
function filtered(){let arr=all().map(normalizeTrack).filter(s=>(genre==='전체'||s.genre===genre)&&(detail==='전체'||s.details.includes(detail))&&(!query||`${s.title} ${s.singer} ${s.album||''} ${s.genre} ${s.details.join(' ')} ${s.type}`.toLowerCase().includes(query)));if(selectedNav==='my')arr=arr.filter(s=>likes.has(s.id));if(sort==='views')arr.sort((a,b)=>b.views-a.views);if(sort==='likes')arr.sort((a,b)=>b.likes-a.likes);return arr}
function isSignedIn(){return Boolean(window.virhangAuth?.user)}
function requireLogin(){if(isSignedIn())return true;document.getElementById('accountModal')?.showModal();return false}
function render(){document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.nav===selectedNav));const arr=filtered();const shown=selectedNav==='home'?arr.slice(0,4):arr;$('songs').innerHTML=shown.map(s=>`<article class="song-card"><div class="cover" style="${artBg(s)}">${artLayer(s)}<button class="cover-play" data-play="${esc(s.id)}" aria-label="${esc(s.title)} 선택">▶</button></div><div class="song-meta"><h3 title="${esc(s.title)}">${esc(s.title)}</h3><p>${esc(s.singer)} · ${esc(s.type)}</p><div class="song-bottom"><span class="tags"><span class="tag main-tag">${esc(s.genre)}</span>${s.details.map(g=>`<span class="tag detail-tag">${esc(g)}</span>`).join('')}</span><button type="button" class="song-more" data-track-menu="${esc(s.id)}" aria-label="${esc(s.title)} 더보기" title="곡 메뉴">⋯</button>${isSignedIn()?`<button class="playlist-add-mini" data-add-playlist="${esc(s.id)}" title="플레이리스트에 담기" aria-label="${esc(s.title)} 플레이리스트에 담기">＋</button><button class="love ${likes.has(s.id)?'on':''}" data-like="${esc(s.id)}" aria-label="좋아요">${likes.has(s.id)?'♥':'♡'}</button>`:''}</div></div></article>`).join('');$('empty').hidden=!!arr.length; $('empty').style.display=arr.length?'none':'';$('searchCount').textContent=selectedNav==='search'?arr.length:0;$('songTitle').textContent=selectedNav==='home'?'🫧 최근 등록된 노래':selectedNav==='songs'?'🎵 모든 노래 탐색':query?'🔎 검색 결과':'🐚 새로운 노래를 발견해요';const top=[...all()].sort((a,b)=>b.views-a.views).slice(0,5);$('rank').innerHTML=top.map((s,i)=>`<div class="rank-row"><span class="rank-no">${i+1}</span><span class="rank-thumb" style="${artBg(s)}">${artLayer(s)}</span><span class="rank-name"><b>${esc(s.title)}</b><small>${esc(s.singer)}</small></span><span class="rank-val">▷ ${num(s.views)}</span>${isSignedIn()?`<button class="rank-add" data-add-playlist="${esc(s.id)}" aria-label="플레이리스트에 담기">＋</button>`:''}<button class="song-more" data-track-menu="${esc(s.id)}" aria-label="곡 메뉴">⋯</button><button class="love" data-play="${esc(s.id)}" aria-label="곡 선택">▶</button></div>`).join('');renderStreamers()}
function notice(msg){$('notice').textContent=msg;$('notice').hidden=false;$('notice').scrollIntoView({behavior:'smooth',block:'nearest'})}
function openVideo(s){if(s?.platform==='soop'){window.open(s.originalUrl||s.video,'_blank','noopener,noreferrer');notice('SOOP 영상은 원본 사이트의 새 탭에서 열려요.');return;}if(location.protocol==='file:'){alert('유튜브 재생은 ZIP에 포함된 시작하기.bat 파일로 실행해 주세요.\n주소가 http://localhost 로 시작해야 합니다.');return;}if(!s?.video){if(window.beohangYT)beohangYT.stop();return;}expandedMediaMode='art';expandPlayer();syncExpandedMedia();if(window.beohangYT)beohangYT.playTrack(s.video);}
function choose(s,restoreOnly=false){if(!s)return;if(!restoreOnly){resumePendingSeconds=0;lastListeningSeconds=0;}s=enrichTrack(s);if(!queue.some(t=>t.id===s.id)){queue=[];queueIndex=-1;}current=s;if(!restoreOnly)window.dispatchEvent(new CustomEvent('virhang:track-selected',{detail:s}));$('playerMore').hidden=false;$('playerMore').setAttribute('data-track-menu',s.id);applyArtwork($('playerArt'),s);$('playerName').textContent=s.title;$('playerSinger').textContent=s.singer;$('playerSinger').disabled=false;$('playerStatus').textContent=[s.genre,...(s.details||[]),s.type].join(' · ');$('play').textContent='▶';syncPlayerExtras();updateExpandedPlayer();if(!restoreOnly){window.dispatchEvent(new Event('beohang:play-request'));openVideo(s);}saveListeningState()}
function navigate(name){$('expandedPlayer').hidden=true;document.body.classList.remove('expanded-open');if(name==='my'&&!requireLogin())return;if(name!=='search'){query='';$('search').value='';}selectedNav=name;document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.nav===name));if(name==='groups'){selectedGroup=null;selectedGroupMember=null;}if(name==='rank')sort='views';else if(name==='home')sort='new';else if(name==='my')sort='new';else if(name==='streamers'){genre='전체';detail='전체';$('detailFilter').value='전체';streamerSelected=null;renderStreamers()}else if(name==='songs'){genre='전체';detail='전체';$('detailFilter').value='전체'}$('sort').value=sort;document.querySelectorAll('.chip').forEach(b=>b.classList.toggle('active',b.dataset.genre===genre));render();(name==='streamers'?$('streamersView'):name==='groups'?$('groupsView'):name==='my'?$('myLibrary'):(name==='rank'?$('rankView'):name==='home'?$('homeIntro'):document.querySelector('.quick'))).scrollIntoView({behavior:'smooth',block:'start'})}
function videoId(raw){try{const u=new URL(raw);const h=u.hostname.toLowerCase();if(h==='youtu.be'||h==='www.youtu.be')return u.pathname.split('/')[1]||null;if(['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(h)){if(u.pathname==='/watch')return u.searchParams.get('v');const m=u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/);return m?.[1]||null}}catch{}return null}

// V1.2: 프로필은 시연용 가상 정보입니다. 현재 브라우저에서 등록한 곡도 자동으로 나타납니다.
const streamerProfiles=[
 {name:'하린',icon:'🐳',group:'블루웨이브',desc:'잔잔한 감성으로 어항을 물들이는 목소리',color:'#d7eaff'},
 {name:'유리',icon:'🪼',group:'코랄하트',desc:'상큼한 멜로디를 들려주는 노래하는 해파리',color:'#f5dafa'},
 {name:'시온',icon:'🐬',group:'블루웨이브',groups:['블루웨이브','달빛 크루'],desc:'청량한 고음과 시원한 록 사운드',color:'#cbeff5'},
 {name:'하루',icon:'⭐',group:'소속 없음',desc:'작은 별에서 온 오리지널 음악',color:'#fff0c9'},
 {name:'리제',icon:'🐡',group:'코랄하트',desc:'리듬과 함께 헤엄치는 팝 보컬',color:'#eadcff'},
 {name:'세나',icon:'🪸',group:'소속 없음',desc:'기타와 함께 들려주는 여름의 이야기',color:'#ffe2cf'},
 {name:'루나',icon:'🌙',group:'달빛 크루',desc:'밤바다를 닮은 달콤한 음색',color:'#d5f0ef'},
 {name:'모아',icon:'🐠',group:'달빛 크루',groups:['달빛 크루','코랄하트'],desc:'반짝이는 꿈을 노래하는 스트리머',color:'#fce2ef'}
];
let streamerSelected=null,streamerFilter='',groupSelected='전체',favOnly=false;
let groupsSearch='',selectedGroup=null,selectedGroupMember=null,queue=[],queueIndex=-1;
let streamerFavs=new Set();
function streamerData(){const entries=new Map(streamerProfiles.map(s=>[s.name,{...s}]));for(const s of all()){if(!entries.has(s.singer))entries.set(s.singer,{name:s.singer,icon:'🐟',group:'소속 미등록',desc:'새롭게 어항에 찾아온 목소리',color:'#cfeee8'})}return [...entries.values()].map(s=>({...s,groups:s.groups||[s.group],songs:all().filter(t=>t.singer===s.name)}))}
const rankingDefinitions={
 realtime:['실시간 인기곡 TOP 50','최근 1시간 동안의 버항 재생 기준'],
 daily:['일간 인기곡 TOP 50','오늘 00:00부터의 버항 재생 기준'],
 weekly:['주간 인기곡 TOP 50','이번 주 월요일부터의 버항 재생 기준'],
 monthly:['월간 인기곡 TOP 50','이번 달 1일부터의 버항 재생 기준'],
 yearly:['연간 인기곡 TOP 50','올해 1월 1일부터의 버항 재생 기준'],
 alltime:['역대 인기곡 TOP 100','버항 서비스 시작 이후 전체 재생 기준'],
 likes:['좋아요 인기곡 TOP 50','버항 회원들의 좋아요 수 기준'],
 new:['신곡 인기 TOP 50','최근 30일간 등록된 곡의 재생 기준']
};
// 실제 서버 집계 전에는 시연용 views/likes를 랭킹 점수로 사용하지 않습니다.
// 서버에서 검증된 [{track_id, position, score, movement}]만 주입할 수 있습니다.
let verifiedRankings={};
window.virhangSetVerifiedRankings=function(mode, records){
 if(!rankingDefinitions[mode]||!Array.isArray(records))return;
 verifiedRankings[mode]=records.filter(r=>r&&typeof r.track_id==='string'&&Number.isFinite(Number(r.score)));
 if(selectedNav==='rank'&&rankMode===mode)renderFullRanking();
};
function renderFullRanking(){
 const [title,period]=rankingDefinitions[rankMode]||rankingDefinitions.realtime;
 $('rankCategoryTitle').textContent=title;
 $('rankWindowDescription').textContent=period;
 document.querySelectorAll('[data-rank-mode]').forEach(b=>{const active=b.dataset.rankMode===rankMode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
 const records=verifiedRankings[rankMode];
 const limit=rankMode==='alltime'?100:50;
 const tracks=new Map(all().map(t=>[String(t.id),normalizeTrack(t)]));
 const rows=(records||[]).slice(0,limit).map(r=>({rank:r,track:tracks.get(String(r.track_id))})).filter(r=>r.track);
 $('rankStatus').textContent=records?'서버가 집계한 로그인 회원의 YouTube 재생 기록입니다. (SOOP·샘플곡 제외)' :'아직 실제 랭킹 데이터 집계를 연결하지 않았습니다. 재생·좋아요 통계가 준비되면 순위가 표시됩니다.';
 $('fullRanking').innerHTML=rows.map(({track:s,rank:r},i)=>`<div class="full-rank-row"><span class="full-rank-number ${i<3?'top-three':''}">${i+1}</span><span class="full-rank-cover" style="${artBg(s)}">${artLayer(s)}</span><div class="full-rank-desc"><b>${esc(s.title)}</b><small>${esc(s.singer)} · ${esc(s.genre)} · ${esc(s.type)}</small></div><div class="full-rank-metric">${num(Number(r.score)||0)}</div>${isSignedIn()?`<button class="rank-add" data-add-playlist="${esc(s.id)}" aria-label="플레이리스트에 담기">＋</button>`:''}<button class="song-more" data-track-menu="${esc(s.id)}" aria-label="곡 메뉴">⋯</button><button class="mini-btn" data-play="${esc(s.id)}">▶ 재생</button></div>`).join('')||'<div class="empty">아직 집계된 노래가 없어요. 랭킹 데이터 연결 후 표시됩니다.</div>';
}

function renderStreamers(){
 const isSearch=selectedNav==='search';
 document.querySelector('.hero').hidden=selectedNav!=='home';
 $('searchSummary').hidden=!isSearch;
 $('searchTerm').textContent=query;
 const isOn=selectedNav==='streamers'; const isGroup=selectedNav==='groups'; $('streamersView').hidden=!isOn; $('groupsView').hidden=!isGroup;
 document.querySelector('.quick').hidden=selectedNav!=='songs';
 $('homeIntro').hidden=selectedNav!=='home';$('rankView').hidden=selectedNav!=='rank';if(selectedNav==='rank'){renderFullRanking();window.dispatchEvent(new CustomEvent('virhang:ranking-mode',{detail:rankMode}));}
 $('myLibrary').hidden=selectedNav!=='my';$('songSection').hidden=!['home','songs','search'].includes(selectedNav);$('songs').hidden=!['home','songs','search'].includes(selectedNav);$('empty').hidden=!['home','songs','search'].includes(selectedNav);$('belowSection').hidden=selectedNav!=='home';if(selectedNav==='my'){renderLibrary();return;}
 if(isGroup){renderGroups();return;} if(!isOn)return;
 const data=streamerData();const currentGroup=$('groupFilter');currentGroup.innerHTML='<option value="전체">전체 소속</option>'+[...new Set(data.flatMap(s=>s.groups))].sort((a,b)=>a.localeCompare(b,'ko')).map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('');currentGroup.value=groupSelected;
 const arr=data.filter(s=> (!streamerFilter||`${s.name} ${s.group}`.toLowerCase().includes(streamerFilter))&&(groupSelected==='전체'||s.groups.includes(groupSelected))&&(!favOnly||streamerFavs.has(s.name)));
 $('streamerCards').innerHTML=arr.map(s=>`<article class="streamer-card"><div class="streamer-portrait" style="background:${s.color}">${esc(s.icon)}</div><div class="streamer-card-meta"><h3>${esc(s.name)}</h3><span class="group-pill">🫧 ${s.groups.map(g=>esc(g)).join(' · ')}</span><p>${esc(s.desc)}</p><small>🎵 등록곡 ${s.songs.length}곡</small></div><div class="streamer-actions"><button class="outline" data-streamer="${esc(s.name)}">프로필 보기 →</button>${isSignedIn()?`<button class="streamer-heart ${streamerFavs.has(s.name)?'on':''}" data-sfav="${esc(s.name)}" title="즐겨찾기">${streamerFavs.has(s.name)?'♥':'♡'}</button>`:''}</div></article>`).join('');
 $('streamerEmpty').hidden=arr.length>0;
 $('onlyFavStreamers').classList.toggle('selected',favOnly);$('onlyFavStreamers').textContent=favOnly?'♥ 즐겨찾기만':'☆ 즐겨찾기만';
 const selected=data.find(s=>s.name===streamerSelected);
 $('streamerDetail').hidden=!selected;
 if(selected){$('streamerDetail').innerHTML=`<div class="profile-header"><div class="profile-icon" style="background:${selected.color}">${esc(selected.icon)}</div><div><span class="pretitle">STREAMER PROFILE</span><h2>${esc(selected.name)} <span class="group-pill">${selected.groups.map(g=>esc(g)).join(' · ')}</span></h2><p>${esc(selected.desc)}</p><b>🎵 노래 ${selected.songs.length}곡</b></div>${isSignedIn()?`<button class="streamer-heart ${streamerFavs.has(selected.name)?'on':''}" data-sfav="${esc(selected.name)}" title="즐겨찾기">${streamerFavs.has(selected.name)?'♥':'♡'}</button>`:''}</div><button class="primary" data-play-streamer="${esc(selected.name)}">▶ ${esc(selected.name)} 노래 이어듣기</button><div class="profile-songs"><h3>🎤 커버곡</h3>${profileSongs(selected.songs.filter(s=>s.type==='커버곡'))}<h3>✨ 오리지널곡</h3>${profileSongs(selected.songs.filter(s=>s.type==='오리지널곡'))}</div><button class="outline" data-close-profile="1">← 목록으로</button>`;}
}
function profileSongs(songs){return songs.length?songs.map(s=>`<div class="profile-song"><span class="mini-cover" style="${artBg(s)}">${artLayer(s)}</span><div><b>${esc(s.title)}</b><small>${esc(s.genre)} · ${(s.details||[]).map(esc).join(', ')||'세부 장르 없음'}</small></div><div class="profile-song-buttons">${isSignedIn()?`<button class="mini-btn" data-add-playlist="${esc(s.id)}" title="플레이리스트에 담기">＋ 담기</button>`:''}<button class="song-more" data-track-menu="${esc(s.id)}" aria-label="곡 메뉴">⋯</button><button class="mini-btn" data-play="${esc(s.id)}">▶ 재생</button></div></div>`).join(''):'<p class="streamer-intro">아직 등록된 곡이 없어요.</p>'}
$('streamerSearch').addEventListener('input',e=>{streamerFilter=e.target.value.trim().toLowerCase();streamerSelected=null;renderStreamers()});
$('groupFilter').addEventListener('change',e=>{groupSelected=e.target.value;streamerSelected=null;renderStreamers()});
$('onlyFavStreamers').addEventListener('click',()=>{favOnly=!favOnly;streamerSelected=null;renderStreamers()});
document.addEventListener('click',e=>{const mode=e.target.closest('[data-rank-mode]');if(mode){rankMode=mode.dataset.rankMode;localStorage.setItem('virhang_rank_mode',rankMode);renderFullRanking();window.dispatchEvent(new CustomEvent('virhang:ranking-mode',{detail:rankMode}));return;}
 const fav=e.target.closest('[data-sfav]');if(fav){if(!requireLogin())return;if(!window.virhangAuth?.soopLinked){alert('스트리머 즐겨찾기는 SOOP 계정 연동 후 이용할 수 있어요.');return;}const name=fav.dataset.sfav;streamerFavs.has(name)?streamerFavs.delete(name):streamerFavs.add(name);localStorage.setItem(userDataKey('streamers'),JSON.stringify([...streamerFavs]));if(selectedNav==='groups')renderGroups();else renderStreamers();return;}
 const btn=e.target.closest('[data-streamer]');if(btn){streamerSelected=btn.dataset.streamer;renderStreamers();$('streamerDetail').scrollIntoView({behavior:'smooth',block:'start'});return;}
 if(e.target.closest('[data-close-profile]')){streamerSelected=null;renderStreamers();$('streamersView').scrollIntoView({behavior:'smooth'});}
});


// V1.4: 소속/크루 체험용 탐색. 스트리머는 여러 그룹에 동시에 소속될 수 있습니다.
function renderGroups(){
 const ds=streamerData();
 const names=[...new Set(ds.flatMap(s=>s.groups).filter(g=>g!=='소속 없음'&&g!=='소속 미등록'))].sort((a,b)=>a.localeCompare(b,'ko'));
 const groups=names.map((name,i)=>({name,members:ds.filter(s=>s.groups.includes(name)),color:['#d5ecfd','#f9e5f0','#def7ef','#fcecd7'][i%4]}));
 const visible=groups.filter(g=>(g.name+' '+g.members.map(s=>s.name).join(' ')).toLowerCase().includes(groupsSearch));
 $('groupCards').innerHTML=visible.map(g=>`<article class="group-card"><div class="group-emoji" style="background:${g.color}">🪸</div><div><h3>${esc(g.name)}</h3><p>🐠 소속 스트리머 ${g.members.length}명</p><div class="group-faces">${g.members.map(s=>`<span title="${esc(s.name)}">${esc(s.icon)}</span>`).join('')}</div></div><button class="outline" data-view-group="${esc(g.name)}">소속 살펴보기 →</button></article>`).join('');
 $('groupEmpty').hidden=visible.length>0;
 const selected=groups.find(g=>g.name===selectedGroup);$('groupDetail').hidden=!selected;
 if(!selected)return;
 const member=selected.members.find(s=>s.name===selectedGroupMember);
 if(member){
   $('groupDetail').innerHTML=`<div class="profile-header"><div class="profile-icon" style="background:${member.color}">${esc(member.icon)}</div><div><span class="pretitle">STREAMER PROFILE</span><h2>${esc(member.name)} <span class="group-pill">${member.groups.map(esc).join(' · ')}</span></h2><p>${esc(member.desc)}</p><b>🎵 노래 ${member.songs.length}곡</b></div>${isSignedIn()?`<button class="streamer-heart ${streamerFavs.has(member.name)?'on':''}" data-sfav="${esc(member.name)}" title="즐겨찾기">${streamerFavs.has(member.name)?'♥':'♡'}</button>`:''}</div><button class="primary" data-play-streamer="${esc(member.name)}">▶ ${esc(member.name)} 노래 이어듣기</button><div class="profile-songs"><h3>🎤 커버곡</h3>${profileSongs(member.songs.filter(s=>s.type==='커버곡'))}<h3>✨ 오리지널곡</h3>${profileSongs(member.songs.filter(s=>s.type==='오리지널곡'))}</div><button class="outline" data-back-to-group="1">← ${esc(selected.name)}으로 돌아가기</button>`;
   return;
 }
 const songMap=new Map();for(const s of selected.members){for(const song of s.songs)songMap.set(song.id,song)}const tracks=[...songMap.values()];
 $('groupDetail').innerHTML=`<div class="profile-header"><div class="profile-icon" style="background:${selected.color}">🪸</div><div><span class="pretitle">GROUP & CREW</span><h2>${esc(selected.name)}</h2><p>멤버 ${selected.members.length}명 · 등록된 노래 ${tracks.length}곡</p></div></div><h3 class="group-subtitle">🐬 함께하는 스트리머</h3><div class="group-members">${selected.members.map(s=>`<button class="member-pill" data-open-member="${esc(s.name)}">${esc(s.icon)} ${esc(s.name)}</button>`).join('')}</div><div class="group-list-header"><h3>🎵 소속 멤버 노래 모아듣기</h3><button class="primary" data-play-group="${esc(selected.name)}" ${tracks.length?'':'disabled'}>▶ 전체 이어듣기</button></div>${profileSongs(tracks)}`;
}
function startQueue(tracks){if(!tracks.length){notice('등록된 노래가 없어요.');return;}queue=[...tracks];queueIndex=0;choose(queue[0]);if(shuffleEnabled)nextShuffleOrder();saveListeningState();}
$('groupsSearch').addEventListener('input',e=>{groupsSearch=e.target.value.trim().toLowerCase();selectedGroup=null;selectedGroupMember=null;renderGroups()});
document.addEventListener('click',e=>{
 const g=e.target.closest('[data-view-group]');if(g){selectedGroup=g.dataset.viewGroup;selectedGroupMember=null;renderGroups();$('groupDetail').scrollIntoView({behavior:'smooth',block:'start'});return;}
 if(e.target.closest('[data-close-group]')){selectedGroup=null;selectedGroupMember=null;renderGroups();return;}
 const gm=e.target.closest('[data-open-member]');if(gm){selectedGroupMember=gm.dataset.openMember;renderGroups();$('groupDetail').scrollIntoView({behavior:'smooth',block:'start'});return;}
 if(e.target.closest('[data-back-to-group]')){selectedGroupMember=null;renderGroups();$('groupDetail').scrollIntoView({behavior:'smooth',block:'start'});return;}
 const gp=e.target.closest('[data-play-group]');if(gp){const members=streamerData().filter(s=>s.groups.includes(gp.dataset.playGroup));const ids=new Map(members.flatMap(s=>s.songs.map(t=>[t.id,t])));startQueue([...ids.values()]);return;}
 const sp=e.target.closest('[data-play-streamer]');if(sp){startQueue(all().filter(t=>t.singer===sp.dataset.playStreamer));return;}
});

document.addEventListener('click',e=>{const like=e.target.closest('[data-like]');if(like){if(!requireLogin())return;const id=like.dataset.like;likes.has(id)?likes.delete(id):likes.add(id);localStorage.setItem(userDataKey('likes'),JSON.stringify([...likes]));window.virhangAuth?.saveLibrary({likes:[...likes],playlists});render();return}const play=e.target.closest('[data-play]');if(play){choose(all().find(s=>s.id===play.dataset.play));return}const nav=e.target.closest('[data-nav]');if(nav)navigate(nav.dataset.nav);const cat=e.target.closest('[data-genre]');if(cat){genre=cat.dataset.genre;selectedNav='songs';document.querySelectorAll('.chip').forEach(b=>b.classList.toggle('active',b===cat));render()}});
$('detailFilter').addEventListener('change',e=>{detail=e.target.value;render()});
$('searchForm').addEventListener('submit',e=>{e.preventDefault();const term=$('search').value.trim();if(!term){$('search').focus();return;}$('expandedPlayer').hidden=true;document.body.classList.remove('expanded-open');query=term.toLowerCase();genre='전체';detail='전체';$('detailFilter').value='전체';sort='new';$('sort').value='new';selectedNav='search';document.querySelectorAll('.nav-link').forEach(b=>b.classList.remove('active'));document.querySelectorAll('.chip').forEach(b=>b.classList.toggle('active',b.dataset.genre==='전체'));render();$('searchSummary').scrollIntoView({behavior:'smooth',block:'start'});});$('backHome').addEventListener('click',()=>{navigate('home');window.scrollTo({top:0,behavior:'smooth'});});$('sort').addEventListener('change',e=>{sort=e.target.value;render()});$('explore').onclick=()=>navigate('songs');$('shuffleHero').onclick=()=>{const arr=filtered().length?filtered():all();if(!arr.length)return;choose(arr[Math.floor(Math.random()*arr.length)])};$('shuffle').onclick=()=>{shuffleEnabled=!shuffleEnabled;if(shuffleEnabled)nextShuffleOrder();else{shuffleOrder=[];shufflePosition=-1;}refreshShuffle();saveListeningState();};$('favoritesBtn').onclick=()=>navigate('my');$('profile').onclick=()=>navigate('my');$('add').onclick=()=>{if(!window.virhangCanPublish?.()){alert('노래 등록은 스트리머 또는 관리자만 가능합니다.');return;}$('modal').showModal();};$('close').onclick=()=>$('modal').close();$('closeVideo').onclick=()=>{$('videoModal').close();$('videoArea').innerHTML=''};$('videoModal').addEventListener('close',()=>{$('videoArea').innerHTML=''});
$('addForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const media=window.virhangMedia?.parse($('newUrl').value);
 if(!media){alert('YouTube 영상/Shorts 또는 SOOP 클립/VOD의 올바른 https 링크를 입력해 주세요.');return;}
 const auth=window.virhangAuth;
 const client=auth?.getClient?.();
 if(!auth?.user||!client){alert('노래 등록은 로그인 후 사용할 수 있어요.');return;}
 const {data:my,error:myError}=await client.rpc('virhang_my_profile');
 if(myError||!['streamer','admin','super_admin'].includes(my?.[0]?.role)){alert('노래 등록은 스트리머 또는 관리자만 가능합니다.');return;}
 let artwork='';
 const file=$('newArtworkFile').files?.[0];
 if(file){alert('전체 공개 등록에서는 이미지 파일 직접 업로드가 아직 지원되지 않아요. 이미지 주소를 입력하거나 자동 썸네일을 사용해 주세요.');return;}
 const supplied=$('newArtworkUrl').value.trim();
 if(supplied){artwork=safeImage(supplied);if(!artwork||!artwork.startsWith('https:')){alert('앨범 이미지 주소는 안전한 https 링크로 입력해 주세요.');return;}}
 // SOOP has no guaranteed public thumbnail URL. With no image supplied, the UI generates a themed cover automatically.
 else artwork=media.platform==='youtube'?thumbnailFromVideo(media.video):'';
 const row={title:$('newTitle').value.trim(),singer:$('newSinger').value.trim(),album:$('newAlbum').value.trim(),platform:media.platform,source_url:media.url,artwork_url:artwork,genre:$('newGenre').value,details:[...document.querySelectorAll('input[name="detailGenre"]:checked')].map(c=>c.value),song_type:$('newType').value,description:$('newDescription').value.trim(),lyrics:$('newLyrics').value.trim(),original_url:$('newOriginalUrl').value.trim()};
 const btn=$('addForm').querySelector('[type="submit"]');btn.disabled=true;
 try{
  const {error}=await client.from('virhang_published_tracks').insert(row);
  if(error)throw error;
  $('modal').close();$('addForm').reset();
  await window.virhangRefreshShared?.();
  notice('🐠 노래가 등록되어 전체 이용자에게 공개됐어요!');
 }catch(err){alert('등록 실패: '+(err.message||'잠시 후 다시 시도해 주세요.'));}
 finally{btn.disabled=false;}
});
$('play').onclick=()=>{if(resumePendingSeconds>0&&current?.video){window.beohangYT?.resumeFrom(resumePendingSeconds);resumePendingSeconds=0;window.dispatchEvent(new Event('beohang:play-request'));openVideo(current);return;}if(!current){notice('먼저 원하는 노래 카드의 ▶ 버튼을 눌러주세요.');return;}if(!current.video){notice('이 곡은 샘플이라 실제 영상이 없어요.');return;}window.dispatchEvent(new Event('beohang:play-request'));if(window.beohangYT)beohangYT.toggle();else openVideo(current)};$('next').onclick=()=>{if(shuffleEnabled){chooseFromShuffle(1);return;}if(queue.length){queueIndex=(queueIndex+1)%queue.length;choose(queue[queueIndex]);return;}const a=filtered(),i=a.findIndex(s=>s.id===current?.id);choose(a[(i+1)%a.length]||all()[0])};$('prev').onclick=()=>{if(shuffleEnabled){chooseFromShuffle(-1);return;}if(queue.length){queueIndex=(queueIndex-1+queue.length)%queue.length;choose(queue[queueIndex]);return;}const a=filtered(),i=a.findIndex(s=>s.id===current?.id);choose(a[(i-1+a.length)%a.length]||all()[0])};
function autoAdvance(){
 if(shuffleEnabled){if(!shuffleOrder.length)nextShuffleOrder();if(shufflePosition+1>=shuffleOrder.length){$('play').textContent='▶';return;}chooseFromShuffle(1);return;}
 const list=queue.length?queue:all().map(normalizeTrack);
 const idx=list.findIndex(s=>s.id===current?.id);
 if(idx<0||idx+1>=list.length){$('play').textContent='▶';return;}
 if(queue.length)queueIndex=idx+1;
 choose(list[idx+1]);
}
render();

// V1.5.2: all playlists and favorites are stored only in this browser.
const PL_KEY='playlists';
let playlists=[];
if(!Array.isArray(playlists))playlists=[];
playlists=playlists.filter(p=>p&&typeof p.name==='string'&&Array.isArray(p.ids)).map(p=>({...p,ids:p.ids.filter(id=>typeof id==='string')}));
// 체험판 전용: 닉네임을 임시 사용자 식별자로 삼아 이 브라우저 안에서만 자료를 분리합니다.
// 실제 공개 서비스에서는 닉네임이 아닌 서버에서 발급한 고유 사용자 ID를 사용해야 합니다.
function demoAccountName(){return window.virhangAuth?.user?.id || null}
function userDataKey(kind){const name=demoAccountName();return name?'virhang_account_'+encodeURIComponent(name)+'_'+kind:'virhang_guest_'+kind}
function loadPersonalLibrary(){
 if(!isSignedIn()){likes=new Set();streamerFavs=new Set();playlists=[];selectedPlaylist=null;return;}
 likes=new Set(fromStore(userDataKey('likes'),[]));
 streamerFavs=new Set(fromStore(userDataKey('streamers'),[]));
 const raw=fromStore(userDataKey(PL_KEY),[]);
 playlists=(Array.isArray(raw)?raw:[]).filter(p=>p&&typeof p.name==='string'&&Array.isArray(p.ids)).map(p=>({...p,ids:p.ids.filter(id=>typeof id==='string')}));
 selectedPlaylist=playlists[0]?.id||null;
}
let libraryTab='songs',selectedPlaylist=null,playlistSong=null;
function storePlaylists(){localStorage.setItem(userDataKey(PL_KEY),JSON.stringify(playlists));window.virhangAuth?.saveLibrary({likes:[...likes],playlists});}
function songRow(t,idx,playlistId=null){return `<div class="library-song ${playlistId!==null?'sortable-track':''}" ${playlistId!==null?`data-sort-pl="${esc(playlistId)}" data-sort-index="${idx}" draggable="true"`:''}>${playlistId!==null?'<span class="drag-handle" title="잡고 끌어서 순서 변경" aria-label="곡 순서 변경">⠿</span>':''}<div class="mini-cover" style="${artBg(t)}">${esc(t.symbol||'🎵')}</div><div class="library-song-title"><b>${esc(t.title)}</b><small>${esc(t.singer)} · ${esc(t.genre)}${t.details?.length?' · '+t.details.map(esc).join(' · '):''} · ${esc(t.type)}</small></div>${playlistId!==null?`<button class="mini-btn" data-remove-pl="${esc(playlistId)}" data-song="${esc(t.id)}">✕</button>`:`<button class="mini-btn" data-add-playlist="${esc(t.id)}">＋ 담기</button>`}<button class="song-more" data-track-menu="${esc(t.id)}" aria-label="곡 메뉴">⋯</button><button class="mini-btn" data-play="${esc(t.id)}">▶</button></div>`;}

function renderLibrary(){if(!isSignedIn()){$('libraryContent').innerHTML='<div class="library-empty">🐠 로그인하면 좋아요·즐겨찾기·플레이리스트를 사용할 수 있어요.</div>';return;}if(selectedNav!=='my')return;
 document.querySelectorAll('[data-library-tab]').forEach(b=>b.classList.toggle('active',b.dataset.libraryTab===libraryTab));
 const content=$('libraryContent');
 if(libraryTab==='songs'){const tracks=all().filter(s=>likes.has(s.id));content.innerHTML=`<div class="library-heading"><h3>💗 좋아요한 노래 <small>${tracks.length}곡</small></h3>${tracks.length?'<button class="primary" data-play-liked>▶ 모두 이어듣기</button>':''}</div>${tracks.length?tracks.map((t,i)=>songRow(t,i)).join(''):'<div class="library-empty">아직 좋아요한 노래가 없어요. 노래 카드의 ♡를 눌러보세요.</div>'}`;}
 else if(libraryTab==='streamers'){const arr=streamerData().filter(s=>streamerFavs.has(s.name));content.innerHTML=`<div class="library-heading"><h3>⭐ 즐겨찾는 스트리머 <small>${arr.length}명</small></h3></div>${arr.length?`<div class="library-streamers">${arr.map(s=>`<div class="library-streamer"><div class="profile-icon" style="background:${s.color}">${esc(s.icon)}</div><div><b>${esc(s.name)}</b><small>${s.groups.map(esc).join(' · ')} · ${s.songs.length}곡</small></div><button class="mini-btn" data-library-streamer="${esc(s.name)}">프로필 보기 →</button><button class="streamer-heart on" data-sfav="${esc(s.name)}">♥</button></div>`).join('')}</div>`:'<div class="library-empty">아직 즐겨찾는 스트리머가 없어요. 스트리머 화면에서 ♡를 눌러보세요.</div>'}`;}
 else {const selected=playlists.find(p=>p.id===selectedPlaylist);content.innerHTML=`<div class="library-heading"><h3>🎵 내 플레이리스트 <small>${playlists.length}개</small></h3></div><form class="playlist-create" id="playlistCreateForm"><input name="name" placeholder="새 플레이리스트 이름을 입력하세요" maxlength="40" required><button class="primary" type="submit">＋ 만들기</button></form><div class="playlist-layout"><div class="playlist-list">${playlists.map(p=>`<button class="playlist-tile ${p.id===selectedPlaylist?'active':''}" data-select-pl="${esc(p.id)}"><span>🎼</span><span><b>${esc(p.name)}</b><small>${p.ids.length}곡</small></span></button>`).join('')||'<p class="streamer-intro">첫 플레이리스트를 만들어 보세요.</p>'}</div><div class="playlist-detail">${selected?`<div class="library-heading"><div><h3>🎧 ${esc(selected.name)}</h3><small>${selected.ids.length}곡 · ⠿ 손잡이를 드래그해 순서를 바꿀 수 있어요.</small></div><button class="primary" data-play-pl="${esc(selected.id)}" ${selected.ids.length?'':'disabled'}>▶ 이어듣기</button></div><div class="playlist-edit"><button class="mini-btn" data-rename-pl="${esc(selected.id)}">✎ 이름 변경</button><button class="mini-btn danger-mini" data-delete-pl="${esc(selected.id)}">삭제</button></div>${selected.ids.map((id,i)=>all().find(t=>t.id===id)?songRow(all().find(t=>t.id===id),i,selected.id):`<div class="library-song"><span>찾을 수 없는 곡</span><button class="mini-btn" data-remove-pl="${esc(selected.id)}" data-song="${esc(id)}">✕</button></div>`).join('')||'<div class="library-empty">아직 담은 곡이 없어요. 노래 카드의 ＋ 버튼으로 추가해 보세요.</div>'}`:'<div class="library-empty">왼쪽에서 플레이리스트를 선택하거나 새로 만들어 보세요.</div>'}</div></div>`;}
}
function newPlaylist(name){if(!requireLogin())return null;name=String(name||'').trim();if(!name)return null;const id='pl'+Date.now()+'_'+Math.random().toString(36).slice(2,7);playlists.push({id,name,ids:[]});selectedPlaylist=id;storePlaylists();return id;}
function openPlaylistAdd(id){if(!requireLogin())return;playlistSong=id;const t=all().find(t=>t.id===id);if(!t)return;$('playlistTargetLabel').textContent=`${t.title} · ${t.singer}`;renderPlaylistPick();$('playlistAddDialog').showModal();}
function renderPlaylistPick(){$('playlistPickList').innerHTML=playlists.map(p=>`<button class="playlist-pick" data-pick-pl="${esc(p.id)}">🎼 ${esc(p.name)} <small>${p.ids.includes(playlistSong)?'✓ 담긴 곡':'＋ 담기'}</small></button>`).join('')||'<p class="streamer-intro">아직 플레이리스트가 없어요. 아래에서 첫 목록을 만들어 보세요.</p>';}
function addTrackToPlaylist(plId,trackId){if(!requireLogin())return;const p=playlists.find(p=>p.id===plId);if(!p)return;if(p.ids.includes(trackId)){alert('이미 담긴 곡이에요.');return;}p.ids.push(trackId);storePlaylists();$('playlistAddDialog').close();if(selectedNav==='my')renderLibrary();}
document.addEventListener('click',e=>{const el=e.target.closest('[data-add-playlist],[data-library-tab],[data-pick-pl],[data-select-pl],[data-play-pl],[data-play-liked],[data-library-streamer],[data-remove-pl],[data-move-pl],[data-rename-pl],[data-delete-pl],[data-close-pl]');if(!el)return;if(!isSignedIn()&&!requireLogin())return;
 if(el.hasAttribute('data-add-playlist')){openPlaylistAdd(el.dataset.addPlaylist);return;}
 if(el.hasAttribute('data-library-tab')){libraryTab=el.dataset.libraryTab;renderLibrary();return;}
 if(el.hasAttribute('data-close-pl')){$('playlistAddDialog').close();return;}
 if(el.hasAttribute('data-pick-pl')){addTrackToPlaylist(el.dataset.pickPl,playlistSong);return;}
 if(el.hasAttribute('data-select-pl')){selectedPlaylist=el.dataset.selectPl;renderLibrary();return;}
 if(el.hasAttribute('data-play-pl')){const p=playlists.find(p=>p.id===el.dataset.playPl);if(p)startQueue(p.ids.map(id=>all().find(t=>t.id===id)).filter(Boolean));return;}
 if(el.hasAttribute('data-play-liked')){startQueue(all().filter(t=>likes.has(t.id)));return;}
 if(el.hasAttribute('data-library-streamer')){streamerSelected=el.dataset.libraryStreamer;navigate('streamers');renderStreamers();$('streamerDetail').scrollIntoView({behavior:'smooth'});return;}
 if(el.hasAttribute('data-remove-pl')){const p=playlists.find(p=>p.id===el.dataset.removePl);if(p){p.ids=p.ids.filter(id=>id!==el.dataset.song);storePlaylists();renderLibrary();}return;}
 if(el.hasAttribute('data-move-pl')){const p=playlists.find(p=>p.id===el.dataset.movePl);if(p){const a=Number(el.dataset.index),b=a+Number(el.dataset.step);if(b>=0&&b<p.ids.length){[p.ids[a],p.ids[b]]=[p.ids[b],p.ids[a]];storePlaylists();renderLibrary();}}return;}
 if(el.hasAttribute('data-rename-pl')){const p=playlists.find(p=>p.id===el.dataset.renamePl);if(p){const v=prompt('새 플레이리스트 이름',p.name);if(v&&v.trim()){p.name=v.trim().slice(0,40);storePlaylists();renderLibrary();}}return;}
 if(el.hasAttribute('data-delete-pl')){const p=playlists.find(p=>p.id===el.dataset.deletePl);if(p&&confirm(`「${p.name}」 플레이리스트를 삭제할까요?`)){playlists=playlists.filter(x=>x.id!==p.id);selectedPlaylist=playlists[0]?.id||null;storePlaylists();renderLibrary();}return;}
});
document.addEventListener('submit',e=>{if(e.target.id==='playlistCreateForm'){e.preventDefault();if(!requireLogin())return;newPlaylist(new FormData(e.target).get('name'));renderLibrary();}});
function reorderPlaylist(plId,from,to){const p=playlists.find(x=>x.id===plId);if(!p||!Number.isInteger(from)||!Number.isInteger(to)||from===to||from<0||to<0||from>=p.ids.length||to>=p.ids.length)return;const [song]=p.ids.splice(from,1);p.ids.splice(to,0,song);storePlaylists();renderLibrary();}
let dragInfo=null;
document.addEventListener('dragstart',e=>{const row=e.target.closest('.sortable-track');if(!row||!isSignedIn())return;dragInfo={id:row.dataset.sortPl,from:+row.dataset.sortIndex};row.classList.add('dragging');if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragInfo.id)}});
document.addEventListener('dragover',e=>{const row=e.target.closest('.sortable-track');if(!row||!dragInfo||row.dataset.sortPl!==dragInfo.id)return;e.preventDefault();document.querySelectorAll('.sort-over').forEach(x=>x.classList.remove('sort-over'));row.classList.add('sort-over')});
document.addEventListener('drop',e=>{const row=e.target.closest('.sortable-track');if(!row||!dragInfo||row.dataset.sortPl!==dragInfo.id)return;e.preventDefault();const info=dragInfo;dragInfo=null;reorderPlaylist(info.id,info.from,+row.dataset.sortIndex)});
document.addEventListener('dragend',()=>{dragInfo=null;document.querySelectorAll('.dragging,.sort-over').forEach(x=>x.classList.remove('dragging','sort-over'))});
// On touchscreens use pointer dragging from the handle.
let touchSort=null;
document.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'||!e.target.closest('.drag-handle'))return;const row=e.target.closest('.sortable-track');if(!row)return;touchSort={id:row.dataset.sortPl,from:+row.dataset.sortIndex,target:null};e.target.setPointerCapture?.(e.pointerId);row.classList.add('dragging')});
document.addEventListener('pointermove',e=>{if(!touchSort)return;const row=document.elementFromPoint(e.clientX,e.clientY)?.closest('.sortable-track');document.querySelectorAll('.sort-over').forEach(x=>x.classList.remove('sort-over'));if(row&&row.dataset.sortPl===touchSort.id){touchSort.target=+row.dataset.sortIndex;row.classList.add('sort-over')}});
document.addEventListener('pointerup',()=>{if(!touchSort)return;const {id,from,target}=touchSort;touchSort=null;document.querySelectorAll('.dragging,.sort-over').forEach(x=>x.classList.remove('dragging','sort-over'));if(target!==null)reorderPlaylist(id,from,target)});
$('playlistQuickCreate').addEventListener('click',()=>{const id=newPlaylist($('playlistQuickName').value);if(id){$('playlistQuickName').value='';addTrackToPlaylist(id,playlistSong);}});
// The same save menu is also accessible from the bottom music player.
function syncPlayerExtras(){
 const save=document.querySelector('.player-save');if(save)save.hidden=!isSignedIn()||!current;
 const info=document.getElementById('trackInfoButton');if(info)info.hidden=!current;
}
function openTrackInfo(){
 if(!current)return;
 const t=normalizeTrack(current);
 document.getElementById('trackInfoTitle').textContent=`${t.title} · ${t.singer}`;
 document.getElementById('trackInfoTags').innerHTML=[t.genre,...(t.details||[]),t.type].map(v=>`<span class="track-info-chip">${esc(v)}</span>`).join('');
 document.getElementById('trackInfoDescription').textContent=t.description?.trim()||'이 곡의 설명은 아직 등록되지 않았어요.';
 const lyric=t.lyrics?.trim();
 document.getElementById('trackInfoLyrics').textContent=lyric||'등록된 가사가 없어요. 추후 스트리머가 제공한 가사나 허용된 가사를 표시할 수 있어요.';
 document.getElementById('trackInfoOrigin').innerHTML=t.originalUrl?`<a href="${esc(t.originalUrl)}" rel="noopener noreferrer" target="_blank">원곡 영상 열기 ↗</a>`:'';
 document.getElementById('trackInfoDialog').showModal();
}
// 곡 정보/가사는 확장 플레이어 탭에서 확인합니다.
document.getElementById('trackInfoClose').onclick=()=>document.getElementById('trackInfoDialog').close();
const playerSave=document.createElement('button');playerSave.className='player-save';playerSave.title='현재 곡 플레이리스트에 담기';playerSave.textContent='＋ 담기';playerSave.hidden=!isSignedIn()||!current;playerSave.onclick=()=>{if(current)openPlaylistAdd(current.id);else alert('먼저 노래를 선택해 주세요.');};$('player').appendChild(playerSave);
const oldFavClickRefresh=()=>{if(selectedNav==='my')renderLibrary();};
document.addEventListener('click',e=>{if(e.target.closest('[data-sfav],[data-like]'))setTimeout(oldFavClickRefresh,0);});
loadPersonalLibrary();

// V2.4: Auth state comes from the verified Supabase Auth SDK, not user input.
(()=>{
 const el=id=>document.getElementById(id);
 function update(){
  const user=window.virhangAuth?.user;
  el('accountEntry').textContent=user?'내 계정':'로그인 / 회원가입';
  if(el('add'))el('add').hidden=true; // streamer registration requires staff approval
  const save=document.querySelector('.player-save');if(save)save.hidden=!user||!current;
  loadPersonalLibrary();render();if(selectedNav==='my')renderLibrary();
 }
 el('accountEntry').onclick=()=>el('accountModal').showModal();
 el('accountClose').onclick=()=>el('accountModal').close();
 window.addEventListener('virhang:session-changed',update);
 window.addEventListener('virhang:library-loaded',e=>{
  const data=e.detail||{};
  if(Array.isArray(data.likes)){likes=new Set(data.likes);localStorage.setItem(userDataKey('likes'),JSON.stringify([...likes]));}
  if(Array.isArray(data.playlists)){playlists=data.playlists;localStorage.setItem(userDataKey('playlists'),JSON.stringify(playlists));selectedPlaylist=playlists[0]?.id||null;}
  render();if(selectedNav==='my')renderLibrary();
 });
 update();
})();

// V1.8: bottom player expands into a music-focused view. Sample tracks do not have audio.
let expandedTab='queue';
let expandedMediaMode='art';
let shuffleEnabled=false,shuffleOrder=[],shufflePosition=-1;
function nextShuffleOrder(){const base=[...new Set((queue.length?queue:all().map(normalizeTrack)).map(t=>t.id))];const rest=base.filter(id=>id!==current?.id);for(let i=rest.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[rest[i],rest[j]]=[rest[j],rest[i]];}shuffleOrder=[current?.id,...rest].filter(Boolean);shufflePosition=0;saveListeningState();}
function chooseFromShuffle(step){if(!shuffleOrder.length)nextShuffleOrder();if(!shuffleOrder.length)return;const next=shufflePosition+step;if(next>=shuffleOrder.length){return;}if(next<0)return;shufflePosition=next;const song=all().map(normalizeTrack).find(s=>s.id===shuffleOrder[shufflePosition]);if(song)choose(song);saveListeningState();}
function refreshShuffle(){const b=$('shuffle');b.classList.toggle('shuffle-on',shuffleEnabled);b.setAttribute('aria-pressed',String(shuffleEnabled));b.title=shuffleEnabled?'셔플 켜짐 · 누르면 끄기':'셔플 꺼짐 · 누르면 켜기';b.textContent=shuffleEnabled?'🔀':'🔀';}

function runSearch(term){
 const value=String(term||'').trim();if(!value)return;
 $('search').value=value;$('searchForm').requestSubmit();
 document.getElementById('expandedPlayer').hidden=true;document.body.classList.remove('expanded-open');
}
function updateExpandedPlayer(){
 const panel=$('expandedPlayer');if(!panel||!current)return;
 const t=normalizeTrack(current);
 syncExpandedMedia();
 applyArtwork($('expandedCover'),t);
 $('expandedTitle').textContent=t.title;
 $('expandedArtist').textContent=t.singer;
 $('expandedAlbum').textContent=t.album||'앨범 정보 없음';
 $('expandedAlbum').disabled=!t.album;
 $('expandedGenres').innerHTML=[t.genre,...t.details,t.type].map(v=>`<span>${esc(v)}</span>`).join('');
 $('expandedPlay').textContent=t.video?'⏯ 재생 / 일시정지':'🎵 샘플곡 · 영상 없음';
 $('expandedPlay').disabled=!t.video;
 document.querySelectorAll('[data-expanded-tab]').forEach(b=>b.classList.toggle('selected',b.dataset.expandedTab===expandedTab));
 const content=$('expandedPanel');
 if(expandedTab==='lyrics'){
  content.innerHTML=`<h3>🎤 가사</h3><p class="expanded-copy">${esc(t.lyrics?.trim()||'현재 등록된 가사가 없어요.')}</p>`;
 }else if(expandedTab==='info'){
  content.innerHTML=`<h3>🫧 곡 정보</h3><p><b>노래 제목</b> ${esc(t.title)}</p><p><b>가수 / 스트리머</b> ${esc(t.singer)}</p><p><b>앨범</b> ${esc(t.album||'미등록')}</p><p><b>곡 종류</b> ${esc(t.type)}</p><p><b>장르</b> ${esc([t.genre,...t.details].join(' · '))}</p><p class="expanded-copy">${esc(t.description?.trim()||'아직 곡 설명이 등록되지 않았어요.')}</p>${t.originalUrl?`<a target="_blank" rel="noopener noreferrer" href="${esc(t.originalUrl)}">원곡 영상 보기 ↗</a>`:''}`;
 }else{
  const list=queue.length?queue:all().map(normalizeTrack);
  content.innerHTML=`<h3>🎶 이어 들을 노래 <small>${list.length}곡</small></h3>`+list.map((s,i)=>`<div role="button" tabindex="0" class="expanded-queue-row ${current.id===s.id?'current':''}" data-expanded-track="${esc(s.id)}"><span class="expanded-queue-art" style="${artBg(s)}">${artLayer(s)}</span><span><b>${esc(s.title)}</b><small>${esc(s.singer)} · ${esc(s.genre)}</small></span>${current.id===s.id?'<em>재생 선택됨</em>':''}<button type="button" class="song-more" data-track-menu="${esc(s.id)}" aria-label="곡 메뉴">⋯</button></div>`).join('');
 }
}
const expandBtn=$('player').querySelector('.player-song');
expandBtn.removeAttribute('role');expandBtn.removeAttribute('tabindex');expandBtn.removeAttribute('title');
function expandPlayer(){if(!current)return;window.scrollTo({top:0,behavior:'instant'});$('expandedPlayer').hidden=false;document.body.classList.add('expanded-open');updateExpandedPlayer()}
function syncExpandedMedia(){
 const video=expandedMediaMode==='video';
 $('expandedArtworkMode').classList.toggle('selected',!video);
 $('expandedVideoMode').classList.toggle('selected',video);
 $('expandedArtworkMode').setAttribute('aria-pressed',String(!video));
 $('expandedVideoMode').setAttribute('aria-pressed',String(video));
 const hasVideo=Boolean(current?.video);
 $('expandedCover').hidden=video;
 const frame=$('expandedVideoFrame');
 frame.classList.remove('album-video-mini','audio-only-hidden');
 if(video){
   frame.hidden=!hasVideo;
   if(!hasVideo){frame.innerHTML='<div class="expanded-no-video">🐟 영상이 등록된 노래를 선택해 주세요.</div>';return;}
 }else{
   if(hasVideo){frame.hidden=false;frame.classList.add('audio-only-hidden');}
   else frame.hidden=true;
 }
 if(hasVideo && window.beohangYT)window.beohangYT.mount();
}

// 하단바의 재생 컨트롤이나 별도 버튼을 제외한 전체 여백으로 확장합니다.
$('player').addEventListener('click',e=>{
 // 곡 정보, 컨트롤, 음량은 별도 동작. 나머지 빈 영역만 재생 화면을 엽니다.
 if(e.target.closest('.player-art,.player-info,.player-controls,.player-volume,.player-timeline,.player-time'))return;
 if(e.target.closest('button,a,input,select,textarea,[data-track-menu]'))return;
 if(!current)return;
 if(!$('expandedPlayer').hidden){
   $('expandedPlayer').hidden=true;
   document.body.classList.remove('expanded-open');
 }else expandPlayer();
});
$('playerSinger').addEventListener('click',e=>{
 e.stopPropagation();
 if(current?.singer){$('expandedPlayer').hidden=true;document.body.classList.remove('expanded-open');runSearch(current.singer);}
});

$('collapsePlayer').onclick=()=>{$('expandedPlayer').hidden=true;document.body.classList.remove('expanded-open');if(window.beohangYT)beohangYT.pause();};


$('expandedArtworkMode').onclick=()=>{expandedMediaMode='art';syncExpandedMedia()};
$('expandedVideoMode').onclick=()=>{expandedMediaMode='video';syncExpandedMedia()};
refreshShuffle();
$('expandedArtist').onclick=()=>{$('expandedPlayer').hidden=true;runSearch(current?.singer)};
$('expandedAlbum').onclick=()=>{$('expandedPlayer').hidden=true;runSearch(current?.album)};
$('expandedPrev').onclick=()=>$('prev').click();$('expandedNext').onclick=()=>$('next').click();
$('expandedPlay').onclick=()=>{if(current?.video&&window.beohangYT)beohangYT.toggle();else if(current?.video)openVideo(current)};
document.querySelectorAll('[data-expanded-tab]').forEach(b=>b.onclick=()=>{expandedTab=b.dataset.expandedTab;updateExpandedPlayer()});
$('expandedPanel').addEventListener('click',e=>{const b=e.target.closest('[data-expanded-track]');if(!b)return;const song=all().find(s=>s.id===b.dataset.expandedTrack);if(song){choose(normalizeTrack(song));if(shuffleEnabled)nextShuffleOrder()}});

// V1.9 responsive sidebar toggles; main navigation persists in expanded mode.
const mobileMenu=document.getElementById('mobileMenu');
mobileMenu.addEventListener('click',()=>{const side=document.getElementById('siteSidebar');const open=side.classList.toggle('mobile-open');mobileMenu.setAttribute('aria-expanded',String(open));});
document.querySelectorAll('#siteSidebar [data-nav]').forEach(b=>b.addEventListener('click',()=>{document.getElementById('siteSidebar').classList.remove('mobile-open');mobileMenu.setAttribute('aria-expanded','false');}));

// V1.10: common song action menu; built dynamically rather than duplicate popups.
let trackMenuId=null;
const trackMenu=document.createElement('div');
trackMenu.id='trackActionMenu';trackMenu.className='track-action-menu';trackMenu.hidden=true;trackMenu.setAttribute('role','menu');
document.body.appendChild(trackMenu);
function closeTrackMenu(){trackMenu.hidden=true;trackMenuId=null;}
function trackForMenu(){return all().map(normalizeTrack).find(t=>t.id===trackMenuId);}
function showTrackMenu(btn,id){
 const s=all().map(normalizeTrack).find(t=>t.id===id);if(!s)return;
 trackMenuId=id;
 const signed=isSignedIn();
 const entries=[['now','▶','지금 재생'],['next','⏭','다음에 재생'],['append','☷','현재 재생목록에 추가'],...(signed?[['playlist','＋','내 플레이리스트에 담기'],['like','♥',likes.has(id)?'좋아요 해제':'좋아요'],['favorite','⭐',streamerFavs.has(s.singer)?'스트리머 즐겨찾기 해제':'스트리머 즐겨찾기']]:[]),['artist','🐬','스트리머 보기'],['info','ⓘ','곡 정보 보기'],['lyrics','♫','가사 보기'],['share','↗','공유'],...(window.virhangCanManageTrack?.(s.id)?[['edit','✎','곡 수정'],['delete','🗑','곡 삭제']]:[])];
 trackMenu.innerHTML='<strong class="track-menu-heading">'+esc(s.title)+'</strong>'+entries.map(([key,ico,label])=>'<button type="button" role="menuitem" data-menu-action="'+key+'"><span>'+ico+'</span>'+label+'</button>').join('');
 trackMenu.hidden=false;
 const r=btn.getBoundingClientRect(),w=260,h=Math.min(window.innerHeight-24,trackMenu.offsetHeight);
 let left=Math.min(window.innerWidth-w-12,Math.max(12,r.right-w));
 let top=r.bottom+7;if(top+h>window.innerHeight-10)top=Math.max(10,r.top-h-7);
 trackMenu.style.left=left+'px';trackMenu.style.top=top+'px';
}
function enqueueTrack(s,immediate){
 if(!queue.length){queue=current?[normalizeTrack(current)]:[];}
 if(immediate){const idx=queue.findIndex(t=>t.id===current?.id);queue.splice(Math.max(0,idx+1),0,s);}
 else queue.push(s);
 queueIndex=Math.max(0,queue.findIndex(t=>t.id===current?.id));
 if(shuffleEnabled){ // insert once into remaining order without disturbing already-played tracks
  if(!shuffleOrder.length)nextShuffleOrder();
  shuffleOrder=shuffleOrder.filter((id,i)=>id!==s.id||i<=shufflePosition);
  const pos=immediate?shufflePosition+1:shuffleOrder.length;
  shuffleOrder.splice(pos,0,s.id);
 }
 updateExpandedPlayer();saveListeningState();notice(immediate?'다음에 재생할 곡으로 추가했어요.':'현재 재생목록에 추가했어요.');
}
document.addEventListener('click',e=>{
 const trigger=e.target.closest('[data-track-menu]');
 if(trigger){e.preventDefault();e.stopImmediatePropagation();if(!trackMenu.hidden&&trackMenuId===trigger.dataset.trackMenu)closeTrackMenu();else showTrackMenu(trigger,trigger.dataset.trackMenu);return;}
 const item=e.target.closest('[data-menu-action]');
 if(item){e.stopImmediatePropagation();const action=item.dataset.menuAction,s=trackForMenu();closeTrackMenu();if(!s)return;
  if(action==='edit'){window.virhangOpenTrackEdit?.(s);return;}
  if(action==='delete'){window.virhangDeleteTrack?.(s);return;}
  if(action==='now'){choose(s);if(shuffleEnabled)nextShuffleOrder();}
  else if(action==='next'||action==='append')enqueueTrack(s,action==='next');
  else if(action==='playlist'){if(!requireLogin())return;openPlaylistAdd(s.id);}
  else if(action==='like'){if(!requireLogin())return;likes.has(s.id)?likes.delete(s.id):likes.add(s.id);localStorage.setItem(userDataKey('likes'),JSON.stringify([...likes]));window.virhangAuth?.saveLibrary({likes:[...likes],playlists});render();}
  else if(action==='favorite'){if(!requireLogin())return;if(!window.virhangAuth?.soopLinked){alert('SOOP 계정 연동 후 이용할 수 있어요.');return;}streamerFavs.has(s.singer)?streamerFavs.delete(s.singer):streamerFavs.add(s.singer);localStorage.setItem(userDataKey('streamers'),JSON.stringify([...streamerFavs]));renderStreamers();if(selectedNav==='my')renderLibrary();}
  else if(action==='artist'){runSearch(s.singer);}
  else if(action==='info'||action==='lyrics'){choose(s);expandedTab=action==='info'?'info':'lyrics';expandPlayer();updateExpandedPlayer();}
  else if(action==='share'){const link=s.video?'https://www.youtube.com/watch?v='+s.video:location.href;if(navigator.clipboard?.writeText)navigator.clipboard.writeText(link).then(()=>notice('공유 링크를 복사했어요.')).catch(()=>prompt('공유할 링크',link));else prompt('공유할 링크',link);}
  return;
 }
 if(!e.target.closest('#trackActionMenu'))closeTrackMenu();
},true);
function openPlaylistPickerForMenu(s){playlistSong=s.id;const picker=document.querySelector('#playlistAddDialog');document.querySelector('#playlistTargetLabel').textContent=s.title+' · '+s.singer;renderPlaylistPick();picker.showModal();}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeTrackMenu()});
window.addEventListener('scroll',closeTrackMenu,{passive:true,capture:true});
window.addEventListener('resize',closeTrackMenu);

/* Volume control bootstrap: video player created asynchronously */
(function(){const slider=document.getElementById('volumeRange'),mute=document.getElementById('volumeMute'),val=document.getElementById('volumeValue');if(!slider||!mute)return;let last=65;try{const saved=Number(localStorage.getItem('beohang-volume'));if(Number.isFinite(saved)&&saved>=0&&saved<=100)last=saved}catch{}slider.value=last;val.textContent=last+'%';mute.textContent=last?'🔊':'🔇';function apply(n){n=Number(n);slider.value=n;val.textContent=n+'%';mute.textContent=n?'🔊':'🔇';window.beohangYT?.setVolume(n);try{localStorage.setItem('beohang-volume',String(n))}catch{}}slider.addEventListener('input',()=>apply(slider.value));mute.addEventListener('click',e=>{e.stopPropagation();if(+slider.value){last=+slider.value;apply(0)}else apply(last||65)});setTimeout(()=>apply(slider.value),500)})();

// V2.0.8: playback timeline driven by the YouTube player API.
(()=>{
 const seek=document.getElementById('seekRange');
 const elapsed=document.getElementById('elapsedTime');
 const total=document.getElementById('totalTime');
 const bar=document.getElementById('playerTimeline');
 const time=document.getElementById('playerTime');
 let duration=0,dragging=false,started=false;
 const fmt=seconds=>{const n=Math.max(0,Math.floor(Number(seconds)||0));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0')};
 const update=(seconds,d)=>{
   duration=d;
   total.textContent=fmt(duration);
   seek.disabled=duration<=0;
   bar.hidden=!(started&&duration>0);
   time.hidden=!(started&&duration>0);
   if(!dragging){elapsed.textContent=fmt(seconds);seek.value=duration>0?String(Math.round(Math.min(1,seconds/duration)*1000)):'0'}
   seek.style.setProperty('--seek-pct',(duration>0?Number(seek.value)/10:0)+'%');
 };
 window.addEventListener('beohang:play-request',()=>{started=true});
 window.addEventListener('beohang:track-restored',()=>{started=false;bar.hidden=true;time.hidden=true;duration=0});
 window.addEventListener('beohang:progress',e=>{const {seconds,duration:d}=e.detail||{};update(seconds||0,d||0)});
 seek.addEventListener('pointerdown',()=>{dragging=true});
 seek.addEventListener('input',()=>{dragging=true;elapsed.textContent=fmt(Number(seek.value)*duration/1000);seek.style.setProperty('--seek-pct',Number(seek.value)/10+'%')});
 seek.addEventListener('change',()=>{if(duration>0)window.beohangYT?.seek(Number(seek.value)*duration/1000);dragging=false});
 seek.addEventListener('pointerup',()=>{dragging=false});
 document.getElementById('playerTimeline').addEventListener('click',e=>e.stopPropagation());
})();


/* V2.1.0 — remember the last track, play queue, shuffle state and resume timestamp.
   Nothing autoplays on page load; browser playback must be initiated by a click. */
const LISTENING_KEY='beohang_listening_v210';
let lastListeningSeconds=0;
let resumePendingSeconds=0;
let lastListeningPersistAt=0;
function saveListeningState(){
 if(!current)return;
 try{
  localStorage.setItem(LISTENING_KEY,JSON.stringify({
   id:current.id,queueIds:queue.map(x=>x.id),queueIndex,
   shuffleEnabled,shuffleOrder:[...shuffleOrder],shufflePosition,
   seconds:Math.max(0,Number(lastListeningSeconds)||0),
   mediaMode:expandedMediaMode,updatedAt:Date.now()
  }));
 }catch(err){console.warn('재생 기록 저장 실패',err)}
}
function recoverListeningState(){
 try{
  const raw=localStorage.getItem(LISTENING_KEY);if(!raw)return;
  const data=JSON.parse(raw);if(!data||typeof data.id!=='string')return;
  const tracks=all().map(normalizeTrack);const byId=new Map(tracks.map(t=>[t.id,t]));
  const saved=byId.get(data.id);if(!saved)return;
  queue=Array.isArray(data.queueIds)?data.queueIds.map(id=>byId.get(id)).filter(Boolean):[];
  queueIndex=queue.findIndex(t=>t.id===saved.id);
  if(queueIndex<0)queueIndex=-1;
  shuffleEnabled=data.shuffleEnabled===true;
  shuffleOrder=Array.isArray(data.shuffleOrder)?data.shuffleOrder.filter(id=>byId.has(id)):[];
  shufflePosition=Number.isInteger(data.shufflePosition)?data.shufflePosition:-1;
  if(shufflePosition<0||shufflePosition>=shuffleOrder.length)shufflePosition=-1;
  expandedMediaMode=data.mediaMode==='video'?'video':'art';
  lastListeningSeconds=Number.isFinite(+data.seconds)?Math.max(0,+data.seconds):0;
  resumePendingSeconds=lastListeningSeconds;
  choose(saved,true);
  window.dispatchEvent(new Event('beohang:track-restored'));
  refreshShuffle();
  $('expandedPlayer').hidden=true;document.body.classList.remove('expanded-open');
  const t=Math.floor(lastListeningSeconds),minutes=Math.floor(t/60),secs=String(t%60).padStart(2,'0');
  $('elapsedTime').textContent=minutes+':'+secs;
  $('playerName').title='이전 재생곡 — ▶를 누르면 '+minutes+':'+secs+'부터 다시 재생합니다.';
 }catch(err){console.warn('이전 재생 기록 불러오기 실패',err)}
}
window.addEventListener('beohang:progress',e=>{
 if(!current)return;
 const seconds=Number(e.detail?.seconds),duration=Number(e.detail?.duration);
 if(!Number.isFinite(seconds)||seconds<0||!Number.isFinite(duration)||duration<=0)return;
 // Keep the restored resume point until playback really starts, then store live progress.
 if(resumePendingSeconds>0)return;
 lastListeningSeconds=seconds;
 if(Date.now()-lastListeningPersistAt>1800){lastListeningPersistAt=Date.now();saveListeningState()}
});
window.addEventListener('pagehide',saveListeningState);
recoverListeningState();

window.virhangCurrentTrack=()=>current;
