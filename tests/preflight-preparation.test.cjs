const {test,describe}=require('node:test');const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');const {fixture,sql}=require('./helpers/security-db.cjs');
describe('staging preparation; no external DB',()=>{
 test('read-only catalog inventory runs without revealing member rows',async()=>{
  const f=await fixture();try{
   const result=await f.db.exec(sql('supabase/verification/security_preflight_03.sql'));
   const text=JSON.stringify(result);
   assert.ok(text.includes('virhang_users'));assert.ok(text.includes('security_definer'));
   assert.ok(!text.includes('fixture-only'));assert.ok(!text.includes('비공개'));
  }finally{await f.db.close();}
 });
 test('an empty Supabase-like public schema cannot bootstrap from existing admin SQL',async()=>{
  const db=new PGlite();try{
   await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;');
   await assert.rejects(()=>db.exec(sql('V2.6.8_ADMIN_STREAMER_SETUP.sql')),e=>e.code==='42P01'&&e.message.includes('virhang_users'));
  }finally{await db.close();}
 });
 test('patch 001 explicitly stops when baseline functions are missing',async()=>{
  const db=new PGlite();try{
   await assert.rejects(()=>db.exec(sql('supabase/migrations/202610230001_admin_null_guards.sql')),e=>e.message.includes('Missing prerequisite functions'));
  }finally{await db.close();}
 });
});
