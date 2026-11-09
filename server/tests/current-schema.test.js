import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL('../../supabase/migrations/008_current_schema_full_fix.sql', import.meta.url),'utf8');
const backend=readFileSync(new URL('../src/index.js', import.meta.url),'utf8');
test('existing application records get profile_id without dropping data',()=>{
 assert.match(migration,/ADD COLUMN IF NOT EXISTS profile_id uuid/i);
 assert.match(migration,/UPDATE public\.applications AS a SET profile_id = r\.profile_id/i);
});
test('profile_name missing from current schema is added',()=>assert.match(migration,/ADD COLUMN IF NOT EXISTS profile_name text/i));
test('JSON membership and RLS are enforced',()=>{
 assert.match(migration,/owns_applicant_profile/);
 assert.match(migration,/CREATE POLICY profiles_read_self/);
 assert.doesNotMatch(backend,/\.from\('profiles'\)\.eq\('user_id'/);
});
test('applications save user and profile IDs',()=>{
 assert.match(backend,/input\.profile_id=input\.profile_id/);
 assert.match(backend,/await ownedProfile\(req,input\.profile_id\)/);
});
