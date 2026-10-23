// Real handlers, real local SQL RPCs; Supabase Auth/network boundary uses synthetic accounts only.
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');const {pathToFileURL}=require('node:url');
async function callLogin(f,{legacy=false,environment='staging',password='rehearsal-only',username='viewer',enforceServiceLookup=false,emailConfirmed=true}={}){
 const calls=[];let handler;
 const {acceptsLoginPolicy}=await import(pathToFileURL(path.resolve(__dirname,'../../supabase/functions/virhang-username-login/login-policy.mjs')));
 const service={
  rpc:async(name,args)=>{
   calls.push(name);
   try{
    const result=await f.actor('service_role',null,()=>f.db.query(`SELECT public.${name}(${args?'$1':''}) AS value`,args?[args.p_username]:[]));
    return {data:result.rows[0].value,error:null};
   }catch(e){return {data:null,error:{message:e.code}};}
  },
  from:()=>({select:()=>({eq:(_,name)=>({maybeSingle:async()=>{
   calls.push('profile_lookup');
   const lookup=()=>f.db.query('SELECT id FROM public.virhang_users WHERE username=$1',[name]);
   const r=enforceServiceLookup?await f.actor('service_role',null,lookup):await lookup();return {data:r.rows[0]||null,error:null};
  }})})}),
  auth:{admin:{getUserById:async id=>({data:{user:{id,email:'rehearsal@example.invalid',email_confirmed_at:emailConfirmed?'2020-01-01':null}},error:null})}}
 };
 const auth={auth:{signInWithPassword:async()=>password==='rehearsal-only'?{data:{user:{id:f.users.viewer},session:{access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600,token_type:'bearer'}},error:null}:{data:{session:null},error:{message:'invalid'}}}};
 const source=legacy?path.resolve(__dirname,'../fixtures/username-login-before-policy.ts'):path.resolve(__dirname,'../../supabase/functions/virhang-username-login/index.ts');
 let clients=0;
 vm.runInNewContext(stripTypeScriptTypes(fs.readFileSync(source,'utf8').replace(/^import .*;\n/gm,'')),{
  Request,Response,TextEncoder,acceptsLoginPolicy,console:{error(){}},
  createClient:()=>clients++===0?service:auth,
  Deno:{env:{get:key=>({VIRHANG_ENV:environment,VIRHANG_SITE_ORIGIN:'https://rehearsal.invalid'})[key]||'synthetic'},serve:fn=>{handler=fn;}}
 },{filename:source});
 const response=await handler(new Request('https://functions.invalid/login',{method:'POST',headers:{origin:'https://rehearsal.invalid','content-type':'application/json'},body:JSON.stringify({username,password})}));
 // Never persist/print response bodies or synthetic tokens.
 return {status:response.status,calls};
}
module.exports={callLogin};
