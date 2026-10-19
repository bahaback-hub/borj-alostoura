#!/usr/bin/env node
/**
 * فحص بوابة الفنيين في DOM حقيقي (jsdom):
 *  - الدخول بلا هوية يعرض كل العقود قيد التركيب (assigned / needs_finishing / installation_done).
 *  - استبعاد العقود بلا فني أو في مراحل أخرى.
 *  - ظهور الرسمة وبيانات العميل (الاسم/الجوال/العنوان) والموعد.
 *  - زرّا «تم التركيب» و«يحتاج تشطيبات».
 *  - إتمام التركيب يحدّث المرحلة ويثبّت الضمان فعلاً.
 *  - إخفاء واجهة الإدارة (شريط التبويبات) في وضع البوابة.
 */
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

setTimeout(() => { console.error('❌ فحص البوابة تجاوز المهلة.'); process.exit(3); }, 20000).unref?.();

const html = readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.test/', pretendToBeVisual: true });
const { window } = dom;
window.fetch = async () => { throw new Error('no network in test'); };
window.localStorage.clear();

const js = readFileSync('app.js', 'utf8');
try {
  window.eval(js + '\n;window.__T = { S, enterTechnicianPortal, exitTechnicianPortal, techOwn, techTokenReady, actInstallDone, technicianSuggestions, renderTechPortal };');
} catch (e) {
  console.error('❌ app.js فشل عند التحميل:', e.message);
  process.exit(1);
}

await new Promise(r => setTimeout(r, 50));
const T = window.__T;
if (!T) { console.error('❌ لم يتم تجهيز الفحص.'); process.exit(1); }
const S = T.S;
const doc = window.document;

S.mode = 'demo';
T.enterTechnicianPortal();
S.mode = 'demo';
await new Promise(r => setTimeout(r, 30));

const iso = (days) => new Date(Date.now() + days * 864e5).toISOString();
S.data = {
  meta: { system: 'x', version: 1, lastUpdated: new Date().toISOString(), nextNumber: 3, nextTicket: 1 },
  settings: { designers: ['أبو جمال', 'أبو يزن', 'علاء', 'خالد'], technicians: [], warrantyYears: 15, defaultDeliveryDays: 30, shippingDays: 10 },
  contracts: [
    { id: 'BRJ-2026-0001', stage: 'assigned', customer: { name: 'عميل أ', phone: '0551234567', address: 'المدينة المنورة' }, technician: { name: 'سالم', assignedAt: iso(0) }, payment: { total: 10000, log: [] }, drawing: { name: 'plan.pdf', url: 'https://x/plan.pdf', uploadedAt: iso(-1), deadline: iso(5), deadlineDays: 30 }, history: [] },
    { id: 'BRJ-2026-0002', stage: 'installation_done', customer: { name: 'عميل ب', phone: '0559999999', address: 'المدينة المنورة' }, technician: { name: 'سالم', assignedAt: iso(0) }, payment: { total: 20000, log: [] }, drawing: null, history: [] },
    { id: 'BRJ-2026-0003', stage: 'new', customer: { name: 'عميل ج', phone: '0550000000', address: 'المدينة المنورة' }, payment: { total: 5000, log: [] }, history: [] }
  ]
};
T.renderTechPortal();

const body = doc.querySelector('#techWrap').innerHTML;
const checks = [
  ['قسم البوابة ظاهر', !doc.querySelector('#techPortal').classList.contains('hidden')],
  ['شريط التبويبات الإدارية مخفي', doc.querySelector('header nav').classList.contains('hidden')],
  ['عرض العقد المسند', body.includes('BRJ-2026-0001')],
  ['عرض العقد المكتمل التركيب', body.includes('BRJ-2026-0002')],
  ['استبعاد عقد في مرحلة أخرى', !body.includes('BRJ-2026-0003')],
  ['ظهور جوال العميل', body.includes('0551234567')],
  ['ظهور عنوان العميل', body.includes('المدينة المنورة')],
  ['ظهور رابط الرسمة', body.includes('plan.pdf')],
  ['زر تم التركيب', body.includes('data-act="installDone"')],
  ['زر يحتاج تشطيبات', body.includes('data-act="needsFinishing"')],
  ['ظهور الموعد/المهلة', body.includes('مهلة التسليم')],
  ['techOwn صحيح داخل البوابة', T.techOwn(S.data.contracts[0]) === true],
  ['techOwn سالب لعقد بلا فني', T.techOwn(S.data.contracts[2]) === false],
  ['الرمز المدمج غير مضبوط (placeholder)', T.techTokenReady() === false],
  ['اقتراحات الأسماء من الإسنادات', T.technicianSuggestions().includes('سالم')]
];

const p = T.actInstallDone('BRJ-2026-0001');
await new Promise(r => setTimeout(r, 10));
const okBtn = doc.querySelector('#cf_ok');
if (okBtn) okBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await p;
checks.push(['إتمام التركيب يحدّث المرحلة', S.data.contracts[0].stage === 'installation_done']);
checks.push(['إتمام التركيب يثبّت الضمان', !!S.data.contracts[0].warranty?.until]);

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error('❌ فشل فحص بوابة الفنيين:');
  for (const [name] of failed) console.error('  - ' + name);
  process.exit(1);
}
console.log(`✅ اجتاز فحص بوابة الفنيين: ${checks.length} تحققًا.`);
process.exit(0);
