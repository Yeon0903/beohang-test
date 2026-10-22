/* virhang V2.5 - Username login via secured Supabase Edge Function. */
(()=>{
'use strict';
const SUPABASE_URL='https://hjvsbfphlnukmdkfbtsh.supabase.co';
// Only public publishable/anon key here. NEVER use service_role or secret keys in browser code.
const SUPABASE_PUBLISHABLE_KEY='PASTE_SUPABASE_PUBLISHABLE_KEY_HERE';
const $=id=>document.getElementById(id);
const app={user:null,soopLinked:false,saveLibrary,getClient:()=>client};window.virhangAuth=app;
let client=null,saveSequence=Promise.resolve(),pendingEmail=null,view='login';
const OTP_DISPLAY_SECONDS=180;
let otpExpiresAt=0,otpTimerId=null,resendBusy=false,previewMode=false;
function stopOtpTimer(){if(otpTimerId!==null){clearInterval(otpTimerId);otpTimerId=null;}}
function updateOtpTimer(){
 const remaining=Math.max(0,Math.ceil((otpExpiresAt-Date.now())/1000));
 const clock=$('virOtpTimer');
 clock.textContent=`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;
 clock.classList.toggle('expired',remaining===0);
 $('virVerifySubmit').disabled=remaining===0;
 if(remaining===0){stopOtpTimer();if(view==='verify')report('입력 제한시간이 지났어요. 인증번호 재발급을 눌러 주세요.');}
}
function startOtpTimer(){stopOtpTimer();otpExpiresAt=Date.now()+OTP_DISPLAY_SECONDS*1000;updateOtpTimer();otpTimerId=setInterval(updateOtpTimer,1000);}

function report(msg){$('virAuthMessage').textContent=msg;}
function validPassword(value){return value.length>=8&&value.length<=128&&/[a-z]/.test(value)&&/[0-9]/.test(value)&&/^[a-z0-9!-/:-@[-`{-~]+$/.test(value);}
function setView(next){
 view=next;
 const login=next==='login',signup=next==='signup',verify=next==='verify';
 if(!verify)stopOtpTimer();
 $('virLoginScreen').hidden=!login;
 $('virSignupScreen').hidden=!signup;
 $('virVerifyForm').hidden=!verify;
 $('virSignupStep').hidden=!verify;
 $('virAccountTitle').textContent=login?'🐠 버항 로그인':signup?'🐠 버항 회원가입':'🐠 이메일 인증';
 if(!verify){previewMode=false;$('virPreviewNotice').hidden=true;$('virVerifyIntro').textContent='회원가입을 완료하려면 이메일 인증을 진행해 주세요.';}
 report('');
}
function present(){
 $('virAuthGuest').hidden=!!app.user;$('virAuthMember').hidden=!app.user;
 const username=app.user?.user_metadata?.username;
 $('virMemberEmail').textContent=app.user?'로그인: '+(username||'버항 회원'):'';
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
 const before=app.user?.id||null;app.user=session?.user||null;present();
 if(app.user&&app.user.id!==before)await loadLibrary();
}
function ready(){
 setView('login');
 $('virGoSignup').addEventListener('click',()=>setView('signup'));
 $('virBackToLogin').addEventListener('click',()=>setView('login'));
 $('virBack').addEventListener('click',()=>{pendingEmail=null;setView('signup');});
 $('virPreviewOtp').addEventListener('click',()=>{
  if(view!=='signup')return;
  pendingEmail=null;setView('verify');previewMode=true;$('virPreviewNotice').hidden=false;
  $('virVerifyIntro').textContent='회원가입 · 이메일 인증 화면을 미리 체험해 보세요.';
  $('virOtp').value='';startOtpTimer();report('미리보기 모드에서는 이메일을 보내지 않으며 실제 인증도 진행하지 않아요.');
 });
 $('virAuthForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!client){report('Supabase 연결 설정을 확인해 주세요.');return;}if(!$('virAuthForm').reportValidity())return;
  const username=$('virUsername').value.trim(),password=$('virPassword').value;
  if(!/^[a-z0-9]{4,20}$/.test(username)){report('아이디는 영문 소문자와 숫자 4~20자여야 해요.');return;}
  $('virSubmit').disabled=true;
  try{
    // Never resolve username -> email in browser or via an openly accessible RPC.
    const {data,error}=await client.functions.invoke('virhang-username-login',{body:{username,password}});
    if(error||!data?.access_token||!data?.refresh_token){report('로그인 실패: 아이디 또는 비밀번호를 확인해 주세요. 서버 함수가 배포되어 있는지도 확인해 주세요.');return;}
    const result=await client.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token});
    report(result.error?'세션 설정 실패: '+result.error.message:'로그인했어요!');
  }catch(err){report('요청 중 오류: '+err.message);}finally{$('virSubmit').disabled=false;}
 });
 $('virSignupForm').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!client){report('Supabase 연결 설정을 확인해 주세요. 미리보기 기능은 사용할 수 있어요.');return;}
  if(!$('virSignupForm').reportValidity())return;
  const username=$('virSignupUsername').value.trim(),password=$('virSignupPassword').value,email=$('virEmail').value.trim();
  if(!/^[a-z0-9]{4,20}$/.test(username)){report('아이디는 영문 소문자와 숫자 4~20자여야 해요.');return;}
  if(!validPassword(password)){report('비밀번호는 8~128자, 영문 소문자와 숫자를 각각 포함해야 해요.');return;}
  if(password!==$('virPasswordConfirm').value){report('비밀번호 확인이 일치하지 않아요.');return;}
  const button=$('virSignupSubmit');button.disabled=true;
  try{
   const {data,error}=await client.auth.signUp({email,password,options:{data:{username}}});
   if(error){
    const m=error.message||'';
    if(/rate limit|too many requests|over_email_send_rate_limit/i.test(m))report('인증 메일 발송 제한에 도달했어요. 잠시 기다린 뒤 다시 시도해 주세요.');
    else if(/username|duplicate key|already exists/i.test(m))report('아이디 또는 이메일이 이미 사용 중일 수 있어요.');
    else report('회원가입 요청 실패: '+m);
    return;
   }
   if(data.session){await client.auth.signOut();report('가입 요청이 접수됐어요. 이메일 인증 설정을 확인해 주세요.');return;}
   pendingEmail=email;setView('verify');startOtpTimer();report('이메일 발송을 요청했어요. 6자리 인증에는 Supabase 인증번호 메일 템플릿 설정이 필요해요.');
  }catch(error){report('요청 중 오류: '+error.message);}finally{button.disabled=false;}
 });
 $('virResendOtp').addEventListener('click',async()=>{
  if(previewMode){$('virOtp').value='';startOtpTimer();report('미리보기: 타이머가 3분으로 초기화됐어요. 실제 메일은 발송하지 않았어요.');return;}
  if(!client){report('Supabase 연결 설정을 확인해 주세요.');return;}
  if(!pendingEmail){report('가입부터 다시 진행해 주세요.');return;}
  if(resendBusy)return;
  resendBusy=true;const button=$('virResendOtp');button.disabled=true;
  try{
   const {error}=await client.auth.resend({type:'signup',email:pendingEmail});
   if(error){report(/rate limit|too many requests/i.test(error.message||'')?'재발급 제한에 도달했어요. 조금 기다린 뒤 다시 시도해 주세요.':'재발급 실패: '+error.message);return;}
   $('virOtp').value='';startOtpTimer();
   report('인증 이메일을 다시 요청했어요. 제한시간이 3분으로 초기화됐어요. (인증번호 템플릿 설정 필요)');
  }catch(error){report('재발급 중 오류: '+error.message);}
  finally{resendBusy=false;button.disabled=false;}
 });
 $('virVerifyForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!client&&!previewMode){report('Supabase 연결 설정을 확인해 주세요.');return;}if(previewMode){report('미리보기에서는 인증을 완료할 수 없어요. 실제 인증은 SMTP와 OTP 메일 설정 후 가능해요.');return;}if(!pendingEmail){report('가입부터 다시 진행해 주세요.');return;}
  if(Date.now()>=otpExpiresAt){updateOtpTimer();return;}
  const token=$('virOtp').value.trim();if(!/^[0-9]{6}$/.test(token)){report('6자리 인증번호를 입력해 주세요.');return;}
  const {error}=await client.auth.verifyOtp({email:pendingEmail,token,type:'signup'});
  if(error){report('인증 실패: 번호 또는 유효기간을 확인해 주세요.');return;}
  pendingEmail=null;stopOtpTimer();await client.auth.signOut();setView('login');report('이메일 인증이 완료됐어요! 아이디로 로그인할 수 있어요.');
 });
 $('virSignOut').addEventListener('click',async()=>{if(!client){report('Supabase 연결 설정을 확인해 주세요.');return;}const {error}=await client.auth.signOut();if(error)report('로그아웃 실패: '+error.message);});
 if(!window.supabase?.createClient){report('인증 라이브러리를 불러오지 못했어요. 새로고침해 주세요.');return;}
 if(SUPABASE_PUBLISHABLE_KEY.includes('PASTE_')){report('관리자 설정 필요: virhang-auth.js에 Supabase 공개 키를 입력해 주세요.');return;}
 client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
 client.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>handleSession(session),0);});
 client.auth.getSession().then(({data})=>handleSession(data.session)).catch(e=>report(e.message));
}
ready();
})();
