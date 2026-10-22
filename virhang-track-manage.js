/* Public-track editing and deleting. Server-side RLS remains authoritative. */
(()=>{'use strict';
const $=id=>document.getElementById(id);let editing=null;
const client=()=>window.virhangAuth?.getClient?.();
function restore(){editing=null;const head=$('addForm')?.querySelector('.modal-head h2'), btn=$('addForm')?.querySelector('[type="submit"]');if(head)head.textContent='🐚 새 노래 등록';if(btn)btn.textContent='전체 공개로 등록하기';}
window.virhangOpenTrackEdit=async track=>{
 if(!window.virhangCanManageTrack?.(track.id)){alert('관리 권한이 없습니다.');return;}
 const {data,error}=await client().from('virhang_published_tracks').select('*').eq('id',track.id).single();
 if(error||!data){alert('수정할 곡 정보를 불러오지 못했어요.');return;}
 editing=data.id;
 $('newTitle').value=data.title;$('newSinger').value=data.singer;$('newAlbum').value=data.album||'';
 $('newUrl').value=data.source_url;$('newArtworkUrl').value=data.artwork_url||'';
 $('newGenre').value=data.genre;$('newType').value=data.song_type;
 $('newDescription').value=data.description||'';$('newLyrics').value=data.lyrics||'';$('newOriginalUrl').value=data.original_url||'';
 document.querySelectorAll('input[name="detailGenre"]').forEach(c=>c.checked=(data.details||[]).includes(c.value));
 $('newArtworkFile').value='';$('addForm').querySelector('.modal-head h2').textContent='✎ 노래 수정';$('addForm').querySelector('[type="submit"]').textContent='수정 내용 저장';
 $('modal').showModal();
};
window.virhangDeleteTrack=async track=>{
 if(!window.virhangCanManageTrack?.(track.id))return alert('관리 권한이 없습니다.');
 if(!confirm(`「${track.title}」 노래를 삭제할까요?\n곡이 숨겨지지만 기록은 보존돼요. 복구는 관리자에게 문의해 주세요.`))return;
 const {error}=await client().from('virhang_published_tracks').update({is_deleted:true,deleted_at:new Date().toISOString()}).eq('id',track.id);
 if(error){alert('삭제 실패: '+error.message);return;}
 await window.virhangRefreshShared?.();alert('노래가 삭제됐습니다.');
};
$('modal').addEventListener('close',restore);
$('addForm').addEventListener('submit',async e=>{
 if(!editing)return;
 e.preventDefault();e.stopImmediatePropagation();
 const media=window.virhangMedia?.parse($('newUrl').value);if(!media)return alert('영상 URL 형식을 확인해 주세요.');
 const file=$('newArtworkFile').files?.[0];if(file)return alert('이미지 파일 직접 업로드는 아직 지원되지 않아요. 이미지 주소를 이용해 주세요.');
 let artwork=$('newArtworkUrl').value.trim();
 if(artwork&&!/^https:\/\//i.test(artwork))return alert('앨범 이미지 주소는 https로 시작해야 해요.');
 if(!artwork&&media.platform==='youtube')artwork=`https://i.ytimg.com/vi/${media.video}/hqdefault.jpg`;
 const changes={title:$('newTitle').value.trim(),singer:$('newSinger').value.trim(),album:$('newAlbum').value.trim(),source_url:media.url,platform:media.platform,artwork_url:artwork,genre:$('newGenre').value,details:[...document.querySelectorAll('input[name="detailGenre"]:checked')].map(c=>c.value),song_type:$('newType').value,description:$('newDescription').value.trim(),lyrics:$('newLyrics').value.trim(),original_url:$('newOriginalUrl').value.trim(),updated_at:new Date().toISOString()};
 const btn=$('addForm').querySelector('[type="submit"]');btn.disabled=true;
 try{const {error}=await client().from('virhang_published_tracks').update(changes).eq('id',editing);if(error)throw error;
 $('modal').close();await window.virhangRefreshShared?.();alert('수정 내용을 저장했어요.');}
 catch(err){alert('수정 실패: '+err.message)}finally{btn.disabled=false;}
 },true);
})();
