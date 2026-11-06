const store = require('./utils/jsonStore');
const { build } = require('./seedData');
// Creates any missing/empty JSON files. With force=true, resets everything to demo data.
async function seedAll(force = false) {
  const all = build();
  for (const [file, rows] of Object.entries(all)) {
    const cur = await store.readData(file);
    if (force || !Array.isArray(cur) || cur.length === 0) await store.writeData(file, rows);
  }
}
module.exports = { seedAll };
if (require.main === module) seedAll(process.argv.includes('--force')).then(() => console.log('Data seeded in', store.DATA_DIR));
