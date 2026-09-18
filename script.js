/* B2B Hacks Challenge 1 — 5:00 total, 15s/question, unlimited, no-repeat, anti-switch + participant tracking */
const TOTAL_TIME = 300, Q_TIME = 15, SEEN_KEY = "b2b_seen_ids_v2";
const $ = (id) => document.getElementById(id);
const shuffle = (a) => { const x=[...a]; for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]];} return x; };
const getSeen = () => { try{return new Set(JSON.parse(localStorage.getItem(SEEN_KEY)||"[]"));}catch{return new Set();} };
const saveSeen = (s) => { try{localStorage.setItem(SEEN_KEY, JSON.stringify([...s]));}catch{} };

// fire-and-forget participant tracking (works with node server; quiz fully works without it)
async function apiPost(path, body){
  try{
    const r = await fetch(path, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
    return await r.json();
  }catch{ return null; }
}

let S = null;

function buildRunQueue(seen){
  const unseen = shuffle(QUESTION_BANK.filter(q=>!seen.has(q.id)));
  const seenQs = shuffle(QUESTION_BANK.filter(q=>seen.has(q.id)));
  return [...unseen, ...seenQs]; // fresh IDs first; seen only after all fresh exhausted
}
function refillQueue(){
  // never modulo-repeat: append a fresh shuffle excluding what this run already asked
  const extra = shuffle(QUESTION_BANK.filter(q=>!S.runIds.has(q.id)));
  S.queue = S.queue.concat(extra.length ? extra : shuffle(QUESTION_BANK));
}
function paintSeenPreview(){
  const s = getSeen();
  $("seenInfo").textContent = s.size ? `${s.size}/${QUESTION_BANK.length} seen before — new ones first` : `${QUESTION_BANK.length} fresh questions loaded`;
  $("historyPill").textContent = (QUESTION_BANK.length - s.size) > 0 ? `Fresh set ✓ (${QUESTION_BANK.length - s.size} new)` : `All seen — reshuffling`;
}

// splash -> start screen (fast intro, then straight to Start the quiz)
window.addEventListener("load", () => {
  paintSeenPreview();
  setTimeout(()=>{ $("splash").classList.add("gone"); $("topbar").classList.remove("hidden"); $("screen-start").classList.remove("hidden"); }, 1500);
});

$("btnResetSeen").onclick = () => { try{localStorage.removeItem(SEEN_KEY);}catch{} paintSeenPreview(); $("historyPill").textContent="Fresh set ✓"; };

$("btnStart").onclick = () => {
  const name = $("inpName").value.trim(), email = $("inpEmail").value.trim();
  if(name.length < 2){ $("formErr").textContent = "Please enter your name."; return; }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ $("formErr").textContent = "Please enter a valid mail ID."; return; }
  $("formErr").textContent = "";
  startQuiz(name, email);
};
// Enter key in either field starts the quiz directly
["inpName","inpEmail"].forEach(id=>$(id).addEventListener("keydown",(e)=>{ if(e.key==="Enter") $("btnStart").click(); }));

function startQuiz(name, email){
  const seen = getSeen();
  S = { name, email, queue: buildRunQueue(seen), runIds: new Set(), idx: 0,
        score: 0, correct: 0, attempted: 0, viol: 0,
        totalLeft: TOTAL_TIME, qLeft: Q_TIME, catStats: {}, locked: false,
        active: true, lastPenalty: 0, timer1: null, timer2: null, seen };
  $("screen-start").classList.add("hidden"); $("screen-result").classList.add("hidden");
  $("screen-quiz").classList.remove("hidden");
  window.scrollTo({top:0, behavior:"smooth"});
  apiPost("/api/play", {name, email}); // admin tracking: upserts + increments play count
  ensureAudio(); enterArena(); // siren unlocked by this click; quiz runs fullscreen
  renderQ();
  S.timer1 = setInterval(()=>{ S.totalLeft--; paintTotal(); if(S.totalLeft<=0) endQuiz(); }, 1000);
  S.timer2 = setInterval(()=>{ if(!S.active||S.locked) return; S.qLeft--; paintQ(); if(S.qLeft<=0) resolveQ(-1, "timeout"); }, 1000);
  S.timer3 = setInterval(()=>{ if(!S.active||S.locked) return; if(document.hidden || (document.hasFocus && !document.hasFocus())) onSwitch("watchdog"); }, 500);
  paintTotal();
}

function fmtTotal(s){ return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; }
function paintTotal(){ $("totalTime").textContent=fmtTotal(Math.max(0,S.totalLeft)); $("totalTime").style.color = S.totalLeft<=60 ? "#fda4af" : ""; }
function paintQ(){ $("qTime").textContent=S.qLeft; $("qTimerFill").style.width=(S.qLeft/Q_TIME*100)+"%"; }

function renderQ(){
  if(S.idx >= S.queue.length) refillQueue();
  S.locked=false; S.qLeft=Q_TIME; paintQ();
  const q=S.queue[S.idx];
  S.current=q; S.runIds.add(q.id); S.seen.add(q.id);
  const card=$("quizCard"); card.dataset.cat=q.category;
  card.classList.remove("q-in"); void card.offsetWidth; card.classList.add("q-in");
  // meme art: real template + question-related caption; emoji fallback if image fails (offline)
  const meme = (typeof memeFor === "function") ? memeFor(q) : null;
  const img = $("qMeme");
  img.onerror = () => { img.classList.add("hidden"); $("memeTop").classList.add("hidden"); $("memeBot").classList.add("hidden"); $("qIcon").textContent = q.icon || "🧠"; $("qIcon").classList.remove("hidden"); };
  if (meme) {
    $("qIcon").classList.add("hidden"); $("memeTop").classList.remove("hidden"); $("memeBot").classList.remove("hidden");
    img.classList.remove("hidden");
    $("memeTop").textContent = meme.top;
    $("memeBot").textContent = q.fun;
    img.alt = meme.tpl.name + " meme";
    if (img.dataset.tpl !== meme.tpl.url) { img.dataset.tpl = meme.tpl.url; img.src = meme.tpl.url; }
  } else { img.onerror(); }
  $("qCat").textContent=q.category; $("qText").textContent=q.q; $("qFun").textContent="😂 "+q.fun;
  $("qCount").textContent=S.idx+1; $("liveScore").textContent=S.score; $("violCount").textContent=`⚠ ${S.viol} violations`;
  $("penalty").classList.add("hidden");
  const box=$("opts"); box.innerHTML="";
  shuffle(q.options.map((t,i)=>({t,ok:i===q.answer}))).forEach(o=>{
    const b=document.createElement("button"); b.className="opt"; b.textContent=o.t;
    b.onclick=()=>resolveQ(o.ok?1:0,"answer",b); box.appendChild(b);
  });
}

function resolveQ(result, how, btn){
  if(!S.active||S.locked) return; S.locked=true;
  const q=S.current; S.attempted++;
  S.catStats[q.category]=S.catStats[q.category]||{a:0,c:0}; S.catStats[q.category].a++;
  const btns=[...document.querySelectorAll(".opt")]; btns.forEach(b=>b.disabled=true);
  btns.forEach(b=>{ if(b.textContent===q.options[q.answer]) b.classList.add("correct"); });
  if(result===1){ S.score+=10; S.correct++; S.catStats[q.category].c++; if(btn) btn.classList.add("correct"); }
  else { if(btn) btn.classList.add("wrong");
    if(how==="switch"){ const hit = S.viol===0 ? 5 : S.viol===1 ? 10 : 15; S.score=Math.max(0,S.score-hit); showPenalty(`Tab / app switch detected — alarm! You lose ${hit} points for this question (−${hit}). 1st=−5, 2nd=−10, 3rd+=−15. Stay in the arena!`); }
    else if(how==="timeout"){ showPenalty("⏱ 15s over — auto-submitted, no points.", true); }
  }
  $("liveScore").textContent=S.score;
  setTimeout(()=>{ if(!S.active) return; S.idx++; saveSeen(S.seen); renderQ(); }, how==="answer"?650:1600);
}

function showPenalty(msg, soft){
  const p=$("penalty"); p.textContent=(soft?"":"⚠ ")+msg; p.classList.remove("hidden");
  if(!soft){ S.viol++; $("violCount").textContent=`⚠ ${S.viol} violations`; }
}

/* ---- Fire alarm (Web Audio, no files needed) + phone vibration ---- */
let AC = null;
function ensureAudio(){ try{ if(!AC) AC = new (window.AudioContext||window.webkitAudioContext)(); if(AC.state==="suspended") AC.resume(); }catch{} }
function playAlarm(){
  try{
    ensureAudio(); if(!AC) return;
    const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
    o.type = "square"; o.connect(g); g.connect(AC.destination);
    for(let i=0;i<6;i++) o.frequency.setValueAtTime(i%2 ? 950 : 700, t + i*0.3); // fire-alarm two-tone
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t+0.05);
    g.gain.setValueAtTime(0.25, t+1.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t+1.95);
    o.start(t); o.stop(t+2.0);
  }catch{}
  try{ if(navigator.vibrate) navigator.vibrate([300,100,300,100,500]); }catch{} // phones buzz too
}
function flashAlarm(){
  const f = $("alarmFlash"); f.classList.remove("hidden");
  void f.offsetWidth; f.classList.add("on");
  setTimeout(()=>{ f.classList.add("hidden"); f.classList.remove("on"); }, 2200);
}

/* ---- Fullscreen arena (leaving it = violation) ---- */
function enterArena(){ try{ const p = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); if(p && p.catch) p.catch(()=>{}); }catch{} }
function exitArena(){ try{ if(document.fullscreenElement) document.exitFullscreen(); }catch{} }
/* ---- Tight switch/app/tab detection: events + 500ms watchdog ---- */
document.addEventListener("visibilitychange", ()=>{ if(document.hidden) onSwitch("tab-hidden"); });
window.addEventListener("blur", ()=>{ if(S&&S.active&&!S.locked) onSwitch("window-blur"); });
window.addEventListener("pagehide", ()=>{ if(S&&S.active&&!S.locked) onSwitch("page-hide"); });
document.addEventListener("fullscreenchange", ()=>{ if(S&&S.active&&!document.fullscreenElement) onSwitch("fullscreen-exit"); });
function onSwitch(){
  if(!S||!S.active||S.locked) return;
  const now=Date.now(); if(now-S.lastPenalty<2000) return; // debounce blur+hidden double-fire (and single siren)
  S.lastPenalty=now;
  playAlarm(); flashAlarm();
  resolveQ(0,"switch");
}
/* ---- No-escape helpers: new-tab shortcuts, devtools, right-click, copy/paste ---- */
document.addEventListener("keydown",(e)=>{
  if(!S||!S.active) return;
  const k=(e.key||"").toLowerCase();
  if((e.ctrlKey||e.metaKey) && ["t","n","w"].includes(k)){ e.preventDefault(); onSwitch("shortcut"); }
  if(e.key==="F12" || ((e.ctrlKey||e.metaKey)&&e.shiftKey&&["i","j","c"].includes(k))){ e.preventDefault(); onSwitch("devtools"); }
});
document.addEventListener("contextmenu",(e)=>{ if(S&&S.active) e.preventDefault(); });
["copy","cut","paste"].forEach(ev=>document.addEventListener(ev,(e)=>{ if(S&&S.active) e.preventDefault(); }));
window.addEventListener("beforeunload",(e)=>{ if(S&&S.active){ e.preventDefault(); e.returnValue=""; } });

function endQuiz(){
  S.active=false; clearInterval(S.timer1); clearInterval(S.timer2); clearInterval(S.timer3); saveSeen(S.seen); exitArena();
  apiPost("/api/finish", {email:S.email, name:S.name, score:S.score, solved:S.correct, attempted:S.attempted, violations:S.viol});
  $("screen-quiz").classList.add("hidden"); $("screen-result").classList.remove("hidden");
  window.scrollTo({top:0,behavior:"smooth"});
  const acc=S.attempted?Math.round(S.correct/S.attempted*100):0;
  $("resTitle").textContent = S.viol>=3 ? `${S.name}, focus slipped! 😅` : S.correct>=8 ? `${S.name}, you cooked! 🔥` : `Nice run, ${S.name}!`;
  $("resSub").textContent=`${S.email} · attempted ${S.attempted} in 5:00 · ${S.viol} tab-switch violation(s)`;
  $("rScore").textContent=S.score; $("rSolved").textContent=`${S.correct}/${S.attempted}`; $("rAcc").textContent=acc+"%"; $("rViol").textContent=S.viol;
  $("rCats").innerHTML=Object.entries(S.catStats).map(([k,v])=>`<div class="cat-row"><span>${k}</span><span>${v.c}/${v.a} correct</span></div>`).join("")||"<p>No answers yet.</p>";
}
$("btnRetry").onclick=()=>{ $("screen-result").classList.add("hidden"); $("screen-start").classList.remove("hidden"); paintSeenPreview(); window.scrollTo({top:0,behavior:"smooth"}); };
