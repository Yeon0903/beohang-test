// Catalog report only. Never connects to a database, executes migrations or reads user rows.
const fs=require('node:fs');const path=require('node:path');
const contract=require('../config/db-contract.json');
const lit=s=>"'"+s.replace(/'/g,"''")+"'";
function renderSQL(){
 const tables=[...Object.keys(contract.tables),...contract.optionalTables];
 const fns=Object.keys(contract.functions);
 const triggers=Object.entries(contract.triggers);
 return `-- Share only this single report cell. Catalog only: no rows, keys, settings values or function bodies.
-- Single SELECT so SQL Editor shows the report directly. All functions below are catalog readers.
WITH expected_tables(name) AS (VALUES ${tables.map(t=>'('+lit(t)+')').join(',')}),
expected_functions(signature,arg_names,return_shape) AS (VALUES ${fns.map(t=>'('+lit(t)+',ARRAY['+contract.arguments[t].map(lit).join(',')+']::text[],'+lit(contract.returns[t])+')').join(',')}),
expected_triggers(name,relation_name,function_signature,event_type) AS (VALUES ${triggers.map(([n,t])=>'('+lit(n)+','+lit(t)+','+lit(contract.triggerFunctions[n])+','+contract.triggerTypes[n]+')').join(',')})
SELECT jsonb_build_object('report_version',1,'scope','catalog-only',
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',e.name,'exists',c.oid IS NOT NULL,
  'rls',COALESCE(c.relrowsecurity,false),'force_rls',COALESCE(c.relforcerowsecurity,false),
  'columns',COALESCE((SELECT jsonb_object_agg(a.attname,CASE WHEN a.atttypid IN ('uuid'::regtype,'text'::regtype,'timestamptz'::regtype,'text[]'::regtype,'jsonb'::regtype,'boolean'::regtype,'integer'::regtype,'bigint'::regtype) THEN format_type(a.atttypid,a.atttypmod) ELSE 'other-type-review-privately' END) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND a.attname IN (${[...new Set(Object.values(contract.tables).flatMap(x=>Object.keys(x)))].map(lit).join(',')})),'{}'::jsonb),
  'primary_key',EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype='p'),
  'unique_username',EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=c.oid AND i.indisunique AND i.indisvalid AND i.indnatts=1 AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indkey[0]=(SELECT attnum FROM pg_attribute WHERE attrelid=c.oid AND attname='username')),
  'auth_user_fk',EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype='f' AND k.confrelid=to_regclass('auth.users') AND k.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.oid AND attname=CASE WHEN e.name='public.virhang_account_libraries' THEN 'user_id' ELSE 'id' END)]::smallint[]),
  'policy_count',(SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid),
  'restrictive_policy_count',(SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid AND NOT p.polpermissive),
  'authenticated_any_update',CASE WHEN c.oid IS NOT NULL THEN has_any_column_privilege('authenticated',c.oid,'UPDATE') ELSE false END,
  'anon_any_select',CASE WHEN c.oid IS NOT NULL THEN has_any_column_privilege('anon',c.oid,'SELECT') ELSE false END
 ) ORDER BY e.name) FROM expected_tables e LEFT JOIN pg_class c ON c.oid=to_regclass(e.name)),
 'functions',(SELECT jsonb_agg(jsonb_build_object('signature',e.signature,'exists',p.oid IS NOT NULL,
  'argument_names_compatible',COALESCE(COALESCE(p.proargnames[1:p.pronargs],ARRAY[]::text[])=e.arg_names,false),'return_shape_compatible',COALESCE(pg_get_function_result(p.oid)=e.return_shape,false),
  'security_definer',COALESCE(p.prosecdef,false),'empty_search_path',COALESCE('search_path=""'=ANY(p.proconfig),false),
  'other_settings_present',EXISTS(SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg NOT LIKE 'search_path=%'),
  'anon_execute',CASE WHEN p.oid IS NOT NULL THEN has_function_privilege('anon',p.oid,'EXECUTE') ELSE false END,
  'authenticated_execute',CASE WHEN p.oid IS NOT NULL THEN has_function_privilege('authenticated',p.oid,'EXECUTE') ELSE false END,
  'service_execute',CASE WHEN p.oid IS NOT NULL THEN has_function_privilege('service_role',p.oid,'EXECUTE') ELSE false END
 ) ORDER BY e.signature) FROM expected_functions e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('name',e.name,'exists',t.oid IS NOT NULL,'enabled',COALESCE(t.tgenabled IN ('O','A'),false),'function_compatible',COALESCE(t.tgfoid=to_regprocedure(e.function_signature),false),'events_compatible',COALESCE(t.tgtype=e.event_type,false)) ORDER BY e.name) FROM expected_triggers e LEFT JOIN pg_trigger t ON t.tgrelid=to_regclass(e.relation_name) AND t.tgname=e.name AND NOT t.tgisinternal),
 'manual_policy_review_required',true,'manual_function_body_review_required',true
) AS virhang_shareable_report;
`;
}
function compare(report){
 if(Array.isArray(report)&&report.length===1)report=report[0];
 if(report?.virhang_shareable_report)report=report.virhang_shareable_report;
 if(report?.report_version!==1||report.scope!=='catalog-only'||!Array.isArray(report.tables)||!Array.isArray(report.functions)||!Array.isArray(report.triggers))throw new Error('Invalid report format; copy the single JSON cell');
 const blockers=[],review=[];const tables=new Map(report.tables.map(t=>[t.name,t]));const funcs=new Map(report.functions.map(t=>[t.signature,t]));
 for(const [name,cols] of Object.entries(contract.tables)){
  const t=tables.get(name);if(!t?.exists){blockers.push('Missing table: '+name);continue;}
  for(const [col,type] of Object.entries(cols))if(t.columns?.[col]!==type)blockers.push(`Column/type mismatch: ${name}.${col} requires ${type}`);
  if(!t.rls)review.push('RLS disabled: '+name);
  if(!t.policy_count)review.push('No policy (may be intentional RPC-only): '+name);
 }
 for(const [signature,required] of Object.entries(contract.functions)){
  const f=funcs.get(signature);if(required&&!f?.exists)blockers.push('Missing prerequisite function: '+signature);
  if(f?.exists&&(!f.argument_names_compatible||!f.return_shape_compatible))blockers.push('Function argument names/return shape mismatch: '+signature);
  if(f?.exists&&!f.empty_search_path)review.push('Function search_path needs review: '+signature);
 }
 for(const name of ['virhang_v26_auth_signup_profile','virhang_song_singers_sync']){
  const t=report.triggers.find(x=>x.name===name);if(!t?.enabled||!t.function_compatible||!t.events_compatible)blockers.push('Missing/disabled/incompatible baseline trigger: '+name);
 }
 const users=tables.get('public.virhang_users');
 if(users?.exists&&(!users.primary_key||!users.unique_username||!users.auth_user_fk))blockers.push('Profile PK/username uniqueness/Auth FK needs reconciliation');
 if(users?.authenticated_any_update)review.push('Direct profile UPDATE privileges require patch 003/review');
 if(users?.anon_any_select)review.push('Anonymous profile column access must be reviewed');
 for(const t of ['public.virhang_tracks','public.virhang_usernames','public.virhang_playlists'])if(tables.get(t)?.exists)review.push('Additional legacy resource requires private RLS review: '+t);
 return {schemaPreconditions: blockers.length?'blocked':'catalog-compatible-only',blockers,review,
  readyToApply:false,reason:'Function signatures/bodies, policy predicates, live data compatibility, Edge and backup restore still need private verification. No changes applied.'};
}
if(require.main===module){
 if(process.argv[2]==='--write-sql')fs.writeFileSync(path.resolve(__dirname,'../supabase/verification/security_shareable_05.sql'),renderSQL());
 else try{console.log(JSON.stringify(compare(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))),null,2));}catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={renderSQL,compare};
