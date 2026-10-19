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
 const VERIFIED_KEY='virhang_soop_verified_test_v222';
 const result=new URLSearchParams(location.search).get('soop_test');
 const intro=document.querySelector('.vir-login-intro');
 const disclaimer=document.querySelector('.vir-login-disclaimer');
 const logout=document.createElement('button');
 logout.type='button';logout.className='outline full vir-soop-logout';
 logout.textContent='인증 기록 지우기 (테스트)';
 logout.hidden=true;
 status?.after(logout);
 function update(){
   const verified=sessionStorage.getItem(VERIFIED_KEY)==='yes';
   const entry=document.getElementById('accountEntry');
   if(entry && !sessionStorage.getItem('beohang_role_demo')){
     entry.textContent=verified?'SOOP 인증 확인됨 · 테스트':'SOOP 로그인';
   }
   btn.textContent=verified?'SOOP 다시 인증하기':'SOOP 계정으로 계속하기';
   logout.hidden=!verified;
   if(verified){
     if(intro)intro.textContent='SOOP 인증이 정상적으로 확인되었어요. 현재는 회원 식별·로그인 세션을 연결하기 전 테스트 단계예요.';
     if(disclaimer)disclaimer.textContent='이 상태는 이 브라우저 탭에만 임시 저장돼요. 서버 회원가입, 권한, 플레이리스트 저장과는 연결되지 않아요.';
     if(status && !status.textContent.trim())status.textContent='✓ SOOP 계정 인증 코드 교환 확인됨 (테스트)';
   }
 }
 logout.addEventListener('click',()=>{
   sessionStorage.removeItem(VERIFIED_KEY);
   status.textContent='이 브라우저의 SOOP 인증 테스트 기록을 지웠어요.';
   if(intro)intro.textContent='SOOP 계정으로 간편하게 버항을 이용해 보세요.';
   if(disclaimer)disclaimer.textContent='현재는 계정 연동 테스트 단계로, 인증 후에도 버항 회원 로그인이나 저장 기능은 활성화되지 않아요.';
   update();
 });
 if(result){
   if(result==='ok'){
     sessionStorage.setItem(VERIFIED_KEY,'yes');
     status.textContent='✓ SOOP 인증 코드 교환 성공! 계정별 회원 로그인은 아직 연결되지 않았어요.';
   }else if(result==='state'){
     status.textContent='보안 검증값(state)을 확인할 수 없어서 인증을 중단했어요.';
   }else{
     status.textContent='SOOP 인증을 확인하지 못했어요. 다시 시도해 주세요.';
   }
   document.getElementById('accountModal')?.showModal();
   const clean=new URL(location.href);
   clean.searchParams.delete('soop_test');
   history.replaceState({},'',clean);
 }
 update();
})();
