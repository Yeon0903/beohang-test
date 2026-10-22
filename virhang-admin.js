/* V2.6.8 Administrator UI. Privilege checks are enforced in database RPCs. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const open=$('virAdminOpen'), dialog=$('virAdminDialog');
const result=$('virStreamerResult');
let role='', pending=false;
const labels={viewer:'일반 회원',streamer:'스트리머',admin:'관리자',super_admin:'최고관리자'};
function client(){return window.virhangAuth?.getClient?.()}
async function sync(){
 open.hidden=true;role='';
 const auth=window.virhangAuth;
 if(!auth?.user||!client())return;
 const myId=auth.user.id;
 try{
  const {data,error}=await client().rpc('virhang_my_profile');
  if(error){console.warn('회원 권한 조회 실패: V2.6.8 SQL이 적용되었는지 확인하세요.');return;}
  if(window.virhangAuth?.user?.id!==myId)return;
  const mine=data?.[0];role=mine?.role||'';
  const member=document.getElementById('virAuthMember');
  if(member){const nodes=member.querySelectorAll('p');if(nodes[1])nodes[1].textContent='🐠 '+(labels[role]||'회원');}
  if(role==='admin'||role==='super_admin')open.hidden=false;
 }catch(err){console.warn('관리자 조회 오류:',err.message)}
}
open.addEventListener('click',()=>{if(role!=='admin'&&role!=='super_admin')return;result.textContent='등록된 버항 아이디를 조회해 주세요.';dialog.showModal()});
$('virAdminClose').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
$('virStreamerAdminForm').addEventListener('submit',e=>e.preventDefault());
async function action(type){
 if(pending)return;
 if(!['admin','super_admin'].includes(role)){result.textContent='관리자 권한이 필요합니다.';return;}
 const field=$('virStreamerUsername');if(!field.reportValidity())return;
 const username=field.value.trim();
 if(!/^[a-z0-9]{4,20}$/.test(username)){result.textContent='아이디 형식을 확인해 주세요.';return;}
 if(type==='revoke'&&!confirm(username+' 계정의 스트리머 권한을 해제할까요?'))return;
 if(type==='grant'&&!confirm(username+' 계정을 스트리머로 지정할까요?'))return;
 pending=true;
 const buttons=[$('virStreamerLookup'),$('virStreamerGrant'),$('virStreamerRevoke')];buttons.forEach(b=>b.disabled=true);
 result.textContent='처리 중...';
 try{
  const {data,error}=await client().rpc('virhang_admin_streamer_account',{p_username:username,p_action:type});
  if(error)throw error;
  const found=data?.[0];
  result.textContent=found?`${found.username} · ${found.display_name||'표시 이름 없음'} · 현재 권한: ${labels[found.role]||found.role}${type==='grant'?' (지정 완료)':type==='revoke'?' (해제 완료)':''}`:'회원 정보를 확인하지 못했습니다.';
 }catch(err){result.textContent='처리 실패: '+(err.message||'알 수 없는 오류')}
 finally{pending=false;buttons.forEach(b=>b.disabled=false)}
}
$('virStreamerLookup').addEventListener('click',()=>action('lookup'));
$('virStreamerGrant').addEventListener('click',()=>action('grant'));
$('virStreamerRevoke').addEventListener('click',()=>action('revoke'));
$('virArtistLinkForm')?.addEventListener('submit',async e=>{
 e.preventDefault();const output=$('virArtistResult');const artist=$('virArtistName').value.trim(),username=$('virArtistUsername').value.trim();
 if(!['admin','super_admin'].includes(role)){output.textContent='관리자 권한이 필요합니다.';return;}
 if(!confirm(`실제 활동명 ${artist}의 계정이 ${username}임을 확인했나요? 연결하면 이전 참여곡도 수정·삭제할 수 있습니다.`))return;
 const btn=$('virArtistLinkForm').querySelector('[type="submit"]');btn.disabled=true;output.textContent='연결 확인 중...';
 try{const {data,error}=await client().rpc('virhang_admin_link_artist',{p_artist_name:artist,p_username:username,p_action:'link'});if(error)throw error;output.textContent=data;window.virhangRefreshShared?.();}
 catch(err){output.textContent='연결 실패: '+(err.message||'오류');}finally{btn.disabled=false;}
});
$('virAdminSongDemo').addEventListener('click',()=>{dialog.close();$('add')?.click()});
window.addEventListener('virhang:session-changed',()=>{sync()});
})();
