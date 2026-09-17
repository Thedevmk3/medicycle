-- Run once in a dedicated Supabase project using the SQL Editor.
-- All browser writes go through validated functions or narrowly scoped policies.
begin;
create schema if not exists medicycle_private;
revoke all on schema medicycle_private from public, anon, authenticated;

create table public.mc_staff_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table public.mc_requests (
 id uuid primary key,
 reference text not null unique default ('MC-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
 user_id uuid not null references auth.users(id),
 organisation text not null, contact text not null, email text not null, phone text not null default '',
 city text not null, intent text not null check(intent in ('Sell equipment','Request disposal assessment')),
 items jsonb not null, notes text not null default '', technical jsonb not null default '{}',
 stage text not null default 'Submitted' check(stage in ('Submitted','Suitability review','Assessment','Offer ready','Accepted','Collection scheduled','Received','Inspection','Refurbishment','Parts recovery','Recycling','Completed','On hold','Declined','Withdrawn')),
 quote jsonb, collection text not null default '', outcome text not null default '',
 version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index mc_requests_user_created on public.mc_requests(user_id,created_at desc);
create table public.mc_request_events (
 id bigint generated always as identity primary key,
 request_id uuid not null references public.mc_requests(id) on delete cascade,
 stage text not null, created_at timestamptz not null default now(), actor_id uuid references auth.users(id)
);
create index mc_events_request on public.mc_request_events(request_id,created_at);
create table public.mc_staff_assessments (
 request_id uuid primary key references public.mc_requests(id) on delete cascade,
 technician text not null default '', notes text not null default '',
 acquisition numeric not null default 0 check(acquisition between 0 and 100000000),
 transport numeric not null default 0 check(transport between 0 and 100000000),
 parts numeric not null default 0 check(parts between 0 and 100000000),
 labour numeric not null default 0 check(labour between 0 and 100000000),
 resale numeric not null default 0 check(resale between 0 and 100000000),
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id)
);
create table public.mc_attachments (
 id uuid primary key default gen_random_uuid(), request_id uuid not null references public.mc_requests(id),
 uploader_id uuid not null references auth.users(id), storage_path text not null unique,
 filename text not null check(length(filename) between 1 and 200),
 kind text not null check(kind in ('Equipment photo','Bulk inventory','Request document')),
 created_at timestamptz not null default now()
);
create index mc_attachments_request on public.mc_attachments(request_id);
create table public.mc_saved_devices (
 user_id uuid not null references auth.users(id) on delete cascade,
 device_id text not null check(device_id in ('monitor','pump','centrifuge','defibrillator')),
 created_at timestamptz not null default now(), primary key(user_id,device_id)
);
create table public.mc_buying_enquiries (
 id uuid primary key, user_id uuid not null references auth.users(id),
 device_id text not null check(device_id in ('monitor','pump','centrifuge','defibrillator')),
 email text not null, requirements text not null check(length(requirements) between 1 and 2000),
 created_at timestamptz not null default now()
);
create index mc_enquiries_user on public.mc_buying_enquiries(user_id,created_at desc);

create function public.mc_is_staff() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.mc_staff_members where user_id=(select auth.uid()));
$$;
create function public.mc_can_access_request(p_request_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.mc_requests where id=p_request_id and (user_id=(select auth.uid()) or public.mc_is_staff()));
$$;

alter table public.mc_staff_members enable row level security;
alter table public.mc_requests enable row level security;
alter table public.mc_request_events enable row level security;
alter table public.mc_staff_assessments enable row level security;
alter table public.mc_attachments enable row level security;
alter table public.mc_saved_devices enable row level security;
alter table public.mc_buying_enquiries enable row level security;
revoke all on public.mc_staff_members,public.mc_requests,public.mc_request_events,public.mc_staff_assessments,public.mc_attachments,public.mc_saved_devices,public.mc_buying_enquiries from anon,authenticated;
grant select on public.mc_staff_members,public.mc_requests,public.mc_request_events,public.mc_staff_assessments,public.mc_attachments,public.mc_saved_devices,public.mc_buying_enquiries to authenticated;
grant insert,delete on public.mc_saved_devices to authenticated;
create policy staff_self_read on public.mc_staff_members for select to authenticated using(user_id=(select auth.uid()));
create policy requests_read on public.mc_requests for select to authenticated using(user_id=(select auth.uid()) or (select public.mc_is_staff()));
create policy events_read on public.mc_request_events for select to authenticated using(public.mc_can_access_request(request_id));
create policy assessments_staff_only on public.mc_staff_assessments for select to authenticated using((select public.mc_is_staff()));
create policy attachments_read on public.mc_attachments for select to authenticated using(public.mc_can_access_request(request_id));
create policy saves_read on public.mc_saved_devices for select to authenticated using(user_id=(select auth.uid()));
create policy saves_insert on public.mc_saved_devices for insert to authenticated with check(user_id=(select auth.uid()));
create policy saves_delete on public.mc_saved_devices for delete to authenticated using(user_id=(select auth.uid()));
create policy enquiries_read on public.mc_buying_enquiries for select to authenticated using(user_id=(select auth.uid()) or (select public.mc_is_staff()));

create function medicycle_private.text_field(j jsonb,k text,minlen int,maxlen int) returns text
language plpgsql immutable set search_path='' as $$
declare v text;
begin
 if j is null or jsonb_typeof(j)<>'object' then raise exception 'Invalid form data'; end if;
 if j ? k and jsonb_typeof(j->k)<>'string' then raise exception 'Invalid %',k; end if;
 v:=trim(coalesce(j->>k,''));
 if length(v)<minlen or length(v)>maxlen then raise exception 'Invalid length for %',k; end if;
 return v;
end $$;
create function medicycle_private.validate_items(j jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare i jsonb; q numeric;
begin
 if j is null or jsonb_typeof(j)<>'array' then raise exception 'Equipment list is required'; end if;
 if jsonb_array_length(j) not between 1 and 20 then raise exception 'Add 1 to 20 equipment types'; end if;
 for i in select value from jsonb_array_elements(j) loop
  perform medicycle_private.text_field(i,'name',1,120);
  perform medicycle_private.text_field(i,'category',1,80);
  perform medicycle_private.text_field(i,'condition',1,80);
  if jsonb_typeof(i->'quantity') is distinct from 'number' then raise exception 'Invalid quantity'; end if;
  q:=(i->>'quantity')::numeric;
  if q<1 or q>10000 or q<>trunc(q) then raise exception 'Quantity must be between 1 and 10000'; end if;
  if (select count(*) from jsonb_object_keys(i))<>4 then raise exception 'Unexpected equipment fields'; end if;
 end loop;
end $$;
create function medicycle_private.cost_field(j jsonb,k text) returns numeric
language plpgsql immutable set search_path='' as $$
declare v numeric;
begin
 if jsonb_typeof(j->k) is distinct from 'number' then raise exception 'Invalid cost: %',k; end if;
 v:=(j->>k)::numeric;
 if v<0 or v>100000000 or v<>trunc(v) then raise exception 'Invalid cost: %',k; end if;
 return v;
end $$;

create function public.mc_create_request(p_id uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); existing uuid; verified_email text;
begin
 if u is null then raise exception 'Please sign in'; end if;
 select user_id into existing from public.mc_requests where id=p_id;
 if found then
  if existing<>u then raise exception 'Request unavailable'; end if;
  return p_id;
 end if;
 if (select count(*) from public.mc_requests where user_id=u and created_at>now()-interval '1 hour')>=10 then raise exception 'Too many requests. Please try later or contact the team.'; end if;
 perform medicycle_private.validate_items(p_data->'items');
 select email into verified_email from auth.users where id=u;
 insert into public.mc_requests(id,user_id,organisation,contact,email,phone,city,intent,items,notes)
 values(p_id,u,medicycle_private.text_field(p_data,'organisation',1,120),medicycle_private.text_field(p_data,'contact',1,100),verified_email,
 medicycle_private.text_field(p_data,'phone',0,30),medicycle_private.text_field(p_data,'city',1,100),medicycle_private.text_field(p_data,'intent',1,60),p_data->'items',medicycle_private.text_field(p_data,'notes',0,2000));
 insert into public.mc_request_events(request_id,stage,actor_id) values(p_id,'Submitted',u);
 return p_id;
end $$;
create function public.mc_update_technical(p_id uuid,p_version int,p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare r public.mc_requests; d jsonb;
begin
 select * into r from public.mc_requests where id=p_id for update;
 if not found or auth.uid() is null or r.user_id<>auth.uid() then raise exception 'Request unavailable'; end if;
 if r.version<>p_version then raise exception 'Record changed. Refresh and try again.'; end if;
 if r.stage in ('Completed','Withdrawn','Declined') then raise exception 'This request is closed'; end if;
 d:=jsonb_build_object('model',medicycle_private.text_field(p_data,'model',0,200),'serial',medicycle_private.text_field(p_data,'serial',0,300),'history',medicycle_private.text_field(p_data,'history',0,3000));
 update public.mc_requests set technical=d,version=version+1,updated_at=now() where id=p_id;
end $$;
create function public.mc_seller_action(p_id uuid,p_version int,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.mc_requests; next_stage text;
begin
 select * into r from public.mc_requests where id=p_id for update;
 if not found or auth.uid() is null or r.user_id<>auth.uid() then raise exception 'Request unavailable'; end if;
 if r.version<>p_version then raise exception 'Record changed. Refresh before responding to this offer.'; end if;
 if p_action='accept' then
  if r.stage<>'Offer ready' or r.quote is null then raise exception 'No offer is available for acceptance'; end if;
  if (r.quote->>'expiry')::date<current_date then raise exception 'This offer has expired. Ask for an updated offer.'; end if;
  next_stage:='Accepted';
 elsif p_action='withdraw' then
  if r.stage not in ('Submitted','Suitability review','Assessment','Offer ready','On hold') then raise exception 'Contact the team to cancel after an offer has been accepted'; end if;
  next_stage:='Withdrawn';
 else raise exception 'Invalid action'; end if;
 update public.mc_requests set stage=next_stage,version=version+1,updated_at=now() where id=p_id;
 insert into public.mc_request_events(request_id,stage,actor_id) values(p_id,next_stage,auth.uid());
end $$;
create function public.mc_save_assessment(p_id uuid,p_version int,p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare r public.mc_requests; s text; q jsonb; collection_text text; outcome_text text; amount numeric;
begin
 if not public.mc_is_staff() then raise exception 'Staff access required'; end if;
 select * into r from public.mc_requests where id=p_id for update;
 if not found then raise exception 'Request unavailable'; end if;
 if r.version<>p_version then raise exception 'Record changed. Refresh and try again.'; end if;
 s:=medicycle_private.text_field(p_data,'stage',1,40);
 if s='Accepted' and r.stage<>'Accepted' then raise exception 'Only the seller can accept an offer'; end if;
 if r.stage in ('Completed','Declined','Withdrawn') and s<>r.stage then raise exception 'Closed requests cannot be reopened'; end if;
 if r.stage in ('Submitted','Suitability review','Assessment','Offer ready','On hold') and s in ('Collection scheduled','Received','Inspection','Refurbishment','Parts recovery','Recycling','Completed') then raise exception 'Seller acceptance is required before collection and processing'; end if;
 collection_text:=medicycle_private.text_field(p_data,'collection',0,1500);
 outcome_text:=medicycle_private.text_field(p_data,'outcome',0,1500);
 q:=p_data->'quote';
 if q='null'::jsonb then q:=null; end if;
 if q is not null then
  amount:=medicycle_private.cost_field(q,'amount');
  q:=jsonb_build_object('amount',amount,'terms',medicycle_private.text_field(q,'terms',1,2000),'expiry',medicycle_private.text_field(q,'expiry',10,10),'collectionCost',medicycle_private.text_field(q,'collectionCost',1,300));
  perform (q->>'expiry')::date;
 end if;
 if s='Offer ready' and (q is null or (q->>'expiry')::date<current_date) then raise exception 'A complete, unexpired offer is required'; end if;
 if r.stage in ('Accepted','Collection scheduled','Received','Inspection','Refurbishment','Parts recovery','Recycling','Completed') and q is distinct from r.quote then raise exception 'Accepted offer terms cannot be changed'; end if;
 if s='Collection scheduled' and collection_text='' then raise exception 'Add collection arrangements'; end if;
 if s='Completed' and outcome_text='' then raise exception 'Record the final disposition'; end if;
 insert into public.mc_staff_assessments(request_id,technician,notes,acquisition,transport,parts,labour,resale,updated_by)
 values(p_id,medicycle_private.text_field(p_data,'technician',0,120),medicycle_private.text_field(p_data,'notes',0,4000),medicycle_private.cost_field(p_data,'acquisition'),medicycle_private.cost_field(p_data,'transport'),medicycle_private.cost_field(p_data,'parts'),medicycle_private.cost_field(p_data,'labour'),medicycle_private.cost_field(p_data,'resale'),auth.uid())
 on conflict(request_id) do update set technician=excluded.technician,notes=excluded.notes,acquisition=excluded.acquisition,transport=excluded.transport,parts=excluded.parts,labour=excluded.labour,resale=excluded.resale,updated_by=auth.uid(),updated_at=now();
 update public.mc_requests set stage=s,quote=q,collection=collection_text,outcome=outcome_text,version=version+1,updated_at=now() where id=p_id;
 if s<>r.stage then insert into public.mc_request_events(request_id,stage,actor_id) values(p_id,s,auth.uid()); end if;
end $$;
create function public.mc_create_buying_enquiry(p_id uuid,p_device text,p_requirements text) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); owner_id uuid; verified_email text;
begin
 if u is null then raise exception 'Please sign in'; end if;
 select user_id into owner_id from public.mc_buying_enquiries where id=p_id;
 if found then if owner_id<>u then raise exception 'Enquiry unavailable'; end if; return p_id; end if;
 if length(trim(p_requirements)) not between 1 and 2000 or p_requirements is null then raise exception 'Enter your requirements'; end if;
 if (select count(*) from public.mc_buying_enquiries where user_id=u and created_at>now()-interval '1 hour')>=10 then raise exception 'Too many enquiries. Please try later.'; end if;
 select email into verified_email from auth.users where id=u;
 insert into public.mc_buying_enquiries(id,user_id,device_id,email,requirements) values(p_id,u,p_device,verified_email,trim(p_requirements));
 return p_id;
end $$;

-- Private file storage. Owner/staff access derives from the parent request, not file URLs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('mc-documents','mc-documents',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create function public.mc_can_access_file(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.mc_requests where id::text=split_part(p_name,'/',1) and (user_id=(select auth.uid()) or public.mc_is_staff()));
$$;
create policy mc_storage_read on storage.objects for select to authenticated using(bucket_id='mc-documents' and public.mc_can_access_file(name));
create policy mc_storage_insert on storage.objects for insert to authenticated with check(bucket_id='mc-documents' and split_part(name,'/',2)=(select auth.uid())::text and public.mc_can_access_file(name));
-- Removal is only for an uploader cleaning up an unregistered/failed upload.
create policy mc_storage_cleanup on storage.objects for delete to authenticated using(bucket_id='mc-documents' and split_part(name,'/',2)=(select auth.uid())::text and public.mc_can_access_file(name) and not exists(select 1 from public.mc_attachments where storage_path=name));
create function public.mc_register_attachment(p_request_id uuid,p_path text,p_filename text,p_kind text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.mc_can_access_request(p_request_id) then raise exception 'Request unavailable'; end if;
 if split_part(p_path,'/',1)<>p_request_id::text or split_part(p_path,'/',2)<>auth.uid()::text then raise exception 'Invalid upload path'; end if;
 if not exists(select 1 from storage.objects where bucket_id='mc-documents' and name=p_path) then raise exception 'Upload not found'; end if;
 insert into public.mc_attachments(request_id,uploader_id,storage_path,filename,kind) values(p_request_id,auth.uid(),p_path,p_filename,p_kind) on conflict(storage_path) do nothing;
end $$;

-- PostgreSQL grants function execution to PUBLIC by default: close that explicitly.
revoke all on all functions in schema medicycle_private from public,anon,authenticated;
revoke all on function public.mc_is_staff(),public.mc_can_access_request(uuid),public.mc_can_access_file(text),public.mc_create_request(uuid,jsonb),public.mc_update_technical(uuid,int,jsonb),public.mc_seller_action(uuid,int,text),public.mc_save_assessment(uuid,int,jsonb),public.mc_create_buying_enquiry(uuid,text,text),public.mc_register_attachment(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.mc_is_staff(),public.mc_can_access_request(uuid),public.mc_can_access_file(text),public.mc_create_request(uuid,jsonb),public.mc_update_technical(uuid,int,jsonb),public.mc_seller_action(uuid,int,text),public.mc_save_assessment(uuid,int,jsonb),public.mc_create_buying_enquiry(uuid,text,text),public.mc_register_attachment(uuid,text,text,text) to authenticated;
commit;
