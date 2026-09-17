import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222',staff='33333333-3333-4333-8333-333333333333';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,storage to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,primary key(bucket_id,name));
 alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to authenticated;
 insert into auth.users values('${alice}','alice@example.com'),('${bob}','bob@example.com'),('${staff}','staff@example.com');`);
await db.exec(await readFile('supabase/migrations/001_medicycle.sql','utf8'));
await db.exec(await readFile('supabase/migrations/002_preserve_accepted_offers.sql','utf8'));
await db.query('insert into public.mc_staff_members(user_id) values($1)',[staff]);
async function user(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
const payload={organisation:'Test clinic',contact:'Alice',phone:'',city:'Bengaluru',intent:'Sell equipment',items:[{name:'Monitor',category:'Patient monitoring',quantity:1,condition:'Non-working'}],notes:''};
const assessment={stage:'Offer ready',technician:'Engineer',notes:'Internal note',acquisition:100,transport:20,parts:30,labour:40,resale:300,quote:{amount:100,expiry:'2099-12-31',terms:'Subject to inspection',collectionCost:'Included'},collection:'',outcome:''};
after(()=>db.close());
test('authenticated intake is validated, idempotent and owned by the caller',async()=>{
 await user(alice);await db.query('select mc_create_request($1,$2)',[id,payload]);await db.query('select mc_create_request($1,$2)',[id,payload]);
 const rows=(await db.query('select * from mc_requests')).rows;assert.equal(rows.length,1);assert.equal(rows[0].user_id,alice);assert.equal(rows[0].email,'alice@example.com');
 await assert.rejects(db.query('select mc_create_request($1,$2)',['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',{...payload,items:[{...payload.items[0],quantity:-2}]}]),/Quantity/);
});
test('another customer cannot read requests, events, documents or update a request',async()=>{
 await user(bob);assert.equal((await db.query('select * from mc_requests')).rows.length,0);assert.equal((await db.query('select * from mc_request_events')).rows.length,0);
 await assert.rejects(db.query('select mc_update_technical($1,1,$2)',[id,{}]),/unavailable/);
 await assert.rejects(db.query('select mc_create_request($1,$2)',[id,payload]),/unavailable/);
 await assert.rejects(db.query("update mc_requests set stage='Accepted'"),/permission denied/);
 await assert.rejects(db.query('insert into mc_staff_members(user_id) values($1)',[bob]),/permission denied/);
});
test('staff can assess; customers cannot read internal notes or invoke staff writes',async()=>{
 await user(alice);await assert.rejects(db.query('select mc_save_assessment($1,1,$2)',[id,assessment]),/Staff access/);
 await user(staff);await db.query('select mc_save_assessment($1,1,$2)',[id,assessment]);assert.equal((await db.query('select notes from mc_staff_assessments')).rows[0].notes,'Internal note');
 await user(alice);assert.equal((await db.query('select * from mc_staff_assessments')).rows.length,0);assert.equal((await db.query('select stage from mc_requests')).rows[0].stage,'Offer ready');
});
test('offer acceptance requires ownership, current version and preserves accepted terms',async()=>{
 await user(bob);await assert.rejects(db.query("select mc_seller_action($1,2,'accept')",[id]),/unavailable/);
 await user(alice);await assert.rejects(db.query("select mc_seller_action($1,1,'accept')",[id]),/Record changed/);
 await db.query("select mc_seller_action($1,2,'accept')",[id]);
 await user(staff);await assert.rejects(db.query('select mc_save_assessment($1,3,$2)',[id,{...assessment,stage:'Accepted',quote:{...assessment.quote,amount:999}}]),/terms cannot/);
 await assert.rejects(db.query('select mc_save_assessment($1,3,$2)',[id,{...assessment,stage:'Collection scheduled'}]),/collection arrangements/);
 await db.query('select mc_save_assessment($1,3,$2)',[id,{...assessment,stage:'Collection scheduled',collection:'Agreed appointment'}]);
});
test('storage follows request ownership, and only unregistered uploads can be cleaned up',async()=>{
 const path=`${id}/${alice}/photo.png`;
 await user(bob);await assert.rejects(db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['mc-documents',`${id}/${bob}/photo.png`]),/row-level security/);
 await user(alice);await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['mc-documents',path]);await db.query('select mc_register_attachment($1,$2,$3,$4)',[id,path,'photo.png','Equipment photo']);
 await db.query('delete from storage.objects where name=$1',[path]);assert.equal((await db.query('select * from storage.objects')).rows.length,1);
 await user(bob);assert.equal((await db.query('select * from storage.objects')).rows.length,0);assert.equal((await db.query('select * from mc_attachments')).rows.length,0);
 await user(staff);assert.equal((await db.query('select * from storage.objects')).rows.length,1);
});
test('anonymous users have no RPC or table access',async()=>{
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from mc_requests'),/permission denied/);await assert.rejects(db.query('select mc_create_request($1,$2)',[id,payload]),/permission denied/);
});
test('saved categories and buying enquiries stay within each customer account',async()=>{
 await user(alice);await db.query("insert into mc_saved_devices values($1,'monitor',now())",[alice]);
 await db.query('select mc_create_buying_enquiry($1,$2,$3)',['cccccccc-cccc-4ccc-8ccc-cccccccccccc','pump','Need two pumps']);
 await user(bob);assert.equal((await db.query('select * from mc_saved_devices')).rows.length,0);assert.equal((await db.query('select * from mc_buying_enquiries')).rows.length,0);
 await assert.rejects(db.query("insert into mc_saved_devices values($1,'pump',now())",[alice]),/row-level security/);
});

test('accepted offer cannot be altered by moving the request on hold',async()=>{
 await user(staff);await db.query('select mc_save_assessment($1,4,$2)',[id,{...assessment,stage:'On hold',collection:'Agreed appointment'}]);
 await assert.rejects(db.query('select mc_save_assessment($1,5,$2)',[id,{...assessment,stage:'On hold',quote:{...assessment.quote,amount:777}}]),/terms cannot/);
 await assert.rejects(db.query('select mc_save_assessment($1,5,$2)',[id,assessment]),/pre-offer/);
});
