import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/013_user_members.sql', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');

test('users.members is a JSON array maintained by account level', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS members json/i);
  assert.match(migration, /json_typeof\(members\) = 'array'/);
  assert.match(migration, /level IN \('user', 'manager', 'admin'\)/);
  assert.match(migration, /json_build_array\(account\.id::text\)/);
  assert.match(migration, /WHERE other\.id <> account\.id/);
  assert.match(migration, /WHEN 'manager'/);
  assert.match(migration, /WHERE account\.id IS NOT NULL/g);
  assert.equal((migration.match(/UPDATE public\.users AS account/g) || []).length, 2);
  assert.match(migration, /A manager members list must contain several user ids/);
  assert.match(backend, /profiles,members,created_at/);
  const workspace = readFileSync(new URL('../../supabase/migrations/014_member_workspace.sql', import.meta.url), 'utf8');
  assert.match(workspace, /caller\.id = public\.request_user_id\(\)/);
  assert.match(workspace, /membership\.member_id/);
  const names = readFileSync(new URL('../../supabase/migrations/015_user_full_name.sql', import.meta.url), 'utf8');
  assert.match(names, /ADD COLUMN IF NOT EXISTS full_name text/i);
  assert.match(names, /'full_name', account\.full_name/);
  assert.match(names, /WHERE public\.users\.id = EXCLUDED\.id/);
  const goal = readFileSync(new URL('../../supabase/migrations/016_daily_goal.sql', import.meta.url), 'utf8');
  assert.match(goal, /ALTER TABLE public\.profiles ADD COLUMN IF NOT EXISTS daily_goal integer NOT NULL DEFAULT 100/i);
  assert.match(goal, /daily_goal IN \(0, 25, 50, 75, 100, 125\)/);
  assert.match(goal, /set_daily_goal\(target_profile uuid, next_goal integer\)/);
  assert.match(goal, /DROP FUNCTION IF EXISTS public\.set_daily_goal\(integer\)/);
  assert.match(goal, /'daily_goal', profile\.daily_goal/);
  assert.match(goal, /WHERE id = target_profile/);
  assert.match(backend, /\/api\/daily-goal/);
});
