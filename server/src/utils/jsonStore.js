// Reusable JSON file storage (no database). Atomic writes + per-file lock queue.
const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../../data');
const locks = new Map();

function withLock(file, fn) {
  const prev = locks.get(file) || Promise.resolve();
  const next = prev.then(() => fn());
  locks.set(file, next.catch(() => {}));
  return next;
}
const fp = (file) => path.join(DATA_DIR, file);

async function readData(file) {
  try {
    const raw = await fs.readFile(fp(file), 'utf8');
    if (!raw.trim()) return [];
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    if (e instanceof SyntaxError) {
      console.error(`[store] ${file} is corrupted, moving aside`);
      await fs.rename(fp(file), fp(file) + '.corrupt-' + Date.now()).catch(() => {});
      return [];
    }
    throw e;
  }
}
async function writeRaw(file, data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = fp(file) + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, fp(file));
}
const writeData = (file, data) => withLock(file, () => writeRaw(file, data));

// Locked read-modify-write. fn may mutate the array and/or return a value. Throwing aborts the write.
function mutate(file, fn) {
  return withLock(file, async () => {
    const data = await readData(file);
    const result = await fn(data);
    await writeRaw(file, data);
    return result;
  });
}
const same = (a, b) => String(a) === String(b);
async function findById(file, id) { return (await readData(file)).find((x) => same(x.id, id)) || null; }
function nextId(prefix, arr) {
  const max = arr.reduce((m, x) => { const n = parseInt(String(x.id).split('-').pop(), 10); return Number.isFinite(n) ? Math.max(m, n) : m; }, 0);
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}
function create(file, prefix, obj) {
  return mutate(file, (arr) => { const item = { id: nextId(prefix, arr), ...obj }; arr.push(item); return item; });
}
function updateById(file, id, patch) {
  return mutate(file, (arr) => {
    const i = arr.findIndex((x) => same(x.id, id));
    if (i < 0) return null;
    arr[i] = { ...arr[i], ...(typeof patch === 'function' ? patch(arr[i]) : patch) };
    return arr[i];
  });
}
function deleteById(file, id) {
  return mutate(file, (arr) => { const i = arr.findIndex((x) => same(x.id, id)); if (i < 0) return false; arr.splice(i, 1); return true; });
}
module.exports = { DATA_DIR, readData, writeData, mutate, findById, create, updateById, deleteById, nextId };
