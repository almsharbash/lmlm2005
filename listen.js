/* كلمات — استماع ومشاهدة
   ملف مستقل يُحمَّل عند فتح القسم فقط. يحرّره المشرف، ويختار العضو حسب مزاجه.
   المكتبة تُحفظ في مستند واحد: config/listen */
import{doc,getDoc,setDoc,serverTimestamp}from"https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const MOODS=[["calm","هادئ","🌿"],["spirit","روحاني","🕌"],["energy","حماسي","⚡"],["tarab","طرب","🎶"],["think","ثقافة وفكر","📚"],["fun","ترفيه","😄"],["news","أخبار","📰"]];
const MOOD=Object.fromEntries(MOODS.map(m=>[m[0],m]));
const MAX_ITEMS=100,TTL=10*60*1000,KEY_LIB="kl-lib",KEY_MOODS="kl-moods";
const S={items:null,at:0,moods:new Set(),type:"all",cur:null,queue:[],qi:-1,noRules:false,ctx:null,box:null,css:false};
const arr=v=>Array.isArray(v)?v:[];
const uid8=()=>Math.random().toString(36).slice(2,9);
const lsGet=k=>{try{return JSON.parse(localStorage.getItem(k)||"null")}catch{return null}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
let esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/* ---------- تحويل أي رابط عادي إلى مشغّل ---------- */
export function parse(raw){
 let u;try{u=new URL(String(raw||"").trim())}catch{return null}
 if(u.protocol!=="https:")return null;
 const h=u.hostname.toLowerCase().replace(/^(www|m|music)\./,""),p=u.pathname;let m;
 if(h==="youtu.be"||h==="youtube.com"||h==="youtube-nocookie.com"){
  const id=h==="youtu.be"?(p.split("/")[1]||""):(u.searchParams.get("v")||((m=p.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/))?m[1]:""));
  const list=u.searchParams.get("list");
  if(/^[\w-]{11}$/.test(id))return{k:"video",site:"YouTube",src:`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1${list&&/^[\w-]{10,60}$/.test(list)?"&list="+encodeURIComponent(list):""}`,thumb:`https://i.ytimg.com/vi/${id}/hqdefault.jpg`};
  if(list&&/^[\w-]{10,60}$/.test(list))return{k:"video",site:"YouTube",src:`https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}&autoplay=1&rel=0&playsinline=1`};
  return null;
 }
 if(h==="vimeo.com"||h==="player.vimeo.com"){m=p.match(/(\d{6,12})/);if(m)return{k:"video",site:"Vimeo",src:`https://player.vimeo.com/video/${m[1]}?autoplay=1`}}
 if(h==="dailymotion.com"){m=p.match(/\/video\/([a-z0-9]+)/i);if(m)return{k:"video",site:"Dailymotion",src:`https://www.dailymotion.com/embed/video/${m[1]}?autoplay=1`}}
 if(h==="soundcloud.com"&&p.split("/").filter(Boolean).length>=2)return{k:"audio",site:"SoundCloud",h:p.includes("/sets/")?352:166,src:`https://w.soundcloud.com/player/?url=${encodeURIComponent(u.origin+p)}&auto_play=true&visual=false`};
 if(h==="open.spotify.com"){m=p.match(/(?:\/intl-[a-z-]+)?\/(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/);if(m)return{k:"audio",site:"Spotify",h:(m[1]==="track"||m[1]==="episode")?152:352,src:`https://open.spotify.com/embed/${m[1]}/${m[2]}`}}
 if(h==="archive.org"){m=p.match(/\/(?:details|embed)\/([\w.\-]+)/);if(m)return{k:"video",site:"أرشيف الإنترنت",src:`https://archive.org/embed/${m[1]}`}}
 if((h==="facebook.com"||h==="web.facebook.com"||h==="fb.watch")&&(h==="fb.watch"||/\/(videos|reel|watch|share\/[vr])/.test(p)||u.searchParams.get("v")))return{k:"video",site:"فيسبوك",src:`https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u.href)}&show_text=false&autoplay=true`};
 if(/\.(mp3|m4a|aac|ogg|oga|wav|opus)$/i.test(p))return{k:"audio",site:"ملف صوتي",file:u.href,tag:"audio"};
 if(/\.(mp4|webm|ogv)$/i.test(p))return{k:"video",site:"ملف فيديو",file:u.href,tag:"video"};
 return null;
}
const safeUrl=v=>{try{const u=new URL(String(v||"").trim());return u.protocol==="https:"?u.href:""}catch{return""}};
function norm(list){
 return arr(list).slice(0,MAX_ITEMS).map(x=>({id:String(x&&x.id||uid8()).slice(0,20),title:String(x&&x.title||"").slice(0,80),url:safeUrl(x&&x.url).slice(0,500),moods:arr(x&&x.moods).filter(k=>MOOD[k]).slice(0,3)})).filter(x=>x.title&&x.url);
}

/* ---------- الأنماط ---------- */
const CSS=`
.kl-top{background:var(--s);border:1px solid var(--b);border-radius:14px;padding:12px;margin-bottom:12px;display:grid;gap:10px}
.kl-h{font-weight:bold;font-size:16px}
.kl-chips{display:flex;flex-wrap:wrap;gap:7px}
.kl-chip{border:1px solid var(--b);background:var(--bg);color:var(--t);border-radius:999px;padding:7px 13px;font:inherit;font-size:14px;cursor:pointer}
.kl-chip.on{background:var(--p-soft);color:var(--p);border-color:var(--p);font-weight:bold}
.kl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.kl-row .btn{padding:9px 14px}
.kl-types{margin-inline-start:auto;display:flex;gap:6px}.kl-types .kl-chip{padding:5px 11px;font-size:13px}
.kl-player{background:var(--s);border:1px solid var(--b);border-radius:14px;padding:10px;margin-bottom:12px;display:grid;gap:8px}
.kl-player.hidden{display:none}
.kl-frame{position:relative;width:100%;border-radius:10px;overflow:hidden;background:#000}.kl-frame.v{aspect-ratio:16/9}.kl-frame.a{background:transparent}
.kl-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.kl-media{width:100%;border-radius:10px;max-height:60vh}
.kl-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.kl-bar strong{flex:1;min-width:0;overflow-wrap:anywhere}
.kl-bar .btn{padding:7px 12px}
.kl-note{font-size:12px;color:var(--m)}.kl-note a{color:var(--p)}
.kl-list{display:grid;gap:8px}
.kl-card{display:flex;gap:10px;align-items:center;background:var(--s);border:1px solid var(--b);border-radius:12px;padding:8px}
.kl-card.cur{border-color:var(--p);background:var(--p-soft)}
.kl-th{flex:none;width:72px;height:54px;border-radius:9px;background:var(--bg);display:grid;place-items:center;font-size:24px;overflow:hidden}.kl-th img{width:100%;height:100%;object-fit:cover}
.kl-ci{flex:1;min-width:0;display:grid;gap:2px}.kl-ci strong{overflow-wrap:anywhere;line-height:1.5}.kl-ci span{font-size:12px;color:var(--m)}
.kl-adm{display:flex;gap:4px;flex-wrap:wrap}.kl-adm button{border:1px solid var(--b);background:var(--bg);color:var(--t);border-radius:8px;padding:4px 10px;font-size:12px}
.kl-empty{text-align:center;color:var(--m);padding:26px 12px}
.kl-warn{background:#fff4d6;color:#7a5a00;border-radius:10px;padding:8px 10px;font-size:13px;margin-bottom:10px}body.dark .kl-warn{background:#3b3216;color:#f1d98a}
.kl-ov{position:fixed;inset:0;z-index:420;background:#0009;display:grid;place-items:center;padding:14px}
.kl-box{width:100%;max-width:460px;max-height:90vh;overflow:auto;background:var(--s);color:var(--t);border-radius:16px;padding:18px;display:grid;gap:10px}
.kl-box h2{margin:0;font-size:19px}.kl-box label{display:grid;gap:4px;font-size:14px}.kl-box textarea{min-height:140px}
.kl-mchips{display:flex;flex-wrap:wrap;gap:6px}.kl-mchips label{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--b);border-radius:999px;padding:5px 10px;background:var(--bg)}
`;
function injectCss(){if(S.css)return;S.css=true;const s=document.createElement("style");s.textContent=CSS;document.head.appendChild(s)}

/* ---------- البيانات ---------- */
async function load(force){
 const {ctx}=S;
 if(!force&&S.items&&Date.now()-S.at<TTL)return;
 S.noRules=false;
 const cached=norm(lsGet(KEY_LIB)||[]);
 if(!navigator.onLine){S.items=S.items||cached;return}
 try{
  const s=await getDoc(doc(ctx.db,"config","listen"));
  if(s.exists()){S.items=norm(s.data().items);lsSet(KEY_LIB,S.items)}
  else S.items=cached;
  S.at=Date.now();
 }catch(e){
  S.noRules=!!e&&e.code==="permission-denied";
  S.items=cached;console.warn("listen",e);
 }
}
async function save(){
 const {ctx}=S;
 lsSet(KEY_LIB,S.items);
 if(!navigator.onLine){ctx.toast("لا يوجد اتصال؛ لم يُحفظ التعديل على الخادم.");return}
 try{await setDoc(doc(ctx.db,"config","listen"),{items:S.items,updatedAt:serverTimestamp()});S.at=Date.now();S.noRules=false}
 catch(e){console.warn(e);ctx.toast(e&&e.code==="permission-denied"?"لا توجد صلاحية: أضف قاعدة listen في قواعد Firestore.":"تعذّر حفظ التعديل.");S.at=0}
 drawList();
}

/* ---------- العرض ---------- */
const typeOf=it=>{const e=parse(it.url);return e?e.k:"link"};
function filtered(){
 return arr(S.items).filter(it=>{
  if(S.moods.size&&!it.moods.some(m=>S.moods.has(m)))return false;
  if(S.type!=="all"&&typeOf(it)!==S.type)return false;
  return true;
 });
}
function drawChips(){
 const c=S.box.querySelector("#kl-chips");if(!c)return;
 c.innerHTML=MOODS.map(m=>`<button type="button" class="kl-chip ${S.moods.has(m[0])?"on":""}" data-l="mood" data-k="${m[0]}">${m[2]} ${esc(m[1])}</button>`).join("")+`<button type="button" class="kl-chip ${S.moods.size?"":"on"}" data-l="allmood">الكل</button>`;
 const t=S.box.querySelector("#kl-types");
 if(t)t.innerHTML=[["all","الكل"],["video","🎬 مرئي"],["audio","🎧 صوتي"]].map(x=>`<button type="button" class="kl-chip ${S.type===x[0]?"on":""}" data-l="type" data-k="${x[0]}">${x[1]}</button>`).join("");
}
function drawList(){
 const l=S.box&&S.box.querySelector("#kl-list");if(!l)return;
 const admin=S.ctx.isAdmin,list=filtered();
 let w="";
 if(admin&&S.noRules)w='<div class="kl-warn">تعذّرت القراءة: أضف قاعدة <b>config/listen</b> في قواعد Firestore (القواعد v7) ثم أعد المحاولة.</div>';
 if(!arr(S.items).length)w+='<div class="kl-empty">'+(admin?"المكتبة فارغة. اضغط «+ إضافة» أو «إضافة جماعية» وألصق روابط يوتيوب أو ساوندكلاود أو سبوتيفاي.":"ستضيف الإدارة محتوى للاستماع والمشاهدة قريباً.")+"</div>";
 else if(!list.length)w+='<div class="kl-empty">لا يوجد محتوى بهذا المزاج الآن. جرّب «الكل».</div>';
 w+=list.map(it=>{
  const e=parse(it.url),ic=e?(e.k==="audio"?"🎧":"🎬"):"🔗";
  const ms=it.moods.map(k=>MOOD[k][2]+" "+MOOD[k][1]).join(" · ");
  return `<div class="kl-card ${S.cur&&S.cur.id===it.id?"cur":""}"><button type="button" class="kl-th" data-l="play" data-id="${esc(it.id)}" aria-label="تشغيل">${e&&e.thumb?`<img src="${esc(e.thumb)}" alt="" loading="lazy" decoding="async">`:ic}</button><div class="kl-ci"><strong>${esc(it.title)}</strong><span>${esc((e?e.site:"رابط")+(ms?" · "+ms:""))}</span></div><button type="button" class="btn" data-l="play" data-id="${esc(it.id)}" style="padding:8px 14px">▶</button>${admin?`<div class="kl-adm" style="flex-basis:100%"><button type="button" data-l="edit" data-id="${esc(it.id)}">تعديل</button><button type="button" data-l="del" data-id="${esc(it.id)}">حذف</button></div>`:""}</div>`;
 }).join("");
 l.innerHTML=w;
}
function playerHtml(it){
 const e=parse(it.url);
 if(!e)return `<div class="kl-empty">هذا الرابط لا يُشغَّل داخل المنصة. افتحه من الرابط الأصلي.</div>`;
 if(e.file)return e.tag==="audio"?`<audio class="kl-media" controls autoplay preload="none" src="${esc(e.file)}"></audio>`:`<video class="kl-media" controls autoplay playsinline src="${esc(e.file)}"></video>`;
 const st=e.k==="audio"?` style="height:${e.h||166}px"`:"";
 return `<div class="kl-frame ${e.k==="video"?"v":"a"}"${st}><iframe src="${esc(e.src)}" title="${esc(it.title)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"></iframe></div>`;
}
function drawPlayer(){
 const p=S.box&&S.box.querySelector("#kl-player");if(!p)return;
 const it=S.cur;
 if(!it){p.classList.add("hidden");p.innerHTML="";return}
 p.classList.remove("hidden");
 p.innerHTML=playerHtml(it)+`<div class="kl-bar"><strong>${esc(it.title)}</strong><button type="button" class="btn secondary" data-l="prev" aria-label="السابق">⏮</button><button type="button" class="btn secondary" data-l="next" aria-label="التالي">⏭</button><button type="button" class="btn secondary" data-l="stop" aria-label="إغلاق">✕</button></div><div class="kl-note">إن لم يعمل المشغّل فالموقع يمنع العرض هنا. <a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">فتح الرابط الأصلي ↗</a></div>`;
 drawList();
 try{p.scrollIntoView({behavior:"smooth",block:"nearest"})}catch{}
}
function play(it,keepQueue){
 if(!it)return;
 S.cur=it;
 if(!keepQueue){S.queue=[];S.qi=-1}
 drawPlayer();
}
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
function surprise(){
 const l=filtered().filter(x=>!S.cur||x.id!==S.cur.id);
 if(!l.length)return S.ctx.toast("لا يوجد محتوى مناسب لهذا المزاج.");
 play(l[Math.floor(Math.random()*l.length)]);
}
function mix(){
 const l=shuffle(filtered());
 if(!l.length)return S.ctx.toast("لا يوجد محتوى مناسب لهذا المزاج.");
 S.queue=l.map(x=>x.id);S.qi=0;play(l[0],true);
 S.ctx.toast("بدأ المزيج: "+l.length+" عنصراً. استعمل ⏭ للتالي.");
}
function step(d){
 const byId=id=>arr(S.items).find(x=>x.id===id);
 if(S.queue.length){
  S.qi=(S.qi+d+S.queue.length)%S.queue.length;
  const it=byId(S.queue[S.qi]);if(it)return play(it,true);
 }
 if(d>0)return surprise();
 S.ctx.toast("لا يوجد سابق.");
}

/* ---------- نوافذ المشرف ---------- */
function modal(html,onSubmit){
 const ov=document.createElement("div");ov.className="kl-ov";
 ov.innerHTML=`<form class="kl-box">${html}<div class="kl-adm"><button class="btn" type="submit" style="padding:9px 16px">حفظ</button><button class="btn secondary" type="button" data-x style="padding:9px 16px">إلغاء</button></div></form>`;
 document.body.appendChild(ov);
 const close=()=>ov.remove();
 ov.addEventListener("click",e=>{if(e.target===ov||e.target.closest("[data-x]"))close()});
 ov.querySelector("form").onsubmit=e=>{e.preventDefault();if(onSubmit(e.currentTarget)!==false)close()};
 setTimeout(()=>ov.querySelector("input,textarea")?.focus(),50);
}
const moodBoxes=sel=>`<div class="kl-mchips">${MOODS.map(m=>`<label><input type="checkbox" name="m" value="${m[0]}" ${sel.includes(m[0])?"checked":""}> ${m[2]} ${esc(m[1])}</label>`).join("")}</div>`;
const pickedMoods=f=>[...f.querySelectorAll("input[name=m]:checked")].map(x=>x.value).slice(0,3);
function editItem(it){
 if(!it&&arr(S.items).length>=MAX_ITEMS)return S.ctx.toast("وصلت إلى الحد الأقصى ("+MAX_ITEMS+").");
 modal(`<h2>${it?"تعديل":"إضافة"}</h2><label>العنوان<input class="field" name="t" maxlength="80" required value="${esc(it?it.title:"")}"></label><label>الرابط العادي (https://...)<input class="field" name="u" type="url" inputmode="url" dir="ltr" maxlength="500" required value="${esc(it?it.url:"")}" placeholder="الصق رابط يوتيوب أو ساوندكلاود أو سبوتيفاي"></label><div>المزاج (حتى ثلاثة)</div>${moodBoxes(it?it.moods:[])}`,f=>{
  const t=f.elements.t.value.trim(),u=safeUrl(f.elements.u.value);
  if(!t||!u){S.ctx.toast("اكتب العنوان ورابطاً يبدأ بـ https://");return false}
  const moods=pickedMoods(f);
  if(it){Object.assign(it,{title:t,url:u,moods})}else S.items.push({id:uid8(),title:t,url:u,moods});
  if(!parse(u))S.ctx.toast("تنبيه: هذا الرابط لن يُشغَّل داخل المنصة، وسيُفتح من الرابط الأصلي فقط.");
  save();
 });
}
function bulkAdd(){
 modal(`<h2>إضافة جماعية</h2><label>سطر لكل عنصر بالشكل: العنوان | الرابط<textarea class="field" name="b" dir="auto" placeholder="ترتيل هادئ | https://www.youtube.com/watch?v=...&#10;مقطوعة | https://soundcloud.com/..."></textarea></label><div>مزاج الجميع (حتى ثلاثة)</div>${moodBoxes([])}`,f=>{
  const moods=pickedMoods(f);let n=0,bad=0;
  for(const line of f.elements.b.value.split("\n")){
   const s=line.trim();if(!s)continue;
   const i=s.lastIndexOf("|"),t=i>0?s.slice(0,i).trim():"",u=safeUrl(i>0?s.slice(i+1):s);
   if(!u){bad++;continue}
   if(arr(S.items).length>=MAX_ITEMS){bad++;continue}
   S.items.push({id:uid8(),title:(t||u.replace(/^https:\/\/(www\.)?/,"")).slice(0,80),url:u.slice(0,500),moods});n++;
  }
  S.ctx.toast(n?("أُضيف "+n+(bad?" وتُجوهل "+bad:"")):"لم يُضف شيء: تأكد من الصيغة والروابط.");
  if(n)save();
 });
}
function delItem(id){
 const it=arr(S.items).find(x=>x.id===id);if(!it)return;
 if(!confirm("حذف «"+it.title+"»؟"))return;
 S.items=S.items.filter(x=>x.id!==id);
 if(S.cur&&S.cur.id===id){S.cur=null;drawPlayer()}
 save();
}

/* ---------- النقرات والتركيب ---------- */
function onClick(e){
 const t=e.target.closest("[data-l]");if(!t)return;
 const a=t.dataset.l,k=t.dataset.k,id=t.dataset.id;
 if(a==="mood"){S.moods.has(k)?S.moods.delete(k):S.moods.add(k);lsSet(KEY_MOODS,[...S.moods]);drawChips();drawList()}
 else if(a==="allmood"){S.moods.clear();lsSet(KEY_MOODS,[]);drawChips();drawList()}
 else if(a==="type"){S.type=k;drawChips();drawList()}
 else if(a==="rand")surprise();
 else if(a==="mix")mix();
 else if(a==="play")play(arr(S.items).find(x=>x.id===id));
 else if(a==="next")step(1);
 else if(a==="prev")step(-1);
 else if(a==="stop"){S.cur=null;S.queue=[];S.qi=-1;drawPlayer();drawList()}
 else if(a==="add"&&S.ctx.isAdmin)editItem(null);
 else if(a==="bulk"&&S.ctx.isAdmin)bulkAdd();
 else if(a==="edit"&&S.ctx.isAdmin)editItem(arr(S.items).find(x=>x.id===id));
 else if(a==="del"&&S.ctx.isAdmin)delItem(id);
}
export async function mount(box,ctx){
 injectCss();
 S.box=box;S.ctx=ctx;if(ctx.esc)esc=ctx.esc;
 S.moods=new Set(arr(lsGet(KEY_MOODS)).filter(k=>MOOD[k]));
 box.innerHTML='<div class="skeleton"></div>';
 await load(false);
 if(!box.isConnected)return;
 const admin=ctx.isAdmin;
 box.innerHTML=`<div class="kl-top"><div class="kl-h">ماذا يناسب مزاجك اليوم؟</div><div class="kl-chips" id="kl-chips"></div><div class="kl-row"><button type="button" class="btn" data-l="rand">🎲 فاجئني</button><button type="button" class="btn secondary" data-l="mix">▶ تشغيل المزيج</button><span class="kl-types" id="kl-types"></span></div>${admin?'<div class="kl-adm"><button type="button" data-l="add" style="padding:8px 14px;font-size:14px">+ إضافة</button><button type="button" data-l="bulk" style="padding:8px 14px;font-size:14px">إضافة جماعية</button></div>':""}</div><div class="kl-player hidden" id="kl-player"></div><div class="kl-list" id="kl-list"></div>`;
 box.onclick=onClick;
 drawChips();drawList();drawPlayer();
}
