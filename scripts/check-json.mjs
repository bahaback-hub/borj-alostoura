#!/usr/bin/env node
/**
 * Validates every JSON file under data/ so a malformed contracts.json can never
 * reach the repository (the app treats it as its database).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = 'data';
let checked = 0;
const problems = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith('.json')) check(full);
  }
}

function check(file) {
  checked++;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (file.endsWith('contracts.json')) {
      if (!parsed || typeof parsed !== 'object') throw new Error('الجذر ليس كائنًا');
      if (!Array.isArray(parsed.contracts)) throw new Error('المفتاح "contracts" يجب أن يكون مصفوفة');
      const ids = new Set();
      for (const c of parsed.contracts) {
        if (!c || typeof c.id !== 'string') throw new Error('عقد بدون معرّف صالح');
        if (ids.has(c.id)) throw new Error(`معرّف مكرر: ${c.id}`);
        ids.add(c.id);
        if (!c.stage) throw new Error(`العقد ${c.id} بدون حالة stage`);
      }
    }
  } catch (e) {
    problems.push(`${file}: ${e.message}`);
  }
}

walk(DATA_DIR);

if (problems.length) {
  console.error('❌ ملفات JSON غير صالحة:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`✅ تم التحقق من ${checked} ملف JSON بنجاح.`);
