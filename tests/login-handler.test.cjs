const {describe,test}=require('node:test');const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');const {stripTypeScriptTypes}=require('node:module');const vm=require('node:vm');
const path=require('node:path');const {pathToFileURL}=require('node:url');
const file=path.resolve(__dirname,'../supabase/functions/virhang-username-login/index.ts');
async function handlerFixture({environment='production',policy,limit=true,policyError=null}={}){
 const {acceptsLoginPolicy}=await import(pathToFileURL(path.join(path.dirname(file),'login-policy.mjs')));
 const calls=[];let handler;
 const service={rpc:async name=>{calls.push(name);return name==='virhang_login_policy'?{data:policy,error:policyError}:{data:limit,error:null};},from:()=>{throw new Error('Credential lookup must not occur after denied security check');}};
 const context={Request,Response,TextEncoder,URL,console:{error(){}},acceptsLoginPolicy,
 createClient:()=>service,Deno:{env:{get:key=>({VIRHANG_ENV:environment,VIRHANG_SITE_ORIGIN:'https://virhang.invalid'})[key]||'fixture-only'},serve:fn=>{handler=fn;}}};
 const code=stripTypeScriptTypes(readFileSync(file,'utf8').replace(/^import .*;\n/gm,''));
 vm.runInNewContext(code,context,{filename:file});
 const response=await handler(new Request('https://functions.invalid/login',{method:'POST',headers:{origin:'https://virhang.invalid','content-type':'application/json'},body:JSON.stringify({username:'viewer',password:'fixture-only'})}));
 return {response,calls};
}
describe('real login handler mocked at network boundary',()=>{
 const good={environment:'production',developer_bypass:false,limiter_integrity:true,privileged_accounts_limited:true};
 test('production refuses a staging policy before credential lookup',async()=>{
  const r=await handlerFixture({policy:{...good,environment:'staging',developer_bypass:true}});assert.equal(r.response.status,503);assert.deepEqual(r.calls,['virhang_login_policy']);
 });
 test('missing or overwritten limiter fails closed',async()=>{
  for(const policy of [null,{...good,limiter_integrity:false}]){const r=await handlerFixture({policy});assert.equal(r.response.status,503);}
 });
 test('DB policy query errors fail closed',async()=>{const r=await handlerFixture({policyError:{message:'fixture'}});assert.equal(r.response.status,503);});
 test('validated policy still enforces denied account attempts',async()=>{
  const r=await handlerFixture({policy:good,limit:false});assert.equal(r.response.status,429);assert.deepEqual(r.calls,['virhang_login_policy','virhang_check_login_limit']);
 });
});
