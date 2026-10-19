/* virhang V2.2 - SOOP OAuth verification only. Not a user session. */
(()=>{
 'use strict';
 const CLIENT_ID='8ad9317ab62d6fdf44435b04d95614c7';
 const CALLBACK='https://yeon0903.github.io/beohang-test/auth/callback.html';
 const STATE_KEY='virhang_soop_oauth_state';
 const status=document.getElementById('soopTestStatus');
 const btn=document.getElementById('soopTestLogin');
 if(!btn)return;
 btn.addEventListener('click',()=>{
   if(!window.crypto?.getRandomValues){status.textContent='보안 연결(HTTPS)에서 다시 시도해 주세요.';return;}
   const data=new Uint8Array(24);crypto.getRandomValues(data);
   const state=Array.from(data,b=>b.toString(16).padStart(2,'0')).join('');
   sessionStorage.setItem(STATE_KEY,state);
   const url=new URL('https://openapi.sooplive.com/auth/code');
   url.searchParams.set('client_id',CLIENT_ID);
   url.searchParams.set('state',state);
   // Official SOOP documentation must confirm whether state is returned.
   // If not returned, callback deliberately refuses to exchange the code.
   status.textContent='SOOP 인증 페이지로 이동하고 있어요…';
   location.assign(url.toString());
 });
 const result=new URLSearchParams(location.search).get('soop_test');
 if(result){
   status.textContent=result==='ok'?'SOOP 계정 인증에 성공했어요! 현재는 연동 테스트 단계라 버항 회원 로그인 상태는 아직 만들어지지 않았어요.':result==='state'?'인증 검증값(state)이 돌아오지 않았어요. SOOP 연동 방식 확인이 필요해요.':'SOOP 인증을 확인하지 못했어요. 인증 페이지 안내를 확인해 주세요.';
   document.getElementById('accountModal')?.showModal();
   const clean=new URL(location.href);clean.searchParams.delete('soop_test');history.replaceState({},'',clean);
 }
})();
