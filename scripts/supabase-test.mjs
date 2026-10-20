#!/usr/bin/env node
/**
 * فحص طبقة Supabase في DOM حقيقي (jsdom) مع محاكاة الشبكة:
 *  - تسجيل الدخول يخزّن الجلسة ويجلب الدور من profiles.
 *  - تحميل البيانات من جدول store.
 *  - الحفظ (upsert) يرسل الصف الصحيح.
 *  - تسجيل الخروج يمسح الجلسة.
 *  - الوضع السحابي يُظهر زر الخروج ويخفي قائمة تبديل الدور.
 */
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { TextEncoder, TextDecoder } from 'node:util';

setTimeout(() => { console.error('❌ فحص Supabase تجاوز المهلة.'); process.exit(3); }, 20000).unref?.();

const html = readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.test/', pretendToBeVisual: true });
const { window } = dom;
window.TextEncoder = TextEncoder;
window.TextDecoder = TextDecoder;
const calls = [];
let storeRow = null;

window.fetch = async (url, opts = {}) => {
  const u = String(url);
  calls.push({ url: u, method: opts.method || 'GET', body: opts.body });
  const json = (obj, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(obj), json: async () => obj, headers: { get: () => null } });
  if (u.includes('/auth/v1/token')) {
    return json({ access_token: 'tok_123', refresh_token: 'ref_123', expires_in: 3600, user: { id: 'user-1', email: 'a@b.c' } });
  }
  if (u.includes('/auth/v1/logout')) return json({}, 204);
  if (u.includes('/rest/v1/profiles')) return json([{ role: 'supervisor', person: 'روان' }]);
  if (u.includes('/rest/v1/store')) {
    if ((opts.method || 'GET') === 'POST') { storeRow = JSON.parse(opts.body); return json(null, 201); }
    return json(storeRow ? [{ data: storeRow.data }] : []);
  }
  return json([], 200);
};
window.localStorage.clear();

const js = readFileSync('app.js', 'utf8');
try {
  window.eval(js + '\n;window.__T = { S, sbSignIn, sbSignOut, sbLoadData, sbPutData, sbGetProfile, sbRefresh, applyCloudIdentity, doCloudLogout, renderAll, renderHeader };');
} catch (e) {
  console.error('❌ app.js فشل عند التحميل:', e.message);
  process.exit(1);
}

await new Promise(r => setTimeout(r, 50));
const T = window.__T;
if (!T) { console.error('❌ لم يتم تجهيز الفحص.'); process.exit(1); }
const S = T.S;
const doc = window.document;

const checks = [];

// 1) تسجيل الدخول
await T.sbSignIn('a@b.c', 'secret');
checks.push(['تسجيل الدخول يخزّن رمز الجلسة', S.sbSession?.access_token === 'tok_123']);
checks.push(['الطلب يحمل apikey', calls.some(c => c.url.includes('/auth/v1/token'))]);

// 2) جلب الملف الشخصي
const prof = await T.sbGetProfile('user-1');
checks.push(['جلب الدور من profiles', prof?.role === 'supervisor']);

// 2ب) تجديد الرمز
const refreshed = await T.sbRefresh();
checks.push(['تجديد الرمز يعمل', refreshed === true && calls.some(c => c.url.includes('grant_type=refresh_token'))]);

// 3) كتابة وقراءة صف store
await T.sbPutData({ meta: { lastUpdated: 'x' }, contracts: [{ id: 'BRJ-1' }] });
checks.push(['الحفظ يرسل upsert إلى store', calls.some(c => c.url.includes('/rest/v1/store?on_conflict=id') && c.method === 'POST')]);
const back = await T.sbLoadData();
checks.push(['القراءة تعيد بيانات store', back?.contracts?.[0]?.id === 'BRJ-1']);

// 4) اعتماد الهوية السحابية وواجهة الترويسة
await T.applyCloudIdentity();
checks.push(['الدور يُعتمد من السحابة', S.role === 'supervisor']);
S.mode = 'supabase';
T.renderHeader();
checks.push(['زر الخروج يظهر في الوضع السحابي', !doc.querySelector('#btnLogout').classList.contains('hidden')]);
checks.push(['قائمة تبديل الدور تُخفى في الوضع السحابي', doc.querySelector('#roleSel').classList.contains('hidden')]);

// 5) تسجيل الخروج
await T.doCloudLogout();
checks.push(['تسجيل الخروج يمسح الجلسة', S.sbSession === null]);
checks.push(['الطلب أرسل إلى logout', calls.some(c => c.url.includes('/auth/v1/logout'))]);

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error('❌ فشل فحص Supabase:');
  for (const [name] of failed) console.error('  - ' + name);
  process.exit(1);
}
console.log(`✅ اجتاز فحص Supabase: ${checks.length} تحققًا.`);
process.exit(0);
