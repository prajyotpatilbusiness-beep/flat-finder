const q=s=>document.querySelector(s);
const modal=q("#researchModal"), promptBox=q("#globalPrompt"), output=q("#researchOutput"), title=q("#researchTitle"), bar=q("#progressBar");
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function research(message){
  modal.hidden=false; title.textContent="Researching your request…"; output.innerHTML='<div class="loader">● ● ●</div><p>Understanding requirements and preparing web research.</p>'; bar.style.width="18%";
  try{
    bar.style.width="42%";
    const response=await fetch("/api/ai-property",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message,requirements:{raw:message},properties:[]})});
    bar.style.width="78%";
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||"Research service unavailable");
    bar.style.width="100%";
    title.textContent="Flat Finder research";
    const sources=(data.sources||[]).slice(0,8).map(s=>'<a href="'+escapeHtml(s.url)+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(s.title||s.url)+' ↗</a>').join("");
    output.innerHTML='<div class="result-answer">'+escapeHtml(data.answer||"No answer returned.").replace(/\n/g,"<br>")+'</div>'+(sources?'<div class="ai-sources"><b>Sources</b>'+sources+'</div>':"");
  }catch(error){
    bar.style.width="100%"; title.textContent="Research unavailable"; output.innerHTML='<p><b>We could not complete live research.</b></p><p>'+escapeHtml(error.message)+'</p><p>Make sure the AI research environment is configured, then try again.</p>';
  }
}
q("#globalSearch")?.addEventListener("click",()=>{const value=promptBox.value.trim();if(value)research(value);});
q("#ctaSearch")?.addEventListener("click",()=>{const value=q("#ctaPrompt").value.trim();if(value){promptBox.value=value;research(value);}});
q("#closeResearch")?.addEventListener("click",()=>modal.hidden=true);
modal?.addEventListener("click",e=>{if(e.target===modal)modal.hidden=true});
promptBox?.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();q("#globalSearch").click();}});
