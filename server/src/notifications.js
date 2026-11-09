import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../data/notifications/', import.meta.url));
const week = 7 * 24 * 60 * 60 * 1000;
const validId = id => /^[a-z0-9-]{1,64}$/i.test(id);
export function createInbox(base = root) {
  function folder(user) {
    if (!validId(user)) throw new Error('Invalid account');
    return join(base, user);
  }
  async function send(user, source, message) {
    const dir = folder(user);
    await mkdir(dir, { recursive: true });
    const id = randomUUID();
    const entry = { id, source, message, createdAt: new Date().toISOString() };
    await writeFile(join(dir, id + '.tmp'), JSON.stringify(entry));
    await rename(join(dir, id + '.tmp'), join(dir, id + '.json'));
    return entry;
  }
  async function list(user, now = Date.now()) {
    const dir = folder(user);
    await mkdir(dir, { recursive: true });
    const welcome = join(dir, 'welcome');
    try { await writeFile(welcome, '', { flag: 'wx' }); }
    catch (err) { if (err.code !== 'EEXIST') throw err; }
    const names = await readdir(dir);
    const entries = await Promise.all(names.filter(n => n === 'welcome' || n.endsWith('.json')).map(async n => {
      try {
        const path = join(dir, n);
        const entry = n === 'welcome'
          ? { id: 'welcome', source: 'System', message: 'Welcome to your JobTrack notification inbox.', createdAt: (await stat(path)).mtime.toISOString() }
          : JSON.parse(await readFile(path, 'utf8'));
        if (Date.parse(entry.createdAt) <= now - week) {
          if (n !== 'welcome') await rm(path, { force: true });
          await rm(join(dir, entry.id + '.read'), { force: true });
          return null;
        }
        return { ...entry, read: names.includes(entry.id + '.read') };
      } catch (err) { if (err.code === 'ENOENT') return null; throw err; }
    }));
    return entries.filter(Boolean).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  }
  async function mark(user, ids) {
    const wanted = new Set(ids);
    const visible = await list(user);
    await Promise.all(visible.filter(n => wanted.has(n.id) && !n.read).map(n =>
      writeFile(join(folder(user), n.id + '.read'), '')));
  }
  return { list, mark, send };
}
