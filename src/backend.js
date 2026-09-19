import { createClient } from '@supabase/supabase-js';

const url = __SUPABASE_URL__;
const key = __SUPABASE_PUBLISHABLE_KEY__;
export const configured = Boolean(url && key);
export const client = configured ? createClient(url, key, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;
export const state = { user: null, staff: false, ready: false, recovery: false };
client?.auth.onAuthStateChange(event => { if(event === "PASSWORD_RECOVERY") state.recovery = true; });

function checked(result) {
  if (result.error) throw new Error(result.error.message || 'The request could not be completed.');
  return result.data;
}
export async function initialise() {
  if (!client) { state.ready = true; return; }
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  await applyUser(data.session?.user || null);
}
let userGeneration=0;
export async function applyUser(user) {
  const generation=++userGeneration;
  state.ready = false; state.user = user; state.staff = false;
  if (user) { const staff=Boolean(checked(await client.rpc('mc_is_staff'))); if(generation!==userGeneration)return;state.staff=staff;}
  state.ready = true;
}
function requireUser() {
  if (!client) throw new Error('Online requests are being set up. Please contact us on WhatsApp.');
  if (!state.user || !state.ready) throw new Error('Please sign in and try again.');
  return state.user;
}
function authClient() {
  if (!client) throw new Error('Online accounts are being set up. You can reach us on WhatsApp.');
  return client.auth;
}
export async function signIn(email,password) {
  return checked(await authClient().signInWithPassword({email,password}));
}
export async function signUp(name,email,password) {
  return checked(await authClient().signUp({email,password,options:{data:{full_name:name},emailRedirectTo:window.location.origin+'/'}}));
}
export async function forgotPassword(email) {
  checked(await authClient().resetPasswordForEmail(email,{redirectTo:window.location.origin+'/'}));
}
export async function resetPassword(password) {
  checked(await authClient().updateUser({password}));
  state.recovery=false;
}
export async function signOut() {
  if(client) checked(await client.auth.signOut({scope:'local'}));
  state.user=null; state.staff=false; state.recovery=false;
}
export async function loadData() {
  const user=requireUser();
  const results=await Promise.all([
    client.from('mc_requests').select('*').order('created_at',{ascending:false}).limit(200),
    client.from('mc_saved_devices').select('device_id').eq('user_id',user.id),
    client.from('mc_buying_enquiries').select('*').order('created_at',{ascending:false}).limit(200)
  ]);
  const rows=checked(results[0]), saved=checked(results[1]), enquiries=checked(results[2]);
  return {requests:rows.map(mapRequest),saved:saved.map(s=>s.device_id),enquiries};
}
function mapRequest(r) {
  return {...r, history:[],attachments:[],staff:{technician:'',notes:'',acquisition:0,transport:0,parts:0,labour:0,resale:0}};
}
export async function requestDetail(id,staff=false) {
  requireUser();
  if(staff&&!state.staff) throw new Error('Staff access required.');
  const tasks=[
    client.from('mc_requests').select('*').eq('id',id).single(),
    client.from('mc_request_events').select('stage,created_at').eq('request_id',id).order('created_at'),
    client.from('mc_attachments').select('*').eq('request_id',id).order('created_at')
  ];
  if(staff) tasks.push(client.from('mc_staff_assessments').select('*').eq('request_id',id).maybeSingle());
  const data=(await Promise.all(tasks)).map(checked),r=mapRequest(data[0]);
  r.history=data[1].map(e=>({stage:e.stage,at:new Date(e.created_at).toLocaleString()}));
  r.attachments=data[2];
  if(data[3])r.staff=data[3];
  return r;
}
export async function createRequest(id,payload) {
  requireUser();
  return checked(await client.rpc('mc_create_request',{p_id:id,p_data:payload}));
}
export async function updateTechnical(r,data) {
  requireUser();checked(await client.rpc('mc_update_technical',{p_id:r.id,p_version:r.version,p_data:data}));
}
export async function sellerAction(r,action) {
  requireUser();checked(await client.rpc('mc_seller_action',{p_id:r.id,p_version:r.version,p_action:action}));
}
export async function saveAssessment(r,data) {
  requireUser();checked(await client.rpc('mc_save_assessment',{p_id:r.id,p_version:r.version,p_data:data}));
}
export async function saveDevice(id,save) {
  const user=requireUser();
  checked(await (save?client.from('mc_saved_devices').insert({user_id:user.id,device_id:id}):client.from('mc_saved_devices').delete().eq('user_id',user.id).eq('device_id',id)));
}
export async function buyingEnquiry(id,device,requirements) {
  requireUser();checked(await client.rpc('mc_create_buying_enquiry',{p_id:id,p_device:device,p_requirements:requirements}));
}
export function validateFile(file) {
  const ext=file.name.split('.').pop().toLowerCase();
  const mime={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',pdf:'application/pdf',csv:'text/csv',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}[ext];
  if(!mime||file.size>10485760||file.size===0) throw new Error('Choose a supported, non-empty file under 10 MB.');
  if(file.name.length>200)throw new Error('File names must be 200 characters or fewer.');
  return {ext,mime};
}
export async function uploadAttachment(id,file,kind) {
  const user=requireUser(),{ext,mime}=validateFile(file);
  const path=`${id}/${user.id}/${crypto.randomUUID()}.${ext}`;
  checked(await client.storage.from('mc-documents').upload(path,file,{contentType:mime,upsert:false}));
  const result=await client.rpc('mc_register_attachment',{p_request_id:id,p_path:path,p_filename:file.name,p_kind:kind});
  if(result.error) {
    // Storage policy permits cleanup only before a metadata record is registered.
    await client.storage.from('mc-documents').remove([path]);
    throw new Error(result.error.message);
  }
}
export async function downloadAttachment(path) {
  requireUser();
  return checked(await client.storage.from('mc-documents').createSignedUrl(path,60,{download:true})).signedUrl;
}

export async function adminRole(){requireUser();return checked(await client.rpc('mc_admin_role'));}
export async function adminReport(from,to,period){requireUser();return checked(await client.rpc('mc_admin_report',{p_from:from,p_to:to,p_period:period}));}
export async function adminUsers(search,offset){requireUser();return checked(await client.rpc('mc_admin_users',{p_search:search,p_offset:offset}));}
export async function setAdmin(user,role){requireUser();checked(await client.rpc('mc_set_admin',{p_user:user,p_role:role}));}
const tracked=new Map();
export function track(action,device=null){
 if(!state.user||state.staff||!state.ready)return;
 const key=state.user.id+action+(device||''),now=Date.now();if(now-(tracked.get(key)||0)<2000)return;tracked.set(key,now);
 void client.rpc('mc_track',{p_action:action,p_device:device}).catch(()=>{});
}
