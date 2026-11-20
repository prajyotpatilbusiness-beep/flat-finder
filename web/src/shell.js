(() => {
  const tabs=[...document.querySelectorAll("[data-tab]")];
  const views={homes:document.getElementById("view-homes"),research:document.getElementById("view-research")};
  const frames={homes:document.getElementById("frame-homes"),research:document.getElementById("frame-research")};
  function activate(name,{updateHash=true}={}){
    if(!views[name]) name="homes";
    for(const key of Object.keys(views)){
      const active=key===name;
      views[key].hidden=!active;
      views[key].classList.toggle("active",active);
      tabs.find(t=>t.dataset.tab===key)?.classList.toggle("active",active);
      tabs.find(t=>t.dataset.tab===key)?.setAttribute("aria-selected",String(active));
    }
    const frame=frames[name];
    if(frame && !frame.hasAttribute("src") && frame.dataset.src) frame.src=frame.dataset.src;
    if(frame){try{const win=frame.contentWindow; if(win) win.dispatchEvent(new win.Event("resize"));}catch{}}
    if(updateHash) history.replaceState(null,"",location.pathname+location.search+(name==="homes"?"#homes":"#research"));
  }
  const authButton=document.getElementById("shell-auth-button");
  authButton?.addEventListener("click",()=>{
    activate("homes");
    frames.homes?.contentWindow?.postMessage({type:"flat-finder:open-auth"},location.origin);
  });
  window.addEventListener("message",event=>{
    if(event.origin!==location.origin||event.source!==frames.homes?.contentWindow)return;
    if(event.data?.type==="flat-finder:auth-state"&&authButton){
      authButton.textContent=event.data.signedIn?"Account":"Sign in";
    }
  });
  tabs.forEach(tab=>tab.addEventListener("click",()=>activate(tab.dataset.tab)));
  const initial=location.hash==="#research"?"research":"homes";
  activate(initial,{updateHash:false});
})();
