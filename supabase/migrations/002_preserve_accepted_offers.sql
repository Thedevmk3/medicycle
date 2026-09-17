begin;
alter table public.mc_requests add column if not exists accepted_at timestamptz;
update public.mc_requests r set accepted_at=(select min(created_at) from public.mc_request_events e where e.request_id=r.id and e.stage='Accepted') where accepted_at is null;
create or replace function public.mc_seller_action(p_id uuid,p_version int,p_action text) returns void
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
 update public.mc_requests set stage=next_stage,accepted_at=case when p_action='accept' then now() else accepted_at end,version=version+1,updated_at=now() where id=p_id;
 insert into public.mc_request_events(request_id,stage,actor_id) values(p_id,next_stage,auth.uid());
end $$;
create or replace function public.mc_save_assessment(p_id uuid,p_version int,p_data jsonb) returns void
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
 if r.accepted_at is null and s in ('Collection scheduled','Received','Inspection','Refurbishment','Parts recovery','Recycling','Completed') then raise exception 'Seller acceptance is required before collection and processing'; end if;
 if r.accepted_at is not null and s in ('Submitted','Suitability review','Assessment','Offer ready') then raise exception 'Accepted requests cannot return to pre-offer stages'; end if;
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
 if r.accepted_at is not null and q is distinct from r.quote then raise exception 'Accepted offer terms cannot be changed'; end if;
 if s='Collection scheduled' and collection_text='' then raise exception 'Add collection arrangements'; end if;
 if s='Completed' and outcome_text='' then raise exception 'Record the final disposition'; end if;
 insert into public.mc_staff_assessments(request_id,technician,notes,acquisition,transport,parts,labour,resale,updated_by)
 values(p_id,medicycle_private.text_field(p_data,'technician',0,120),medicycle_private.text_field(p_data,'notes',0,4000),medicycle_private.cost_field(p_data,'acquisition'),medicycle_private.cost_field(p_data,'transport'),medicycle_private.cost_field(p_data,'parts'),medicycle_private.cost_field(p_data,'labour'),medicycle_private.cost_field(p_data,'resale'),auth.uid())
 on conflict(request_id) do update set technician=excluded.technician,notes=excluded.notes,acquisition=excluded.acquisition,transport=excluded.transport,parts=excluded.parts,labour=excluded.labour,resale=excluded.resale,updated_by=auth.uid(),updated_at=now();
 update public.mc_requests set stage=s,quote=q,collection=collection_text,outcome=outcome_text,version=version+1,updated_at=now() where id=p_id;
 if s<>r.stage then insert into public.mc_request_events(request_id,stage,actor_id) values(p_id,s,auth.uid()); end if;
end $$;

commit;
