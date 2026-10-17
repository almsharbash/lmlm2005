/* كلمات — «اليوم لك»: تحية الوقت، المزاج، اقتباس اليوم، توفير البيانات
   ملف مستقل يُحمَّل عند فتح الاقتراحات. إن تعطّل لا يتأثر شيء آخر. */
import{doc,getDoc,setDoc,serverTimestamp}from"https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const MOODS=[["happy","😊","سعيد"],["calm","🌿","هادئ"],["energy","⚡","نشيط"],["fun","😄","مرِح"],["spirit","🕌","روحاني"],["think","📚","متأمل"],["tired","😴","متعب"],["busy","💼","مشغول"]];
const MOOD=Object.fromEntries(MOODS.map(m=>[m[0],m]));
const TO_LISTEN={calm:"calm",energy:"energy",fun:"fun",spirit:"spirit",think:"think"};
const FRESH=24*3600*1000,TTL=10*60*1000,MAXQ=60;
const S={uid:"",ctx:null,box:null,me:null,quotes:null,qAt:0,fr:null,frAt:0,css:false,open:null,top:false,noRules:false};
const arr=v=>Array.isArray(v)?v:[];
const lsGet=k=>{try{return JSON.parse(localStorage.getItem(k)||"null")}catch{return null}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
let esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ms=t=>t&&typeof t.toMillis==="function"?t.toMillis():(typeof t==="number"?t:0);

const CSS=`
.kt{background:var(--s);border:1px solid var(--b);border-radius:14px;margin-bottom:12px;overflow:hidden}
.kt-h{width:100%;display:flex;align-items:center;gap:10px;padding:12px 14px;border:0;background:transparent;color:var(--t);font:inherit;text-align:start;cursor:pointer}
.kt-h strong{flex:1;min-width:0;overflow-wrap:anywhere}.kt-h small{display:block;color:var(--m);font-weight:normal;margin-top:2px}
.kt-ar{transition:transform .2s;color:var(--m)}.kt.open>.kt-h .kt-ar{transform:rotate(180deg)}
.kt-body{display:none;padding:0 12px 12px;gap:8px}.kt.open>.kt-body{display:grid}
.ks{border:1px solid var(--b);border-radius:12px;background:var(--bg);overflow:hidden}
.ks-h{width:100%;display:flex;align-items:center;gap:8px;padding:10px 12px;border:0;background:transparent;color:var(--t);font:inherit;text-align:start;cursor:pointer}
.ks-h span:first-child{flex:1}.ks-h .kt-ar{font-size:12px}
.ks.open .kt-ar{transform:rotate(180deg)}
.ks-b{display:none;padding:0 12px 12px;gap:8px}.ks.open .ks-b{display:grid}
.kt-chips{display:flex;flex-wrap:wrap;gap:7px}
.kt-chip{border:1px solid var(--b);background:var(--s);color:var(--t);border-radius:999px;padding:6px 12px;font:inherit;font-size:14px;cursor:pointer}
.kt-chip.on{background:var(--p-soft);color:var(--p);border-color:var(--p);font-weight:bold}
.kt-q{font-size:17px;line-height:1.9;margin:0;overflow-wrap:anywhere}.kt-by{font-size:13px;color:var(--m)}
.kt-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.kt-row button{border:1px solid var(--b);background:var(--s);color:var(--t);border-radius:8px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer}
.kt-note{font-size:12px;color:var(--m)}
.kt-fr{display:flex;flex-wrap:wrap;gap:6px}.kt-fr span{background:var(--s);border:1px solid var(--b);border-radius:999px;padding:4px 10px;font-size:13px}
.kt-sw{display:flex;align-items:center;gap:10px}.kt-sw input{width:20px;height:20px}
.kt-ov{position:fixed;inset:0;z-index:420;background:#0009;display:grid;place-items:center;padding:14px}
.kt-box{width:100%;max-width:460px;max-height:90vh;overflow:auto;background:var(--s);color:var(--t);border-radius:16px;padding:18px;display:grid;gap:10px}
.kt-box h2{margin:0;font-size:19px}.kt-box textarea{min-height:200px}
`;
function injectCss(){if(S.css)return;S.css=true;const s=document.createElement("style");s.textContent=CSS;document.head.appendChild(s)}

/* ---------- أدوات ---------- */
const dayKey=()=>{const d=new Date();return d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate()};
const hash=str=>{let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0};
function greet(){
 const h=new Date().getHours();
 if(h>=5&&h<12)return["☀️","صباح الخير"];
 if(h>=12&&h<17)return["🌤️","طاب يومك"];
 if(h>=17&&h<21)return["🌇","مساء الخير"];
 return["🌙","ليلتك سعيدة"];
}
const myMood=()=>{
 const m=S.me&&S.me.mood,t=ms(S.me&&S.me.moodAt);
 if(m&&MOOD[m]&&(!t||Date.now()-t<FRESH))return m;
 const l=lsGet("kt-mood");return l&&MOOD[l.k]&&Date.now()-l.t<FRESH?l.k:"";
};
function normQuotes(list){
 return arr(list).slice(0,MAXQ).map(x=>({t:String(x&&x.t||"").slice(0,220),by:String(x&&x.by||"").slice(0,60)})).filter(x=>x.t);
}

/* ---------- البيانات ---------- */
async function loadMe(){
 const {db,user}=S.ctx;
 try{const s=await getDoc(doc(db,"users",user.uid));S.me=s.exists()?s.data():{}}
 catch(e){console.warn("today me",e);S.me=S.me||{}}
}
async function loadQuotes(force){
 const {db}=S.ctx;
 if(!force&&S.quotes&&Date.now()-S.qAt<TTL)return;
 S.noRules=false;
 const cached=normQuotes(lsGet("kt-quotes")||[]);
 if(!navigator.onLine){S.quotes=S.quotes||cached;return}
 try{
  const s=await getDoc(doc(db,"config","quotes"));
  if(s.exists()){S.quotes=normQuotes(s.data().items);lsSet("kt-quotes",S.quotes)}else S.quotes=cached;
  S.qAt=Date.now();
 }catch(e){S.noRules=!!e&&e.code==="permission-denied";S.quotes=cached;console.warn("quotes",e)}
}
async function loadFriends(){
 if(S.fr&&Date.now()-S.frAt<TTL)return;
 const {db,user}=S.ctx;
 if(!navigator.onLine){S.fr=S.fr||[];return}
 const ids=arr(S.me&&S.me.friends).filter(x=>x&&x!==user.uid).sort(()=>Math.random()-.5).slice(0,8);
 const got=await Promise.all(ids.map(id=>getDoc(doc(db,"users",id)).catch(()=>null)));
 const out=[];
 got.forEach(s=>{
  if(!s||!s.exists())return;const d=s.data();
  if(arr(d.blockedUsers).includes(user.uid))return;
  const t=ms(d.moodAt);
  if(d.mood&&MOOD[d.mood]&&t&&Date.now()-t<FRESH)out.push({n:d.displayName||d.name||"عضو",k:d.mood});
 });
 S.fr=out;S.frAt=Date.now();
}

/* ---------- العرض ---------- */
function summary(){
 const [ic,txt]=greet(),n=(S.me&&(S.me.displayName||S.me.name))||S.ctx.user.displayName||"";
 const mk=myMood(),m=mk?MOOD[mk]:null;
 return`<span aria-hidden="true">${ic}</span><strong>${esc(txt+(n?" يا "+n:""))}<small>${m?esc(m[1]+" "+m[2]+" · "):""}اليوم لك: مزاجك واقتباس اليوم</small></strong><span class="kt-ar">▾</span>`;
}
function quoteBlock(){
 const l=arr(S.quotes),admin=S.ctx.isAdmin();
 let w="";
 if(admin&&S.noRules)w='<div class="kt-note">تعذّرت القراءة: أضف قاعدة <b>config/quotes</b> في القواعد (v8).</div>';
 if(l.length){
  const q=l[hash(dayKey())%l.length];
  w+=`<p class="kt-q">«${esc(q.t)}»</p>${q.by?`<div class="kt-by">— ${esc(q.by)}</div>`:""}<div class="kt-row"><button type="button" data-t="copyq">نسخ</button>${admin?'<button type="button" data-t="editq">إدارة الاقتباسات</button>':""}</div>`;
 }else w+=admin?'<div class="kt-note">لا توجد اقتباسات بعد.</div><div class="kt-row"><button type="button" data-t="editq">إضافة اقتباسات</button></div>':'<div class="kt-note">سيظهر هنا اقتباس يومي قريبًا.</div>';
 return w;
}
function moodBlock(){
 const cur=myMood();
 let w=`<div class="kt-chips">${MOODS.map(m=>`<button type="button" class="kt-chip ${cur===m[0]?"on":""}" data-t="mood" data-k="${m[0]}">${m[1]} ${esc(m[2])}</button>`).join("")}</div>`;
 w+=`<div class="kt-row">${cur?'<button type="button" data-t="nomood">مسح مزاجي</button>':""}<span class="kt-note">يراه أصدقاؤك ويبقى 24 ساعة، ويقترح لك محتوى في «استماع ومشاهدة».</span></div>`;
 const f=arr(S.fr);
 if(f.length)w+=`<div class="kt-note">مزاج أصدقائك اليوم:</div><div class="kt-fr">${f.map(x=>`<span>${esc(MOOD[x.k][1]+" "+x.n)}</span>`).join("")}</div>`;
 return w;
}
function saverBlock(){
 const on=!!lsGet("kp-datasaver");
 return`<label class="kt-sw"><input type="checkbox" data-t="saver" ${on?"checked":""}><span>توفير البيانات</span></label><div class="kt-note">يوقف الصور المصغّرة في قسم «استماع ومشاهدة» ولا يشغّل شيئًا إلا بضغطتك. لا يغيّر صور المنشورات.</div>`;
}
const SECS=[["mood","🎭","مزاجي اليوم",moodBlock],["quote","✨","اقتباس اليوم",quoteBlock],["saver","📉","توفير البيانات",saverBlock]];
function draw(){
 const box=S.box;if(!box)return;
 box.innerHTML=`<div class="kt ${S.top?"open":""}"><button type="button" class="kt-h" data-t="top" aria-expanded="${S.top}">${summary()}</button><div class="kt-body">${SECS.map(s=>`<div class="ks ${S.open===s[0]?"open":""}" data-s="${s[0]}"><button type="button" class="ks-h" data-t="sec" data-k="${s[0]}" aria-expanded="${S.open===s[0]}"><span>${s[1]} ${s[2]}</span><span class="kt-ar">▾</span></button><div class="ks-b">${S.open===s[0]?s[3]():""}</div></div>`).join("")}</div></div>`;
}

/* ---------- إجراءات ---------- */
async function setMood(k){
 const {db,user,toast}=S.ctx;
 if(k&&!MOOD[k])return;
 if(k)lsSet("kt-mood",{k,t:Date.now()});else lsSet("kt-mood",null);
 if(k&&TO_LISTEN[k])lsSet("kl-moods",[TO_LISTEN[k]]);
 S.me=Object.assign({},S.me,{mood:k,moodAt:k?Date.now():null});
 draw();
 if(!navigator.onLine){toast("لا يوجد اتصال؛ حُفظ مزاجك على جوالك فقط.");return}
 try{await setDoc(doc(db,"users",user.uid),{mood:k,moodAt:k?serverTimestamp():null},{merge:true})}
 catch(e){console.warn(e);toast("تعذّر حفظ المزاج على الخادم الآن.")}
}
function modal(html,onSubmit){
 const ov=document.createElement("div");ov.className="kt-ov";
 ov.innerHTML=`<form class="kt-box">${html}<div class="kt-row"><button class="btn" type="submit" style="padding:9px 16px">حفظ</button><button class="btn secondary" type="button" data-x style="padding:9px 16px">إلغاء</button></div></form>`;
 document.body.appendChild(ov);
 const close=()=>ov.remove();
 ov.addEventListener("click",e=>{if(e.target===ov||e.target.closest("[data-x]"))close()});
 ov.querySelector("form").onsubmit=async e=>{e.preventDefault();if(await onSubmit(e.currentTarget)!==false)close()};
}
function editQuotes(){
 const text=arr(S.quotes).map(q=>q.by?q.t+" | "+q.by:q.t).join("\n");
 modal(`<h2>اقتباسات اليوم</h2><label>سطر لكل اقتباس. يمكنك إضافة القائل بعد الرمز |<textarea class="field" name="q" dir="auto" placeholder="الكلمة الطيبة صدقة | حديث شريف">${esc(text)}</textarea></label><div class="kt-note">حتى ${MAXQ} اقتباسًا، ويتغير الاقتباس المعروض كل يوم. تأكد من نسبة كل قول إلى قائله الصحيح.</div>`,async f=>{
  const items=[];
  for(const line of f.elements.q.value.split("\n")){
   const s=line.trim();if(!s)continue;
   const i=s.lastIndexOf("|");
   items.push(i>0?{t:s.slice(0,i).trim().slice(0,220),by:s.slice(i+1).trim().slice(0,60)}:{t:s.slice(0,220),by:""});
  }
  const q=normQuotes(items);
  if(!navigator.onLine){S.ctx.toast("لا يوجد اتصال.");return false}
  try{await setDoc(doc(S.ctx.db,"config","quotes"),{items:q,updatedAt:serverTimestamp()});S.quotes=q;S.qAt=Date.now();lsSet("kt-quotes",q);S.noRules=false;draw();S.ctx.toast("حُفظت الاقتباسات.")}
  catch(e){console.warn(e);S.ctx.toast(e&&e.code==="permission-denied"?"لا توجد صلاحية: أضف قاعدة config/quotes (v8).":"تعذّر الحفظ.");return false}
 });
}
async function onClick(e){
 const t=e.target.closest("[data-t]");if(!t||!S.box.contains(t))return;
 const a=t.dataset.t;
 if(a==="top"){
  S.top=!S.top;lsSet("kt-top",S.top);draw();
  if(S.top&&S.open)openSec(S.open);
 }
 else if(a==="sec")openSec(S.open===t.dataset.k?"":t.dataset.k);
 else if(a==="mood")setMood(t.dataset.k);
 else if(a==="nomood")setMood("");
 else if(a==="copyq"){
  const l=arr(S.quotes);if(!l.length)return;const q=l[hash(dayKey())%l.length];
  const txt="«"+q.t+"»"+(q.by?" — "+q.by:"");
  try{await navigator.clipboard.writeText(txt);S.ctx.toast("تم نسخ الاقتباس.")}catch{S.ctx.toast("تعذّر النسخ.")}
 }
 else if(a==="editq"&&S.ctx.isAdmin())editQuotes();
}
function onChange(e){
 const t=e.target.closest("[data-t=saver]");if(!t)return;
 lsSet("kp-datasaver",!!t.checked);S.ctx.toast(t.checked?"تم تفعيل توفير البيانات.":"أُلغي توفير البيانات.");
}
async function openSec(k){
 S.open=k;lsSet("kt-open",k);draw();
 if(k==="quote"&&!S.quotes){await loadQuotes(false);if(S.open==="quote")draw()}
 if(k==="mood"&&!S.fr){await loadFriends().catch(()=>{S.fr=[]});if(S.open==="mood")draw()}
}

/* ---------- التركيب ---------- */
export async function mount(box,ctx){
 injectCss();
 if(ctx.esc)esc=ctx.esc;
 const fresh=S.box!==box;
 if(S.uid!==ctx.user.uid){S.uid=ctx.user.uid;S.me=null;S.fr=null;S.quotes=null}
 S.ctx=ctx;S.box=box;
 if(fresh){
  S.top=!!lsGet("kt-top");S.open=lsGet("kt-open")||"";
  box.addEventListener("click",onClick);box.addEventListener("change",onChange);
 }
 if(!S.me){S.me={};draw();await loadMe()}
 draw();
 if(S.top&&S.open)openSec(S.open);
}
