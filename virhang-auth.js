/* virhang V2.4 Supabase Auth / per-account library. */
(()=>{
'use strict';
const SUPABASE_URL='https://hjvsbfphlnukmdkfbtsh.supabase.co';
// Paste only the PUBLIC publishable/anon key from Supabase -> API Keys.
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_5jKogXuaVT4eC_pASvakVg_JD7p469i';
const $=id=>document.getElementById(id);
const app={user:null,soopLinked:false,saveLibrary};window.virhangAuth=app;
let client=null,saveSequence=Promise.resolve();
function report(message){$('virAuthMessage').textContent=message;}
function present(){
 $('virAuthGuest').hidden=!!app.user;$('virAuthMember').hidden=!app.user;
 $('virMemberEmail').textContent=app.user?'로그인: '+app.user.email:'';
 window.dispatchEvent(new Event('virhang:session-changed'));
}
async function loadLibrary(){
 if(!app.user)return;
 const {data,error}=await client.from('virhang_account_libraries').select('likes,playlists').eq('user_id',app.user.id).maybeSingle();
 if(error){report('저장된 목록을 가져오지 못했어요: '+error.message);return;}
 window.dispatchEvent(new CustomEvent('virhang:library-loaded',{detail:{likes:data?.likes||[],playlists:data?.playlists||[]}}));
}
async function saveLibrary(content){
 if(!app.user||!client)return;
 const id=app.user.id;
 saveSequence=saveSequence.then(async()=>{
  if(app.user?.id!==id)return;
  const {error}=await client.from('virhang_account_libraries').upsert({user_id:id,likes:content.likes,playlists:content.playlists,updated_at:new Date().toISOString()},{onConflict:'user_id'});
  if(error)report('개인 목록 서버 저장 실패: '+error.message);
 }).catch(e=>report('저장 오류: '+e.message));
 return saveSequence;
}
async function handleSession(session){
 const before=app.user?.id||null;
 app.user=session?.user||null;
 present();
 if(app.user && app.user.id!==before)await loadLibrary();
}
function ready(){
 if(!window.supabase?.createClient){report('인증 라이브러리를 불러오지 못했어요. 새로고침해 주세요.');return;}
 if(SUPABASE_PUBLISHABLE_KEY.includes('PASTE_')){report('관리자 설정 필요: virhang-auth.js에 Supabase 공개 키를 입력해 주세요.');return;}
 client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
 client.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>handleSession(session),0)});
 client.auth.getSession().then(({data})=>handleSession(data.session)).catch(e=>report(e.message));
 $('virAuthForm').addEventListener('submit',async e=>{
  e.preventDefault();const email=$('virEmail').value.trim(),password=$('virPassword').value;
  const {error}=await client.auth.signInWithPassword({email,password});
  report(error?'로그인 실패: '+error.message:'로그인했어요!');
 });
 $('virSignUp').addEventListener('click',async()=>{
  if(!$('virAuthForm').reportValidity())return;
  const email=$('virEmail').value.trim(),password=$('virPassword').value;
  const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});
  report(error?'회원가입 실패: '+error.message:(data.session?'회원가입과 로그인이 완료됐어요!':'가입 확인 이메일을 보냈어요. 이메일 인증 후 로그인해 주세요.'));
 });
 $('virSignOut').addEventListener('click',async()=>{
  const {error}=await client.auth.signOut();if(error)report('로그아웃 실패: '+error.message);
 });
}
ready();
})();
