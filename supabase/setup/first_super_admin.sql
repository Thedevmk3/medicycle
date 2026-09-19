-- Run AFTER migration 003. Replace the email below with your own account email.
-- The account must already exist (sign up through Medicycle first).
-- Run only in the Supabase SQL Editor, never in the browser app.
do $$
declare owner_email text := 'REPLACE_WITH_YOUR_EMAIL'; owner_id uuid; previous_role text;
begin
 if owner_email='REPLACE_WITH_YOUR_EMAIL' then raise exception 'Replace REPLACE_WITH_YOUR_EMAIL with your account email first'; end if;
 select id into owner_id from auth.users where lower(email)=lower(trim(owner_email));
 if owner_id is null then raise exception 'Account not found. Sign up through Medicycle first.'; end if;
 perform pg_advisory_xact_lock(731903);
 select role into previous_role from public.mc_staff_members where user_id=owner_id;
 insert into public.mc_staff_members(user_id,role) values(owner_id,'super_admin')
 on conflict(user_id) do update set role='super_admin';
 if previous_role is distinct from 'super_admin' then
 insert into public.mc_admin_audit(actor_id,target_id,old_role,new_role) values(null,owner_id,coalesce(previous_role,'user'),'super_admin');
 end if;
end $$;
