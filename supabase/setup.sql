-- ============================================================================
--  منظومة برج الأسطورة — إعداد قاعدة بيانات Supabase (يُلصق مرة واحدة)
--  الاستخدام: Supabase Dashboard → SQL Editor → New query → الصق هذا الملف → Run
--  آمن للتشغيل أكثر من مرة (idempotent).
-- ============================================================================

-- 1) جدول البيانات الرئيسي: صفّ واحد (id='main') يخزّن كل بيانات المنظومة في data.
create table if not exists public.store (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- 2) جدول الملفات الشخصية: يربط كل حساب مُسجّل بدوره واسمه.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null default 'supervisor'
              check (role in ('supervisor','designer','warehouse','technician')),
  person      text not null default '',
  updated_at  timestamptz not null default now()
);

-- 3) تفعيل أمان مستوى الصفوف (RLS).
alter table public.store    enable row level security;
alter table public.profiles enable row level security;

-- 4) سياسات جدول store: لا قراءة ولا كتابة إلا للمستخدمين المسجّلين.
drop policy if exists store_select_auth on public.store;
drop policy if exists store_insert_auth on public.store;
drop policy if exists store_update_auth on public.store;
create policy store_select_auth on public.store for select to authenticated using (true);
create policy store_insert_auth on public.store for insert to authenticated with check (true);
create policy store_update_auth on public.store for update to authenticated using (true) with check (true);

-- 5) سياسات جدول profiles: كل مستخدم يقرأ ملفه؛ والمشرف يقرأ الكل ويعدّل.
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'supervisor'));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- 6) إنشاء صف profile تلقائيًا لكل مستخدم جديد (دوره الافتراضي: مصمم).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, person)
  values (new.id, 'designer', coalesce(new.raw_user_meta_data->>'person', ''))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 7) صف بيانات المنظومة الأولي (فارغ).
insert into public.store (id, data)
values ('main', '{"meta":{"system":"منظومة برج الأسطورة","version":1,"lastUpdated":null,"nextNumber":1,"nextTicket":1},"settings":{"designers":["أبو جمال","أبو يزن","علاء","خالد"],"technicians":[],"warrantyYears":15,"defaultDeliveryDays":30,"shippingDays":10,"city":"المدينة المنورة","factory":"القصيم"},"contracts":[]}'::jsonb)
on conflict (id) do nothing;

-- 8) دلو التخزين لرسمات المصنع (ملفات PDF/صور) — عام للقراءة، والكتابة للمسجّلين فقط.
insert into storage.buckets (id, name, public) values ('drawings', 'drawings', true)
on conflict (id) do nothing;

drop policy if exists drawings_read on storage.objects;
drop policy if exists drawings_write on storage.objects;
create policy drawings_read on storage.objects for select to public
  using (bucket_id = 'drawings');
create policy drawings_write on storage.objects for insert to authenticated
  with check (bucket_id = 'drawings');

-- ============================================================================
--  بعد التشغيل: أنشئ المستخدمين من Authentication → Users → Add user،
--  ثم اضبط دور كل مستخدم في جدول profiles كما في الخطوات المرسلة لك.
-- ============================================================================
