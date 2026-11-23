const AI = (() => {
  const q = (s) => document.querySelector(s);
  const money = (n) => n >= 10000000 ? "₹"+(n/10000000).toFixed(2)+" Cr" : n >= 100000 ? "₹"+(n/100000).toFixed(1)+" L" : "₹"+Math.round(n).toLocaleString("en-IN");
  const norm = (s) => String(s||"").toLowerCase().replace(/[,₹]/g,"").replace(/\\s+/g," ").trim();

  function parseMoney(text) {
    const m = norm(text).match(/(?:₹\\s*)?(\\d+(?:\\.\\d+)?)\\s*(cr|crore|l|lac|lakh|k|thousand)?/);
    if (!m) return null;
    const n = Number(m[1]); const unit = m[2] || "";
    if (["cr","crore"].includes(unit)) return n*10000000;
    if (["l","lac","lakh"].includes(unit)) return n*100000;
    if (["k","thousand"].includes(unit)) return n*1000;
    return n;
  }

  function parseRequirements(text) {
    const raw = String(text||""), t = norm(raw);
    const r = { raw, purpose: /\\b(rent|rental|lease|monthly rent)\\b/.test(t) ? "rent" : /\\b(buy|buying|purchase|sale)\\b/.test(t) ? "sale" : null, city:null, locality:null, maxPrice:null, minPrice:null, bhk:[], maxCommute:null, workplace:null, campus:null, furnished:null, amenities:[] };
    const cities = ["Pune","Mumbai","Bengaluru","Delhi NCR","Hyderabad","Chennai","Gurugram","Noida","Kolkata","Ahmedabad"];
    const city = cities.find(c => t.includes(c.toLowerCase())); if (city) r.city = city;
    r.bhk = [...new Set([...t.matchAll(/\\b([1-4])\\s*(?:bhk|bed(?:room)?s?)\\b/g)].map(m=>Number(m[1])))];
    const under = t.match(/(?:under|below|less than|upto|up to|max(?:imum)?|budget(?: of)?)[^₹0-9]{0,15}(₹?\\s*\\d+(?:\\.\\d+)?\\s*(?:cr|crore|l|lac|lakh|k|thousand)?)/);
    if (under) r.maxPrice = parseMoney(under[1]);
    if (!r.maxPrice) { const price=t.match(/₹\\s*\\d+(?:\\.\\d+)?\\s*(?:cr|crore|l|lac|lakh|k|thousand)?/); if(price) r.maxPrice=parseMoney(price[0]); }
    const commute=t.match(/(?:within|under|max(?:imum)?|less than)\\s*(\\d+)\\s*(?:min|mins|minutes)\\b/); if(commute) r.maxCommute=Number(commute[1]);
    const near=t.match(/(?:near|around|close to|nearby)\\s+([a-z][a-z0-9 .-]{2,40}?)(?=\\s+(?:under|below|within|for|with|and|,|$))/i); if(near) r.locality=near[1].trim();
    const workplace=t.match(/(?:work(?:place)?|office|job)\\s+(?:in|at|near)\\s+([a-z][a-z0-9 .-]{2,40}?)(?=\\s+(?:and|with|under|within|,|$))/i); if(workplace) r.workplace=workplace[1].trim();
    if(/furnished/.test(t)) r.furnished=/semi[- ]?furnished/.test(t) ? "Semi-furnished" : "Furnished";
    const amenityMap=[["parking","Parking"],["gym","Gym"],["lift","Lift"],["security","Security"],["pool","Swimming pool"],["power backup","Power backup"],["metro","Metro access"],["school","Schools nearby"]];
    for(const pair of amenityMap) if(t.includes(pair[0])) r.amenities.push(pair[1]);
    return r;
  }

  function emi(principal, annualRate, years) {
    if(!principal||!annualRate||!years) return 0;
    const m=annualRate/1200,n=years*12;
    return principal*m*Math.pow(1+m,n)/(Math.pow(1+m,n)-1);
  }

  function scoreProperty(p,r) {
    let score=50,reasons=[];
    if(r.maxPrice){if(Number(p.price)<=r.maxPrice){score+=18;reasons.push("within your budget");}else score-=Math.min(25,((Number(p.price)-r.maxPrice)/r.maxPrice)*25);}
    if(r.bhk.length){if(r.bhk.includes(Number(p.bhk))){score+=12;reasons.push(r.bhk.join("/")+" BHK match");}else score-=10;}
    if(r.city){if(String(p.city||"").toLowerCase()===r.city.toLowerCase()){score+=8;reasons.push("in "+r.city);}else score-=8;}
    if(r.locality){const hay=(String(p.locality||"")+" "+String(p.title||"")).toLowerCase();if(hay.includes(r.locality.toLowerCase())){score+=8;reasons.push("near "+r.locality);}}
    if(r.furnished&&p.furnishing===r.furnished){score+=5;reasons.push(r.furnished);}
    if(r.amenities.length){const a=(p.amenities||[]).map(x=>String(x).toLowerCase());const hits=r.amenities.filter(x=>a.some(v=>v.includes(x.toLowerCase().split(" ")[0]))).length;score+=Math.min(8,hits*2);if(hits)reasons.push(hits+" requested amenit"+(hits===1?"y":"ies"));}
    if(Number.isFinite(p.nearbyDistanceKm)&&r.maxCommute){const minutes=p.nearbyDistanceKm*3;if(minutes<=r.maxCommute){score+=5;reasons.push("within your approximate commute");}else score-=5;}
    return {score:Math.max(0,Math.min(100,Math.round(score))),reasons};
  }

  function rank(listings,r){
    return listings.filter(p=>p&&p.source!=="demo").map(p=>{const s=scoreProperty(p,r);return Object.assign({},p,{aiScore:s.score,aiReasons:s.reasons});})
      .filter(p=>!r.maxPrice||Number(p.price)<=r.maxPrice*1.15).sort((a,b)=>b.aiScore-a.aiScore).slice(0,8);
  }

  function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));}
  function card(p){
    const purpose=p.purpose==="rent"?"/month":"";
    return '<article class="ai-result-card"><div class="ai-result-top"><span class="ai-score">'+p.aiScore+'/100</span><span class="ai-source">'+escapeHtml(String(p.source||"Flat Finder").toUpperCase())+'</span></div><h4>'+escapeHtml(p.title||"Property")+'</h4><p>'+escapeHtml([p.locality,p.city].filter(Boolean).join(", "))+'</p><div class="ai-result-facts"><b>'+money(Number(p.price)||0)+' '+purpose+'</b><span>'+(p.bhk||"—")+' BHK</span><span>'+(p.area?Number(p.area).toLocaleString("en-IN")+" sq.ft":"Area unavailable")+'</span></div><div class="ai-reasons">'+(p.aiReasons||[]).slice(0,3).map(x=>'<span>✓ '+escapeHtml(x)+'</span>').join("")+'</div><button type="button" class="ai-open-property" data-ai-property="'+escapeHtml(p.id)+'">Open property</button></article>';
  }

  async function askModel(message,requirements,results){
    try{
      const response=await fetch("/api/ai-property",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message,requirements,properties:results.map(p=>({id:p.id,title:p.title,city:p.city,locality:p.locality,purpose:p.purpose,price:p.price,bhk:p.bhk,area:p.area,aiScore:p.aiScore,reasons:p.aiReasons}))})});
      if(!response.ok)return null; const data=await response.json(); return data.answer||null;
    }catch{return null;}
  }

  async function run(message){
    const listings=window.FlatFinderAI?.getListings?.()||[];
    const requirements=parseRequirements(message), results=rank(listings,requirements);
    const modelAnswer=await askModel(message,requirements,results);
    const answer=modelAnswer||(results.length?"I found "+results.length+" strong matches from the property records currently connected to Flat Finder. I ranked them against your budget, BHK, location and other requirements.":"I couldn't find a connected listing that matches these requirements yet. Try a wider budget, radius, city or BHK range.");
    return {answer,requirements,results};
  }

  function open(){const layer=q("#ai-search-layer");if(layer){layer.hidden=false;q("#ai-chat-input")?.focus();}}
  function close(){const layer=q("#ai-search-layer");if(layer)layer.hidden=true;}
  function renderResponse(data){
    const box=q("#ai-chat-results");if(!box)return;
    box.innerHTML='<div class="ai-answer"><p>'+escapeHtml(data.answer)+'</p></div><div class="ai-requirements">'+data.requirements.map(x=>'<span>'+escapeHtml(x)+'</span>').join("")+'</div>'+(data.results.length?'<div class="ai-results-head"><b>Best matches</b><span>'+data.results.length+' properties</span></div><div class="ai-results-grid">'+data.results.map(card).join("")+'</div>':"");
    box.querySelectorAll("[data-ai-property]").forEach(btn=>btn.onclick=()=>window.FlatFinderAI?.openProperty?.(btn.dataset.aiProperty));
  }

  function init(){
    q("#ai-search-open")?.addEventListener("click",open);
    q("#ai-search-close")?.addEventListener("click",close);
    q("#ai-search-layer")?.addEventListener("click",e=>{if(e.target.id==="ai-search-layer")close();});
    q("#ai-chat-form")?.addEventListener("submit",async e=>{
      e.preventDefault();const input=q("#ai-chat-input"),message=input.value.trim();if(!message)return;
      const submit=q("#ai-chat-submit");submit.disabled=true;submit.textContent="Thinking…";q("#ai-chat-results").innerHTML='<div class="ai-loading"><span></span><span></span><span></span> Reading your requirements…</div>';
      try{renderResponse(await run(message));}finally{submit.disabled=false;submit.textContent="Find my homes";}
    });
    document.querySelectorAll("[data-ai-example]").forEach(b=>b.onclick=()=>{q("#ai-chat-input").value=b.dataset.aiExample;q("#ai-chat-form").requestSubmit();});
  }
  return {init,open,close,parseRequirements,emi};
})();

window.FlatFinderAI=window.FlatFinderAI||{};
window.FlatFinderAI.init=AI.init;
window.FlatFinderAI.parseRequirements=AI.parseRequirements;
window.FlatFinderAI.emi=AI.emi;
