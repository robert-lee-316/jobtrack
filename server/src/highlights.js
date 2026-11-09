import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {z} from 'zod';

const directory = fileURLToPath(new URL('../data/highlights/', import.meta.url));
const defaults = {keywords: [], background: '#ffe49c', foreground: '#251e12', underline: false};
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const schema = z.object({
  keywords: z.array(z.string().trim().min(1).max(100)).max(100),
  background: color, foreground: color, underline: z.boolean()
}).strict();

export function registerHighlights(app, wrap, base = directory) {
  const pathFor = id => join(base, z.string().uuid().parse(id) + '.json');
  app.get('/api/highlights', wrap(async (req, res) => {
    let data;
    try {data = JSON.parse(await readFile(pathFor(req.user.id), 'utf8'));}
    catch (e) {if (e.code !== 'ENOENT') throw e; data = defaults;}
    res.set('Cache-Control', 'no-store').json(data);
  }));
  app.put('/api/highlights', wrap(async (req, res) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return res.status(400).json({error:'Use up to 100 keywords of 1–100 characters and valid highlight colors.'});
    const data = result.data;
    const seen = new Set();
    data.keywords = data.keywords.filter(word => {
      const key = word.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    const path = pathFor(req.user.id), temp = path + '.' + randomUUID();
    await mkdir(base, {recursive:true});
    await writeFile(temp, JSON.stringify(data), {mode:0o600});
    await rename(temp, path);
    res.json(data);
  }));
}
