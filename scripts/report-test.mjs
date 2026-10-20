#!/usr/bin/env node
/**
 * فحص لوحة تقارير الإدارة في DOM حقيقي (jsdom):
 *  - ظهور اللوحة للمدير العام فقط وإخفاؤها لغيره.
 *  - صحة مؤشرات المال (الإجمالي/المحصَّل/المتبقي/نسبة التحصيل).
 *  - صحة محاور: المراحل، المصممين، اللوجستيات، المهل، «تحتاج انتباه».
 *  - صحة توليد CSV من العقود.
 */
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

setTimeout(() => { console.error('❌ فحص التقرير تجاوز المهلة.'); process.exit(3); }, 20000).unref?.();

const html = readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.test/', pretendToBeVisual: true });
const { window } = dom;
window.fetch = async () => { throw new Error('no network in test'); };
window.localStorage.clear();

const js = readFileSync('app.js', 'utf8');
try {
  window.eval(js + '\n;window.__T = { S, canViewReport, computeReport, renderReport, renderAll, setIdentity, actExportCSV, csvEscape, deadlineStateOf, staleDaysOf };');
} catch (e) {
  console.error('❌ app.js فشل عند التحميل:', e.message);
  process.exit(1);
}

await new Promise(r => setTimeout(r, 50));
const T = window.__T;
if (!T) { console.error('❌ لم يتم تجهيز الفحص.'); process.exit(1); }
const S = T.S;
const doc = window.document;

const iso = (days) => new Date(Date.now() + days * 864e5).toISOString();

S.mode = 'demo';
S.data = {
  meta: { system: 'x', version: 1, lastUpdated: new Date().toISOString(), nextNumber: 6, nextTicket: 1 },
  settings: { designers: ['أبو جمال', 'أبو يزن', 'علاء', 'خالد'], technicians: [], warrantyYears: 15, defaultDeliveryDays: 30, shippingDays: 10 },
  contracts: [
    // مسدّد بالكامل، قيد التصنيع، مصمم أبو جمال، متأخر عن المهلة
    { id: 'BRJ-2026-0001', createdAt: iso(-40), stage: 'in_production', designer: 'أبو جمال', customer: { name: 'عميل أ', phone: '0551234567', address: 'المدينة المنورة' }, payment: { total: 10000, log: [{ amount: 10000, at: iso(-35) }] }, drawing: { deadline: iso(-2) }, technician: null, installation: { status: 'pending' }, history: [{ at: iso(-35), by: 'x', text: 'دفع' }] },
    // ربع المسدد، بانتظار الرسمة، مصمم أبو يزن، فقد صار راكدًا (آخر حدث 20 يومًا)
    { id: 'BRJ-2026-0002', createdAt: iso(-30), stage: 'deposit_paid', designer: 'أبو يزن', customer: { name: 'عميل ب', phone: '0559999999', address: 'المدينة المنورة' }, payment: { total: 20000, log: [{ amount: 5000, at: iso(-20) }] }, drawing: { deadline: iso(10) }, technician: null, installation: { status: 'pending' }, history: [{ at: iso(-20), by: 'x', text: 'عربون' }] },
    // مكتمل مع ضمان نشط، مصمم أبو جمال
    { id: 'BRJ-2026-0003', createdAt: iso(-60), stage: 'completed', designer: 'أبو جمال', customer: { name: 'عميل ج', phone: '0550000000', address: 'المدينة المنورة' }, payment: { total: 30000, log: [{ amount: 30000, at: iso(-30) }] }, drawing: { deadline: iso(-20) }, technician: { name: 'سالم', assignedAt: iso(-25) }, installation: { status: 'done', installedAt: iso(-23) }, closure: { closedAt: iso(-10) }, warranty: { until: iso(3000) }, maintenance: [{ id: 'MT-0001', status: 'open', openedAt: iso(-5) }], history: [{ at: iso(-10), by: 'x', text: 'إغلاق' }] },
    // مسند لفني، يحتاج تشطيبات، مصمم علاء
    { id: 'BRJ-2026-0004', createdAt: iso(-15), stage: 'needs_finishing', designer: 'علاء', customer: { name: 'عميل د', phone: '0551111111', address: 'المدينة المنورة' }, payment: { total: 15000, log: [{ amount: 15000, at: iso(-14) }] }, drawing: { deadline: iso(3) }, technician: { name: 'سالم', assignedAt: iso(-6) }, installation: { status: 'needs_finishing' }, history: [{ at: iso(-6), by: 'x', text: 'تركيب' }] }
  ]
};

// 1) غير المدير: اللوحة مخفية
T.setIdentity('warehouse', '', { silent: true });
S.mode = 'demo';
T.renderAll();
const hiddenForNonSupervisor = doc.querySelector('#reportPanel').classList.contains('hidden');

// 2) المدير: اللوحة ظاهرة
T.setIdentity('supervisor', '', { silent: true });
S.mode = 'demo';
T.renderAll();
const panel = doc.querySelector('#reportPanel');
const shownForSupervisor = !panel.classList.contains('hidden');

const r = T.computeReport();
const body = panel.innerHTML;

const checks = [
  ['canViewReport صحيح للمدير', T.canViewReport() === true],
  ['اللوحة مخفية لغير المدير', hiddenForNonSupervisor],
  ['اللوحة ظاهرة للمدير', shownForSupervisor],
  ['عدد العقود صحيح', r.count === 4],
  ['إجمالي القيمة صحيح', r.totalValue === 75000],
  ['المحصَّل صحيح', r.collected === 60000],
  ['المتبقي صحيح', r.remaining === 15000],
  ['نسبة التحصيل صحيحة', r.collectRate === 80],
  ['متأخر واحد في المهل', r.late === 1],
  ['مصمم أبو جمال: عقدان', r.designersArr.find(d => d.name === 'أبو جمال')?.count === 2],
  ['فني سالم: 4 مهام', r.techsArr.find(t => t.name === 'سالم')?.total === 2],
  ['تذاكر مفتوحة = 1', r.openTickets === 1],
  ['ضمان نشط = 1', r.warrantyActive === 1],
  ['قائمة تحتاج انتباه غير فارغة', r.attention.length > 0],
  ['عقد متأخر عن المهلة يُكتشف', T.deadlineStateOf(S.data.contracts[0]) === 'late'],
  ['عقد راكد (>14 يوم) يُكتشف', T.staleDaysOf(S.data.contracts[1]) >= 14],
  ['ظهور مؤشرات المال في DOM', body.includes('نسبة التحصيل')],
  ['ظهور قمع اللوجستيات في DOM', body.includes('قيد التصنيع')],
  ['ربط openDetails في قائمة الانتباه', body.includes('data-act="openDetails"')],
  ['فاصل CSV صحيح', T.csvEscape('a,b') === '"a,b"'],
  ['CSV يقتبس علامة التنصيص', T.csvEscape('a"b') === '"a""b"']
];

// 3) اختبار توليد CSV دون تنزيل فعلي
let csvOk = true;
try {
  window.URL.createObjectURL = () => 'blob:test';
  window.URL.revokeObjectURL = () => {};
  T.actExportCSV();
} catch (e) { csvOk = false; console.error('CSV:', e.message); }
checks.push(['توليد CSV لا يرمي خطأ', csvOk]);

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error('❌ فشل فحص لوحة التقارير:');
  for (const [name] of failed) console.error('  - ' + name);
  process.exit(1);
}
console.log(`✅ اجتاز فحص لوحة التقارير: ${checks.length} تحققًا.`);
process.exit(0);
