import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
const values={...process.env};
// Local .env is optional and never copied into the public directory.
try {for(const line of (await readFile('.env','utf8')).split('\n')) {const match=line.match(/^([A-Z_]+)\s*=\s*(.*?)\s*$/);if(match&&!values[match[1]])values[match[1]]=match[2].replace(/^['"]|['"]$/g,'');}} catch(e){if(e.code!=='ENOENT')throw e;}
const publicConfig=JSON.parse(await readFile('config/supabase.public.json','utf8'));
const url=values.PUBLIC_SUPABASE_URL||values.NEXT_PUBLIC_SUPABASE_URL||publicConfig.url||'',key=values.PUBLIC_SUPABASE_PUBLISHABLE_KEY||values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||publicConfig.publishableKey||'';
if(Boolean(url)!==Boolean(key))throw new Error('Set both PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
if(url&&!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url))throw new Error('Use the HTTPS Supabase project URL without a trailing slash.');
if(key.startsWith('sb_secret_'))throw new Error('Never use a Supabase secret key in the browser.');
if(key&&!key.startsWith('sb_publishable_')) {
 let payload;try{payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString());}catch{throw new Error('Expected a publishable key or legacy anon key.');}
 if(payload.role!=='anon')throw new Error('Only the publishable or legacy anon key can be used here.');
}
await build({entryPoints:['src/app.js'],bundle:true,format:'iife',outfile:'dist/app.js',minify:true,target:['es2022'],legalComments:'eof',define:{__SUPABASE_URL__:JSON.stringify(url),__SUPABASE_PUBLISHABLE_KEY__:JSON.stringify(key)}});
console.log(url?'Built with Supabase configuration.':'Built in contact-only mode; account submissions remain disabled until Supabase is configured.');
