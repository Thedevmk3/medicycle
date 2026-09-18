import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

async function harness(responses={}) {
 const calls=[]; let callback;
 const auth=new Proxy({}, {get:(_,method)=>method==='onAuthStateChange'?fn=>{callback=fn;}:async (payload,options)=>{calls.push({method,payload,options});return responses[method]||{data:{session:{user:{id:'customer'}}},error:null};}});
 const source=(await fs.readFile(new URL('../src/backend.js',import.meta.url),'utf8'))
  .replace("import { createClient } from '@supabase/supabase-js';",'')
  .replaceAll('export ','');
 const context=vm.createContext({__SUPABASE_URL__:'https://example.supabase.co',__SUPABASE_PUBLISHABLE_KEY__:'public',createClient:()=>({auth}),window:{location:{origin:'https://medicycle.example'}}});
 vm.runInContext(source+'\nglobalThis.api={signIn,signUp,forgotPassword,resetPassword,signOut,state};',context);
 return {api:context.api,calls,event:event=>callback(event)};
}
test('password signup stores name as metadata and returns immediate session',async()=>{
 const {api,calls}=await harness();
 assert.ok((await api.signUp('Customer','customer@example.com','test-password')).session);
 assert.equal(calls[0].method,'signUp');
 assert.equal(calls[0].payload.options.data.full_name,'Customer');
 assert.equal(calls[0].payload.password,'test-password');
 assert.equal(calls[0].payload.options.emailRedirectTo,'https://medicycle.example/');
});
test('password login uses password auth and propagates failures',async()=>{
 const {api,calls}=await harness({signInWithPassword:{error:{message:'Invalid login credentials'}}});
 await assert.rejects(api.signIn('customer@example.com','wrong-password'),/Invalid login credentials/);
 assert.equal(calls[0].method,'signInWithPassword');
});
test('recovery event is retained before UI boot and cleared only after password update succeeds',async()=>{
 const {api,calls,event}=await harness();
 await api.forgotPassword('customer@example.com');
 assert.equal(calls[0].method,'resetPasswordForEmail');
 assert.equal(calls[0].options.redirectTo,'https://medicycle.example/');
 event('PASSWORD_RECOVERY'); assert.equal(api.state.recovery,true);
 await api.resetPassword('new-password');
 assert.equal(calls[1].method,'updateUser');
 assert.equal(api.state.recovery,false);
 const failed=await harness({updateUser:{error:{message:'Password too weak'}}});
 failed.event('PASSWORD_RECOVERY');
 await assert.rejects(failed.api.resetPassword('weak'),/Password too weak/);
 assert.equal(failed.api.state.recovery,true);
});
test('signup keeps confirmation-required response for later verification policy',async()=>{
 const {api}=await harness({signUp:{data:{session:null,user:{id:'pending'}},error:null}});
 assert.equal((await api.signUp('Customer','customer@example.com','test-password')).session,null);
});
