const q=s=>document.querySelector(s);
const qa=s=>[...document.querySelectorAll(s)];
const modal=q("#researchModal"),promptBox=q("#globalPrompt"),output=q("#researchOutput"),title=q("#researchTitle"),bar=q("#progressBar");
let researchData={answer:"",candidates:[],sources:[],summary:"",recommendation:"",requirements:{}};
let compareItems=[];

function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function money(v,currency){if(v===null||v===undefined||v==="")return "Price unavailable"; const n=Number(v); if(!Number.isFinite(n))return escapeHtml(String(v)); return new Intl.NumberFormat(undefined,{style:"currency",currency:currency||"USD",maximumFractionDigits:0}).format(n);}
function cityClass(location){const s=String(location||"").toLowerCase(); if(s.includes("dubai"))return "city-dubai"; if(s.includes("london"))return "city-london"; if(s.includes("miami"))return "city-miami"; return "city-default";}
function sourceLinks(sources){return (sources||[]).slice(0,8).map(s=>`<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.title||s.url)} ↗</a>`).join("");}

function showResearchModal(){
  modal.hidden=false;
  title.textContent="Researching your request…";
  output.innerHTML='<div class="loader">● ● ●</div><p>Understanding your requirements and preparing permitted web research.</p>';
  bar.style.width="12%";
}
function closeResearch(){modal.hidden=true;}

async function research(message){
  showResearchModal();
  try{
    bar.style.width="35%";
    const response=await fetch("/api/ai-property",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message,requirements:{raw:message},properties:[]})});
    bar.style.width="72%";
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||"Research service unavailable");
    researchData=data;
    bar.style.width="100%";
    title.textContent="Research complete";
    const candidates=(data.candidates||[]).length;
    output.innerHTML=`<div class="ai-answer">${escapeHtml(data.answer||"Research completed.")}</div>
      <div class="research-note"><b>${candidates} researched candidates.</b> Property facts are source-reported only when supported by the research. Availability and prices can change.</div>
      ${data.sources?.length?'<div class="ai-sources"><b>Research sources</b>'+sourceLinks(data.sources)+'</div>':""}
      <button id="viewResultsNow" class="dark-btn" style="margin-top:18px">View researched matches →</button>`;
    q("#viewResultsNow")?.addEventListener("click",()=>{closeResearch();renderResults();document.querySelector("#resultsShell")?.scrollIntoView({behavior:"smooth",block:"start"});});
  }catch(error){
    bar.style.width="100%"; title.textContent="Research unavailable";
    output.innerHTML=`<p><b>We could not complete live research.</b></p><p>${escapeHtml(error.message)}</p><div class="research-note">The launch experience is free, but live web research requires the Flat Finder server to have its AI provider configured.</div>`;
  }
}

function renderResults(){
  const list=q("#propertyList"),shell=q("#resultsShell"),empty=q("#resultsState");
  if(!list||!shell)return;
  const candidates=[...(researchData.candidates||[])];
  empty.hidden=true;shell.hidden=false;
  q("#resultCount").textContent=candidates.length;
  q("#researchMeta").textContent=researchData.researchUsed?"· live source research":"";
  list.innerHTML=candidates.length?candidates.map((p,i)=>cardHtml(p,i)).join(""):'<div class="results-state"><div class="empty-visual">⌕</div><h3>No reliable candidates returned</h3><p>Try a broader city, budget or property type. Flat Finder will not invent listings to fill the page.</p></div>';
  const rec=researchData.recommendation||"No recommendation yet.";
  q("#analysisCard").innerHTML=`<div class="analysis-map"><div class="map-grid"></div><span class="map-label" style="left:18%;top:25%">Research map</span><span class="map-label" style="left:55%;top:52%">${candidates.length} matches</span></div><div class="analysis-body"><div class="analysis-top"><span>✦ AI DECISION SUMMARY</span><span>${candidates.length} candidates</span></div><h3>${escapeHtml(researchData.summary||"Your researched shortlist")}</h3><p>${escapeHtml(rec)}</p><ul><li>Source links are shown on each result.</li><li>AI match scores are recommendations, not guarantees.</li><li>Verify current availability and final price with the source.</li></ul><div class="source-links">${sourceLinks(researchData.sources)}</div></div>`;
  qa(".compare-action").forEach(btn=>btn.addEventListener("click",()=>toggleCompare(Number(btn.dataset.index))));
  qa(".detail-action").forEach(btn=>btn.addEventListener("click",()=>openProperty(Number(btn.dataset.index))));
  qa(".save-action").forEach(btn=>btn.addEventListener("click",()=>{btn.textContent=btn.textContent==="♡"?"♥":"♡";}));
}
function cardHtml(p,i){
  const price=p.price?money(p.price,p.currency):"Price unavailable";
  const reasons=(p.reasons||[]).slice(0,3).map(x=>`<i>✓ ${escapeHtml(x)}</i>`).join("");
  const confidence=p.confidence?escapeHtml(p.confidence):"Research";
  const score=Number(p.matchScore||0);
  return `<article class="property-card"><div class="property-visual ${cityClass(p.location)}"><span class="badge">${escapeHtml(p.badge||"AI researched")}</span><button class="save-btn save-action" aria-label="Save property">♡</button><span class="match-score">${score?score+"/100":"—"} match</span></div><div class="property-body"><div class="source-line"><span>${confidence} confidence</span><b>${escapeHtml(p.sourceType||"Web research")}</b></div><h3>${escapeHtml(p.title||"Property candidate")}</h3><p>${escapeHtml(p.location||"Location not specified")}</p><div class="facts"><b>${price}</b><span>${escapeHtml(p.bedrooms||"—")} BR</span><span>${escapeHtml(p.area||"—")}</span></div><div class="reason-row">${reasons||"<i>Research-backed match</i>"}</div><div class="card-actions"><button class="detail-action primary" data-index="${i}">View analysis</button><button class="compare-action" data-index="${i}">${compareItems.some(x=>x.title===p.title)?"✓ Comparing":"⇄ Compare"}</button></div></div></article>`;
}
function openProperty(i){
  const p=researchData.candidates?.[i]; if(!p)return;
  q("#propertyDetail").innerHTML=`<div class="detail-grid"><div class="detail-visual ${cityClass(p.location)}"><span class="match-score">${escapeHtml(String(p.matchScore||"—"))}/100 match</span></div><div class="detail-copy"><span class="eyebrow">AI PROPERTY ANALYSIS</span><h2>${escapeHtml(p.title||"Property candidate")}</h2><div class="location">${escapeHtml(p.location||"")}</div><div class="price">${p.price?money(p.price,p.currency):"Price unavailable"}</div><div class="detail-facts"><span>${escapeHtml(p.bedrooms||"—")} bedrooms</span><span>${escapeHtml(p.bathrooms||"—")} bathrooms</span><span>${escapeHtml(p.area||"—")}</span></div><div class="detail-section"><h4>Why it matches</h4><p>${escapeHtml(p.why||"The research indicates this candidate may fit your request.")}</p></div><div class="detail-section"><h4>Verify before deciding</h4><p>${escapeHtml(p.verify||"Confirm current price, availability, fees, legal status and exact property details with the source.")}</p></div><div class="detail-actions"><button class="primary" onclick="toggleCompare(${i});openProperty(${i})">⇄ Compare</button><a class="source-chip" href="${escapeHtml(p.sourceUrl||"#")}" target="_blank" rel="noopener noreferrer">Open source ↗</a></div></div></div>`;
  q("#propertyModal").hidden=false;
}
function toggleCompare(i){
  const p=researchData.candidates?.[i]; if(!p)return;
  const idx=compareItems.findIndex(x=>x.title===p.title);
  if(idx>=0)compareItems.splice(idx,1); else if(compareItems.length<4)compareItems.push(p);
  renderCompare();renderResults();
}
function renderCompare(){
  const empty=q("#compareEmpty"),table=q("#compareTable");
  if(!compareItems.length){empty.hidden=false;table.hidden=true;return}
  empty.hidden=true;table.hidden=false;
  const rows=[["Price",p=>p.price?money(p.price,p.currency):"—"],["Location",p=>p.location||"—"],["Bedrooms",p=>p.bedrooms||"—"],["Area",p=>p.area||"—"],["AI match",p=>(p.matchScore||"—")+"/100"],["Confidence",p=>p.confidence||"—"],["Why it matches",p=>p.why||"—"]];
  table.innerHTML='<table><thead><tr><th>Metric</th>'+compareItems.map(p=>'<th>'+escapeHtml(p.title||"Property")+'</th>').join("")+'</tr></thead><tbody>'+rows.map(r=>'<tr><th>'+escapeHtml(r[0])+'</th>'+compareItems.map(p=>'<td>'+escapeHtml(r[1](p))+'</td>').join("")+'</tr>').join("")+'</tbody></table>';
}
function applyFilters(){
  const parts=[q("#filterLocation")?.value,q("#filterPurpose")?.value,q("#filterBudget")?.value,q("#filterBeds")?.value].filter(v=>v&&v!=="Any");
  if(parts.length){promptBox.value=parts.join(" ")+" property search";research(promptBox.value);}
  q("#quickPanel").hidden=true;
}
qa(".search-pills button").forEach(btn=>btn.addEventListener("click",()=>{q("#quickPanel").hidden=!q("#quickPanel").hidden;}));
q("#applyFilters")?.addEventListener("click",applyFilters);
qa(".example-row button").forEach(btn=>btn.addEventListener("click",()=>{promptBox.value=btn.dataset.example;research(btn.dataset.example);}));
qa("[data-category]").forEach(btn=>btn.addEventListener("click",()=>{qa("[data-category]").forEach(x=>x.classList.remove("selected"));btn.classList.add("selected");}));
q("#globalSearch")?.addEventListener("click",()=>{const value=promptBox.value.trim();if(value)research(value);});
q("#ctaSearch")?.addEventListener("click",()=>{const value=q("#ctaPrompt").value.trim();if(value){promptBox.value=value;research(value);}});
q("#closeResearch")?.addEventListener("click",closeResearch);
q("#closeProperty")?.addEventListener("click",()=>q("#propertyModal").hidden=true);
modal?.addEventListener("click",e=>{if(e.target===modal)closeResearch();});
q("#propertyModal")?.addEventListener("click",e=>{if(e.target===q("#propertyModal"))q("#propertyModal").hidden=true;});
promptBox?.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();q("#globalSearch").click();}});
q("#sortResults")?.addEventListener("change",e=>{const key=e.target.value;researchData.candidates.sort((a,b)=>key==="price"?Number(a.price||Infinity)-Number(b.price||Infinity):key==="confidence"?String(b.confidence||"").localeCompare(String(a.confidence||"")):Number(b.matchScore||0)-Number(a.matchScore||0));renderResults();});
q("#freeBtn")?.addEventListener("click",()=>document.querySelector("#explore")?.scrollIntoView({behavior:"smooth"}));
window.FlatFinderGlobal={research,renderResults,toggleCompare};