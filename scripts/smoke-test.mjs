#!/usr/bin/env node
/**
 * فحص دخان (smoke test) ثابت بلا متصفح:
 *  - index.html يشير إلى assets/app.css المولّد (لا CDN Tailwind).
 *  - كل معرّف يستخدمه app.js عبر $('#id') موجود فعلاً في index.html.
 *  - كل دالة إجراء (act*) المرتبطة عبر data-act مُعرّفة في app.js.
 * يمنع أخطاء "الزر لا يعمل" و"UIKit missing" قبل النشر.
 */
import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const js = readFileSync('app.js', 'utf8');
const problems = [];

// 1) لا نعتمد على CDN Tailwind
if (/cdn\.tailwindcss\.com/.test(html)) {
  problems.push('index.html لا يزال يستخدم CDN لـ Tailwind — يجب استخدام assets/app.css المولّد.');
}
if (!/href="assets\/app\.css"/.test(html)) {
  problems.push('index.html لا يشير إلى assets/app.css المولّد.');
}

// 2) كل #id يستخدمه app.js يجب أن يوجد في index.html
const usedIds = new Set();
for (const m of js.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)) usedIds.add(m[1]);
for (const m of js.matchAll(/\$\$?\('#([A-Za-z0-9_-]+)\s/g)) usedIds.add(m[1]);
const htmlIds = new Set();
for (const m of html.matchAll(/\bid="([A-Za-z0-9_-]+)"/g)) htmlIds.add(m[1]);
for (const id of usedIds) {
  if (!htmlIds.has(id)) problems.push(`app.js يستخدم #${id} وهو غير موجود في index.html.`);
}

// 3) كل data-act في الكود له دالة معالجة
const acts = new Set();
for (const m of js.matchAll(/data-act="([A-Za-z]+)"/g)) acts.add(m[1]);
const switchCases = new Set();
for (const m of js.matchAll(/case '([A-Za-z]+)':/g)) switchCases.add(m[1]);
for (const a of acts) {
  if (!switchCases.has(a)) problems.push(`data-act="${a}" بلا حالة معالجة في مستمع الأحداث.`);
}

if (problems.length) {
  console.error('❌ فشل فحص الدخان:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`✅ اجتاز فحص الدخان: ${usedIds.size} معرّفًا، ${acts.size} إجراءً مرتبطة بنجاح.`);
