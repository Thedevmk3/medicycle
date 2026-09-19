import * as DB from './backend.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'₹'+Number(n).toLocaleString('en-IN');
const devices=[
{id:'monitor',name:'Patient monitor',category:'Patient monitoring',img:'exploded.png',description:'A view of the assemblies that support monitoring: the display, processing electronics, power module and enclosure.',parts:['Display assembly','Processing electronics','Power module','Enclosure']},
{id:'pump',name:'Infusion pump',category:'Infusion therapy',img:'infusion-exploded.webp',description:'A compact device with control electronics, a pumping mechanism, a display and a power assembly. Each unit needs a device-specific assessment.',parts:['Pumping mechanism','Control board','Display','Power assembly']},
{id:'centrifuge',name:'Laboratory centrifuge',category:'Laboratory equipment',img:'centrifuge-exploded.webp',description:'An exploded illustration of the housing, chamber, rotor, drive motor and controls of a tabletop laboratory centrifuge.',parts:['Rotor & chamber','Drive motor','Control electronics','Lid & housing']},
{id:'defibrillator',name:'Portable defibrillator',category:'Emergency care',img:'defibrillator-exploded.webp',description:'A conceptual view of the display, electronics, energy-storage assembly, battery and enclosure of a portable defibrillator.',parts:['Display & controls','Circuit assemblies','Energy-storage module','Battery & enclosure']}
];
const stages=['Submitted','Suitability review','Assessment','Offer ready','Accepted','Collection scheduled','Received','Inspection','Refurbishment','Parts recovery','Recycling','Completed','On hold','Declined','Withdrawn'];
const saved=new Set();let savedOnly=false,activeDevice=0,toastTimer,rowCounter=0;
let requests=[];
let submissionId=null;let intakePhotos=[],inventoryFile=null;
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4200)}
function celebrateSignup(){
 view('home');
 $('#signup-celebration')?.remove();
 const banner=document.createElement('section');banner.id='signup-celebration';banner.className='signup-celebration';banner.setAttribute('role','status');
 banner.innerHTML='<span class="party-popper" aria-hidden="true">🎉</span><div><strong>Congratulations!</strong><p>Account created successfully. Welcome to Medicycle!</p></div><button type="button" aria-label="Dismiss welcome message">×</button>';
 banner.querySelector('button').onclick=()=>banner.remove();document.body.append(banner);
 if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
  const confetti=document.createElement('div');confetti.className='signup-confetti';confetti.setAttribute('aria-hidden','true');
  for(let i=0;i<36;i++){const piece=document.createElement('i');piece.style.cssText=`--x:${(i*37)%100}vw;--delay:${(i%7)*.07}s;--turn:${i%2?720:-540}deg;background:${['#1f7760','#e8bc54','#e78475','#8da9e0'][i%4]}`;confetti.append(piece);}
  document.body.append(confetti);setTimeout(()=>confetti.remove(),3500);
 }
 setTimeout(()=>banner.remove(),6500);
}
function view(v){
 if(!['home','sell','market','requests','staff'].includes(v))throw Error('Unknown view');
 if(['sell','requests','staff'].includes(v)&&!requireSignIn())return 'sign-in';
 if(v==='staff'&&!DB.state.staff){toast('Staff access is required.');return 'home';}
 $$('.view').forEach(e=>e.hidden=e.id!==v+'-view');
 $$('.nav').forEach(e=>e.classList.toggle('active',e.dataset.view===v||(v==='sell'&&e.dataset.view==='home')));
 if(v==='requests'||v==='staff')run(async()=>{await refreshData();renderRequests();});
 window.scrollTo({top:0,behavior:'instant'});return v;
}
$$('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view));$$('.brand').forEach(a=>a.onclick=e=>{e.preventDefault();view('home')});
function openInfo(title,html){$('#info-content').innerHTML=`<p class="eyebrow">MEDICYCLE</p><h2>${esc(title)}</h2>${html}`;$('#info-dialog').showModal()}
$$('.close').forEach(b=>b.onclick=()=>b.closest('dialog').close());$$('dialog').forEach(d=>d.onclick=e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close()}});
function selectSpotlight(index){if(!Number.isInteger(index)||!devices[index])throw Error('Unknown device');activeDevice=index;const d=devices[index];$('#spotlight-image').src='assets/'+d.img;$('#spotlight-image').alt='Exploded 3D concept illustration of '+d.name;$('#spotlight-number').textContent=`0${index+1} / 04`;$('#spotlight-category').textContent=d.category;$('#spotlight-title').textContent=d.name;$('#spotlight-description').textContent=d.description;$('#component-tags').innerHTML=d.parts.map(p=>`<span>${p}</span>`).join('');$('#spotlight-tabs').innerHTML=devices.map((x,i)=>`<button aria-pressed="${i===index}" class="${i===index?'selected':''}" data-spotlight="${i}">${x.name}</button>`).join('');$$('[data-spotlight]').forEach(b=>b.onclick=()=>selectSpotlight(+b.dataset.spotlight));}
$('#submit-featured').onclick=()=>{view('sell');const row=$('.device-row');row.querySelector('[data-field="name"]').value=devices[activeDevice].name;row.querySelector('[data-field="category"]').value=devices[activeDevice].category};
$('#eligibility-open').onclick=()=>openInfo('Equipment suitability','<p>Describe medical devices used in monitoring, therapy, diagnostics, emergency care or laboratories. Acceptance depends on the individual equipment, its condition and location.</p><p>Identify ownership or documentation gaps, contamination concerns, patient-data storage and specialist handling requirements. Furniture and other non-device items need a separate review.</p><p>Our team confirms eligibility and collection coverage after reviewing your enquiry.</p>');
function renderCatalogue(){const query=$('#search').value.trim().toLowerCase(),cat=$('#category').value;const list=devices.filter(d=>(!savedOnly||saved.has(d.id))&&(cat==='all'||d.category===cat)&&(d.name+' '+d.category).toLowerCase().includes(query));$('#cards').innerHTML=list.map(d=>`<article class="device-card"><div class="card-art"><span class="badge">Exploded concept</span><button class="save ${saved.has(d.id)?'on':''}" data-save="${d.id}" aria-label="${saved.has(d.id)?'Unsave':'Save'} ${d.name}" aria-pressed="${saved.has(d.id)}">${saved.has(d.id)?'♥':'♡'}</button><img src="assets/${d.img}" width="1536" height="1024" alt="Exploded 3D illustration of ${d.name}" loading="lazy"></div><div class="card-info"><span class="card-meta">${d.category}</span><h3>${d.name}</h3><p class="location">Illustrative example · Availability by enquiry</p><div class="card-price"><span>Request equipment details</span><button data-detail="${d.id}">Explore ↗</button></div></div></article>`).join('');$('#count').textContent=list.length;$('#saved-count').textContent=saved.size;$('#empty').hidden=list.length>0;$$('[data-save]').forEach(b=>b.onclick=()=>{if(!requireSignIn())return;run(async()=>{const id=b.dataset.save,add=!saved.has(id);await DB.saveDevice(id,add);add?saved.add(id):saved.delete(id);renderCatalogue();},b)});$$('[data-detail]').forEach(b=>b.onclick=()=>deviceDetail(b.dataset.detail));return list.map(({id,name,category})=>({id,name,category}));}
$('#search').oninput=renderCatalogue;$('#category').onchange=renderCatalogue;function stock(only){savedOnly=only;$('#all-stock').classList.toggle('selected',!only);$('#saved-stock').classList.toggle('selected',only);renderCatalogue()}$('#all-stock').onclick=()=>stock(false);$('#saved-stock').onclick=()=>stock(true);$('#reset-filters').onclick=()=>{$('#search').value='';$('#category').value='all';stock(false)};
function deviceDetail(id){const d=devices.find(x=>x.id===id);if(!d)return;
 $('#detail-content').innerHTML=`<p class="eyebrow">DEVICE CATEGORY · ILLUSTRATIVE EXAMPLE</p><div class="detail-grid"><div><img src="assets/${d.img}" alt="Exploded concept of ${d.name}"><p class="micro">Concept render only. Ask for actual unit photos, condition and test documentation.</p></div><div><h2>${d.name}</h2><p>${d.description}</p><div class="component-tags">${d.parts.map(x=>`<span>${x}</span>`).join('')}</div><h3>Before buying a refurbished unit</h3><p>Confirm the model, accessories, inspection results and warranty or service terms.</p><button class="primary" id="enquire-device">Enquire about this equipment ↗</button><a class="whatsapp-inline field-gap" href="${whatsappURL('Hello Medicycle, I would like to know more about a '+d.name.toLowerCase()+'.')}" target="_blank" rel="noopener noreferrer">Ask our team on WhatsApp ↗</a></div></div>`;
 $('#detail-dialog').showModal();$('#enquire-device').onclick=()=>{if(!requireSignIn())return;
 openInfo('Equipment enquiry',`<p>Tell us what you need from a ${d.name.toLowerCase()}. Our team will confirm availability.</p><form id="buyer-form"><p class="micro">Signed in as ${esc(DB.state.user.email)}</p><label>Your requirements<textarea required name="requirements" rows="3" maxlength="2000" placeholder="Model, quantity, budget or required accessories"></textarea></label><p id="buyer-feedback" class="form-feedback" role="status"></p><button class="primary field-gap">Send enquiry</button></form>`);
 const enquiryId=crypto.randomUUID();$('#buyer-form').onsubmit=e=>{e.preventDefault();run(async()=>{const text=new FormData(e.target).get('requirements').trim();if(!text)throw Error('Enter your equipment requirements.');await DB.buyingEnquiry(enquiryId,id,text);await refreshData();$('#info-dialog').close();toast('Your equipment enquiry has been received.');},e.submitter)};
 };
}
let buyerEnquiries=[];
function addDevice(){if($$('.device-row').length>=20){toast('For more than 20 device types, attach an inventory file.');return}const n=++rowCounter;const row=document.createElement('fieldset');row.className='device-row';row.innerHTML=`<legend>Equipment type ${n}</legend><div class="form-grid"><label>Device type / name<input data-field="name" required maxlength="120" placeholder="e.g. Patient monitor"></label><label>Category<select data-field="category"><option>Patient monitoring</option><option>Infusion therapy</option><option>Laboratory equipment</option><option>Diagnostic imaging</option><option>Emergency care</option><option>Other / unsure</option></select></label><label>Approximate quantity<input data-field="quantity" required type="number" min="1" max="10000" value="1"></label><label>Condition<select data-field="condition"><option>Unknown / not tested</option><option>Working surplus</option><option>Non-working</option><option>Intermittent fault</option><option>Parts only</option></select></label></div><button type="button" class="text-button remove-device">Remove this type</button>`;$('#device-rows').append(row);row.querySelector('.remove-device').onclick=()=>{if($$('.device-row').length===1){toast('Keep at least one equipment type.');return}row.remove()};}
$('#add-device').onclick=addDevice;$('#bulk-start').onclick=()=>{view('sell');if($$('.device-row').length===1)addDevice()};
function filesValid(files,types,max=5){return files.length<=max&&files.every(f=>types.includes(f.type)&&f.size<=10*1024*1024)}
$('#photos').onchange=e=>{const files=[...e.target.files];if(!filesValid(files,['image/jpeg','image/png','image/webp'])){e.target.value='';toast('Choose up to 5 JPG, PNG or WebP files, no larger than 10 MB each.');return}intakePhotos.forEach(a=>URL.revokeObjectURL(a.url));intakePhotos=files.map(f=>({name:f.name,url:URL.createObjectURL(f),file:f,type:'Equipment photo'}));$('#photo-previews').replaceChildren();intakePhotos.forEach(a=>{const img=document.createElement('img');img.src=a.url;img.alt='Preview: '+a.name;$('#photo-previews').append(img)})};
$('#inventory-file').onchange=e=>{const f=e.target.files[0];if(f&&(!/\.(csv|xlsx)$/i.test(f.name)||f.size>10*1024*1024)){e.target.value='';toast('Choose a CSV or XLSX inventory under 10 MB.');return}if(inventoryFile)URL.revokeObjectURL(inventoryFile.url);inventoryFile=f?{name:f.name,file:f,url:URL.createObjectURL(f),type:'Bulk inventory'}:null;$('#inventory-name').textContent=f?'Attached for manual review: '+f.name:''};
$('#sell-form').onsubmit=e=>{e.preventDefault();if(!requireSignIn())return;
 run(async()=>{
 const f=new FormData(e.target),items=$$('.device-row').map(row=>Object.fromEntries([...row.querySelectorAll('[data-field]')].map(x=>[x.dataset.field,x.dataset.field==='quantity'?Number(x.value):x.value.trim()])));
 if(items.some(i=>!i.name)||!f.get('organisation').trim()||!f.get('city').trim())throw Error('Enter organisation, location and equipment names.');
 const payload={organisation:f.get('organisation').trim(),contact:f.get('contact').trim(),phone:f.get('phone'),city:f.get('city').trim(),intent:f.get('intent'),items,notes:f.get('notes')};
 const attachments=[...intakePhotos,...(inventoryFile?[inventoryFile]:[])];attachments.forEach(a=>DB.validateFile(a.file));
 submissionId??=crypto.randomUUID();const id=await DB.createRequest(submissionId,payload);
 const failures=[];
 for(const a of attachments){try{await DB.uploadAttachment(id,a.file,a.type);}catch{failures.push(a.name);}}
 submissionId=null;intakePhotos.forEach(a=>URL.revokeObjectURL(a.url));if(inventoryFile)URL.revokeObjectURL(inventoryFile.url);intakePhotos=[];inventoryFile=null;
 e.target.reset();updateAccount();$('#photo-previews').replaceChildren();$('#inventory-name').textContent='';$('#device-rows').replaceChildren();rowCounter=0;addDevice();
 await refreshData();view('requests');await openRequest(id);
 if(failures.length)toast('Request saved. Please reattach these files from your request: '+failures.join(', '));else toast('Request received. You can track it in My requests.');
 },e.submitter);
};
function totalUnits(r){return r.items.reduce((n,i)=>n+Number(i.quantity),0)}
function rowHtml(r,staff){return `<div class="pipeline-row"><div><h3>${esc(r.items.map(i=>i.name).join(', '))}</h3><p>${esc(r.reference)} · ${totalUnits(r)} unit(s) · ${esc(r.organisation)}</p></div><p>${esc(r.city)}</p><span class="status">${esc(r.stage)}</span><button data-request="${r.id}" data-staff="${staff}">${staff?'Manage':'View request'} →</button></div>`}
function renderRequests(){
 const mine=requests.filter(r=>r.user_id===DB.state.user?.id),open=mine.filter(r=>!['Completed','Declined','Withdrawn'].includes(r.stage));
 $('#seller-stats').innerHTML=[[open.length,'Open requests'],[mine.filter(r=>r.stage==='Offer ready').length,'Offers to review'],[mine.filter(r=>r.stage==='Collection scheduled').length,'Collections planned'],[mine.reduce((n,r)=>n+totalUnits(r),0),'Equipment units']].map(([n,l])=>`<div><span>${l}</span><strong>${n}</strong></div>`).join('');
 $('#staff-stats').innerHTML=[[requests.length,'Recent requests'],[requests.filter(r=>['Submitted','Suitability review','Assessment'].includes(r.stage)).length,'Awaiting assessment'],[requests.filter(r=>['Inspection','Refurbishment'].includes(r.stage)).length,'In technical review'],[buyerEnquiries.length,'Recent buying enquiries']].map(([n,l])=>`<div><span>${l}</span><strong>${n}</strong></div>`).join('');
 const myBuying=buyerEnquiries.filter(q=>q.user_id===DB.state.user?.id);
 $('#request-list').innerHTML=mine.length?mine.map(r=>rowHtml(r,false)).join(''):'<div class="empty"><h3>No equipment requests yet</h3><p>Start an assessment to track its progress here.</p><button class="primary" id="empty-enquiry">Request an assessment ↗</button></div>';
 if($('#empty-enquiry'))$('#empty-enquiry').onclick=()=>view('sell');
 if(myBuying.length)$('#request-list').innerHTML+='<h3>My buying enquiries</h3>'+myBuying.map(q=>`<div class="enquiry-record"><strong>${esc(devices.find(d=>d.id===q.device_id)?.name||q.device_id)}</strong><p>${esc(q.requirements)}</p><span class="micro">Received ${new Date(q.created_at).toLocaleString()}</span></div>`).join('');
 const filtered=requests.filter(r=>$('#staff-filter').value==='all'||r.stage===$('#staff-filter').value);
 $('#staff-list').innerHTML=DB.state.staff?(filtered.length?filtered.map(r=>rowHtml(r,true)).join(''):'<div class="empty">No requests at this stage.</div>'):'';
 if(DB.state.staff&&buyerEnquiries.length)$('#staff-list').innerHTML+='<h3>Buying enquiries</h3>'+buyerEnquiries.map(q=>`<div class="enquiry-record"><strong>${esc(devices.find(d=>d.id===q.device_id)?.name||q.device_id)}</strong><p>${esc(q.email)} · ${esc(q.requirements)}</p></div>`).join('');
 $$('[data-request]').forEach(b=>b.onclick=()=>run(()=>b.dataset.staff==='true'?openStaff(b.dataset.request):openRequest(b.dataset.request),b));
}
$('#staff-filter').innerHTML+=[...stages].map(s=>`<option>${s}</option>`).join('');$('#staff-filter').onchange=renderRequests;

function attachmentHtml(r){return r.attachments.length?r.attachments.map(a=>`<button class="attachment" data-download="${a.id}">↧ ${esc(a.filename)} <span>${esc(a.kind)}</span></button>`).join(''):'<p class="micro">No documents attached yet.</p>'}
function bindDownloads(r){$$('[data-download]').forEach(b=>b.onclick=()=>run(async()=>{const a=r.attachments.find(x=>x.id===b.dataset.download);const url=await DB.downloadAttachment(a.storage_path);const link=document.createElement('a');link.href=url;link.rel='noopener noreferrer';link.target='_blank';link.download=a.filename;link.click();},b));}
function requestItems(r){return `<div class="item-list">${r.items.map((i,n)=>`<div><strong>${esc(i.name)}</strong><span>Equipment ${esc(r.reference)}-${n+1} · ${i.quantity} unit(s) · ${esc(i.condition)}</span></div>`).join('')}</div>`}
async function openRequest(id){
 if(!requireSignIn())return;const owner=DB.state.user.id,r=await DB.requestDetail(id);if(DB.state.user?.id!==owner)return;
 const closed=['Completed','Withdrawn','Declined'].includes(r.stage);
 $('#detail-content').innerHTML=`<p class="eyebrow">MY REQUEST · ${esc(r.reference)}</p><h2>${esc(r.organisation)}</h2><p>${esc(r.intent)} · ${esc(r.city)} · ${totalUnits(r)} unit(s)</p><span class="status">${esc(r.stage)}</span>${requestItems(r)}<div class="timeline">${r.history.map(h=>`<div><b>${esc(h.stage)}</b><span>${esc(h.at)}</span></div>`).join('')}</div>${r.quote?`<section class="quote-box"><p class="eyebrow">WRITTEN OFFER</p><h3>${money(r.quote.amount)}</h3><p>${esc(r.quote.terms)}</p><p>${esc(r.quote.collectionCost)}<br>Offer expiry: ${esc(r.quote.expiry)}</p>${r.stage==='Offer ready'?'<button class="primary" id="review-quote">Review & respond</button>':''}</section>`:''}${r.collection?`<h3>Collection arrangements</h3><p>${esc(r.collection)}</p>`:''}${r.outcome?`<h3>Recorded outcome</h3><p>${esc(r.outcome)}</p>`:''}${!closed?`<details class="request-details"><summary>Add technical details & service history</summary><form id="technical-form"><div class="form-grid field-gap"><label>Manufacturer / model<input name="model" value="${esc(r.technical.model||'')}" maxlength="200"></label><label>Serial numbers / asset references<input name="serial" value="${esc(r.technical.serial||'')}" maxlength="300"></label></div><label>Condition, accessories, history & access needs<textarea name="history" rows="3" maxlength="3000">${esc(r.technical.history||'')}</textarea></label><button class="secondary field-gap">Save details</button></form></details>`:''}<h3>Private attachments</h3>${attachmentHtml(r)}<label class="field-gap">Add a document or photo <span class="optional">PDF, image, CSV or XLSX · Max 10 MB</span><input id="request-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.xlsx"></label><p class="micro">Documents are shared with your account and authorized Medicycle staff. Exclude patient information.</p><a class="whatsapp-inline" href="${whatsappURL('Hello Medicycle, I would like help with my equipment request.')}" target="_blank" rel="noopener noreferrer">Talk to our team on WhatsApp ↗</a>${['Submitted','Suitability review','Assessment','Offer ready','On hold'].includes(r.stage)?'<button class="text-button field-gap" id="withdraw-request">Withdraw request</button>':''}`;
 $('#detail-dialog').showModal();bindDownloads(r);
 if($('#technical-form'))$('#technical-form').onsubmit=e=>{e.preventDefault();run(async()=>{await DB.updateTechnical(r,Object.fromEntries(new FormData(e.target)));await refreshData();await openRequest(id);toast('Technical details saved.');},e.submitter)};
 $('#request-file').onchange=e=>{const file=e.target.files[0];if(file)run(async()=>{await DB.uploadAttachment(id,file,'Request document');await openRequest(id);toast('Document uploaded.');},e.target)};
 if($('#review-quote'))$('#review-quote').onclick=()=>{
 openInfo('Accept this offer?',`<h3>${money(r.quote.amount)}</h3><p>${esc(r.quote.terms)}</p><p>${esc(r.quote.collectionCost)}</p><p>Your acceptance will be recorded and shared with the team.</p><label class="check"><input id="quote-confirm" type="checkbox"> I have reviewed the offer and agree to these terms.</label><button class="primary field-gap" id="accept-quote">Confirm acceptance</button>`);
 $('#accept-quote').onclick=e=>run(async()=>{if(!$('#quote-confirm').checked)throw Error('Please confirm that you have reviewed the offer.');await DB.sellerAction(r,'accept');$('#info-dialog').close();await refreshData();await openRequest(id);toast('Offer acceptance recorded.');},e.currentTarget);
 };
 if($('#withdraw-request'))$('#withdraw-request').onclick=()=>{openInfo('Withdraw this request?','<p>Your request will be closed. You can submit a new enquiry if needed.</p><button class="primary" id="confirm-withdraw">Confirm withdrawal</button>');$('#confirm-withdraw').onclick=e=>run(async()=>{await DB.sellerAction(r,'withdraw');$('#info-dialog').close();await refreshData();await openRequest(id);toast('Request withdrawn.');},e.currentTarget)};
}
async function openStaff(id){if(!requireSignIn()||!DB.state.staff)return;const owner=DB.state.user.id,r=await DB.requestDetail(id,true);if(DB.state.user?.id!==owner||!DB.state.staff)return;const s=r.staff;$('#detail-content').innerHTML=`<p class="eyebrow">STAFF WORKSPACE · ${esc(r.reference)}</p><h2>Assessment & recovery record</h2><p>${esc(r.organisation)} · ${esc(r.contact)} · ${esc(r.email)} · ${esc(r.city)}</p>${requestItems(r)}<details class="request-details"><summary>Submitted information & attachments</summary><p>${esc(r.notes||'No additional notes')}</p><p>Model: ${esc(r.technical.model||'Not provided')}<br>Serial / assets: ${esc(r.technical.serial||'Not provided')}</p><p>${esc(r.technical.history||'')}</p>${attachmentHtml(r)}</details><form id="staff-form"><div class="form-grid field-gap"><label>Current stage<select name="stage">${stages.map(x=>`<option ${x===r.stage?'selected':''}>${x}</option>`).join('')}</select></label><label>Assigned assessor / technician<input name="technician" value="${esc(s.technician)}" maxlength="120"></label></div><label>Inspection findings / repair notes<textarea name="notes" rows="3" maxlength="4000">${esc(s.notes)}</textarea></label><h3>Internal cost estimate <span class="optional">INR</span></h3><div class="cost-grid">${[['acquisition','Acquisition'],['transport','Transport'],['parts','Parts'],['labour','Labour'],['resale','Expected resale']].map(([key,label])=>`<label>${label}<input data-cost name="${key}" type="number" min="0" max="100000000" step="1" value="${s[key]}"></label>`).join('')}</div><div class="margin-box" id="margin-result"></div><h3>Written offer</h3><div class="form-grid"><label>Offer amount (INR)<input name="offerAmount" type="number" min="0" max="100000000" value="${r.quote?.amount??''}"></label><label>Offer expiry<input name="offerExpiry" type="date" value="${r.quote?.expiry??''}"></label></div><label class="field-gap">Offer conditions<textarea name="offerTerms" maxlength="2000" rows="2">${esc(r.quote?.terms??'')}</textarea></label><label class="field-gap">Collection costs / inclusion<input name="collectionCost" maxlength="300" value="${esc(r.quote?.collectionCost??'')}"></label><label class="field-gap">Collection arrangement<textarea name="collection" rows="2" maxlength="1500">${esc(r.collection)}</textarea></label><label class="field-gap">Final disposition / outcome<textarea name="outcome" rows="2" maxlength="1500" placeholder="Record the disposition and reference supporting documents.">${esc(r.outcome)}</textarea></label><div class="form-foot"><p>Internal estimates and notes are restricted to authorized staff. Save changes to update the seller’s request.</p><button class="primary">Save assessment</button></div></form>`;$('#detail-dialog').showModal();bindDownloads(r);const calc=()=>{const f=new FormData($('#staff-form')),cost=['acquisition','transport','parts','labour'].reduce((n,k)=>n+Number(f.get(k)||0),0),margin=Number(f.get('resale')||0)-cost;$('#margin-result').textContent=`Estimated total cost: ${money(cost)} · Expected contribution: ${money(margin)} (before tax, overheads and other costs)`};$$('[data-cost]').forEach(i=>i.oninput=calc);calc();$('#staff-form').onsubmit=e=>{e.preventDefault();run(async()=>{
 const f=new FormData(e.target),hasQuote=String(f.get('offerAmount')).trim()!=='';
 const payload={stage:f.get('stage'),technician:f.get('technician'),notes:f.get('notes'),...Object.fromEntries(['acquisition','transport','parts','labour','resale'].map(k=>[k,Number(f.get(k))])),quote:hasQuote?{amount:Number(f.get('offerAmount')),expiry:f.get('offerExpiry'),terms:f.get('offerTerms'),collectionCost:f.get('collectionCost')}:null,collection:f.get('collection'),outcome:f.get('outcome')};
 await DB.saveAssessment(r,payload);await refreshData();$('#detail-dialog').close();toast('Assessment saved. Seller tracking is updated.');
 },e.submitter)};
}

$('#about').onclick=()=>openInfo('About Medicycle','<p>We help organisations enquire about retired medical equipment, refurbishment and recovery options. Contact our team to discuss equipment suitability, availability and collection.</p><p>Catalogue images are illustrative exploded renders, not photographs of stock, service instructions or proof of condition.</p><a class="whatsapp-inline" href="'+whatsappURL('Hello Medicycle, I would like to know more about your services.')+'" target="_blank" rel="noopener noreferrer">Chat with our team on WhatsApp ↗</a>');
let refreshGeneration=0,authEpoch=0;
function whatsappURL(message='Hello Medicycle, I would like to discuss medical equipment.') {
 return 'https://wa.me/917676888427?text='+encodeURIComponent(message);
}
function resetPrivateState(){refreshGeneration++;requests=[];buyerEnquiries=[];saved.clear();submissionId=null;intakePhotos.forEach(a=>URL.revokeObjectURL(a.url));if(inventoryFile)URL.revokeObjectURL(inventoryFile.url);intakePhotos=[];inventoryFile=null;$('#sell-form').reset();$('#photo-previews').replaceChildren();$('#inventory-name').textContent='';$('#device-rows').replaceChildren();rowCounter=0;addDevice();$$('dialog[open]').forEach(d=>d.close());$('#detail-content').replaceChildren();$('#info-content').replaceChildren();renderRequests();renderCatalogue();}
function requireSignIn(){
 if(!DB.configured){openInfo('Let’s talk about your equipment',`<p>Online accounts are being set up. Our team can help you through WhatsApp in the meantime.</p><a class="primary" href="${whatsappURL()}" target="_blank" rel="noopener noreferrer">Chat on WhatsApp ↗</a>`);return false;}
 if(!DB.state.ready){toast('Please wait while we check your account.');return false;}
 if(!DB.state.user){openAccount();return false;}return true;
}
async function run(action,button){
 if(button?.disabled)return;
 if(button){button.disabled=true;button.setAttribute('aria-busy','true');}
 try{return await action();}catch(error){toast(error.message||'Something went wrong. Please try again.');return null;}
 finally{if(button){button.disabled=false;button.removeAttribute('aria-busy');}}
}
async function refreshData(){
 if(!DB.state.user)return;const generation=++refreshGeneration,user=DB.state.user.id;
 const data=await DB.loadData();if(generation!==refreshGeneration||DB.state.user?.id!==user)return;
 requests=data.requests;buyerEnquiries=data.enquiries;saved.clear();data.saved.forEach(id=>saved.add(id));renderRequests();renderCatalogue();
}
function updateAccount(){
 const account=$('#account-button'),user=DB.state.user;
 const metadata=user?.user_metadata;
 const name=[metadata?.full_name,metadata?.name,user?.email?.split('@')[0]].find(value=>typeof value==='string'&&value.trim())?.trim()||'Profile';
 account.classList.toggle('profile-button',Boolean(user));
 if(user){
  account.innerHTML='<svg class="profile-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg><span class="profile-name"></span>';
  account.querySelector('.profile-name').textContent=name;
  account.setAttribute('aria-label','Open profile for '+name);account.title=name;
 }else{account.textContent='Sign in';account.removeAttribute('aria-label');account.removeAttribute('title');}
 $('#staff-button').hidden=!DB.state.staff;
 $('#connection-notice').hidden=DB.configured;
 $('#account-loading').hidden=DB.state.ready;
 const email=$('#sell-form input[name="email"]');email.value=DB.state.user?.email||'';email.readOnly=true;
}
function openAccount(){
 if(!DB.configured){requireSignIn();return;}
 if(DB.state.recovery){openAuthForm('reset');return;}
 if(DB.state.user){openInfo('Your account',`<p>Signed in as <strong>${esc(DB.state.user.email)}</strong>.</p><p>Your requests and documents are stored securely with access for your account and authorized staff.</p><button class="secondary" id="sign-out">Sign out</button>`);$('#sign-out').onclick=e=>run(async()=>{await DB.signOut();resetPrivateState();updateAccount();view('home');toast('Signed out.');},e.currentTarget);return;}
 openAuthForm('signin');
}
function openAuthForm(mode){
 const signup=mode==='signup',forgot=mode==='forgot',reset=mode==='reset';
 const title=signup?'Create your account':forgot?'Forgot password?':reset?'Choose a new password':'Welcome back';
 openInfo(title,`<p>${signup?'Enter your details to get started.':forgot?'We’ll email you a link to choose a new password. Open it in this browser.':reset?'Set a new password for your Medicycle account.':'Sign in with your email and password.'}</p>
 <form id="login-form">
 ${signup?'<label class="field-gap">Full name<input name="name" autocomplete="name" required maxlength="120"></label>':''}
 ${!reset?'<label class="field-gap">Email address<input type="email" name="email" autocomplete="email" required maxlength="254" placeholder="you@organisation.com"></label>':''}
 ${!forgot?`<label class="field-gap">${reset?'New password':'Password'}<input type="password" name="password" autocomplete="${signup||reset?'new-password':'current-password'}" required ${signup||reset?'minlength="8"':''} maxlength="128"></label><button type="button" class="text-button" id="toggle-password" aria-pressed="false">Show password</button>${signup||reset?'<p class="micro">Use at least 8 characters.</p>':''}`:''}
 ${reset?'<label class="field-gap">Confirm new password<input type="password" name="confirm" autocomplete="new-password" required minlength="8" maxlength="128"></label>':''}
 <p id="login-feedback" class="form-feedback" role="status" aria-live="polite"></p>
 <button class="primary field-gap" type="submit">${signup?'Create account':forgot?'Send reset link':reset?'Save new password':'Sign in'}</button></form>
 <div class="auth-actions">${!signup&&!forgot&&!reset?'<button class="text-button" data-auth="forgot">Forgot password?</button><button class="text-button" data-auth="signup">New here? Create an account</button>':''}${signup||forgot?'<button class="text-button" data-auth="signin">Back to sign in</button>':''}</div>`);
 $$('[data-auth]').forEach(b=>b.onclick=()=>openAuthForm(b.dataset.auth));
 const toggle=$('#toggle-password');if(toggle)toggle.onclick=()=>{const input=$('#login-form input[name="password"]'),show=input.type==='password';input.type=show?'text':'password';toggle.textContent=show?'Hide password':'Show password';toggle.setAttribute('aria-pressed',String(show));};
 $('#login-form').onsubmit=e=>{e.preventDefault();const form=e.target,feedback=$('#login-feedback'),data=new FormData(form);run(async()=>{
  feedback.textContent='';
  try{
   const email=String(data.get('email')||'').trim(),password=String(data.get('password')||'');
   if(forgot){await DB.forgotPassword(email);feedback.textContent='If an account exists for this email, a reset link has been requested. Check your inbox and spam folder.';return;}
   if(reset){if(password!==data.get('confirm'))throw new Error('Passwords do not match.');await DB.resetPassword(password);form.reset();$('#info-dialog').close();toast('Password updated. You are signed in.');return;}
   const name=String(data.get('name')||'').trim();if(signup&&!name)throw new Error('Please enter your name.');
   const result=signup?await DB.signUp(name,email,password):await DB.signIn(email,password);
   if(!result.session){feedback.textContent='Your account needs email confirmation. Check your inbox, then sign in.';return;}
   form.reset();$('#info-dialog').close();if(signup)celebrateSignup();else{view('home');toast('You’re signed in.');}
  }catch(error){feedback.textContent=error.message;}
 },e.submitter);};
}
async function boot(){
 $('#account-button').onclick=openAccount;
 $$('.refresh-records').forEach(b=>b.onclick=()=>run(refreshData,b));
 const toggle=$('#whatsapp-toggle'),panel=$('#whatsapp-panel');
 const setChat=open=>{panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open));if(open)panel.querySelector('a').focus();};
 toggle.onclick=()=>setChat(panel.hidden);$('#whatsapp-close').onclick=()=>{setChat(false);toggle.focus();};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){setChat(false);toggle.focus();}});
 try{await DB.initialise();if(DB.state.user)await refreshData();}
 catch(error){DB.state.ready=true;DB.state.staff=false;toast('Unable to load your account. '+error.message);}
 updateAccount();
 const callbackError=new URLSearchParams(location.hash.slice(1)).get('error_description')||new URLSearchParams(location.search).get('error_description');
 if(callbackError)toast('The sign-in link could not be used. Request a new link.');
 if(DB.client)DB.client.auth.onAuthStateChange((event,session)=>{
  if(!['SIGNED_IN','SIGNED_OUT','USER_UPDATED','PASSWORD_RECOVERY'].includes(event))return;
  const epoch=++authEpoch;
  // Supabase recommends deferring async API work outside the auth callback.
  setTimeout(async()=>{if(epoch!==authEpoch)return;try{
   const changed=DB.state.user?.id!==session?.user?.id;
   if(changed)resetPrivateState();
   await DB.applyUser(session?.user||null);if(epoch!==authEpoch)return;
   updateAccount();if(DB.state.recovery&&DB.state.user)openAuthForm('reset');if(DB.state.user)await refreshData();else view('home');
  }catch(error){DB.state.ready=true;DB.state.staff=false;updateAccount();toast(error.message);}},0);
 });
 if(DB.state.recovery&&DB.state.user)openAuthForm('reset');
 if(DB.state.user&&new URLSearchParams(location.search).has('code'))history.replaceState(null,'',location.pathname);
}

addDevice();selectSpotlight(0);renderCatalogue();renderRequests();
boot();
if(document.modelContext?.registerTool){const lifecycle=new AbortController();addEventListener('pagehide',()=>lifecycle.abort(),{once:true});const tools=[{name:'search_equipment_categories',title:'Search sample device categories',description:'Filter the visible illustrative equipment catalogue. Does not search live stock.',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false},execute:input=>{if(!input||typeof input.query!=='string'||input.query.length>200)throw Error('query must be at most 200 characters');view('market');savedOnly=false;$('#search').value=input.query;$('#category').value='all';stock(false);return{devices:renderCatalogue()}}},{name:'start_equipment_assessment',title:'Open seller enquiry',description:'Open the initial seller enquiry form without submitting anything.',inputSchema:{type:'object',properties:{},additionalProperties:false},execute:input=>{if(!input||Object.keys(input).length)throw Error('No arguments expected');return{view:view('sell'),submitted:false}}}];for(const t of tools){try{Promise.resolve(document.modelContext.registerTool(t,{signal:lifecycle.signal})).catch(()=>{})}catch{}}}
