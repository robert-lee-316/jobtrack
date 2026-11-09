import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const api=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const sql=readFileSync(new URL('../../supabase/migrations/004_match_visualized_schema.sql',import.meta.url),'utf8');
test('application links to resume id',()=>{assert.match(api,/resume_id:uuid\.nullable/);assert.match(api,/resumes:resume_id/);assert.match(sql,/applications_resume_id_fkey/)});
test('resume upload records profile id',()=>{assert.match(api,/profile_id:profileId/);assert.match(api,/\.eq\('profile_id',profileId\)\.eq\('name',name\)/);assert.match(api,/\.insert\(record\)/);assert.doesNotMatch(api,/\.upsert\(/);assert.match(sql,/resumes_profile_id_fkey/)});
test('API does not write outdated resume name',()=>{assert.doesNotMatch(api,/input\.resume_name/);});

const profilesSql=readFileSync(new URL('../../supabase/migrations/007_profiles_json_membership.sql',import.meta.url),'utf8');
test('profile ownership is determined from users.profiles JSON',()=>{
 assert.match(api,/account\.ids\.includes\(id\)/);
 assert.doesNotMatch(api,/from\('profiles'\)[^;]*eq\('user_id'/);
 assert.match(profilesSql,/json_array_elements_text/);
 assert.match(profilesSql,/DROP COLUMN IF EXISTS user_id/i);
});
test('profile creation and deletion are atomic RPC operations',()=>{
 assert.match(api,/rpc\('create_applicant_profile'/);
 assert.match(api,/rpc\('delete_applicant_profile'/);
 assert.match(profilesSql,/CREATE OR REPLACE FUNCTION public\.create_applicant_profile/);
 assert.match(profilesSql,/CREATE OR REPLACE FUNCTION public\.delete_applicant_profile/);
});
test('resume and application still validate profile membership',()=>{
 assert.match(api,/await ownedProfile\(req,input\.profile_id\)/);
});

test('current schema does not require profiles.user_id or users.profiles_id',()=>{
 assert.doesNotMatch(api,/\.select\('profiles,profiles_id'\)/);
 assert.doesNotMatch(profilesSql,/FROM public\.profiles p WHERE p\.user_id/);
 assert.doesNotMatch(profilesSql,/INSERT INTO public\.users \(id,email,level,profiles_id,profiles\)/);
 assert.match(profilesSql,/account_row\.profiles->>0/);
});
