-- Run after migrations 001 and 002. No account is automatically promoted.
begin;
alter table public.mc_staff_members add column if not exists role text not null default 'admin' check(role in ('admin','super_admin'));
create table public.mc_admin_audit(id bigint generated always as identity primary key,actor_id uuid,target_id uuid,old_role text,new_role text,created_at timestamptz not null default now());
create table public.mc_activity(id bigint generated always as identity primary key,user_id uuid references auth.users(id) on delete set null,action text not null,device text,created_at timestamptz not null default now());
create index on public.mc_activity(created_at);
create index on public.mc_activity(user_id,created_at);
alter table public.mc_admin_audit enable row level security;
alter table public.mc_activity enable row level security;
revoke all on public.mc_admin_audit,public.mc_activity from public,anon,authenticated;
create function public.mc_admin_role() returns text language sql stable security definer set search_path='' as $$select role from public.mc_staff_members where user_id=auth.uid()$$;
create function public.mc_set_admin(p_user uuid,p_role text) returns void language plpgsql security definer set search_path='' as $$
declare old text;
begin
 -- Serialize changes so concurrent removals cannot remove the final super admin.
 perform pg_advisory_xact_lock(731903);
 if public.mc_admin_role() is distinct from 'super_admin' then raise exception 'Super admin access required'; end if;
 if p_role is null or p_role not in ('user','admin','super_admin') then raise exception 'Invalid role'; end if;
 if not exists(select 1 from auth.users where id=p_user) then raise exception 'User not found'; end if;
 select role into old from public.mc_staff_members where user_id=p_user;
 if old='super_admin' and p_role<>'super_admin' and (select count(*) from public.mc_staff_members where role='super_admin')<=1 then raise exception 'Cannot remove the last super admin'; end if;
 if coalesce(old,'user')=p_role then return; end if;
 if p_role='user' then delete from public.mc_staff_members where user_id=p_user;
 else insert into public.mc_staff_members(user_id,role) values(p_user,p_role) on conflict(user_id) do update set role=excluded.role; end if;
 insert into public.mc_admin_audit(actor_id,target_id,old_role,new_role) values(auth.uid(),p_user,coalesce(old,'user'),p_role);
end $$;
create function public.mc_admin_users(p_search text default '',p_offset int default 0) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if public.mc_admin_role() is distinct from 'super_admin' then raise exception 'Super admin access required'; end if;
 if p_offset is null or p_offset<0 or length(p_search)>254 then raise exception 'Invalid search'; end if;
 return (select jsonb_build_object('users',coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb)) from (
 select u.id,u.email,left(u.raw_user_meta_data->>'full_name',120) as name,u.created_at,coalesce(s.role,'user') as role,count(*) over() as total
 from auth.users u left join public.mc_staff_members s on s.user_id=u.id
 where coalesce(u.email,'') ilike '%'||p_search||'%' or coalesce(u.raw_user_meta_data->>'full_name','') ilike '%'||p_search||'%'
 order by u.created_at desc,u.id limit 25 offset p_offset) q);
end $$;
create function public.mc_track(p_action text,p_device text default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_action is null or p_action not in ('catalogue_view','device_view','assessment_start','whatsapp_click') then raise exception 'Invalid action'; end if;
 if p_device is not null and p_device not in ('monitor','pump','centrifuge','defibrillator') then raise exception 'Invalid device'; end if;
 if public.mc_is_staff() then return; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 if (select count(*) from public.mc_activity where user_id=auth.uid() and created_at>now()-interval '1 minute')>=60 then return; end if;
 insert into public.mc_activity(user_id,action,device) values(auth.uid(),p_action,p_device);
end $$;
create function public.mc_admin_report(p_from date,p_to date,p_period text default 'day') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; start_at timestamptz; end_at timestamptz;
begin
 if not public.mc_is_staff() then raise exception 'Admin access required'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>3660 or p_period is null or p_period not in ('day','week','month','year') then raise exception 'Invalid date range or period'; end if;
 start_at:=p_from::timestamp at time zone 'Asia/Kolkata';end_at:=(p_to+1)::timestamp at time zone 'Asia/Kolkata';
 select jsonb_build_object('total_users',(select count(*) from auth.users),
 'new_users',(select count(*) from auth.users where created_at>=start_at and created_at<end_at),
 'signups',(select coalesce(jsonb_agg(jsonb_build_object('period',b.bucket::date,'count',coalesce(c.n,0)) order by b.bucket),'[]'::jsonb) from generate_series(date_trunc(p_period,p_from::timestamp),date_trunc(p_period,p_to::timestamp),('1 '||p_period)::interval) b(bucket) left join (
 select date_trunc(p_period,created_at at time zone 'Asia/Kolkata') bucket,count(*) n from auth.users where created_at>=start_at and created_at<end_at group by 1) c using(bucket)),
 'actions',(select coalesce(jsonb_agg(to_jsonb(a) order by a.count desc),'[]'::jsonb) from (
 select action,count(*) as count,count(distinct user_id) as users from public.mc_activity where created_at>=start_at and created_at<end_at group by action
 union all select 'assessment_submitted',count(*),count(distinct user_id) from public.mc_requests where created_at>=start_at and created_at<end_at
 union all select 'buying_enquiry_submitted',count(*),count(distinct user_id) from public.mc_buying_enquiries where created_at>=start_at and created_at<end_at) a),
 'devices',(select coalesce(jsonb_agg(to_jsonb(d) order by d.count desc),'[]'::jsonb) from (select device,count(*) as count from public.mc_activity where action='device_view' and device is not null and created_at>=start_at and created_at<end_at group by device) d),
 'audit',case when public.mc_admin_role()='super_admin' then (select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from (select actor_id,target_id,old_role,new_role,created_at from public.mc_admin_audit order by created_at desc,id desc limit 30) a) else '[]'::jsonb end) into result;
 return result;
end $$;
revoke all on function public.mc_admin_role(),public.mc_set_admin(uuid,text),public.mc_admin_users(text,int),public.mc_track(text,text),public.mc_admin_report(date,date,text) from public,anon;
grant execute on function public.mc_admin_role(),public.mc_set_admin(uuid,text),public.mc_admin_users(text,int),public.mc_track(text,text),public.mc_admin_report(date,date,text) to authenticated;
commit;
