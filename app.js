/* =====================================================================
   منظومة برج الأسطورة — app.js
   تطبيق ويب ثابت (GitHub Pages) يستخدم GitHub API كقاعدة بيانات
   عبر قراءة/تحديث ملف data/contracts.json داخل المستودع.
   ===================================================================== */
'use strict';

/* ------------------------------ ثوابت الحالات ------------------------------ */
const STAGES = {
  new:                { label: 'عقد جديد — بانتظار دفع العربون', chip: 'bg-slate-500/15 text-slate-300 border-slate-400/20',  icon: 'fa-file-circle-plus' },
  deposit_paid:       { label: 'تم دفع العربون — بانتظار استكمال السداد', chip: 'bg-amber-500/15 text-amber-300 border-amber-400/20', icon: 'fa-hourglass-half' },
  fully_paid:         { label: 'مسدد بالكامل — بانتظار رفع رسمة المصنع', chip: 'bg-sky-500/15 text-sky-300 border-sky-400/20', icon: 'fa-circle-check' },
  in_production:      { label: 'قيد التصنيع في مصنع القصيم', chip: 'bg-indigo-500/15 text-indigo-300 border-indigo-400/20', icon: 'fa-industry' },
  shipping:           { label: 'قيد الشحن إلى المدينة المنورة', chip: 'bg-violet-500/15 text-violet-300 border-violet-400/20', icon: 'fa-truck-fast' },
  arrived_warehouse:  { label: 'وصل مستودع المدينة — بانتظار الإسناد', chip: 'bg-cyan-500/15 text-cyan-300 border-cyan-400/20', icon: 'fa-warehouse' },
  assigned:           { label: 'مسند لفني — قيد التركيب', chip: 'bg-orange-500/15 text-orange-300 border-orange-400/20', icon: 'fa-screwdriver-wrench' },
  needs_finishing:    { label: 'تم التركيب — يحتاج بعض التشطيبات', chip: 'bg-yellow-500/15 text-yellow-300 border-yellow-400/20', icon: 'fa-paint-roller' },
  installation_done:  { label: 'تم التركيب — بانتظار اعتماد المشرف', chip: 'bg-lime-500/15 text-lime-300 border-lime-400/20', icon: 'fa-clipboard-check' },
  completed:          { label: 'مكتمل وملفه مغلق — تحت الضمان', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20', icon: 'fa-shield-halved' }
};

const STEP_ORDER = ['new','deposit_paid','fully_paid','in_production','shipping','arrived_warehouse','assigned','installation_done','completed'];
const STEP_NAMES = ['العقد','العربون','السداد الكامل','الرسمة/التصنيع','الشحن','المستودع','التركيب','الاعتماد'];

const ROLE_DEFS = {
  supervisor: { label: 'المدير العام / المشرف', icon: 'fa-user-shield' },
  designer:   { label: 'مصمم', icon: 'fa-pen-ruler' },
  warehouse:  { label: 'مدير المستودع', icon: 'fa-warehouse' },
  technician: { label: 'فني تركيب', icon: 'fa-screwdriver-wrench' }
};

const STORE = { cfg: 'borj_cfg_v1', role: 'borj_role_v1', demo: 'borj_demo_v1', cache: 'borj_cache_v1', sbSession: 'borj_sb_session_v1' };

/* ---------------------------------------------------------------------------
   بوابة الفنيين: رمز كتابة مشترك يُستخدم عند دخول الفني بلا هوية.
   ⚠️ تنبيه أمني: هذا الرمز يُوضع داخل ملف منشور علنًا على GitHub Pages، لذا قد
   يستخرجه أي شخص يستطيع الكتابة في المستودع. أنشئ رمزًا Fine-grained مقصورًا على
   مستودع borj-alostoura فقط وبصلاحية Contents: Read & Write، ولا تستخدم رمزًا
   واسع الصلاحيات. عند تركه كما هو (placeholder) تعمل البوابة في الوضع التجريبي
   (حفظ محلي فقط دون رفع إلى GitHub).
   --------------------------------------------------------------------------- */
const TECH_SHARED_TOKEN = 'PUT_YOUR_FINE_GRAINED_PAT_HERE';
const TECH_OWNER = 'bahaback-hub';
const TECH_REPO = 'borj-alostoura';

/* ---------------------------------------------------------------------------
   Supabase: قاعدة البيانات السحابية الأساسية للمنظومة.
   - SUPABASE_ANON: المفتاح العام (publishable) — آمن للعرض في الواجهة، محميّ بسياسات RLS.
   - الجدول store: صفّ واحد (id='main') يخزّن كامل بيانات المنظومة في عمود data (jsonb).
   - جدول profiles: يربط كل حساب مُسجّل بدوره واسمه.
   ⚠️ لا تضع أبدًا المفتاح السرّي (service_role) هنا — فهو عام ومكشوف.
   --------------------------------------------------------------------------- */
const SUPABASE_URL = 'https://kxgqwkhqogfzggunxogt.supabase.co';
const SUPABASE_ANON = 'sb_publishable_JNBU3uv3-hoU8fHS3Wqg7w_Ca2T4QdS';
const SB_STORE_ID = 'main';
const MAX_UPLOAD_BYTES = 900 * 1024; // حد الرفع المباشر إلى GitHub Contents API
// GitHub Contents API يرفض الملفات الكبيرة (>~1MB عبر هذا المسار)، ولأن ملف البيانات
// يُقرأ ويُكتب بالكامل في كل عملية فنحذّر عند الاقتراب من الحد لتفادي فقدان الحفظ.
const MAX_DATA_BYTES = 850 * 1024;
const WARN_DATA_BYTES = 700 * 1024;

/* --------------------------------- أدوات --------------------------------- */
const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const fmtMoney = (n) => new Intl.NumberFormat('en-US').format(Math.round(+n || 0)) + ' ر.س';
const fmtNum = (n) => new Intl.NumberFormat('en-US').format(+n || 0);
const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return String(iso).slice(0, 10); }
};
const fmtDateTime = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return fmtDate(iso) + ' — ' + d.toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
  } catch { return String(iso).slice(0, 16); }
};
const nowISO = () => new Date().toISOString();
const normAr = (s) => String(s || '')
  .replace(/[\u064B-\u0652\u0640]/g, '')
  .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/[^\u0600-\u06FFa-zA-Z0-9]/g, '').toLowerCase();
const digitsOnly = (s) => String(s || '').replace(/\D/g, '');
const isValidSaudiPhone = (s) => /^(?:9665|05|5)\d{8}$/.test(digitsOnly(s));
const addDays = (iso, days) => new Date(new Date(iso).getTime() + days * 864e5).toISOString();
const addYears = (iso, y) => { const d = new Date(iso); d.setFullYear(d.getFullYear() + y); return d.toISOString(); };
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

/* --------------------------------- الحالة --------------------------------- */
const S = {
  cfg: { owner: '', repo: '', branch: 'main', path: 'data/contracts.json', token: '' },
  role: null, person: '',
  data: null, sha: null, etag: null,
  mode: 'demo',            // demo | github | offline | supabase
  sbSession: null,         // جلسة Supabase الحالية
  sbProfile: null,         // ملف المستخدم الحالي من profiles (دوره الحقيقي واسمه)
  viewAs: null,            // عند الاستعراض: { role, person, email } للموظف المعروض (للمدير فقط)
  tab: 'contracts',
  curId: null,             // العقد المفتوح في نافذة التفاصيل
  confirmResolve: null,
  techPortal: false,       // true عند الدخول من بوابة الفنيين (بلا هوية)
  filters: { q: '', stage: '', designer: '' }
};

const LS = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v === null || v === undefined ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};

/* ------------------------- صلاحيات (الأدوار) ------------------------- */
// الدور/الاسم الفعليان: أثناء «الاستعراض» يتبدّلان إلى الموظف المعروض (للمدير العام فقط).
const effRole = () => (S.viewAs?.role) || S.role;
const effPerson = () => (S.viewAs ? (S.viewAs.person || '') : S.person);
const isSupervisor = () => effRole() === 'supervisor';
const canPay = () => ['supervisor', 'designer'].includes(effRole());
const canCreate = () => ['supervisor', 'designer'].includes(effRole());
const canLogistics = () => ['supervisor', 'warehouse'].includes(effRole());
const canClose = () => isSupervisor();
const canViewReport = () => isSupervisor();
const canTicket = () => ['supervisor', 'warehouse', 'technician'].includes(effRole());
const canUploadDrawing = (c) => isSupervisor() || paidOf(c) >= (c.payment?.total || 0);
// مدير التركيب (البوابة) يرى كل العقود المسندة؛ الفني العادي (بدور technician واسم) يرى ما أُسند له فقط.
const techOwn = (c) => !!c.technician && (S.techPortal || (effRole() === 'technician' && c.technician?.name === effPerson()));

const paidOf = (c) => (c.payment?.log || []).reduce((s, p) => s + (+p.amount || 0), 0);
const remainingOf = (c) => Math.max(0, (c.payment?.total || 0) - paidOf(c));
const byName = () => S.techPortal ? 'فني تركيب (بوابة الفنيين)' : `${ROLE_DEFS[effRole()]?.label || effRole()}${effPerson() ? ' — ' + effPerson() : ''}`;

/* =====================================================================
   طبقة Supabase (قاعدة البيانات السحابية)
   ===================================================================== */
function sbReady() { return !!(SUPABASE_URL && SUPABASE_ANON); }

/** رأس مصادقة Supabase — يستخدم رمز الجلسة إن وُجد، وإلا المفتاح العام. */
function sbHeaders(extra = {}) {
  const token = S.sbSession?.access_token || SUPABASE_ANON;
  return { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...extra };
}

/** استدعاء REST على Supabase — يجدّد الجلسة تلقائيًا عند 401 ثم يعيد المحاولة مرة. */
async function sbFetch(path, opts = {}, _retried = false) {
  const res = await fetch(`${SUPABASE_URL}${path}`, { ...opts, headers: sbHeaders(opts.headers || {}) });
  if (res.status === 401 && !_retried && S.sbSession?.refresh_token) {
    if (await sbRefresh()) return sbFetch(path, opts, true);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let msg = `Supabase ${res.status}`;
    try { const j = JSON.parse(body); msg = j.msg || j.message || j.error_description || msg; } catch { /* نص غير JSON */ }
    const err = new Error(msg);
    err.status = res.status; err.body = body;
    throw err;
  }
  if (res.status === 204) return null;
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

/** تسجيل الدخول بالإيميل وكلمة المرور — يحفظ الجلسة محليًا ويُعيد المستخدم. */
async function sbSignIn(email, password) {
  const j = await sbFetch('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  S.sbSession = { access_token: j.access_token, refresh_token: j.refresh_token, user: j.user, expires_at: Date.now() + ((j.expires_in || 3600) * 1000), at: nowISO() };
  LS.set(STORE.sbSession, S.sbSession);
  return j.user;
}

/** تجديد رمز الجلسة المنتهي باستخدام refresh_token. تُعيد true عند النجاح. */
async function sbRefresh() {
  const rt = S.sbSession?.refresh_token;
  if (!rt) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt })
    });
    if (!res.ok) return false;
    const j = await res.json();
    S.sbSession = { ...S.sbSession, access_token: j.access_token, refresh_token: j.refresh_token || rt, expires_at: Date.now() + ((j.expires_in || 3600) * 1000) };
    LS.set(STORE.sbSession, S.sbSession);
    return true;
  } catch { return false; }
}

/** يضمن وجود رمز صالح — يجدّد إن انتهى. */
async function sbEnsureToken() {
  if (!S.sbSession?.access_token) return false;
  if (S.sbSession.expires_at && Date.now() > S.sbSession.expires_at - 60000) {
    return await sbRefresh();
  }
  return true;
}

/** تسجيل الخروج ومسح الجلسة. */
async function sbSignOut() {
  try {
    if (S.sbSession?.access_token) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: sbHeaders() });
    }
  } catch { /* تجاهل أخطاء الشبكة عند الخروج */ }
  S.sbSession = null;
  LS.del(STORE.sbSession);
}

/** قراءة صف البيانات الرئيسي من جدول store. تُعيد كائن البيانات أو null. */
async function sbLoadData() {
  const rows = await sbFetch(`/rest/v1/store?id=eq.${SB_STORE_ID}&select=data`);
  if (!rows || !rows.length) return null;
  return rows[0].data;
}

/** كتابة صف البيانات الرئيسي (upsert) في جدول store. */
async function sbPutData(data) {
  const json = JSON.stringify(data, null, 2);
  const bytes = new TextEncoder().encode(json).length;
  if (bytes > MAX_DATA_BYTES) {
    const err = new Error(`حجم البيانات (${fmtNum(Math.round(bytes / 1024))} كيلوبايت) يتجاوز الحد (${fmtNum(Math.round(MAX_DATA_BYTES / 1024))} كيلوبايت).`);
    err.code = 'DATA_TOO_LARGE';
    throw err;
  }
  await sbFetch('/rest/v1/store?on_conflict=id', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: SB_STORE_ID, data, updated_at: nowISO() })
  });
}

/** جلب ملف المستخدم (الدور والاسم) من جدول profiles. */
async function sbGetProfile(userId) {
  const rows = await sbFetch(`/rest/v1/profiles?id=eq.${userId}&select=role,person`);
  if (!rows || !rows.length) return null;
  return rows[0];
}

/** جلب كل الملفات الشخصية (للمشرف فقط — تسمح سياسة RLS بذلك) لعرض قائمة الموظفين. */
async function sbListProfiles() {
  return await sbFetch('/rest/v1/profiles?select=id,role,person,email&order=role') || [];
}

/** رفع ملف رسمة إلى Supabase Storage (دلو 'drawings') — تُعيد الرابط العام. */
async function sbUploadDrawing(fileName, blob, contentType = 'application/octet-stream') {
  const path = `drawings/${encodeURIComponent(fileName)}`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${path}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON,
      'Authorization': `Bearer ${S.sbSession?.access_token || SUPABASE_ANON}`,
      'Content-Type': contentType,
      'x-upsert': 'true'
    },
    body: blob
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`رفع الرسمة فشل (${res.status})`);
    err.status = res.status; err.body = body;
    throw err;
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${path}`;
}

/* =====================================================================
   طبقة GitHub API (قاعدة بيانات احتياطية — تبقى كخيار ثانٍ)
   ===================================================================== */
function ghCfgReady() { return !!(S.cfg.owner && S.cfg.repo && S.cfg.token); }

function ghApiRaw(path, opts = {}) {
  const url = `https://api.github.com/repos/${S.cfg.owner}/${S.cfg.repo}/${path}`;
  return fetch(url, {
    ...opts,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${S.cfg.token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    }
  });
}

function ghApi(path, opts = {}) {
  return ghApiRaw(path, opts).then(async (res) => {
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error(`GitHub API ${res.status}`);
      err.status = res.status; err.body = body;
      throw err;
    }
    return res.json();
  });
}
function b64ToUtf8(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}
function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(bin);
}

/** قراءة ملف البيانات من المستودع — تُعيد {data, sha} */
async function ghLoadData() {
  const p = `contents/${S.cfg.path}?ref=${encodeURIComponent(S.cfg.branch || 'main')}&t=${Date.now()}`;
  const j = await ghApi(p);
  const data = JSON.parse(b64ToUtf8(j.content || ''));
  S.sha = j.sha;
  S.etag = null; // نجبر طلبًا كاملًا في المرة القادمة بعد أي كتابة
  return data;
}

/**
 * قراءة مشروطة (If-None-Match) للتحديث التلقائي: إذا لم يتغيّر الملف يرد GitHub 304
 * فلا نُهدر حصة الطلبات ولا نُعيد الرسم. تُعيد true إن تغيّر شيء وحُدّثت S.data.
 */
async function ghLoadDataIfChanged() {
  const p = `contents/${S.cfg.path}?ref=${encodeURIComponent(S.cfg.branch || 'main')}`;
  const headers = S.etag ? { 'If-None-Match': S.etag } : {};
  const res = await ghApiRaw(p, { headers });
  if (res.status === 304) return false;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`GitHub API ${res.status}`);
    err.status = res.status; err.body = body;
    throw err;
  }
  const j = await res.json();
  S.etag = res.headers.get('ETag') || null;
  S.data = JSON.parse(b64ToUtf8(j.content || ''));
  S.sha = j.sha;
  LS.set(STORE.cache, { at: nowISO(), data: S.data });
  return true;
}

/** كتابة ملف البيانات مع SHA الحالي (Commit) */
async function ghPutData(data, message) {
  const json = JSON.stringify(data, null, 2);
  const bytes = new TextEncoder().encode(json).length;
  if (bytes > MAX_DATA_BYTES) {
    const err = new Error(`حجم ملف البيانات (${fmtNum(Math.round(bytes / 1024))} كيلوبايت) يتجاوز الحد المسموح (${fmtNum(Math.round(MAX_DATA_BYTES / 1024))} كيلوبايت) — أرشِف العقود القديمة أو انقل الرسمات إلى روابط خارجية.`);
    err.code = 'DATA_TOO_LARGE';
    throw err;
  }
  if (bytes > WARN_DATA_BYTES) {
    toast(`تنبيه: ملف البيانات كبر (${fmtNum(Math.round(bytes / 1024))} كيلوبايت من أصل ${fmtNum(Math.round(MAX_DATA_BYTES / 1024))}). يُفضَّل أرشفة العقود المكتملة القديمة.`, 'warn');
  }
  const body = {
    message: message + ' — عبر منظومة برج الأسطورة',
    content: utf8ToB64(json),
    branch: S.cfg.branch || 'main'
  };
  if (S.sha) body.sha = S.sha;
  const j = await ghApi(`contents/${S.cfg.path}`, { method: 'PUT', body: JSON.stringify(body) });
  S.sha = j.content?.sha || S.sha;
  return j;
}

/** رفع ملف رسمة إلى مجلد drawings/ داخل المستودع — تُعيد رابط التحميل */
async function ghUploadDrawing(fileName, base64Content, contractId) {
  const j = await ghApi(`contents/drawings/${encodeURIComponent(fileName)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `رفع رسمة المصنع للعقد ${contractId} — منظومة برج الأسطورة`,
      content: base64Content,
      branch: S.cfg.branch || 'main'
    })
  });
  return j.content?.download_url || '';
}

/**
 * الحفظ الآمن: قراءة حديثة → تعديل → كتابة (مع إعادة المحاولة عند التعارض)
 * mutator: دالة تعدّل كائن البيانات في مكانها.
 */
async function saveData(mutator, commitMsg) {
  if (S.mode === 'supabase' && sbReady()) {
    const fresh = (await sbLoadData()) || FALLBACK_SEED();   // جلب أحدث نسخة (دمج آمن)
    mutator(fresh);
    fresh.meta = fresh.meta || {};
    fresh.meta.lastUpdated = nowISO();
    await sbPutData(fresh);
    S.data = fresh;
    LS.set(STORE.cache, { at: nowISO(), data: fresh }); // نسخة احتياطية محلية
    return;
  }
  if (S.mode === 'github' && ghCfgReady()) {
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const fresh = await ghLoadData();          // جلب أحدث نسخة + SHA
        mutator(fresh);
        fresh.meta = fresh.meta || {};
        fresh.meta.lastUpdated = nowISO();
        await ghPutData(fresh, commitMsg);
        S.data = fresh;
        LS.set(STORE.cache, { at: nowISO(), data: fresh }); // نسخة احتياطية محلية
        return;
      } catch (e) {
        lastErr = e;
        if (e.status === 409 || e.status === 422) continue; // تعارض تعديلات متزامنة
        throw e;
      }
    }
    throw lastErr || new Error('تعذر الحفظ');
  } else if (S.mode === 'github') {
    throw new Error('الوضع غير مكتمل');
  } else {
    // الوضع التجريبي المحلي
    mutator(S.data);
    S.data.meta = S.data.meta || {};
    S.data.meta.lastUpdated = nowISO();
    LS.set(STORE.demo, S.data);
  }
}

/* ---------------------------- تحميل البيانات ---------------------------- */
const FALLBACK_SEED = () => ({
  meta: { system: 'منظومة برج الأسطورة', version: 1, lastUpdated: nowISO(), nextNumber: 1, nextTicket: 1 },
  settings: {
    designers: ['أبو جمال', 'أبو يزن', 'علاء', 'خالد'],
    technicians: [],
    warrantyYears: 15, defaultDeliveryDays: 30, shippingDays: 10,
    city: 'المدينة المنورة', factory: 'القصيم'
  },
  // لا نُدرج عقدًا وهميًا: ملف البيانات الفعلي يجب أن يبدأ فارغًا. البيانات التجريبية
  // للعرض في data/sample.json ويستطيع المستخدم نسخها يدويًا عند الحاجة.
  contracts: []
});

async function fetchLocalSeed() {
  try {
    const res = await fetch(S.cfg.path || 'data/contracts.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch failed');
    return await res.json();
  } catch { return null; }
}

async function loadData(silent = false) {
  if (!silent) busy(true, 'جارٍ تحميل البيانات…');
  try {
    if (S.sbSession?.access_token && sbReady()) {
      // الوضع السحابي (Supabase) — الأساس
      S.mode = 'supabase';
      try {
        const data = await sbLoadData();
        S.data = data || FALLBACK_SEED();
        if (!data) await sbPutData(S.data);   // تهيئة الصف أول مرة
        LS.set(STORE.cache, { at: nowISO(), data: S.data });
      } catch {
        const cached = LS.get(STORE.cache, null);
        if (cached?.data) { S.data = cached.data; S.mode = 'offline'; if (!silent) toast('تعذر الاتصال بالسحابة — عرض نسخة محفوظة (قراءة فقط).', 'warn'); }
        else { S.data = FALLBACK_SEED(); if (!silent) toast('تعذر الاتصال بالسحابة — تم البدء ببيانات فارغة.', 'warn'); }
      }
    } else if (ghCfgReady()) {
      S.mode = 'github';
      try {
        const data = await ghLoadData();
        S.data = data;
        LS.set(STORE.cache, { at: nowISO(), data });
      } catch {
        const cached = LS.get(STORE.cache, null);
        if (cached?.data) {
          S.data = cached.data; S.mode = 'offline';
          if (!silent) toast('تعذر الاتصال بـ GitHub — يتم عرض نسخة محفوظة مؤقتًا (القراءة فقط).', 'warn');
        } else {
          S.data = await fetchLocalSeed() || FALLBACK_SEED();
          S.mode = 'demo';
          if (!silent) toast('تعذر الاتصال بـ GitHub — تحقق من الإعدادات. تم التبديل للوضع التجريبي.', 'warn');
        }
      }
    } else {
      S.mode = 'demo';
      S.data = LS.get(STORE.demo, null) || await fetchLocalSeed() || FALLBACK_SEED();
      LS.set(STORE.demo, S.data);
    }
  } finally {
    if (!silent) busy(false);
  }
}

/* =====================================================================
   محركات العرض (Rendering)
   ===================================================================== */
function stageChip(stage, extra = '') {
  const st = STAGES[stage] || STAGES.new;
  return `<span class="chip ${st.chip} ${extra}"><i class="fa-solid ${st.icon}"></i> ${esc(st.label)}</span>`;
}

function countdownHTML(c) {
  const dl = c.drawing?.deadline;
  if (!dl || ['completed'].includes(c.stage)) return '';
  const left = Math.ceil((new Date(dl) - Date.now()) / 864e5);
  if (!Number.isFinite(left)) return ''; // تاريخ غير صالح — لا نعرض عدّادًا مضلّلًا
  let cls = 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20', txt = `متبقٍ ${left} يوم من مهلة التسليم`;
  if (left <= 0) { cls = 'bg-rose-500/15 text-rose-300 border-rose-400/20'; txt = `انتهت المهلة بـ ${Math.abs(left)} يوم`; }
  else if (left <= 5) { cls = 'bg-rose-500/15 text-rose-300 border-rose-400/20'; }
  else if (left <= 10) { cls = 'bg-amber-500/15 text-amber-300 border-amber-400/20'; }
  return `<span class="chip num ${cls}"><i class="fa-solid fa-stopwatch"></i> ${txt}</span>`;
}

/** نسبة تقدّم مهلة التسليم (0–100) لرسمة العقد — آمنة ضد التواريخ الناقصة/غير الصالحة. */
function drawingProgress(c) {
  const dl = c.drawing?.deadline;
  const up = c.drawing?.uploadedAt;
  if (!dl || !up) return 0;
  const total = daysBetween(up, dl);
  if (!Number.isFinite(total) || total <= 0) return 0;
  const elapsed = daysBetween(up, nowISO());
  if (!Number.isFinite(elapsed)) return 0;
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

function warrantyChip(c) {
  if (c.stage !== 'completed' || !c.warranty?.until) return '';
  const active = new Date(c.warranty.until) > new Date();
  return active
    ? `<span class="chip bg-emerald-500/15 text-emerald-300 border-emerald-400/20"><i class="fa-solid fa-shield-halved"></i> ضمان حتى ${fmtDate(c.warranty.until)}</span>`
    : `<span class="chip bg-ink-700 text-mist-400 border-ink-600"><i class="fa-solid fa-shield-halved"></i> انتهى الضمان</span>`;
}

/* ---------------------- شريط الإحصائيات ---------------------- */
function renderStats() {
  const cs = S.data?.contracts || [];
  const groups = {
    all: cs.length,
    awaiting_pay: cs.filter(c => ['new', 'deposit_paid'].includes(c.stage)).length,
    awaiting_drawing: cs.filter(c => c.stage === 'fully_paid').length,
    production_shipping: cs.filter(c => ['in_production', 'shipping'].includes(c.stage)).length,
    warehouse_install: cs.filter(c => ['arrived_warehouse', 'assigned', 'needs_finishing', 'installation_done'].includes(c.stage)).length,
    completed: cs.filter(c => c.stage === 'completed').length
  };
  const cards = [
    { k: 'all', t: 'إجمالي العقود', v: groups.all, i: 'fa-layer-group', c: 'text-mist-200' },
    { k: 'awaiting_pay', t: 'بانتظار السداد', v: groups.awaiting_pay, i: 'fa-hourglass-half', c: 'text-amber-300' },
    { k: 'awaiting_drawing', t: 'بانتظار الرسمة', v: groups.awaiting_drawing, i: 'fa-file-circle-plus', c: 'text-sky-300' },
    { k: 'production_shipping', t: 'تصنيع وشحن', v: groups.production_shipping, i: 'fa-truck-fast', c: 'text-indigo-300' },
    { k: 'warehouse_install', t: 'مستودع وتركيب', v: groups.warehouse_install, i: 'fa-boxes-stacked', c: 'text-cyan-300' },
    { k: 'completed', t: 'مكتملة', v: groups.completed, i: 'fa-circle-check', c: 'text-emerald-300' }
  ];
  $('#statsRow').innerHTML = cards.map(x => `
    <button class="card p-4 text-start hover:border-gold-500/40 transition ${S.filters.stage === x.k ? '!border-gold-500/60' : ''}" data-stat="${x.k}">
      <div class="flex items-center justify-between mb-2"><i class="fa-solid ${x.i} ${x.c}"></i><span class="text-2xl font-head font-extrabold num ${x.c}">${x.v}</span></div>
      <p class="text-[11px] text-mist-400 font-bold">${x.t}</p>
    </button>`).join('');
}

/* =====================================================================
   لوحة تقارير الإدارة (Dashboard) — تُحسب كل المؤشرات من البيانات الحالية.
   ===================================================================== */
const STALE_DAYS = 14; // عدد الأيام بلا أي حدث يُعدّ العقد بعده "راكدًا"
const REPORT_STAGE_ORDER = ['new', 'deposit_paid', 'fully_paid', 'in_production', 'shipping', 'arrived_warehouse', 'assigned', 'needs_finishing', 'installation_done', 'completed'];

/** آخر حدث زمني لعقد (من السجل أو تاريخ الإنشاء). تُعيد ISO أو ''. */
function lastActivityOf(c) {
  let last = c.createdAt || '';
  for (const h of (c.history || [])) if (h?.at && h.at > last) last = h.at;
  return last;
}

/** عدد الأيام منذ آخر حدث (أو Infinity عند غياب التاريخ). */
function staleDaysOf(c) {
  const last = lastActivityOf(c);
  if (!last) return Infinity;
  const d = daysBetween(last, nowISO());
  return Number.isFinite(d) ? d : Infinity;
}

/** حالة مهلة التسليم: safe | soon | late | none. */
function deadlineStateOf(c) {
  const dl = c.drawing?.deadline;
  if (!dl || c.stage === 'completed') return 'none';
  const left = daysBetween(nowISO(), dl); // موجب = متبقٍ، سالب = متأخر
  if (!Number.isFinite(left)) return 'none';
  if (left < 0) return 'late';
  if (left <= 5) return 'soon';
  return 'safe';
}

/** متوسط زمن الدورة بالأيام (من الإنشاء حتى إغلاق الملف) للعقود المكتملة. تُعيد null إن لا توجد بيانات. */
function avgCycleDays(cs) {
  const done = cs.filter(c => c.closure?.closedAt && c.createdAt);
  if (!done.length) return null;
  const total = done.reduce((s, c) => {
    const d = daysBetween(c.createdAt, c.closure.closedAt);
    return s + (Number.isFinite(d) ? Math.max(0, d) : 0);
  }, 0);
  return Math.round(total / done.length);
}

/** تجميع كل أرقام التقرير في كائن واحد. */
function computeReport() {
  const cs = S.data?.contracts || [];
  const totalValue = cs.reduce((s, c) => s + (c.payment?.total || 0), 0);
  const collected = cs.reduce((s, c) => s + paidOf(c), 0);
  const remaining = Math.max(0, totalValue - collected);
  const collectRate = totalValue > 0 ? Math.round((collected / totalValue) * 100) : 0;

  const byStage = {};
  for (const k of REPORT_STAGE_ORDER) byStage[k] = 0;
  for (const c of cs) if (byStage[c.stage] !== undefined) byStage[c.stage]++; else byStage[c.stage] = (byStage[c.stage] || 0) + 1;

  // مصممون: عدد + قيمة + متوسط زمن الإنجاز (للمكتملة)
  const designers = {};
  for (const c of cs) {
    const d = c.designer || 'غير محدد';
    designers[d] = designers[d] || { name: d, count: 0, value: 0, doneDurations: [] };
    designers[d].count++;
    designers[d].value += (c.payment?.total || 0);
    if (c.closure?.closedAt && c.createdAt) {
      const days = daysBetween(c.createdAt, c.closure.closedAt);
      if (Number.isFinite(days)) designers[d].doneDurations.push(Math.max(0, days));
    }
  }
  const designersArr = Object.values(designers).map(d => ({
    name: d.name, count: d.count, value: d.value,
    avgDays: d.doneDurations.length ? Math.round(d.doneDurations.reduce((s, x) => s + x, 0) / d.doneDurations.length) : null
  })).sort((a, b) => b.count - a.count);

  // فنيون
  const techs = {};
  for (const c of cs) {
    if (!c.technician?.name) continue;
    const t = c.technician.name;
    techs[t] = techs[t] || { name: t, total: 0, done: 0, finishing: 0 };
    techs[t].total++;
    if (c.stage === 'installation_done' || c.stage === 'completed') techs[t].done++;
    if (c.stage === 'needs_finishing') techs[t].finishing++;
  }
  const techsArr = Object.values(techs).sort((a, b) => b.total - a.total);

  // لوجستيات (قمع)
  const logistics = {
    production: cs.filter(c => c.stage === 'in_production').length,
    shipping: cs.filter(c => c.stage === 'shipping').length,
    warehouse: cs.filter(c => c.stage === 'arrived_warehouse').length,
    assigned: cs.filter(c => ['assigned', 'needs_finishing'].includes(c.stage)).length,
    installed: cs.filter(c => c.stage === 'installation_done').length,
    completed: cs.filter(c => c.stage === 'completed').length
  };

  // مهل
  let late = 0, soon = 0, safe = 0;
  for (const c of cs) {
    const st = deadlineStateOf(c);
    if (st === 'late') late++; else if (st === 'soon') soon++; else if (st === 'safe') safe++;
  }

  // تحتاج انتباه
  const attention = [];
  for (const c of cs) {
    if (c.stage === 'completed') continue;
    const reasons = [];
    if (deadlineStateOf(c) === 'late') reasons.push('تجاوزت مهلة التسليم');
    else if (deadlineStateOf(c) === 'soon') reasons.push('اقتربت مهلة التسليم');
    if (staleDaysOf(c) >= STALE_DAYS) reasons.push(`راكد منذ ${Math.floor(staleDaysOf(c))} يومًا`);
    if (remainingOf(c) > 0 && ['fully_paid', 'in_production', 'shipping', 'arrived_warehouse', 'assigned', 'needs_finishing', 'installation_done'].includes(c.stage))
      reasons.push(`متبقٍ غير محصّل: ${fmtMoney(remainingOf(c))}`);
    if (reasons.length) attention.push({ c, reasons });
  }
  attention.sort((a, b) => {
    const rank = (r) => r.some(x => x.includes('تجاوزت')) ? 0 : r.some(x => x.includes('راكد')) ? 1 : r.some(x => x.includes('اقتربت')) ? 2 : 3;
    return rank(a.reasons) - rank(b.reasons);
  });

  // ضمان وصيانة
  const warrantyActive = cs.filter(c => c.warranty?.until && new Date(c.warranty.until) > new Date()).length;
  let openTickets = 0, closedTickets = 0;
  for (const c of cs) for (const t of (c.maintenance || [])) { if (t.status === 'open') openTickets++; else closedTickets++; }

  // آخر النشاطات
  const activity = [];
  for (const c of cs) for (const h of (c.history || [])) activity.push({ at: h.at, by: h.by, text: h.text, id: c.id });
  activity.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const recent = activity.slice(0, 10);

  return {
    count: cs.length, totalValue, collected, remaining, collectRate,
    byStage, designersArr, techsArr, logistics, late, soon, safe,
    attention, warrantyActive, openTickets, closedTickets, recent,
    avgCycle: avgCycleDays(cs)
  };
}

/** شريط تقدم أفقي بسيط (CSS). */
function reportBar(label, value, max, tone = 'gold', extra = '') {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const tones = { gold: 'bg-gold-500', sky: 'bg-sky-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500', indigo: 'bg-indigo-500', cyan: 'bg-cyan-500', violet: 'bg-violet-500' };
  return `
    <div class="mb-2.5">
      <div class="flex justify-between text-xs mb-1"><span class="text-mist-300 font-bold">${esc(label)}</span><span class="num text-mist-400">${extra || fmtNum(value)}</span></div>
      <div class="h-2 rounded-full bg-ink-700 overflow-hidden"><div class="${tones[tone] || 'bg-gold-500'} h-full rounded-full" style="width:${pct}%"></div></div>
    </div>`;
}

/** حلقة SVG لتوزيع المراحل. */
function reportDonut(segments) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const R = 54, C = 2 * Math.PI * R;
  if (!total) return '<p class="text-xs text-mist-500">لا توجد بيانات.</p>';
  let offset = 0;
  const arcs = segments.filter(x => x.value > 0).map(x => {
    const frac = x.value / total;
    const len = frac * C;
    const el = `<circle cx="70" cy="70" r="${R}" fill="none" stroke="${x.color}" stroke-width="18" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"></circle>`;
    offset += len;
    return el;
  }).join('');
  const legend = segments.filter(x => x.value > 0).map(x => `
    <li class="flex items-center gap-2 text-[11px]"><span class="w-3 h-3 rounded-sm inline-block" style="background:${x.color}"></span><span class="text-mist-300 flex-1">${esc(x.label)}</span><b class="num text-mist-100">${x.value}</b></li>`).join('');
  return `
  <div class="flex flex-col sm:flex-row items-center gap-4">
    <svg viewBox="0 0 140 140" class="w-32 h-32 shrink-0">
      <circle cx="70" cy="70" r="${R}" fill="none" stroke="#1e293b" stroke-width="18"></circle>
      ${arcs}
      <text x="70" y="66" text-anchor="middle" fill="#e2e8f0" font-size="20" font-weight="800">${fmtNum(total)}</text>
      <text x="70" y="84" text-anchor="middle" fill="#94a3b8" font-size="10">عقد</text>
    </svg>
    <ul class="space-y-1 flex-1 w-full">${legend}</ul>
  </div>`;
}

function renderReport() {
  const panel = $('#reportPanel');
  if (!panel) return;
  if (!canViewReport()) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');

  const r = computeReport();
  $('#rep_kpi').innerHTML = [
    { t: 'إجمالي قيمة العقود', v: fmtMoney(r.totalValue), i: 'fa-sack-dollar', c: 'text-mist-100' },
    { t: 'المحصَّل', v: fmtMoney(r.collected), i: 'fa-hand-holding-dollar', c: 'text-emerald-300' },
    { t: 'المتبقي غير المحصَّل', v: fmtMoney(r.remaining), i: 'fa-hourglass-half', c: 'text-gold-300' },
    { t: 'نسبة التحصيل', v: r.collectRate + '%', i: 'fa-percent', c: 'text-sky-300' },
    { t: 'إجمالي العقود', v: fmtNum(r.count), i: 'fa-layer-group', c: 'text-mist-200' },
    { t: 'متوسط زمن الدورة', v: r.avgCycle == null ? '—' : fmtNum(r.avgCycle) + ' يوم', i: 'fa-clock', c: 'text-violet-300' }
  ].map(x => `
    <div class="card !bg-ink-800/70 p-4">
      <div class="flex items-center justify-between mb-1"><i class="fa-solid ${x.i} ${x.c}"></i></div>
      <p class="text-lg font-head font-extrabold num ${x.c}">${x.v}</p>
      <p class="text-[11px] text-mist-400 font-bold mt-0.5">${x.t}</p>
    </div>`).join('');

  // حلقة المراحل
  const stageColors = ['#64748b', '#f59e0b', '#38bdf8', '#6366f1', '#8b5cf6', '#22d3ee', '#fb923c', '#eab308', '#a3e635', '#34d399'];
  $('#rep_stages').innerHTML = reportDonut(REPORT_STAGE_ORDER.map((k, i) => ({ label: STAGES[k]?.label || k, value: r.byStage[k] || 0, color: stageColors[i] })));

  // أداء المصممين
  const maxDes = Math.max(1, ...r.designersArr.map(d => d.count));
  $('#rep_designers').innerHTML = r.designersArr.length ? r.designersArr.map(d =>
    reportBar(d.name, d.count, maxDes, 'gold', `${fmtNum(d.count)} عقد • ${fmtMoney(d.value)}${d.avgDays != null ? ' • ' + d.avgDays + ' يوم' : ''}`)
  ).join('') : '<p class="text-xs text-mist-500">لا توجد عقود.</p>';

  // قمع اللوجستيات
  const lg = r.logistics;
  const maxLg = Math.max(1, lg.production, lg.shipping, lg.warehouse, lg.assigned, lg.installed, lg.completed);
  $('#rep_logistics').innerHTML = [
    reportBar('قيد التصنيع', lg.production, maxLg, 'indigo'),
    reportBar('قيد الشحن', lg.shipping, maxLg, 'violet'),
    reportBar('في مستودع المدينة', lg.warehouse, maxLg, 'cyan'),
    reportBar('مسندة للفنيين', lg.assigned, maxLg, 'amber'),
    reportBar('تم التركيب — بانتظار الاعتماد', lg.installed, maxLg, 'emerald'),
    reportBar('مكتملة ومعتمدة', lg.completed, maxLg, 'emerald')
  ].join('');

  // مؤشر المهل
  const dTotal = r.late + r.soon + r.safe;
  const seg = (v, cls, label) => dTotal ? `<div class="${cls} h-full" style="width:${Math.round(v / dTotal * 100)}%" title="${label}: ${v}"></div>` : '';
  $('#rep_deadlines').innerHTML = dTotal ? `
    <div class="flex h-4 rounded-full overflow-hidden bg-ink-700 mb-3">
      ${seg(r.safe, 'bg-emerald-500', 'ضمن المهلة')}${seg(r.soon, 'bg-amber-500', 'تقترب')}${seg(r.late, 'bg-rose-500', 'متأخرة')}
    </div>
    <div class="grid grid-cols-3 gap-2 text-center text-xs">
      <div class="bg-ink-800/70 rounded-lg py-2"><b class="num text-emerald-300 block text-lg">${r.safe}</b><span class="text-mist-500">ضمن المهلة</span></div>
      <div class="bg-ink-800/70 rounded-lg py-2"><b class="num text-amber-300 block text-lg">${r.soon}</b><span class="text-mist-500">تقترب (≤5 أيام)</span></div>
      <div class="bg-ink-800/70 rounded-lg py-2"><b class="num text-rose-300 block text-lg">${r.late}</b><span class="text-mist-500">متأخرة</span></div>
    </div>` : '<p class="text-xs text-mist-500">لا توجد مهل تسليم نشطة.</p>';

  // تحتاج انتباه
  $('#rep_attention').innerHTML = r.attention.length ? r.attention.slice(0, 10).map(a => `
    <div class="flex flex-wrap items-center gap-2 bg-ink-800/70 border border-ink-600 rounded-xl px-3 py-2">
      <span class="chip num border-ink-500 bg-ink-700 text-mist-200">${esc(a.c.id)}</span>
      <span class="text-sm font-bold flex-1 min-w-[140px]">${esc(a.c.customer?.name || '—')}</span>
      <span class="text-[11px] text-rose-300/90 flex-1 min-w-[180px]">${esc(a.reasons.join(' • '))}</span>
      <button class="btn-ghost !py-1.5 !px-2.5 !text-[11px]" data-act="openDetails" data-id="${esc(a.c.id)}"><i class="fa-solid fa-folder-open"></i> فتح</button>
    </div>`).join('') : '<p class="text-xs text-emerald-300/90"><i class="fa-solid fa-circle-check me-1"></i> لا توجد عقود تحتاج انتباهًا عاجلًا.</p>';

  // أداء الفنيين
  $('#rep_techs').innerHTML = r.techsArr.length ? `
    <table class="w-full text-xs">
      <thead><tr class="text-mist-500 text-[11px]"><th class="text-start py-1.5">الفني</th><th class="text-center">المهام</th><th class="text-center">مكتملة</th><th class="text-center">تشطيبات</th></tr></thead>
      <tbody>${r.techsArr.map(t => `<tr class="border-t border-ink-700"><td class="py-1.5 font-bold">${esc(t.name)}</td><td class="text-center num">${t.total}</td><td class="text-center num text-emerald-300">${t.done}</td><td class="text-center num text-yellow-300">${t.finishing}</td></tr>`).join('')}</tbody>
    </table>` : '<p class="text-xs text-mist-500">لم يُسند أي عمل لفنيين بعد.</p>';

  // ضمان وصيانة
  $('#rep_warranty').innerHTML = `
    <div class="grid grid-cols-3 gap-2 text-center text-xs">
      <div class="bg-ink-800/70 rounded-lg py-2"><b class="num text-emerald-300 block text-lg">${r.warrantyActive}</b><span class="text-mist-500">ضمان نشط</span></div>
      <div class="bg-ink-800/70 rounded-lg py-2"><b class="num text-rose-300 block text-lg">${r.openTickets}</b><span class="text-mist-500">تذاكر مفتوحة</span></div>
      <div class="bg-ink-800/70 rounded-lg py-2"><b class="num text-mist-300 block text-lg">${r.closedTickets}</b><span class="text-mist-500">تذاكر مغلقة</span></div>
    </div>`;

  // آخر النشاطات
  $('#rep_activity').innerHTML = r.recent.length ? `<ul class="space-y-2">${r.recent.map(a => `
    <li class="flex gap-2 text-xs"><span class="num text-mist-500 shrink-0">${fmtDate(a.at)}</span><span class="num text-gold-300 shrink-0">${esc(a.id)}</span><span class="text-mist-300 flex-1">${esc(a.text)} <span class="text-mist-500">— ${esc(a.by || '')}</span></span></li>`).join('')}</ul>` : '<p class="text-xs text-mist-500">لا يوجد نشاط بعد.</p>';
}

/* =====================================================================
   تصدير التقرير والبيانات
   ===================================================================== */
function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function actExportCSV() {
  const cs = S.data?.contracts || [];
  if (!cs.length) return toast('لا توجد عقود للتصدير.', 'warn');
  const header = ['رقم العقد', 'اسم العميل', 'الجوال', 'العنوان', 'المصمم', 'المرحلة', 'الإجمالي', 'المدفوع', 'المتبقي', 'تاريخ الإنشاء', 'مهلة التسليم', 'الفني', 'تاريخ التركيب', 'الضمان حتى', 'تذاكر مفتوحة'];
  const rows = cs.map(c => [
    c.id, c.customer?.name, c.customer?.phone, c.customer?.address, c.designer,
    (STAGES[c.stage]?.label || c.stage), (c.payment?.total || 0), paidOf(c), remainingOf(c),
    c.createdAt ? fmtDate(c.createdAt) : '', c.drawing?.deadline ? fmtDate(c.drawing.deadline) : '',
    c.technician?.name || '', c.installation?.installedAt ? fmtDate(c.installation.installedAt) : '',
    c.warranty?.until ? fmtDate(c.warranty.until) : '',
    (c.maintenance || []).filter(t => t.status === 'open').length
  ]);
  const csv = '\uFEFF' + [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `borj-contracts-${nowISO().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`تم تصدير ${cs.length} عقدًا إلى ملف CSV.`, 'ok');
}

function actPrintReport() {
  if (!canViewReport()) return toast('التقرير متاح للمدير العام فقط.', 'err');
  switchTab('contracts');
  setTimeout(() => window.print(), 60);
}

/* ---------------------- كرت عقد ---------------------- */
function primaryAction(c) {
  const btn = (act, label, icon, cls = 'btn-gold', disabled = false, title = '') =>
    `<button class="${cls} !py-2 !px-3 text-xs" data-act="${act}" data-id="${c.id}" ${disabled ? 'disabled title="' + title + '"' : ''}><i class="fa-solid ${icon}"></i> ${label}</button>`;

  switch (c.stage) {
    case 'new':
    case 'deposit_paid':
      return canPay() ? btn('openPay', 'تسجيل دفعة', 'fa-cash-register') : '';
    case 'fully_paid':
      return canPay()
        ? (canUploadDrawing(c) ? btn('openDrawing', 'رفع رسمة المصنع', 'fa-file-import')
                               : btn('openDrawing', 'رفع رسمة المصنع', 'fa-lock', 'btn-ghost', true, 'متاح بعد السداد الكامل فقط'))
        : '';
    case 'in_production':
      return canLogistics() ? btn('startShipping', 'بدء الشحن من القصيم', 'fa-truck-fast', 'btn-sky') : '';
    case 'shipping':
      return canLogistics() ? btn('arrive', 'تم الوصول إلى مستودع المدينة', 'fa-warehouse', 'btn-emerald') : '';
    case 'arrived_warehouse':
      return canLogistics() ? btn('openAssign', 'إسناد لفني تركيب', 'fa-user-gear') : '';
    case 'assigned':
    case 'needs_finishing':
      return (techOwn(c) || isSupervisor()) ? btn('openDetails', 'تحديث حالة التركيب', 'fa-screwdriver-wrench') : '';
    case 'installation_done':
      return canClose() ? btn('closeFile', 'اعتماد وإنهاء الملف', 'fa-flag-checkered', 'btn-emerald') : '';
    case 'completed':
      return canTicket() ? btn('openTicket', 'فتح تذكرة صيانة', 'fa-screwdriver-wrench', 'btn-ghost') : '';
    default: return '';
  }
}

function contractCard(c) {
  const rem = remainingOf(c);
  const mine = techOwn(c) || (effRole() === 'designer' && c.designer === effPerson());
  return `
  <div class="card p-5 ${mine ? '!border-gold-500/40' : ''}">
    <div class="flex flex-wrap items-center gap-2 mb-3">
      <span class="chip border-ink-500 bg-ink-700 text-mist-200 num"><i class="fa-solid fa-hashtag"></i> ${esc(c.id)}</span>
      ${stageChip(c.stage)}
      ${countdownHTML(c)}
      ${warrantyChip(c)}
      ${mine ? '<span class="chip border-gold-500/30 bg-gold-500/10 text-gold-300"><i class="fa-solid fa-thumbtack"></i> ملفك</span>' : ''}
    </div>
    <h3 class="font-head font-extrabold text-lg mb-1"><i class="fa-regular fa-user text-mist-500 me-2 text-sm"></i>${esc(c.customer?.name)}</h3>
    <p class="text-sm text-mist-400 mb-3"><i class="fa-solid fa-location-dot me-1.5 text-mist-500"></i>${esc(c.customer?.address || '—')}</p>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-4">
      <div class="bg-ink-800/70 rounded-xl px-3 py-2"><span class="text-mist-500 block">الجوال</span><a href="tel:${esc(c.customer?.phone)}" dir="ltr" class="num text-mist-100 font-bold text-left block">${esc(c.customer?.phone)}</a></div>
      <div class="bg-ink-800/70 rounded-xl px-3 py-2"><span class="text-mist-500 block">المصمم</span><span class="font-bold">${esc(c.designer)}</span></div>
      <div class="bg-ink-800/70 rounded-xl px-3 py-2"><span class="text-mist-500 block">الإجمالي</span><span class="num font-bold">${fmtMoney(c.payment?.total)}</span></div>
      <div class="bg-ink-800/70 rounded-xl px-3 py-2"><span class="text-mist-500 block">المتبقي</span><span class="num font-bold ${rem > 0 ? 'text-gold-300' : 'text-emerald-300'}">${fmtMoney(rem)}</span></div>
    </div>
    ${c.technician?.name ? `<p class="text-xs text-mist-400 mb-3"><i class="fa-solid fa-user-gear me-1.5 text-mist-500"></i>الفني المسؤول: <b class="text-mist-200">${esc(c.technician.name)}</b></p>` : ''}
    <div class="flex flex-wrap gap-2">
      ${primaryAction(c)}
      <button class="btn-ghost !py-2 !px-3 text-xs" data-act="openDetails" data-id="${c.id}"><i class="fa-solid fa-file-lines"></i> التفاصيل الكاملة</button>
    </div>
  </div>`;
}

function applyFilters(cs) {
  const q = normAr(S.filters.q);
  return cs.filter(c => {
    if (S.filters.designer && c.designer !== S.filters.designer) return false;
    const st = S.filters.stage;
    if (st) {
      if (st === 'awaiting_pay' && !['new', 'deposit_paid'].includes(c.stage)) return false;
      else if (st === 'awaiting_drawing' && c.stage !== 'fully_paid') return false;
      else if (st === 'production_shipping' && !['in_production', 'shipping'].includes(c.stage)) return false;
      else if (st === 'warehouse_install' && !['arrived_warehouse', 'assigned', 'needs_finishing', 'installation_done'].includes(c.stage)) return false;
      else if (st === 'completed' && c.stage !== 'completed') return false;
    }
    if (q) {
      const hay = normAr([c.id, c.customer?.name, c.customer?.phone].join(' '));
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderContracts() {
  const cs = applyFilters(S.data?.contracts || []);
  cs.sort((a, b) => (STEP_ORDER.indexOf(a.stage) - STEP_ORDER.indexOf(b.stage)) || (b.createdAt > a.createdAt ? 1 : -1));
  $('#contractsList').innerHTML = cs.map(contractCard).join('');
  $('#contractsEmpty').classList.toggle('hidden', cs.length > 0);
  $('#fltDesigner').innerHTML = '<option value="">كل المصممين</option>' +
    (S.data?.settings?.designers || []).map(d => `<option value="${esc(d)}" ${S.filters.designer === d ? 'selected' : ''}>${esc(d)}</option>`).join('');
}

/* ---------------------- المستودع واللوجستيات ---------------------- */
function whSection(title, icon, cls, items, note = '') {
  if (!items.length) return '';
  return `
  <div class="card p-5">
    <div class="flex items-center justify-between mb-4">
      <h3 class="sec-title"><i class="fa-solid ${icon} ${cls} me-2"></i>${title}</h3>
      <span class="chip border-ink-600 bg-ink-800 text-mist-300 num">${items.length}</span>
    </div>
    ${note ? `<p class="text-[11px] text-mist-500 mb-3">${note}</p>` : ''}
    <div class="space-y-3">${items.map(c => whItem(c)).join('')}</div>
  </div>`;
}

function whItem(c) {
  const isMine = techOwn(c);
  const actions = [];
  if (c.stage === 'shipping' && canLogistics())
    actions.push(`<button class="btn-emerald !py-2 !px-3 text-xs" data-act="arrive" data-id="${c.id}"><i class="fa-solid fa-warehouse"></i> تم الوصول إلى مستودع المدينة</button>`);
  if (c.stage === 'arrived_warehouse' && canLogistics())
    actions.push(`<button class="btn-gold !py-2 !px-3 text-xs" data-act="openAssign" data-id="${c.id}"><i class="fa-solid fa-user-gear"></i> إسناد لفني تركيب</button>`);
  if (['assigned', 'needs_finishing'].includes(c.stage) && (isMine || isSupervisor())) {
    actions.push(`<button class="btn-emerald !py-2 !px-3 text-xs" data-act="installDone" data-id="${c.id}"><i class="fa-solid fa-circle-check"></i> تم الانتهاء من التركيب</button>`);
    if (c.stage === 'assigned')
      actions.push(`<button class="btn-ghost !py-2 !px-3 text-xs !text-yellow-300" data-act="needsFinishing" data-id="${c.id}"><i class="fa-solid fa-paint-roller"></i> يحتاج بعض التشطيبات</button>`);
  }
  if (c.stage === 'installation_done' && canClose())
    actions.push(`<button class="btn-gold !py-2 !px-3 text-xs" data-act="closeFile" data-id="${c.id}"><i class="fa-solid fa-flag-checkered"></i> اعتماد وإنهاء الملف</button>`);
  actions.push(`<button class="btn-ghost !py-2 !px-3 text-xs" data-act="openDetails" data-id="${c.id}"><i class="fa-solid fa-file-lines"></i> تفاصيل</button>`);

  const customerLine = (isMine || effRole() !== 'technician')
    ? `<p class="text-xs text-mist-300 mt-1"><i class="fa-solid fa-phone me-1.5 text-mist-500"></i><a href="tel:${esc(c.customer?.phone)}" dir="ltr" class="num">${esc(c.customer?.phone)}</a> — ${esc(c.customer?.address || '')}</p>`
    : '';

  return `
  <div class="bg-ink-800/70 border ${isMine ? 'border-gold-500/40' : 'border-ink-600'} rounded-xl p-4">
    <div class="flex flex-wrap items-center gap-2 mb-1.5">
      <span class="chip border-ink-500 bg-ink-700 text-mist-200 num">${esc(c.id)}</span>
      ${stageChip(c.stage)}
      ${countdownHTML(c)}
      ${isMine ? '<span class="chip border-gold-500/30 bg-gold-500/10 text-gold-300"><i class="fa-solid fa-thumbtack"></i> مهمتك</span>' : ''}
    </div>
    <p class="font-bold text-sm">${esc(c.customer?.name)}</p>
    ${customerLine}
    ${c.technician?.name ? `<p class="text-[11px] text-mist-400 mt-1"><i class="fa-solid fa-user-gear me-1"></i>الفني: ${esc(c.technician.name)}</p>` : ''}
    ${c.stage === 'shipping' ? '<p class="text-[11px] text-violet-300/80 mt-1"><i class="fa-solid fa-truck-fast me-1"></i>في الطريق من القصيم — الوصول المتوقع خلال ~10 أيام من بدء الشحن</p>' : ''}
    <div class="flex flex-wrap gap-2 mt-3">${actions.join('')}</div>
  </div>`;
}

function renderWarehouse() {
  const cs = S.data?.contracts || [];
  const wrap = $('#whWrap');
  if (effRole() === 'technician') {
    const mine = cs.filter(c => techOwn(c) && ['assigned', 'needs_finishing', 'installation_done'].includes(c.stage));
    $('#whIntro').classList.add('hidden');
    wrap.innerHTML = whSection('مهام التركيب الخاصة بي', 'fa-screwdriver-wrench', 'text-gold-400', mine,
      'تأكد من الاتصال بالعميل مسبقًا، وبعد إتمام العمل اضغط «تم الانتهاء من التركيب». في حال وجود أعمال إضافية اضغط «يحتاج بعض التشطيبات».');
    wrap.classList.toggle('hidden', false);
    $('#whEmpty').classList.toggle('hidden', mine.length > 0);
    return;
  }
  $('#whIntro').classList.remove('hidden');
  const shipping = cs.filter(c => c.stage === 'shipping');
  const awaiting = cs.filter(c => c.stage === 'arrived_warehouse');
  const assigned = cs.filter(c => ['assigned', 'needs_finishing'].includes(c.stage));
  const installed = cs.filter(c => c.stage === 'installation_done');
  let html = '';
  html += whSection('قيد الشحن من القصيم إلى المدينة', 'fa-truck-fast', 'text-violet-300', shipping, 'يضغط مدير المستودع زر الوصول فور وصول الشحنة ليظهر التحديث فورًا أمام الجميع.');
  html += whSection('وصلت المستودع — بانتظار الإسناد', 'fa-warehouse', 'text-cyan-300', awaiting);
  html += whSection('مسندة للفنيين — قيد التركيب', 'fa-screwdriver-wrench', 'text-orange-300', assigned);
  html += whSection('تم التركيب — بانتظار اعتماد المشرف', 'fa-flag-checkered', 'text-lime-300', installed, 'المدير العام فقط هو المخول بإنهاء ملف العميل نهائيًا.');
  wrap.innerHTML = html;
  const any = shipping.length + awaiting.length + assigned.length + installed.length;
  $('#whEmpty').classList.toggle('hidden', any > 0);
}

/* ---------------------- البحث في الصيانة ---------------------- */
function renderSearch() {
  const q = normAr($('#mSearch').value);
  const res = $('#mResults');
  if (!q) { res.innerHTML = ''; $('#mHint').classList.remove('hidden'); return; }
  const cs = (S.data?.contracts || []).filter(c => normAr([c.id, c.customer?.name, c.customer?.phone].join(' ')).includes(q));
  $('#mHint').classList.toggle('hidden', true);
  if (!cs.length) {
    res.innerHTML = `<div class="card p-10 text-center text-mist-400"><i class="fa-regular fa-face-frown text-4xl mb-3 text-ink-500"></i><p class="font-bold">لا توجد نتائج مطابقة لـ «${esc($('#mSearch').value)}»</p><p class="text-xs mt-1">جرّب رقم الجوال أو رقم العقد أو جزءًا من الاسم.</p></div>`;
    return;
  }
  res.innerHTML = cs.map(c => {
    const tickets = c.maintenance || [];
    return `
    <div class="card p-5">
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <span class="chip border-ink-500 bg-ink-700 text-mist-200 num">${esc(c.id)}</span>
        ${stageChip(c.stage)} ${countdownHTML(c)} ${warrantyChip(c)}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-4">
        <div class="bg-ink-800/70 rounded-xl p-3"><span class="text-mist-500 text-[11px] block mb-1">العميل</span><b>${esc(c.customer?.name)}</b></div>
        <div class="bg-ink-800/70 rounded-xl p-3"><span class="text-mist-500 text-[11px] block mb-1">الجوال</span><a href="tel:${esc(c.customer?.phone)}" dir="ltr" class="num font-bold text-left block">${esc(c.customer?.phone)}</a></div>
        <div class="bg-ink-800/70 rounded-xl p-3 sm:col-span-2"><span class="text-mist-500 text-[11px] block mb-1">العنوان</span>${esc(c.customer?.address || '—')}</div>
        <div class="bg-ink-800/70 rounded-xl p-3"><span class="text-mist-500 text-[11px] block mb-1">تاريخ العقد</span><span class="num">${fmtDate(c.createdAt)}</span></div>
        <div class="bg-ink-800/70 rounded-xl p-3"><span class="text-mist-500 text-[11px] block mb-1">تاريخ التركيب</span><span class="num">${c.installation?.installedAt ? fmtDate(c.installation.installedAt) : 'لم يتم بعد'}</span></div>
        <div class="bg-ink-800/70 rounded-xl p-3"><span class="text-mist-500 text-[11px] block mb-1">رسمة المصنع</span>${c.drawing ? (c.drawing.url ? `<a href="${esc(c.drawing.url)}" target="_blank" rel="noopener" class="text-gold-300 hover:underline"><i class="fa-solid fa-file-arrow-down me-1"></i>${esc(c.drawing.name)}</a>` : esc(c.drawing.name || 'مرفوعة')) : '<span class="text-mist-500">لم تُرفع بعد</span>'}</div>
        <div class="bg-ink-800/70 rounded-xl p-3"><span class="text-mist-500 text-[11px] block mb-1">المبالغ</span><span class="num">الإجمالي ${fmtMoney(c.payment?.total)} — المتبقي ${fmtMoney(remainingOf(c))}</span></div>
      </div>
      <div class="mb-3">
        <p class="text-xs font-bold text-mist-300 mb-2"><i class="fa-solid fa-list-check me-1.5 text-gold-400"></i>تذاكر الصيانة (${tickets.length})</p>
        ${tickets.length ? `<div class="space-y-2">${tickets.map(t => `
          <div class="bg-ink-800/70 border border-ink-600 rounded-xl p-3 flex flex-wrap items-center gap-2">
            <span class="chip num ${t.status === 'open' ? 'bg-rose-500/15 text-rose-300 border-rose-400/20' : 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20'}">${t.status === 'open' ? '<i class="fa-solid fa-circle-dot"></i> مفتوحة' : '<i class="fa-solid fa-circle-check"></i> مغلقة'}</span>
            <span class="text-xs text-mist-500 num">${t.id}</span>
            <span class="text-sm flex-1 min-w-[200px]">${esc(t.description)}</span>
            ${t.technician ? `<span class="text-[11px] text-mist-400"><i class="fa-solid fa-user-gear me-1"></i>${esc(t.technician)}</span>` : ''}
            <span class="text-[11px] text-mist-500 num">${fmtDate(t.openedAt)}</span>
            ${t.status === 'open' && isSupervisor() ? `<button class="btn-ghost !py-1.5 !px-2.5 !text-[11px]" data-act="closeTicket" data-id="${c.id}" data-tid="${t.id}"><i class="fa-solid fa-check"></i> إغلاق</button>` : ''}
          </div>`).join('')}</div>` : '<p class="text-xs text-mist-500">لا توجد تذاكر صيانة سابقة.</p>'}
      </div>
      <div class="flex flex-wrap gap-2">
        ${canTicket() ? `<button class="btn-gold !py-2 !px-3 text-xs" data-act="openTicket" data-id="${c.id}"><i class="fa-solid fa-plus"></i> فتح تذكرة صيانة جديدة</button>` : ''}
        <button class="btn-ghost !py-2 !px-3 text-xs" data-act="openDetails" data-id="${c.id}"><i class="fa-solid fa-file-lines"></i> الملف الكامل</button>
      </div>
    </div>`;
  }).join('');
}

/* ---------------------- نافذة تفاصيل العقد ---------------------- */
function stepperHTML(c) {
  const idx = { new: 0, deposit_paid: 1, fully_paid: 2, in_production: 3, shipping: 3, arrived_warehouse: 4, assigned: 5, needs_finishing: 5, installation_done: 6, completed: 7 }[c.stage] ?? 0;
  return `
  <div class="flex flex-wrap gap-y-3 justify-between items-start bg-ink-800/50 border border-ink-700 rounded-2xl p-4">
    ${STEP_NAMES.map((n, i) => `
      <div class="flex flex-col items-center gap-1.5 min-w-[64px] flex-1">
        <span class="w-7 h-7 rounded-full grid place-items-center text-[10px] font-bold num ${i < idx ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30' : i === idx ? 'bg-gold-500 text-ink-950 shadow-md shadow-gold-500/30' : 'bg-ink-700 text-mist-500 border border-ink-600'}">${i < idx ? '<i class="fa-solid fa-check"></i>' : i + 1}</span>
        <span class="text-[9.5px] ${i <= idx ? 'text-mist-200 font-bold' : 'text-mist-500'} text-center leading-tight">${n}</span>
      </div>`).join('')}
  </div>`;
}

function infoRow(label, value, ltr = false) {
  return `<div class="bg-ink-800/70 rounded-xl px-3 py-2.5"><span class="text-mist-500 text-[11px] block mb-0.5">${label}</span><span class="text-sm font-bold ${ltr ? 'num text-left block' : ''}" ${ltr ? 'dir="ltr"' : ''}>${value}</span></div>`;
}

/**
 * زر رفع/تحديث رسمة المصنع — مصدر واحد للمنطق يتطابق مع قفل الأمان (canUploadDrawing).
 * تُعيد '' لمن لا يملك صلاحية الدفع أو بعد اكتمال الملف.
 */
function drawingButtonHTML(c) {
  if (!canPay()) return '';
  if (['completed', 'deposit_paid', 'new'].includes(c.stage) && !isSupervisor()) {
    // قفل الأمان قبل السداد الكامل: زر معطّل بمظهر مقفل.
    return `<button class="btn-ghost !py-2 !px-3 text-xs mt-3 opacity-40 cursor-not-allowed" disabled title="قفل الأمان: متاح بعد السداد الكامل فقط"><i class="fa-solid fa-lock"></i> رفع رسمة المصنع — مقفل حتى السداد الكامل</button>`;
  }
  if (['new', 'deposit_paid'].includes(c.stage) && isSupervisor()) {
    return `<button class="btn-gold !py-2 !px-3 text-xs mt-3" data-act="openDrawing" data-id="${c.id}" title="تجاوز قفل السداد بصلاحية المدير العام"><i class="fa-solid fa-user-shield"></i> رفع رسمة المصنع (تجاوز القفل)</button>`;
  }
  if (['fully_paid', 'in_production'].includes(c.stage)) {
    const allowed = canUploadDrawing(c);
    return `<button class="btn-gold !py-2 !px-3 text-xs mt-3 ${allowed ? '' : 'opacity-40 cursor-not-allowed'}" data-act="openDrawing" data-id="${c.id}" ${allowed ? '' : 'disabled title="متاح بعد السداد الكامل فقط"'}><i class="fa-solid fa-cloud-arrow-up"></i> ${c.drawing ? 'تحديث الرسمة' : 'رفع رسمة المصنع'}</button>`;
  }
  return '';
}

function renderDetails(c) {
  $('#dt_name').textContent = c.customer?.name || '—';
  $('#dt_id').textContent = c.id;
  $('#dt_stage').outerHTML = `<span id="dt_stage">${stageChip(c.stage)}</span>`;
  $('#dt_countdown').outerHTML = `<span id="dt_countdown">${countdownHTML(c) + warrantyChip(c)}</span>`;

  const rem = remainingOf(c);
  const lockNote = (!canUploadDrawing(c))
    ? `<p class="text-[11px] text-rose-300/90 mt-2"><i class="fa-solid fa-lock me-1"></i>الرفع مقفل برمجيًا حتى السداد الكامل (المتبقي: ${fmtMoney(rem)}). يُستثنى من ذلك المدير العام.</p>`
    : (isSupervisor() && rem > 0 ? '<p class="text-[11px] text-gold-300/90 mt-2"><i class="fa-solid fa-user-shield me-1"></i>تجاوز قفل السداد بصلاحية المدير العام.</p>' : '');

  const payRows = (c.payment?.log || []).map(p => `
    <tr class="border-t border-ink-700">
      <td class="py-2 num">${fmtMoney(p.amount)}</td>
      <td class="py-2 text-mist-300 text-xs">${esc(p.kind)}</td>
      <td class="py-2 text-mist-400 text-xs">${esc(p.note || '—')}</td>
      <td class="py-2 text-mist-400 text-xs">${esc(p.by)}</td>
      <td class="py-2 text-mist-500 text-xs num">${fmtDate(p.at)}</td>
    </tr>`).join('');

  const tickets = (c.maintenance || []).map(t => `
    <div class="bg-ink-800/70 border border-ink-600 rounded-xl p-3 flex flex-wrap items-center gap-2">
      <span class="chip num ${t.status === 'open' ? 'bg-rose-500/15 text-rose-300 border-rose-400/20' : 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20'}">${t.status === 'open' ? '<i class="fa-solid fa-circle-dot"></i> مفتوحة' : '<i class="fa-solid fa-circle-check"></i> مغلقة'}</span>
      <span class="text-xs text-mist-500 num">${t.id}</span>
      <span class="text-sm flex-1 min-w-[180px]">${esc(t.description)}</span>
      <span class="text-[11px] text-mist-500 num">${fmtDate(t.openedAt)}</span>
      ${t.status === 'open' && isSupervisor() ? `<button class="btn-ghost !py-1.5 !px-2.5 !text-[11px]" data-act="closeTicket" data-id="${c.id}" data-tid="${t.id}"><i class="fa-solid fa-check"></i> إغلاق</button>` : ''}
    </div>`).join('');

  const hist = (c.history || []).slice().reverse().map(h => `
    <li class="relative ps-6 pb-4 last:pb-0">
      <span class="absolute start-0 top-1 w-2.5 h-2.5 rounded-full bg-gold-400 shadow shadow-gold-400/40"></span>
      <span class="absolute start-[4.5px] top-4 bottom-0 w-px bg-ink-600 last:hidden"></span>
      <p class="text-sm">${esc(h.text)}</p>
      <p class="text-[11px] text-mist-500 mt-0.5"><i class="fa-solid fa-user me-1"></i>${esc(h.by)} • <span class="num">${fmtDateTime(h.at)}</span></p>
    </li>`).join('');

  const progress = drawingProgress(c);

  $('#dt_body').innerHTML = `
    ${stepperHTML(c)}

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      ${infoRow('العميل', esc(c.customer?.name))}
      ${infoRow('رقم الجوال', `<a href="tel:${esc(c.customer?.phone)}" class="hover:text-gold-300">${esc(c.customer?.phone)}</a>`, true)}
      ${infoRow('العنوان في المدينة', esc(c.customer?.address))}
      ${infoRow('المصمم المسؤول', esc(c.designer))}
      ${infoRow('تاريخ فتح العقد', fmtDate(c.createdAt), true)}
      ${infoRow('ملاحظات', esc(c.notes || '—'))}
    </div>

    <div class="card !bg-ink-800/50 p-4">
      <h4 class="font-bold text-sm mb-3"><i class="fa-solid fa-wallet text-gold-400 me-2"></i>المبالغ والمدفوعات</h4>
      <div class="grid grid-cols-3 gap-2 mb-3 text-center">
        <div class="bg-ink-800 rounded-xl py-2.5"><span class="text-[11px] text-mist-500 block">الإجمالي</span><b class="num text-sm">${fmtMoney(c.payment?.total)}</b></div>
        <div class="bg-ink-800 rounded-xl py-2.5"><span class="text-[11px] text-mist-500 block">المدفوع</span><b class="num text-sm text-emerald-300">${fmtMoney(paidOf(c))}</b></div>
        <div class="bg-ink-800 rounded-xl py-2.5"><span class="text-[11px] text-mist-500 block">المتبقي</span><b class="num text-sm ${rem > 0 ? 'text-gold-300' : 'text-emerald-300'}">${fmtMoney(rem)}</b></div>
      </div>
      ${payRows ? `<div class="overflow-x-auto"><table class="w-full text-xs text-mist-200 mb-2"><thead><tr class="text-mist-500 text-[11px] text-start"><th class="py-1.5 text-start">المبلغ</th><th class="py-1.5 text-start">النوع</th><th class="py-1.5 text-start">ملاحظة</th><th class="py-1.5 text-start">بواسطة</th><th class="py-1.5 text-start">التاريخ</th></tr></thead><tbody>${payRows}</tbody></table></div>` : '<p class="text-xs text-mist-500 mb-2">لم تُسجَّل أي دفعات بعد.</p>'}
      ${['new', 'deposit_paid'].includes(c.stage) && canPay() ? `<button class="btn-gold !py-2 !px-3 text-xs" data-act="openPay" data-id="${c.id}"><i class="fa-solid fa-cash-register"></i> تسجيل دفعة</button>` : ''}
    </div>

    <div class="card !bg-ink-800/50 p-4">
      <h4 class="font-bold text-sm mb-3"><i class="fa-solid fa-file-import text-gold-400 me-2"></i>رسمة المصنع ومهلة التسليم</h4>
      ${c.drawing ? `
        <div class="flex flex-wrap items-center gap-2 mb-2">
          <span class="chip bg-sky-500/15 text-sky-300 border-sky-400/20"><i class="fa-solid fa-check"></i> مرفوعة</span>
          ${c.drawing.url ? `<a href="${esc(c.drawing.url)}" target="_blank" rel="noopener" class="chip border-gold-500/30 bg-gold-500/10 text-gold-300 hover:brightness-125"><i class="fa-solid fa-file-arrow-down"></i> ${esc(c.drawing.name)}</a>` : `<span class="text-sm">${esc(c.drawing.name)}</span>`}
        </div>
        <p class="text-xs text-mist-400">رُفعت بواسطة ${esc(c.drawing.uploadedBy)} — <span class="num">${fmtDateTime(c.drawing.uploadedAt)}</span> • مهلة ${c.drawing.deadlineDays} يومًا تنتهي <span class="num">${fmtDate(c.drawing.deadline)}</span></p>
        <div class="h-2 bg-ink-700 rounded-full overflow-hidden mt-3"><div class="h-full bg-gradient-to-l from-gold-600 to-gold-400 rounded-full" style="width:${progress}%"></div></div>
      ` : '<p class="text-xs text-mist-500">لم تُرفع الرسمة بعد — يتطلب ذلك السداد الكامل أولاً.</p>'}
      ${lockNote}
      ${drawingButtonHTML(c)}
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div class="card !bg-ink-800/50 p-4">
        <h4 class="font-bold text-sm mb-3"><i class="fa-solid fa-truck-fast text-gold-400 me-2"></i>التصنيع والشحن</h4>
        <div class="space-y-2 text-xs">
          <p class="flex justify-between"><span class="text-mist-500">بدء التصنيع (بعد الرسمة)</span><span class="num">${c.production?.startedAt ? fmtDate(c.production.startedAt) : '—'}</span></p>
          <p class="flex justify-between"><span class="text-mist-500">بدء الشحن من القصيم</span><span class="num">${c.shipping?.startedAt ? fmtDate(c.shipping.startedAt) : '—'}</span></p>
          <p class="flex justify-between"><span class="text-mist-500">الوصول لمستودع المدينة</span><span class="num">${c.shipping?.arrivedAt ? fmtDate(c.shipping.arrivedAt) : '—'}</span></p>
        </div>
        ${c.stage === 'in_production' && canLogistics() ? `<button class="btn-sky !py-2 !px-3 text-xs mt-3" data-act="startShipping" data-id="${c.id}"><i class="fa-solid fa-truck-fast"></i> بدء الشحن من القصيم</button>` : ''}
        ${c.stage === 'shipping' && canLogistics() ? `<button class="btn-emerald !py-2 !px-3 text-xs mt-3" data-act="arrive" data-id="${c.id}"><i class="fa-solid fa-warehouse"></i> تم الوصول إلى مستودع المدينة</button>` : ''}
      </div>
      <div class="card !bg-ink-800/50 p-4">
        <h4 class="font-bold text-sm mb-3"><i class="fa-solid fa-user-gear text-gold-400 me-2"></i>التركيب والاعتماد</h4>
        <div class="space-y-2 text-xs">
          <p class="flex justify-between"><span class="text-mist-500">الفني المسؤول</span><span>${esc(c.technician?.name || 'لم يُسند بعد')}</span></p>
          <p class="flex justify-between"><span class="text-mist-500">تاريخ الإسناد</span><span class="num">${c.technician?.assignedAt ? fmtDate(c.technician.assignedAt) : '—'}</span></p>
          <p class="flex justify-between"><span class="text-mist-500">تاريخ التركيب</span><span class="num">${c.installation?.installedAt ? fmtDate(c.installation.installedAt) : '—'}</span></p>
          <p class="flex justify-between"><span class="text-mist-500">الضمان (15 سنة)</span><span class="num">${c.warranty?.until ? fmtDate(c.warranty.until) : 'يُفعّل بعد التركيب'}</span></p>
        </div>
        <div class="flex flex-wrap gap-2 mt-3">
          ${c.stage === 'arrived_warehouse' && canLogistics() ? `<button class="btn-gold !py-2 !px-3 text-xs" data-act="openAssign" data-id="${c.id}"><i class="fa-solid fa-user-gear"></i> إسناد لفني</button>` : ''}
          ${['assigned', 'needs_finishing'].includes(c.stage) && (techOwn(c) || isSupervisor()) ? `
            <button class="btn-emerald !py-2 !px-3 text-xs" data-act="installDone" data-id="${c.id}"><i class="fa-solid fa-circle-check"></i> تم الانتهاء من التركيب</button>
            ${c.stage === 'assigned' ? `<button class="btn-ghost !py-2 !px-3 text-xs !text-yellow-300" data-act="needsFinishing" data-id="${c.id}"><i class="fa-solid fa-paint-roller"></i> يحتاج بعض التشطيبات</button>` : ''}` : ''}
          ${c.stage === 'installation_done' && canClose() ? `<button class="btn-gold !py-2 !px-3 text-xs" data-act="closeFile" data-id="${c.id}"><i class="fa-solid fa-flag-checkered"></i> اعتماد وإنهاء الملف نهائيًا</button>` : ''}
        </div>
      </div>
    </div>

    <div class="card !bg-ink-800/50 p-4">
      <h4 class="font-bold text-sm mb-3"><i class="fa-solid fa-screwdriver-wrench text-gold-400 me-2"></i>تذاكر الصيانة (${(c.maintenance || []).length})</h4>
      ${tickets || '<p class="text-xs text-mist-500">لا توجد تذاكر صيانة.</p>'}
      ${canTicket() ? `<button class="btn-ghost !py-2 !px-3 text-xs mt-3" data-act="openTicket" data-id="${c.id}"><i class="fa-solid fa-plus"></i> فتح تذكرة صيانة</button>` : ''}
    </div>

    <div class="card !bg-ink-800/50 p-4">
      <h4 class="font-bold text-sm mb-4"><i class="fa-solid fa-clock-rotate-left text-gold-400 me-2"></i>سجل العقد (${(c.history || []).length} حركة)</h4>
      <ul>${hist}</ul>
    </div>`;
}

/* ---------------------- تبويب عقد جديد ---------------------- */
function renderNewTab() {
  const ok = canCreate();
  $('#ncNotice').classList.toggle('hidden', ok);
  $$('#formNew input, #formNew select, #formNew button').forEach(el => { el.disabled = !ok; });
  const designers = S.data?.settings?.designers || [];
  const sel = $('#nc_designer');
  const cur = sel.value;
  sel.innerHTML = designers.map(d => `<option value="${esc(d)}" ${effRole() === 'designer' && effPerson() === d ? 'selected' : ''}>${esc(d)}</option>`).join('');
  if (cur) sel.value = cur;
}

/* ---------------------- العرض الكامل ---------------------- */
function renderModeBadge() {
  const badge = $('#modeBadge');
  if (!badge) return;
  if (S.mode === 'supabase') badge.outerHTML = `<span id="modeBadge" class="chip bg-emerald-500/15 text-emerald-300 border-emerald-400/20"><i class="fa-solid fa-cloud"></i> متصل: قاعدة البيانات السحابية</span>`;
  else if (S.mode === 'github') badge.outerHTML = `<span id="modeBadge" class="chip bg-emerald-500/15 text-emerald-300 border-emerald-400/20"><i class="fa-brands fa-github"></i> متصل: ${esc(S.cfg.owner)}/${esc(S.cfg.repo)}</span>`;
  else if (S.mode === 'offline') badge.outerHTML = `<span id="modeBadge" class="chip bg-amber-500/15 text-amber-300 border-amber-400/20"><i class="fa-solid fa-triangle-exclamation"></i> غير متصل — نسخة مؤقتة (قراءة فقط)</span>`;
  else badge.outerHTML = `<span id="modeBadge" class="chip bg-gold-500/15 text-gold-300 border-gold-400/20"><i class="fa-solid fa-flask"></i> وضع تجريبي محلي</span>`;
}

function renderHeader() {
  renderModeBadge();
  const chip = $('#identityChip');
  if (effRole() && !S.techPortal) {
    chip.classList.remove('hidden');
    chip.innerHTML = `<i class="fa-solid ${ROLE_DEFS[effRole()].icon}"></i> ${ROLE_DEFS[effRole()].label}${effPerson() ? ' — ' + esc(effPerson()) : ''}`;
  } else if (!S.techPortal) chip.classList.add('hidden');
  // في الوضع السحابي: تُخفى قائمة تبديل الدور ويظهر زر الخروج.
  const cloud = !!(S.sbSession?.access_token && S.mode === 'supabase');
  const rs = $('#roleSel'), ps = $('#personSel'), sw = $('#btnSwitch'), lo = $('#btnLogout');
  if (rs) rs.classList.toggle('hidden', cloud);
  if (ps && cloud) ps.classList.add('hidden');
  if (sw) sw.classList.toggle('hidden', cloud);
  if (lo) lo.classList.toggle('hidden', !cloud);
  // زر «اعرض كموظف»: للمدير الحقيقي فقط في الوضع السحابي، ويُخفى أثناء الاستعراض نفسه.
  const va = $('#btnViewAs');
  if (va) va.classList.toggle('hidden', !(cloud && S.role === 'supervisor' && !S.viewAs));
  renderViewAsBanner();
}

/** شريط الاستعراض أعلى الصفحة — يظهر أثناء «عرض المنظومة كموظف». */
function renderViewAsBanner() {
  const bar = $('#viewAsBanner');
  if (!bar) return;
  const on = !!S.viewAs;
  bar.classList.toggle('hidden', !on);
  if (on) {
    const who = $('#viewAsWho');
    if (who) who.textContent = `${ROLE_DEFS[S.viewAs.role]?.label || S.viewAs.role}${S.viewAs.person ? ' — ' + S.viewAs.person : ''}`;
  }
}

function renderAll() {
  if (S.techPortal) { renderTechPortal(); return; }
  renderHeader();
  renderReport();
  renderStats();
  renderContracts();
  renderWarehouse();
  renderSearch();
  renderNewTab();
  if (S.curId) {
    const c = (S.data?.contracts || []).find(x => x.id === S.curId);
    if (c) renderDetails(c);
  }
}

function switchTab(name) {
  S.tab = name;
  $$('.tabbtn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  ['contracts', 'new', 'warehouse', 'maintenance'].forEach(t => {
    $('#tab-' + t).classList.toggle('hidden', t !== name);
    $('#tab-' + t).classList.toggle('fade-in', t === name);
  });
  if (name === 'maintenance') $('#mSearch').focus();
}

/* =====================================================================
   بوابة الفنيين — واجهة مستقلّة بلا هوية ولا كلمة مرور
   تُعرض كل العقود قيد التركيب، ومعها رسمة المصنع وبيانات العميل والموعد.
   ===================================================================== */
function techTokenReady() { return TECH_SHARED_TOKEN && TECH_SHARED_TOKEN !== 'PUT_YOUR_FINE_GRAINED_PAT_HERE'; }

function enterTechnicianPortal() {
  S.techPortal = true;
  S.role = 'technician';
  S.person = '';
  closeOnboard();
  // تهيئة اتصال الكتابة للفني: رمز مشترك عندما يكون مضبوطًا، وإلا وضع تجريبي محلي.
  if (techTokenReady()) {
    S.cfg = { owner: TECH_OWNER, repo: TECH_REPO, branch: 'main', path: 'data/contracts.json', token: TECH_SHARED_TOKEN };
  } else {
    S.cfg = { owner: '', repo: '', branch: 'main', path: 'data/contracts.json', token: '' };
  }
  loadData().then(() => { applyPortalChrome(); renderTechPortal(); });
  applyPortalChrome();
  renderTechPortal();
  toast(techTokenReady() ? 'مرحبًا بك في بوابة الفنيين — أي تأكيد يُحدَّث فورًا في المستودع.' : 'بوابة الفنيين (وضع تجريبي) — لم يُضبط رمز الفنيين بعد، لذا يُحفظ محليًا فقط.', techTokenReady() ? 'ok' : 'warn');
}

function exitTechnicianPortal() {
  S.techPortal = false;
  S.role = null; S.person = '';
  LS.set(STORE.role, null);
  S.cfg = LS.get(STORE.cfg, { owner: '', repo: '', branch: 'main', path: 'data/contracts.json', token: '' });
  applyPortalChrome();
  switchTab(S.tab || 'contracts');   // أعِد إظهار التبويب النشط بعد إخفاء البوابة
  loadData().then(() => renderAll());
  openOnboard('role');
}

/** إظهار/إخفاء عناصر الواجهة حسب كوننا داخل بوابة الفنيين. */
function applyPortalChrome() {
  const on = S.techPortal;
  const headerNav = document.querySelector('header nav');
  if (headerNav) headerNav.classList.toggle('hidden', on);
  ['#roleSel', '#personSel', '#btnSettings', '#btnSwitch', '#btnLogout', '#btnViewAs'].forEach(s => { const el = $(s); if (el) el.classList.toggle('hidden', on); });
  ['#tab-contracts', '#tab-new', '#tab-warehouse', '#tab-maintenance'].forEach(s => { const el = $(s); if (el) el.classList.toggle('hidden', on); });
  const portal = $('#techPortal');
  if (portal) portal.classList.toggle('hidden', !on);
  const chip = $('#identityChip');
  if (chip) {
    if (on) { chip.classList.remove('hidden'); chip.innerHTML = '<i class="fa-solid fa-screwdriver-wrench"></i> بوابة الفنيين'; }
  }
}

function techDeadlineLine(c) {
  const dl = c.drawing?.deadline;
  const ship = c.shipping?.startedAt;
  const parts = [];
  if (dl) parts.push(`مهلة التسليم: <b class="num">${fmtDate(dl)}</b>`);
  if (ship) parts.push(`بدأ الشحن: <b class="num">${fmtDate(ship)}</b>`);
  return parts.length ? parts.join(' • ') : 'لم تُحدَّد مهلة بعد.';
}

function techCard(c) {
  const drawing = c.drawing
    ? (c.drawing.url
        ? `<a href="${esc(c.drawing.url)}" target="_blank" rel="noopener" class="chip border-gold-500/30 bg-gold-500/10 text-gold-300 hover:brightness-125"><i class="fa-solid fa-file-arrow-down"></i> ${esc(c.drawing.name || 'رسمة المصنع')}</a>`
        : `<span class="chip border-ink-600 bg-ink-800 text-mist-200"><i class="fa-solid fa-file"></i> ${esc(c.drawing.name || 'مرفوعة')}</span>`)
    : '<span class="chip border-rose-400/20 bg-rose-500/10 text-rose-300"><i class="fa-solid fa-circle-exclamation"></i> لم تُرفع الرسمة بعد</span>';
  return `
  <div class="card p-5">
    <div class="flex flex-wrap items-center gap-2 mb-3">
      <span class="chip border-ink-500 bg-ink-700 text-mist-200 num"><i class="fa-solid fa-hashtag"></i> ${esc(c.id)}</span>
      ${stageChip(c.stage)}
      ${c.technician?.name ? `<span class="chip border-orange-400/20 bg-orange-500/10 text-orange-300"><i class="fa-solid fa-user-gear"></i> ${esc(c.technician.name)}</span>` : ''}
      ${countdownHTML(c)}
    </div>
    <h3 class="font-head font-extrabold text-lg mb-1"><i class="fa-regular fa-user text-mist-500 me-2 text-sm"></i>${esc(c.customer?.name)}</h3>
    <p class="text-sm text-mist-400 mb-3"><i class="fa-solid fa-location-dot me-1.5 text-mist-500"></i>${esc(c.customer?.address || '—')}</p>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs mb-3">
      <div class="bg-ink-800/70 rounded-xl px-3 py-2"><span class="text-mist-500 block">الجوال</span><a href="tel:${esc(c.customer?.phone)}" dir="ltr" class="num text-mist-100 font-bold text-left block">${esc(c.customer?.phone || '—')}</a></div>
      <div class="bg-ink-800/70 rounded-xl px-3 py-2 sm:col-span-2"><span class="text-mist-500 block">الموعد / المهلة</span><span class="text-mist-100 font-bold">${techDeadlineLine(c)}</span></div>
    </div>
    <div class="flex flex-wrap items-center gap-2 mb-4">
      <span class="text-mist-500 text-xs">رسمة المصنع:</span> ${drawing}
    </div>
    <div class="flex flex-wrap gap-2">
      ${['assigned', 'needs_finishing'].includes(c.stage) ? `
        <button class="btn-emerald !py-2 !px-3 text-xs" data-act="installDone" data-id="${c.id}"><i class="fa-solid fa-circle-check"></i> تم الانتهاء من التركيب</button>
        <button class="btn-ghost !py-2 !px-3 text-xs !text-yellow-300" data-act="needsFinishing" data-id="${c.id}"><i class="fa-solid fa-paint-roller"></i> يحتاج بعض التشطيبات</button>
      ` : `<span class="chip border-lime-400/20 bg-lime-500/10 text-lime-300"><i class="fa-solid fa-clipboard-check"></i> تم التركيب — بانتظار اعتماد المشرف</span>`}
      <button class="btn-ghost !py-2 !px-3 text-xs" data-act="openDetails" data-id="${c.id}"><i class="fa-solid fa-file-lines"></i> التفاصيل</button>
    </div>
  </div>`;
}

function renderTechPortal() {
  const wrap = $('#techWrap');
  if (!wrap) return;
  renderModeBadge();
  const chip = $('#identityChip');
  if (chip) { chip.classList.remove('hidden'); chip.innerHTML = '<i class="fa-solid fa-screwdriver-wrench"></i> بوابة الفنيين'; }
  const cs = (S.data?.contracts || []).filter(c => techOwn(c) && ['assigned', 'needs_finishing', 'installation_done'].includes(c.stage));
  if (!cs.length) {
    wrap.innerHTML = '';
    const empty = $('#techEmpty'); if (empty) empty.classList.remove('hidden');
    return;
  }
  const empty = $('#techEmpty'); if (empty) empty.classList.add('hidden');
  const pending = cs.filter(c => ['assigned', 'needs_finishing'].includes(c.stage));
  const done = cs.filter(c => c.stage === 'installation_done');
  let html = '';
  if (pending.length) html += `<h3 class="sec-title mb-3"><i class="fa-solid fa-screwdriver-wrench text-gold-400 me-2"></i>مهام قيد التركيب (${pending.length})</h3><div class="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-6">${pending.map(techCard).join('')}</div>`;
  if (done.length) html += `<h3 class="sec-title mb-3"><i class="fa-solid fa-clipboard-check text-lime-400 me-2"></i>تم تركيبها — بانتظار الاعتماد (${done.length})</h3><div class="grid grid-cols-1 xl:grid-cols-2 gap-5">${done.map(techCard).join('')}</div>`;
  wrap.innerHTML = html;
}

/* =====================================================================
   النوافذ والتنبيهات المساعدة
   ===================================================================== */
function busy(on, text = 'جارٍ المعالجة…') {
  $('#busyText').textContent = text;
  $('#busy').classList.toggle('hidden', !on);
  $('#busy').classList.toggle('flex', on);
}
function openModal(id) {
  const m = $('#' + id);
  m.classList.remove('hidden'); m.classList.add('flex');
  document.body.style.overflow = 'hidden';
}
function closeModal(el) {
  const m = el.closest('.modal') || el;
  m.classList.add('hidden'); m.classList.remove('flex');
  document.body.style.overflow = '';
}
function closeAllModals() { $$('.modal').forEach(m => { m.classList.add('hidden'); m.classList.remove('flex'); }); document.body.style.overflow = ''; }

function toast(msg, type = 'ok') {
  const styles = {
    ok: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
    err: 'border-rose-400/30 bg-rose-500/10 text-rose-200',
    warn: 'border-amber-400/30 bg-amber-500/10 text-amber-200',
    info: 'border-sky-400/30 bg-sky-500/10 text-sky-200'
  };
  const icons = { ok: 'fa-circle-check', err: 'fa-circle-xmark', warn: 'fa-triangle-exclamation', info: 'fa-circle-info' };
  const el = document.createElement('div');
  el.className = `fade-in border ${styles[type]} backdrop-blur rounded-xl px-4 py-3 text-sm font-bold flex items-start gap-2 shadow-xl`;
  el.innerHTML = `<i class="fa-solid ${icons[type]} mt-0.5"></i><span class="flex-1">${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; setTimeout(() => el.remove(), 400); }, 4200);
}

function confirmDlg(title, msg, { danger = false, okLabel = 'تأكيد', icon = 'fa-circle-question' } = {}) {
  return new Promise(resolve => {
    $('#cf_title').textContent = title;
    $('#cf_msg').textContent = msg;
    $('#cf_icon').className = `fa-solid text-3xl mb-3 ${danger ? 'fa-triangle-exclamation text-rose-400' : icon + ' text-gold-400'}`;
    const ok = $('#cf_ok');
    ok.className = danger ? 'btn-danger flex-1' : 'btn-gold flex-1';
    ok.textContent = okLabel;
    S.confirmResolve = resolve;
    openModal('m-confirm');
  });
}

function findContract(id) { return (S.data?.contracts || []).find(c => c.id === id); }

function hist(data, c, text) {
  c.history = c.history || [];
  c.history.push({ at: nowISO(), by: byName(), text });
}

/**
 * الحصول على رقم متسلسل فريد آمن ضد التزامن.
 * يعتمد على أكبر معرّف موجود فعليًا (وليس العدّاد وحده) ثم يرفع العدّاد فوقه،
 * فيمنع تكرار المعرّفات حتى لو كان العدّاد قديمًا أو عاد خطوة عند دمج الأجهزة.
 * prefix: مثل 'BRJ-2026-' أو 'MT-'؛ width: عدد أرقام التسلسل.
 */
function nextSeq(data, counterKey, existingIds, prefix, width) {
  const re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)$');
  let maxExisting = 0;
  for (const id of existingIds) {
    const m = re.exec(id || '');
    if (m) maxExisting = Math.max(maxExisting, parseInt(m[1], 10));
  }
  const counter = parseInt(data.meta?.[counterKey], 10) || 1;
  const num = Math.max(counter, maxExisting + 1);
  data.meta = data.meta || {};
  data.meta[counterKey] = num + 1;
  return prefix + String(num).padStart(width, '0');
}

/* =====================================================================
   إجراءات دورة حياة العقد
   ===================================================================== */

/* ---------- إنشاء عقد جديد ---------- */
async function actCreateContract(e) {
  e.preventDefault();
  if (!canCreate()) return toast('ليست لديك صلاحية فتح العقود.', 'err');
  const name = $('#nc_name').value.trim();
  const phone = digitsOnly($('#nc_phone').value);
  const address = $('#nc_address').value.trim();
  const designer = $('#nc_designer').value;
  const total = Math.round(+$('#nc_total').value || 0);
  const deposit = Math.round(+$('#nc_deposit').value || 0);
  const notes = $('#nc_notes').value.trim();

  if (name.length < 3) return toast('أدخل اسم العميل كاملًا (3 أحرف على الأقل).', 'err');
  if (!isValidSaudiPhone(phone)) return toast('رقم الجوال غير صحيح — الصيغة: 05xxxxxxxx أو 9665xxxxxxxx.', 'err');
  if (address.length < 5) return toast('أدخل عنوان العميل في المدينة المنورة.', 'err');
  if (!designer) return toast('اختر اسم المصمم (أضف المصممين من الإعدادات إن كانت القائمة فارغة).', 'err');
  if (total <= 0) return toast('أدخل المبلغ الإجمالي للعقد.', 'err');
  if (deposit < 0 || deposit > total) return toast('مبلغ العربون يجب أن يكون بين 0 والمبلغ الإجمالي.', 'err');

  const ok = await confirmDlg('إنشاء عقد جديد', `سيتم إنشاء عقد باسم «${name}» بإجمالي ${fmtMoney(total)}. هل المتابعة؟`);
  if (!ok) return;

  busy(true, 'جارٍ إنشاء العقد وحفظه…');
  try {
    let newId = '';
    await saveData((data) => {
      data.contracts = data.contracts || [];
      newId = nextSeq(data, 'nextNumber', data.contracts.map(x => x.id), `BRJ-${new Date().getFullYear()}-`, 4);
      const contract = {
        id: newId, createdAt: nowISO(),
        customer: { name, phone, address },
        designer,
        payment: { total, deposit, log: [] },
        stage: 'new',
        drawing: null, production: null, shipping: null, technician: null,
        installation: { status: 'pending', installedAt: null },
        closure: null, warranty: null,
        maintenance: [], notes,
        history: [{ at: nowISO(), by: byName(), text: 'إنشاء العقد' }]
      };
      data.contracts.unshift(contract);
    }, `عقد جديد ${newId} — ${name}`);
    $('#formNew').reset();
    $('#nc_remaining').textContent = '0';
    toast(`تم إنشاء العقد ${newId} بنجاح${S.mode !== 'github' ? ' (وضع تجريبي محلي)' : ' وحفظه في المستودع'}.`, 'ok');
    renderAll();
    switchTab('contracts');
  } catch (err) { toast('فشل الحفظ: ' + err.message, 'err'); }
  finally { busy(false); }
}

/* ---------- تسجيل دفعة ---------- */
function actOpenPay(id) {
  const c = findContract(id); if (!c || !canPay()) return;
  $('#pay_contract').innerHTML = `العقد <b class="num">${esc(c.id)}</b> — ${esc(c.customer?.name)} • المتبقي: <b class="num text-gold-300">${fmtMoney(remainingOf(c))}</b>`;
  $('#pay_amount').value = remainingOf(c) || '';
  $('#pay_kind').value = c.stage === 'new' ? 'عربون' : 'سداد نهائي';
  $('#pay_note').value = '';
  $('#formPayment').dataset.id = c.id;
  openModal('m-payment');
}

async function actSubmitPayment(e) {
  e.preventDefault();
  const id = e.target.dataset.id;
  const c = findContract(id); if (!c || !canPay()) return;
  const amount = Math.round(+$('#pay_amount').value || 0);
  const kind = $('#pay_kind').value;
  const note = $('#pay_note').value.trim();
  const rem = remainingOf(c);
  if (amount <= 0) return toast('أدخل مبلغًا صحيحًا.', 'err');
  if (amount > rem) return toast(`المبلغ يتجاوز المتبقي (${fmtMoney(rem)}).`, 'err');

  busy(true, 'جارٍ تسجيل الدفعة…');
  try {
    await saveData((data) => {
      const cc = data.contracts.find(x => x.id === id);
      cc.payment.log = cc.payment.log || [];
      cc.payment.log.push({ amount, kind, note, by: byName(), at: nowISO() });
      const paid = cc.payment.log.reduce((s, p) => s + (+p.amount || 0), 0);
      if (paid >= (cc.payment.total || 0) && ['new', 'deposit_paid'].includes(cc.stage)) {
        cc.stage = 'fully_paid';
        hist(data, cc, `تسجيل ${kind} بمبلغ ${fmtMoney(amount)} — أصبح العقد مسددًا بالكامل وانفتح رفع رسمة المصنع`);
      } else {
        hist(data, cc, `تسجيل ${kind} بمبلغ ${fmtMoney(amount)}${note ? ' — ' + note : ''}`);
      }
    }, `تسجيل دفعة ${fmtMoney(amount)} للعقد ${id}`);
    closeModal(e.target);
    toast(`تم تسجيل الدفعة بنجاح.${remainingOf(findContract(id)) <= 0 ? ' العقد الآن مسدد بالكامل — يمكن رفع رسمة المصنع.' : ''}`, 'ok');
    renderAll();
  } catch (err) { toast('فشل الحفظ: ' + err.message, 'err'); }
  finally { busy(false); }
}

/* ---------- رفع رسمة المصنع (مع قفل الأمان) ---------- */
function actOpenDrawing(id) {
  const c = findContract(id); if (!c || !canPay()) return;
  // قفل الأمان: تعطيل الرفع إلا بعد السداد الكامل — باستثناء المدير العام
  if (!canUploadDrawing(c)) return toast('قفل الأمان: لا يمكن رفع الرسمة إلا بعد أن يصبح العقد مسددًا بالكامل.', 'err');
  $('#dr_contract').innerHTML = `العقد <b class="num">${esc(c.id)}</b> — ${esc(c.customer?.name)} • المتبقي: <b class="num ${remainingOf(c) > 0 ? 'text-gold-300' : 'text-emerald-300'}">${fmtMoney(remainingOf(c))}</b>`;
  $('#dr_lockWarn').classList.toggle('hidden', canUploadDrawing(c));
  $('#dr_supNote').classList.toggle('hidden', !(isSupervisor() && remainingOf(c) > 0));
  const sel = $('#dr_days');
  const def = S.data?.settings?.defaultDeliveryDays || 30;
  sel.innerHTML = Array.from({ length: 26 }, (_, i) => 15 + i)
    .map(d => `<option value="${d}" ${d === def ? 'selected' : ''}>${d} يومًا</option>`).join('');
  $('#dr_file').value = ''; $('#dr_link').value = '';
  $('#formDrawing').dataset.id = c.id;
  openModal('m-drawing');
}

function fileToB64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function actSubmitDrawing(e) {
  e.preventDefault();
  const id = e.target.dataset.id;
  const c = findContract(id); if (!c || !canPay()) return;
  if (!canUploadDrawing(c)) return toast('قفل الأمان: السداد غير مكتمل.', 'err');

  const file = $('#dr_file').files[0];
  const link = $('#dr_link').value.trim();
  const days = +$('#dr_days').value || 30;
  if (!file && !link) return toast('اختر ملف الرسمة أو أدخل رابطًا خارجيًا.', 'err');
  if (file && file.size > MAX_UPLOAD_BYTES) return toast('حجم الملف أكبر من 900KB — استخدم رابطًا خارجيًا (Drive / Dropbox).', 'err');

  busy(true, file ? 'جارٍ رفع ملف الرسمة…' : 'جارٍ حفظ بيانات الرسمة…');
  try {
    let url = '', fname = '';
    if (file) {
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
      fname = `${id}-${Date.now()}.${ext}`.replace(/[^\w.-]/g, '_');
      const b64 = await fileToB64(file);
      if (S.mode === 'supabase' && S.sbSession?.access_token) {
        url = await sbUploadDrawing(fname, file, file.type || 'application/octet-stream');
      } else if (S.mode === 'github' && ghCfgReady()) {
        url = await ghUploadDrawing(fname, b64, id);
      } else {
        url = ''; // الوضع التجريبي: بيانات وصفية فقط
      }
    }
    const name = file ? file.name : (link.match(/([^/?#]+)(?:[?#].*)?$/) || [])[1] || 'رسمة خارجية';
    await saveData((data) => {
      const cc = data.contracts.find(x => x.id === id);
      const uploadedAt = nowISO();
      cc.drawing = {
        source: file ? (S.mode === 'supabase' ? 'supabase' : S.mode === 'github' ? 'github' : 'local') : 'link',
        name, url: url || link,
        uploadedAt, uploadedBy: byName(),
        deadlineDays: days,
        deadline: addDays(uploadedAt, days)
      };
      cc.stage = 'in_production';
      cc.production = { startedAt: uploadedAt };
      hist(data, cc, `رفع رسمة المصنع «${name}» — بدأ عدّ التسليم تلقائيًا (${days} يومًا حتى ${fmtDate(cc.drawing.deadline)})`);
    }, `رفع رسمة المصنع للعقد ${id} + بدء عداد التسليم`);
    closeModal(e.target);
    toast(`تم رفع الرسمة بنجاح — بدأ عدّاد التسليم (${days} يومًا). المرحلة التالية: التصنيع ثم الشحن من القصيم.`, 'ok');
    renderAll();
  } catch (err) { toast('فشل رفع الرسمة: ' + err.message, 'err'); }
  finally { busy(false); }
}

/* ---------- بدء الشحن ---------- */
async function actStartShipping(id) {
  const c = findContract(id); if (!c || !canLogistics()) return;
  const ok = await confirmDlg('بدء الشحن', `تأكيد بدء شحن طلب «${c.customer?.name}» (${c.id}) من مصنع القصيم إلى المدينة المنورة؟`, { icon: 'fa-truck-fast', okLabel: 'بدء الشحن' });
  if (!ok) return;
  busy(true, 'جارٍ تحديث الحالة…');
  try {
    await saveData((data) => {
      const cc = data.contracts.find(x => x.id === id);
      cc.shipping = { startedAt: nowISO(), arrivedAt: null };
      cc.stage = 'shipping';
      hist(data, cc, 'بدء الشحن من مصنع القصيم إلى المدينة المنورة (الوصول المتوقع ~10 أيام)');
    }, `بدء شحن العقد ${id}`);
    toast('تم تحديث الحالة إلى «قيد الشحن» — عند وصول الشحنة يضغط مدير المستودع زر الوصول.', 'ok');
    renderAll();
  } catch (err) { toast('فشل الحفظ: ' + err.message, 'err'); }
  finally { busy(false); }
}

/* ---------- تأكيد الوصول للمستودع ---------- */
async function actArrive(id) {
  const c = findContract(id); if (!c || !canLogistics()) return;
  const ok = await confirmDlg('تأكيد الوصول', `هل وصلت شحنة العقد «${c.customer?.name}» (${c.id}) إلى مستودع المدينة المنورة؟ سيظهر التحديث فورًا أمام الجميع.`, { okLabel: 'تم الوصول', icon: 'fa-warehouse' });
  if (!ok) return;
  busy(true, 'جارٍ تأكيد الوصول…');
  try {
    await saveData((data) => {
      const cc = data.contracts.find(x => x.id === id);
      cc.shipping = cc.shipping || {};
      cc.shipping.arrivedAt = nowISO();
      cc.stage = 'arrived_warehouse';
      hist(data, cc, 'تم الوصول إلى مستودع المدينة المنورة — بانتظار الإسناد لفني تركيب');
    }, `وصول العقد ${id} إلى مستودع المدينة`);
    toast('تم تسجيل الوصول إلى مستودع المدينة — الطلب جاهز للإسناد لفني تركيب.', 'ok');
    renderAll();
  } catch (err) { toast('فشل الحفظ: ' + err.message, 'err'); }
  finally { busy(false); }
}

/* ---------- إسناد فني ---------- */
/** أسماء الفنيين المقترحة: الأسماء المُسندة سابقًا في العقود + أسماء الإعدادات (بلا تكرار). */
function technicianSuggestions() {
  const seen = new Set();
  const out = [];
  for (const c of (S.data?.contracts || [])) {
    const n = c.technician?.name?.trim();
    if (n && !seen.has(n)) { seen.add(n); out.push(n); }
  }
  for (const t of (S.data?.settings?.technicians || [])) {
    const n = String(t || '').trim();
    if (n && !seen.has(n)) { seen.add(n); out.push(n); }
  }
  return out;
}

function actOpenAssign(id) {
  const c = findContract(id); if (!c || !canLogistics()) return;
  $('#as_contract').innerHTML = `العقد <b class="num">${esc(c.id)}</b> — ${esc(c.customer?.name)} • ${esc(c.customer?.address || '')}`;
  const dl = $('#as_techList');
  if (dl) dl.innerHTML = technicianSuggestions().map(t => `<option value="${esc(t)}"></option>`).join('');
  $('#as_tech').value = c.technician?.name || '';
  $('#as_note').value = '';
  $('#formAssign').dataset.id = c.id;
  openModal('m-assign');
}

async function actSubmitAssign(e) {
  e.preventDefault();
  const id = e.target.dataset.id;
  const c = findContract(id); if (!c || !canLogistics()) return;
  const tech = $('#as_tech').value.trim();
  const note = $('#as_note').value.trim();
  if (!tech) return toast('اكتب اسم الفني المسؤول.', 'err');
  busy(true, 'جارٍ الإسناد…');
  try {
    await saveData((data) => {
      const cc = data.contracts.find(x => x.id === id);
      cc.technician = { name: tech, assignedAt: nowISO(), assignedBy: byName() };
      if (note) cc.notes = (cc.notes ? cc.notes + ' | ' : '') + 'ملاحظة إسناد: ' + note;
      cc.stage = 'assigned';
      hist(data, cc, `إسناد الطلب لفني التركيب: ${tech}${note ? ' — ' + note : ''}`);
    }, `إسناد العقد ${id} للفني ${tech}`);
    closeModal(e.target);
    toast(`تم إسناد العقد للفني ${tech} — أصبحت بيانات العميل (الجوال والعنوان) متاحة في مهمته.`, 'ok');
    renderAll();
  } catch (err) { toast('فشل الحفظ: ' + err.message, 'err'); }
  finally { busy(false); }
}

/* ---------- تأكيدات الفني ---------- */
async function actInstallDone(id) {
  const c = findContract(id);
  if (!c || !(techOwn(c) || isSupervisor())) return toast('هذا الإجراء متاح للفني المسند إليه الطلب أو للمدير العام.', 'err');
  const ok = await confirmDlg('تم الانتهاء من التركيب', `تأكيد إتمام تركيب طلب «${c.customer?.name}» (${c.id}) بالكامل؟`, { okLabel: 'تم التركيب', icon: 'fa-circle-check' });
  if (!ok) return;
  busy(true, 'جارٍ التحديث…');
  try {
    await saveData((data) => {
      const cc = data.contracts.find(x => x.id === id);
      const at = nowISO();
      cc.installation = { status: 'done', installedAt: at };
      cc.stage = 'installation_done';
      const wy = S.data?.settings?.warrantyYears || 15;
      cc.warranty = { years: wy, until: addYears(at, wy) };
      hist(data, cc, `تم الانتهاء من التركيب — بانتظار اعتماد المشرف النهائي (بدأ احتساب ضمان ${wy} سنة حتى ${fmtDate(cc.warranty.until)})`);
    }, `إتمام تركيب العقد ${id}`);
    toast('تم تسجيل إتمام التركيب — بانتظار اعتماد المشرف لإنهاء الملف.', 'ok');
    renderAll();
  } catch (err) { toast('فشل الحفظ: ' + err.message, 'err'); }
  finally { busy(false); }
}

async function actNeedsFinishing(id) {
  const c = findContract(id);
  if (!c || !(techOwn(c) || isSupervisor())) return toast('هذا الإجراء متاح للفني المسند إليه الطلب أو للمدير العام.', 'err');
  const ok = await confirmDlg('يحتاج بعض التشطيبات', `تأكيد أن تركيب «${c.customer?.name}» (${c.id}) يحتاج بعض التشطيبات الإضافية؟`, { okLabel: 'تأكيد', icon: 'fa-paint-roller' });
  if (!ok) return;
  busy(true, 'جارٍ التحديث…');
  try {
    await saveData((data) => {
      const cc = data.contracts.find(x => x.id === id);
      cc.installation = { status: 'needs_finishing', installedAt: cc.installation?.installedAt || null };
      cc.stage = 'needs_finishing';
      hist(data, cc, 'تم التركيب مع الحاجة لبعض التشطيبات — يعود الفني لإتمامها');
    }, `تحديث حالة العقد ${id}: يحتاج تشطيبات`);
    toast('تم تسجيل الحالة — تظهر المهمة للفني والمشرف لإتمام التشطيبات.', 'ok');
    renderAll();
  } catch (err) { toast('فشل الحفظ: ' + err.message, 'err'); }
  finally { busy(false); }
}

/* ---------- اعتماد نهائي (المشرف فقط) ---------- */
async function actCloseFile(id) {
  const c = findContract(id); if (!c || !canClose()) return toast('المدير العام فقط هو المخول بإنهاء ملف العميل.', 'err');
  const ok = await confirmDlg('إنهاء ملف العميل نهائيًا', `اعتماد إنجاز طلب «${c.customer?.name}» (${c.id}) وإغلاق الملف كاملًا؟ بعد الاعتماد يبقى العقد متاحًا في أرشيف الصيانة وضمان الـ15 سنة.`, { okLabel: 'اعتماد وإنهاء', danger: false, icon: 'fa-flag-checkered' });
  if (!ok) return;
  busy(true, 'جارٍ الاعتماد النهائي…');
  try {
    await saveData((data) => {
      const cc = data.contracts.find(x => x.id === id);
      const at = nowISO();
      cc.closure = { closedAt: at, closedBy: byName() };
      if (!cc.installation?.installedAt) { cc.installation = { status: 'done', installedAt: at }; }
      const wy = S.data?.settings?.warrantyYears || 15;
      cc.warranty = cc.warranty || { years: wy, until: addYears(cc.installation.installedAt, wy) };
      cc.stage = 'completed';
      hist(data, cc, `اعتماد نهائي وإنهاء ملف العميل — الضمان سارٍ حتى ${fmtDate(cc.warranty.until)}`);
    }, `اعتماد نهائي وإغلاق ملف العقد ${id}`);
    toast('تم إنهاء ملف العميل نهائيًا — أصبح العقد في أرشيف الضمان والصيانة.', 'ok');
    renderAll();
  } catch (err) { toast('فشل الحفظ: ' + err.message, 'err'); }
  finally { busy(false); }
}

/* ---------- تذاكر الصيانة ---------- */
function actOpenTicket(id) {
  const c = findContract(id); if (!c || !canTicket()) return;
  $('#tk_contract').innerHTML = `العقد <b class="num">${esc(c.id)}</b> — ${esc(c.customer?.name)} • ${esc(c.customer?.phone || '')}`;
  $('#tk_tech').innerHTML = '<option value="">— بدون تحديد —</option>' + (S.data?.settings?.technicians || []).map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  $('#tk_desc').value = '';
  $('#formTicket').dataset.id = c.id;
  openModal('m-ticket');
}

async function actSubmitTicket(e) {
  e.preventDefault();
  const id = e.target.dataset.id;
  const c = findContract(id); if (!c || !canTicket()) return;
  const desc = $('#tk_desc').value.trim();
  const tech = $('#tk_tech').value;
  if (desc.length < 5) return toast('اكتب وصفًا واضحًا للمشكلة (5 أحرف على الأقل).', 'err');
  busy(true, 'جارٍ فتح التذكرة…');
  try {
    let tid = '';
    await saveData((data) => {
      const cc = data.contracts.find(x => x.id === id);
      const allTickets = data.contracts.flatMap(x => (x.maintenance || []).map(t => t.id));
      tid = nextSeq(data, 'nextTicket', allTickets, 'MT-', 4);
      cc.maintenance = cc.maintenance || [];
      cc.maintenance.unshift({ id: tid, openedAt: nowISO(), by: byName(), technician: tech || '', description: desc, status: 'open', closedAt: null });
      hist(data, cc, `فتح تذكرة صيانة ${tid}: ${desc}`);
    }, `فتح تذكرة صيانة ${tid} للعقد ${id}`);
    closeModal(e.target);
    toast(`تم فتح تذكرة الصيانة ${tid} بنجاح.`, 'ok');
    renderAll();
  } catch (err) { toast('فشل الحفظ: ' + err.message, 'err'); }
  finally { busy(false); }
}

async function actCloseTicket(id, tid) {
  if (!isSupervisor()) return toast('إغلاق التذاكر متاح للمدير العام.', 'err');
  const ok = await confirmDlg('إغلاق تذكرة الصيانة', `تأكيد إغلاق التذكرة ${tid}؟`, { okLabel: 'إغلاق التذكرة' });
  if (!ok) return;
  busy(true, 'جارٍ الإغلاق…');
  try {
    await saveData((data) => {
      const cc = data.contracts.find(x => x.id === id);
      const t = (cc.maintenance || []).find(x => x.id === tid);
      if (t) { t.status = 'closed'; t.closedAt = nowISO(); }
      hist(data, cc, `إغلاق تذكرة الصيانة ${tid}`);
    }, `إغلاق تذكرة الصيانة ${tid}`);
    toast('تم إغلاق التذكرة.', 'ok');
    renderAll();
  } catch (err) { toast('فشل الحفظ: ' + err.message, 'err'); }
  finally { busy(false); }
}

/* ---------- فتح التفاصيل ---------- */
function actOpenDetails(id) {
  const c = findContract(id); if (!c) return;
  S.curId = id;
  renderDetails(c);
  openModal('m-details');
}

/* =====================================================================
   الهوية والأدوار
   ===================================================================== */
/* =====================================================================
   تسجيل الدخول السحابي (Supabase Auth)
   ===================================================================== */
function showLoginError(msg) {
  const el = $('#login_err');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('hidden', !msg);
}

/** تعبئة دور/اسم المستخدم من جدول profiles واعتماده. */
async function applyCloudIdentity() {
  let prof = null;
  try { prof = await sbGetProfile(S.sbSession?.user?.id); } catch { /* جدول profiles قد لا يوجد بعد */ }
  S.sbProfile = prof || null;
  const role = prof?.role || 'supervisor';
  S.role = role;
  S.person = prof?.person || '';
  S.viewAs = null;                 // لا استعراض عند الدخول
  LS.set(STORE.role, { role: S.role, person: S.person });
  closeOnboard();
  await loadData();
  renderAll();
  toast(`مرحبًا ${S.person || ROLE_DEFS[role]?.label || ''} — أنت متصل بقاعدة البيانات السحابية.`, 'ok');
}

/** تنفيذ تسجيل الدخول بالإيميل وكلمة المرور. */
async function doCloudLogin(e) {
  if (e) e.preventDefault();
  const email = $('#login_email').value.trim();
  const password = $('#login_password').value;
  showLoginError('');
  if (!email || !password) return showLoginError('أدخل البريد الإلكتروني وكلمة المرور.');
  const btn = $('#loginForm button[type="submit"]');
  if (btn) btn.disabled = true;
  busy(true, 'جارٍ تسجيل الدخول…');
  try {
    await sbSignIn(email, password);
    $('#login_password').value = '';
    busy(false);
    await applyCloudIdentity();
  } catch (err) {
    busy(false);
    if (btn) btn.disabled = false;
    const msg = /Invalid login|invalid_grant|400/i.test(err.message || '') ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' : ('تعذر تسجيل الدخول: ' + (err.message || ''));
    showLoginError(msg);
  }
}

/** تسجيل الخروج والعودة لشاشة الدخول. */
async function doCloudLogout() {
  S.viewAs = null;                 // إلغاء أي استعراض قبل الخروج
  await sbSignOut();
  S.role = null; S.person = ''; S.data = null; S.sbProfile = null;
  LS.del(STORE.role);
  $('#roleSel').value = '';
  renderAll();
  openOnboard('login');
  toast('تم تسجيل الخروج.', 'info');
}

/* =====================================================================
   استعراض المنظومة كهوية موظف (للمدير العام فقط)
   ===================================================================== */
/** فتح نافذة اختيار الموظف وجلب القائمة من profiles. */
async function openViewAs() {
  if (!(S.role === 'supervisor' && !S.viewAs && S.mode === 'supabase')) return;
  const modal = $('#viewAsModal'), list = $('#viewAsList');
  if (!modal || !list) return;
  modal.classList.remove('hidden'); modal.classList.add('flex');
  list.innerHTML = '<p class="text-center text-sm text-mist-400 py-6"><i class="fa-solid fa-circle-notch fa-spin"></i> جارٍ تحميل الموظفين…</p>';
  let profiles = [];
  try { profiles = await sbListProfiles(); } catch { /* لا صلاحية أو خطأ شبكة */ }
  profiles = profiles.filter(p => p.role);
  if (!profiles.length) {
    list.innerHTML = '<p class="text-center text-sm text-mist-400 py-6">لا يوجد موظفون آخرون مسجّلون بعد.</p>';
    return;
  }
  list.innerHTML = profiles.map(p => `
    <button class="card w-full p-3 flex items-center gap-3 hover:border-amber-500/50 transition text-start" data-vapick="${esc(p.id)}" data-varole="${esc(p.role)}" data-vaperson="${esc(p.person || '')}">
      <i class="fa-solid ${ROLE_DEFS[p.role]?.icon || 'fa-user'} text-lg text-amber-400"></i>
      <span class="flex-1">
        <span class="block font-bold text-sm">${esc(p.person || ROLE_DEFS[p.role]?.label || p.role)}</span>
        <span class="block text-[11px] text-mist-400">${esc(ROLE_DEFS[p.role]?.label || p.role)}${p.email ? ' — ' + esc(p.email) : ''}</span>
      </span>
      <i class="fa-solid fa-chevron-left text-mist-500"></i>
    </button>`).join('');
}

function closeViewAs() {
  const modal = $('#viewAsModal');
  if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}

/** تفعيل الاستعراض بهوية موظف مختار. */
function startViewAs(role, person) {
  if (S.role !== 'supervisor') return;
  S.viewAs = { role: role || 'supervisor', person: person || '' };
  closeViewAs();
  renderAll();
  toast(`أنت تستعرض المنظومة كهوية: ${ROLE_DEFS[role]?.label || role}${person ? ' — ' + person : ''}.`, 'warn');
}

/** إيقاف الاستعراض والعودة لهوية المدير الحقيقي. */
function stopViewAs() {
  if (!S.viewAs) return;
  S.viewAs = null;
  renderAll();
  toast('تم الرجوع إلى صلاحية المدير العام.', 'info');
}

function setIdentity(role, person, { silent = false } = {}) {
  S.role = role || null;
  S.person = person || '';
  LS.set(STORE.role, { role: S.role, person: S.person });
  const rs = $('#roleSel'); if (rs) rs.value = S.role || '';
  const ps = $('#personSel');
  if (ps && (S.role === 'designer' || S.role === 'technician')) {
    const list = (S.data?.settings?.[S.role === 'designer' ? 'designers' : 'technicians']) || [];
    ps.classList.remove('hidden');
    ps.innerHTML = list.map(n => `<option value="${esc(n)}" ${n === S.person ? 'selected' : ''}>${esc(n)}</option>`).join('');
  } else if (ps) { ps.classList.add('hidden'); }
  if (!silent) toast(`تم تبديل الدور: ${ROLE_DEFS[S.role]?.label}${S.person ? ' — ' + S.person : ''}`, 'info');
  renderAll();
}

function openOnboard(step = 'role') {
  const ob = $('#onboard');
  ob.classList.remove('hidden'); ob.classList.add('flex');
  const roles = $('#ob_roles'), persons = $('#ob_persons'), login = $('#loginForm');
  const isLogin = step === 'login';
  if (login) login.classList.toggle('hidden', !isLogin);
  if (isLogin) {
    roles.classList.add('hidden'); persons.classList.add('hidden'); persons.classList.remove('grid');
    const sub = $('#ob_sub'); if (sub) sub.textContent = 'سجّل الدخول بحسابك للوصول إلى المنظومة.';
    setTimeout(() => $('#login_email')?.focus(), 50);
    return;
  }
  if (step === 'role') {
    roles.classList.remove('hidden'); persons.classList.add('hidden'); persons.classList.remove('grid');
  } else {
    roles.classList.add('hidden');
    const list = (S.data?.settings?.[S.obRole === 'designer' ? 'designers' : 'technicians']) || [];
    persons.innerHTML = `<p class="col-span-2 text-sm font-bold text-mist-300 mb-1">اختر اسمك للمتابعة:</p>` +
      list.map(n => `<button class="card p-4 hover:border-gold-500/50 transition" data-operson="${esc(n)}"><i class="fa-solid fa-user text-gold-400 mb-2"></i><p class="font-bold text-sm">${esc(n)}</p></button>`).join('');
    persons.classList.remove('hidden'); persons.classList.add('grid');
  }
}
function closeOnboard() { const ob = $('#onboard'); ob.classList.add('hidden'); ob.classList.remove('flex'); }

/* =====================================================================
   الإعدادات
   ===================================================================== */
function openSettings() {
  $('#cfg_owner').value = S.cfg.owner; $('#cfg_repo').value = S.cfg.repo;
  $('#cfg_branch').value = S.cfg.branch || 'main'; $('#cfg_path').value = S.cfg.path || 'data/contracts.json';
  $('#cfg_token').value = S.cfg.token;
  const st = S.data?.settings || {};
  $('#sys_designers').value = (st.designers || []).join('\n');
  $('#sys_technicians').value = (st.technicians || []).join('\n');
  $('#sys_warranty').value = st.warrantyYears ?? 15;
  $('#sys_delivery').value = st.defaultDeliveryDays ?? 30;
  const gate = !isSupervisor();
  $('#sysGate').classList.toggle('hidden', !gate);
  ['#sys_designers', '#sys_technicians', '#sys_warranty', '#sys_delivery', '#btnSaveSys'].forEach(s => $(s).disabled = gate);
  openModal('m-settings');
}

async function actSaveCfg() {
  const cfg = {
    owner: $('#cfg_owner').value.trim(),
    repo: $('#cfg_repo').value.trim(),
    branch: $('#cfg_branch').value.trim() || 'main',
    path: $('#cfg_path').value.trim() || 'data/contracts.json',
    token: $('#cfg_token').value.trim()
  };
  if ((cfg.owner || cfg.repo || cfg.token) && !(cfg.owner && cfg.repo && cfg.token))
    return toast('لتفعيل الاتصال أدخل: مالك المستودع + اسم المستودع + رمز الوصول. أو امسح الحقول كلها للوضع التجريبي.', 'warn');
  S.cfg = cfg; LS.set(STORE.cfg, cfg);
  busy(true, 'جارٍ الاتصال بـ GitHub…');
  await loadData(true);
  busy(false);
  renderAll();
  if (S.mode === 'github') { toast('تم الاتصال بالمستودع بنجاح — كل التحديثات ستُحفظ كـ Commits.', 'ok'); closeAllModals(); }
  else toast('لم يتم الاتصال بعد — التحقق من البيانات أو استمر بالوضع التجريبي.', 'warn');
}

async function actTestConn() {
  const tmp = { owner: $('#cfg_owner').value.trim(), repo: $('#cfg_repo').value.trim(), branch: $('#cfg_branch').value.trim() || 'main', path: $('#cfg_path').value.trim() || 'data/contracts.json', token: $('#cfg_token').value.trim() };
  if (!(tmp.owner && tmp.repo && tmp.token)) return toast('أدخل Owner و Repo و PAT أولاً.', 'warn');
  busy(true, 'جارٍ اختبار الاتصال…');
  const saved = S.cfg;
  try {
    S.cfg = tmp;
    const data = await ghLoadData();
    S.cfg = saved;
    busy(false);
    toast(`الاتصال ناجح — تم قراءة ${data.contracts?.length || 0} عقدًا من الملف.`, 'ok');
  } catch (e) {
    S.cfg = saved; busy(false);
    const hints = { 401: 'رمز الوصول (PAT) غير صالح.', 404: 'المستودع أو مسار الملف غير موجود — تحقق من Owner/Repo/المسار والفرع.', 403: 'رمز الوصول لا يملك صلاحية القراءة (Contents: Read).' };
    toast('فشل الاتصال: ' + (hints[e.status] || e.message), 'err');
  }
}

function actClearCfg() {
  S.cfg = { owner: '', repo: '', branch: 'main', path: 'data/contracts.json', token: '' };
  LS.set(STORE.cfg, S.cfg);
  loadData().then(() => { renderAll(); toast('تم مسح الإعدادات — العودة للوضع التجريبي المحلي.', 'info'); });
}

async function actSaveSys() {
  if (!isSupervisor()) return toast('المدير العام فقط يعدّل إعدادات المنظومة.', 'err');
  const designers = $('#sys_designers').value.split('\n').map(s => s.trim()).filter(Boolean);
  const technicians = $('#sys_technicians').value.split('\n').map(s => s.trim()).filter(Boolean);
  const warrantyYears = Math.max(1, +$('#sys_warranty').value || 15);
  const defaultDeliveryDays = Math.min(40, Math.max(15, +$('#sys_delivery').value || 30));
  if (!designers.length) return toast('يجب إدخال اسم مصمم واحد على الأقل.', 'err');
  busy(true, 'جارٍ حفظ إعدادات المنظومة…');
  try {
    await saveData((data) => {
      data.settings = data.settings || {};
      data.settings.designers = designers;
      data.settings.technicians = technicians;
      data.settings.warrantyYears = warrantyYears;
      data.settings.defaultDeliveryDays = defaultDeliveryDays;
    }, 'تحديث إعدادات المنظومة (الفريق والضمان ومهلة التسليم)');
    if ((S.role === 'designer' || S.role === 'technician') && S.person && !(S.role === 'designer' ? designers : technicians).includes(S.person)) {
      setIdentity(S.role, (S.role === 'designer' ? designers : technicians)[0] || '');
    }
    closeAllModals();
    toast('تم حفظ إعدادات المنظومة بنجاح.', 'ok');
    renderAll();
  } catch (err) { toast('فشل الحفظ: ' + err.message, 'err'); }
  finally { busy(false); }
}

/* =====================================================================
   ربط الأحداث + الإقلاع
   ===================================================================== */
function bindEvents() {
  // التبويبات
  $$('.tabbtn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  // الأزرار عبر التفويض (event delegation)
  document.addEventListener('click', (e) => {
    const close = e.target.closest('[data-close]');
    if (close) { if (close.id === 'cf_cancel' && S.confirmResolve) { S.confirmResolve(false); S.confirmResolve = null; } closeModal(close); return; }

    const stat = e.target.closest('[data-stat]');
    if (stat) {
      const k = stat.dataset.stat;
      S.filters.stage = S.filters.stage === k ? '' : k;
      const map = { awaiting_pay: 'awaiting_pay', awaiting_drawing: 'awaiting_drawing', production_shipping: 'production_shipping', warehouse_install: 'warehouse_install', completed: 'completed', all: '' };
      $('#fltStage').value = map[k] ?? '';
      renderStats(); renderContracts();
      return;
    }

    const quick = e.target.closest('[data-quick]');
    if (quick) { $('#mSearch').value = quick.dataset.quick; renderSearch(); return; }

    const orole = e.target.closest('[data-orole]');
    if (orole) {
      S.obRole = orole.dataset.orole;
      if (S.obRole === 'designer' || S.obRole === 'technician') openOnboard('person');
      else { closeOnboard(); setIdentity(S.obRole, ''); }
      return;
    }
    const operson = e.target.closest('[data-operson]');
    if (operson) { closeOnboard(); setIdentity(S.obRole, operson.dataset.operson); return; }

    const vapick = e.target.closest('[data-vapick]');
    if (vapick) { startViewAs(vapick.dataset.varole, vapick.dataset.vaperson); return; }

    if (e.target.closest('#btnTechPortal')) { enterTechnicianPortal(); return; }
    if (e.target.closest('#btnTechExit')) { exitTechnicianPortal(); return; }
    if (e.target.closest('#btnReportPrint')) { actPrintReport(); return; }
    if (e.target.closest('#btnReportCSV')) { actExportCSV(); return; }
    if (e.target.closest('#btnTechRefresh')) {
      loadData(true).then(() => { renderTechPortal(); toast(S.mode === 'github' ? 'تم جلب أحدث البيانات من المستودع.' : 'تم تحديث البيانات المحلية.', S.mode === 'offline' ? 'warn' : 'info'); });
      return;
    }

    const act = e.target.closest('[data-act]');
    if (!act || act.disabled) return;
    const id = act.dataset.id;
    switch (act.dataset.act) {
      case 'openDetails': actOpenDetails(id); break;
      case 'openPay': actOpenPay(id); break;
      case 'openDrawing': actOpenDrawing(id); break;
      case 'openAssign': actOpenAssign(id); break;
      case 'openTicket': actOpenTicket(id); break;
      case 'startShipping': actStartShipping(id); break;
      case 'arrive': actArrive(id); break;
      case 'installDone': actInstallDone(id); break;
      case 'needsFinishing': actNeedsFinishing(id); break;
      case 'closeFile': actCloseFile(id); break;
      case 'closeTicket': actCloseTicket(id, act.dataset.tid); break;
    }
  });

  // النماذج
  $('#formNew').addEventListener('submit', actCreateContract);
  $('#formPayment').addEventListener('submit', actSubmitPayment);
  $('#formDrawing').addEventListener('submit', actSubmitDrawing);
  $('#formAssign').addEventListener('submit', actSubmitAssign);
  $('#formTicket').addEventListener('submit', actSubmitTicket);

  // حساب المتبقي في نموذج العقد الجديد
  ['nc_total', 'nc_deposit'].forEach(id => $('#' + id).addEventListener('input', () => {
    const t = +$('#nc_total').value || 0, d = +$('#nc_deposit').value || 0;
    $('#nc_remaining').textContent = fmtNum(Math.max(0, t - d));
  }));

  // الفلاتر
  $('#fltSearch').addEventListener('input', (e) => { S.filters.q = e.target.value; renderContracts(); });
  $('#fltStage').addEventListener('change', (e) => { S.filters.stage = e.target.value; renderStats(); renderContracts(); });
  $('#fltDesigner').addEventListener('change', (e) => { S.filters.designer = e.target.value; renderContracts(); });
  $('#mSearch').addEventListener('input', () => renderSearch());

  // الهوية
  $('#roleSel').addEventListener('change', (e) => {
    const r = e.target.value;
    if (!r) return;
    if (r === 'designer' || r === 'technician') { S.obRole = r; openOnboard('person'); }
    else setIdentity(r, '');
  });
  $('#personSel').addEventListener('change', (e) => setIdentity(S.role, e.target.value, { silent: true }));
  $('#btnSwitch').addEventListener('click', () => openOnboard('role'));
  $('#loginForm').addEventListener('submit', doCloudLogin);
  $('#btnLogout').addEventListener('click', doCloudLogout);
  $('#btnViewAs').addEventListener('click', openViewAs);
  $('#btnViewAsStop').addEventListener('click', stopViewAs);
  $('#btnViewAsCancel').addEventListener('click', closeViewAs);

  // الإعدادات والتحديث
  $('#btnSettings').addEventListener('click', openSettings);
  $('#btnSaveCfg').addEventListener('click', actSaveCfg);
  $('#btnTestConn').addEventListener('click', actTestConn);
  $('#btnClearCfg').addEventListener('click', actClearCfg);
  $('#btnSaveSys').addEventListener('click', actSaveSys);
  $('#btnRefresh').addEventListener('click', async () => {
    await loadData();
    renderAll();
    toast(S.mode === 'supabase' ? 'تم جلب أحدث البيانات من قاعدة البيانات السحابية.' : S.mode === 'github' ? 'تم جلب أحدث البيانات من المستودع.' : 'تم تحديث البيانات المحلية.', S.mode === 'offline' ? 'warn' : 'info');
  });

  // تأكيد
  $('#cf_ok').addEventListener('click', () => { if (S.confirmResolve) { S.confirmResolve(true); S.confirmResolve = null; } closeAllModals(); });

  // إغلاق بـ Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (S.confirmResolve) { S.confirmResolve(false); S.confirmResolve = null; }
      closeAllModals();
    }
  });

  // تحديث تلقائي خفيف في وضع GitHub: طلب مشروط (304 لا يُهدر الحصة) ولا يعمل إلا
  // عندما تكون الصفحة مرئية ولا توجد نافذة تفاصيل مفتوحة.
  const autoRefresh = async () => {
    if (document.visibilityState !== 'visible') return;
    if ($('#busy').classList.contains('flex') || S.curId) return;
    S.lastAutoRefresh = Date.now();
    try {
      if (S.mode === 'supabase' && S.sbSession?.access_token) {
        const fresh = await sbLoadData();
        if (fresh && JSON.stringify(fresh.meta?.lastUpdated) !== JSON.stringify(S.data?.meta?.lastUpdated)) {
          S.data = fresh; renderAll(); toast('تم تحديث البيانات من السحابة.', 'info');
        }
      } else if (S.mode === 'github' && ghCfgReady()) {
        const changed = await ghLoadDataIfChanged();
        if (changed) { renderAll(); toast('تم تحديث البيانات من المستودع.', 'info'); }
      }
    } catch { /* تجاهل أخطاء الشبكة العابرة — ستُعاد المحاولة */ }
  };
  setInterval(autoRefresh, 120000);

  // عند العودة إلى التبويب بعد غياب، حدّث فورًا (أفضل من انتظار المؤقّت).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const last = S.lastAutoRefresh || 0;
      if (Date.now() - last > 20000) { S.lastAutoRefresh = Date.now(); autoRefresh(); }
    }
  });
}

/* ------------------------------ الإقلاع ------------------------------ */
(async function init() {
  S.cfg = LS.get(STORE.cfg, S.cfg);
  S.sbSession = LS.get(STORE.sbSession, null);
  bindEvents();
  // رابط مختصر لبوابة الفنيين: افتح الموقع مع ?tech=1 للدخول المباشر.
  const wantTech = new URLSearchParams(location.search).get('tech') === '1';
  if (wantTech) { enterTechnicianPortal(); return; }

  // الوضع السحابي: إن وُجدت جلسة محفوظة، استأنف الدخول مباشرة (مع تجديد الرمز عند الحاجة).
  if (S.sbSession?.access_token && sbReady()) {
    const ok = await sbEnsureToken();
    if (ok && S.sbSession?.access_token) { await applyCloudIdentity(); return; }
    await sbSignOut();
  }

  // بلا جلسة: أظهر شاشة الدخول السحابي.
  await loadData(true);
  renderAll();
  openOnboard(sbReady() ? 'login' : 'role');
})();


