import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { authClient, authConfigured } from "./auth.js";
import "./marketplace.css";

let listings=[
{id:"demo-pune-1",city:"Pune",locality:"Wakad",title:"Ganga Ashiyana Society",purpose:"rent",type:"Apartment",bhk:1,bath:1,area:550,price:18000,deposit:35000,furnishing:"Furnished",amenities:["Parking","Lift","Security","Power backup"],score:9.2,lat:18.5995,lng:73.7604,image:"https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80",tag:"Owner",distance:"0.4 km from PCCOE"},
{id:"demo-pune-2",city:"Pune",locality:"Hinjawadi Phase 1",title:"Park Titanium",purpose:"rent",type:"Apartment",bhk:2,bath:2,area:850,price:24000,deposit:50000,furnishing:"Semi-furnished",amenities:["Parking","Lift","Security","Gym"],score:8.8,lat:18.5914,lng:73.7387,image:"https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=900&q=80",tag:"Broker",distance:"8 min from office hubs"},
{id:"demo-pune-3",city:"Pune",locality:"Karve Nagar",title:"Campus Stay PG",purpose:"rent",type:"PG / Co-living",bhk:1,bath:1,area:220,price:7500,deposit:10000,furnishing:"Furnished",amenities:["Security","Power backup"],score:9.4,lat:18.4935,lng:73.8215,image:"https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=900&q=80",tag:"PG",distance:"1.5 km from campus"},
{id:"demo-mumbai-1",city:"Mumbai",locality:"Powai",title:"Lakeview Heights",purpose:"rent",type:"Apartment",bhk:2,bath:2,area:920,price:52000,deposit:150000,furnishing:"Furnished",amenities:["Parking","Lift","Security","Gym","Power backup"],score:9.1,lat:19.1176,lng:72.9060,image:"https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=900&q=80",tag:"Owner",distance:"Near Hiranandani"},
{id:"demo-bengaluru-1",city:"Bengaluru",locality:"Whitefield",title:"Palm Grove Residences",purpose:"rent",type:"Apartment",bhk:2,bath:2,area:1050,price:36000,deposit:90000,furnishing:"Semi-furnished",amenities:["Parking","Lift","Security","Gym"],score:9.0,lat:12.9698,lng:77.7499,image:"https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=900&q=80",tag:"Demo",distance:"12 min to ITPL"},
{id:"demo-delhi-1",city:"Delhi NCR",locality:"Noida Sector 137",title:"Metroview Apartments",purpose:"sale",type:"Apartment",bhk:3,bath:3,area:1450,price:11200000,deposit:0,furnishing:"Unfurnished",amenities:["Parking","Lift","Security","Power backup"],score:8.9,lat:28.5055,lng:77.3910,image:"https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=900&q=80",tag:"Demo sale",distance:"Near Noida Expressway"},
{id:"demo-hyderabad-1",city:"Hyderabad",locality:"Gachibowli",title:"Cedar Park Homes",purpose:"sale",type:"Apartment",bhk:2,bath:2,area:1180,price:8900000,deposit:0,furnishing:"Semi-furnished",amenities:["Parking","Lift","Security","Gym","Power backup"],score:9.0,lat:17.4401,lng:78.3489,image:"https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80",tag:"Demo sale",distance:"Near Financial District"},
{id:"demo-chennai-1",city:"Chennai",locality:"OMR",title:"Palm Court",purpose:"rent",type:"Apartment",bhk:3,bath:3,area:1400,price:42000,deposit:120000,furnishing:"Furnished",amenities:["Parking","Lift","Security","Pool"],score:8.7,lat:12.9352,lng:80.2300,image:"https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=900&q=80",tag:"Demo",distance:"Near Tidel Park"}];

const state={
  purpose:"rent",city:"all",location:"",type:"Apartment",bhk:"all",
  budget:50000,sort:"recommended",source:"all",
  saved:new Set(JSON.parse(localStorage.getItem("ff-saved")||"[]"))
};
const money=n=>n>=10000000?"₹"+(n/10000000).toFixed(2)+" Cr":n>=100000?"₹"+(n/100000).toFixed(1)+" L":"₹"+Math.round(n).toLocaleString("en-IN");
const q=s=>document.querySelector(s);
const qa=s=>[...document.querySelectorAll(s)];
const typeList=["Apartment","Independent House","Villa","Studio","PG / Co-living"];
const bhkList=["all","1","2","3","4+"];
const portalLabels={99acres:"99acres",nobroker:"NoBroker",housing:"Housing.com",flatfinder:"Flat Finder",demo:"Sample"};
const cityNames={gurgaon:"Gurugram",bangalore:"Bengaluru",mumbai:"Mumbai",pune:"Pune"};
const portalHosts={99acres:["99acres.com","www.99acres.com"],nobroker:["nobroker.in","www.nobroker.in"],housing:["housing.com","www.housing.com"]};

function safePortalUrl(value,source){
  try{
    const url=new URL(String(value||""));
    if(!["https:","http:"].includes(url.protocol)||!(portalHosts[source]||[]).includes(url.hostname))return "";
    return url.href;
  }catch{return "";}
}
function propertyType(value){
  const text=String(value||"").toLowerCase();
  if(/villa|bungalow/.test(text))return "Villa";
  if(/independent|row house|duplex|house/.test(text))return "Independent House";
  if(/studio/.test(text))return "Studio";
  if(/pg|paying guest|co.?living/.test(text))return "PG / Co-living";
  return "Apartment";
}
function renderChips(){
  q("#types").innerHTML=typeList.map(x=>"<button class=\"chip "+(state.type===x?"on":"")+"\" data-type=\""+x+"\">"+x+"</button>").join("");
  q("#bhks").innerHTML=bhkList.map(x=>"<button class=\"chip "+(state.bhk===x?"on":"")+"\" data-bhk=\""+x+"\">"+(x==="all"?"Any":x)+"</button>").join("");
  qa("[data-type]").forEach(b=>b.onclick=()=>{state.type=b.dataset.type;renderChips();render()});
  qa("[data-bhk]").forEach(b=>b.onclick=()=>{state.bhk=b.dataset.bhk;renderChips();render()});
}
function matches(l){
  if(l.purpose!==state.purpose)return false;
  if(state.city!=="all"&&l.city!==state.city)return false;
  if(state.source!=="all"&&l.source!==state.source)return false;
  const text=(l.city+" "+l.locality+" "+l.title).toLowerCase();
  if(state.location&&!text.includes(state.location.toLowerCase()))return false;
  if(state.type&&l.type!==state.type)return false;
  if(state.bhk!=="all"&&(state.bhk==="4+"?Number(l.bhk)<4:String(l.bhk)!==state.bhk))return false;
  if(Number(l.price)>state.budget)return false;
  const furnishing=qa("#furnishing input:checked").map(x=>x.value);
  if(furnishing.length&&!furnishing.includes(l.furnishing))return false;
  const amenities=qa("#amenities input:checked").map(x=>x.value);
  if(amenities.some(v=>!(l.amenities||[]).includes(v)))return false;
  return true;
}
function card(l){
  const saved=state.saved.has(l.id);
  const isDemo=l.source==="demo"||String(l.id).startsWith("demo-");
  const isPortal=["99acres","nobroker","housing"].includes(l.source);
  const image=typeof l.image==="string"&&/^https:\/\//i.test(l.image)
    ? '<img src="'+authEscape(l.image)+'" alt="" loading="lazy">'
    : '<div class="photo-placeholder" aria-hidden="true">⌂</div>';
  const facts=[l.bhk?Number(l.bhk)+" BHK":null,l.area?Number(l.area).toLocaleString("en-IN")+" sq.ft":null,l.locality]
    .filter(Boolean).map(authEscape).join(" · ");
  const place=[l.city,l.distance].filter(Boolean).map(authEscape).join(" · ");
  const score=Number(l.score)>0
    ? '<div class="score"><span>★ '+Number(l.score).toFixed(1)+'</span><small>'+(isDemo?"Sample score":"Flat Finder score")+'</small></div>'
    : "";
  const sourceLabel=portalLabels[l.source]||"Flat Finder";
  const demo=isDemo?'<span class="demo-pill">SAMPLE</span>':"";
  const sourceTag='<span class="source-pill source-'+authEscape(l.source||"flatfinder")+'">'+authEscape(sourceLabel)+'</span>';
  const action=isPortal
    ? '<a class="details" href="'+authEscape(safePortalUrl(l.sourceUrl,l.source))+'" target="_blank" rel="noopener noreferrer">View original on '+authEscape(sourceLabel)+' ↗</a>'
    : '<button class="details" data-detail="'+authEscape(l.id)+'">'+(isDemo?"Preview sample property →":"Unlock verified owner details →")+'</button>';
  return '<article class="card"><div class="photo">'+image
    +'<span class="tag">'+authEscape(l.tag||sourceLabel)+'</span>'
    +'<button class="heart '+(saved?"saved":"")+'" data-save="'+authEscape(l.id)+'" aria-label="'+(saved?"Remove saved property":"Save property")+'">'+(saved?"♥":"♡")+'</button>'
    +demo+'</div><div class="cardbody"><div class="card-source-row">'+sourceTag+'<span class="meta">'+facts+'</span></div><h3>'+authEscape(l.title)+'</h3>'
    +'<p class="place">⌖ '+place+'</p><div class="price">'+money(Number(l.price)||0)
    +' <small>'+(l.purpose==="rent"?"/ month":"sale")+'</small></div>'+score+action+'</div></article>';
}
function updateDashboardStats(){
  const portalRows=listings.filter(l=>["99acres","nobroker","housing"].includes(l.source));
  const memberRows=listings.filter(l=>l.source==="flatfinder");
  if(q("#portalListingCount"))q("#portalListingCount").textContent=portalRows.length.toLocaleString("en-IN");
  if(q("#approvedListingCount"))q("#approvedListingCount").textContent=memberRows.length.toLocaleString("en-IN");
  if(q("#portalSourceCount"))q("#portalSourceCount").textContent="3";
  if(q("#sourceNotice")){
    if(portalRows.length){
      const sources=[...new Set(portalRows.map(l=>portalLabels[l.source]))].join(", ");
      q("#sourceNotice").innerHTML="<b>Imported portal listings:</b> "+portalRows.length.toLocaleString("en-IN")+" source-linked properties from "+authEscape(sources)+". Open the original listing to confirm current price and availability. Demo cards remain clearly marked.";
    }else{
      q("#sourceNotice").innerHTML="<b>Source transparency:</b> sample homes are fictional. 99acres, NoBroker and Housing.com feeds are supported; real listings appear only after an authorised CSV/JSON feed has been supplied. Portal cards link back to their source.";
    }
  }
}
function render(){
  const rows=listings.filter(matches);
  if(state.sort==="priceAsc")rows.sort((a,b)=>a.price-b.price);
  if(state.sort==="priceDesc")rows.sort((a,b)=>b.price-a.price);
  if(state.sort==="area")rows.sort((a,b)=>b.area-a.area);
  q("#count").textContent=rows.length.toLocaleString("en-IN");
  q("#context").textContent=(state.city==="all"?"Across India":state.city)+" · "+(state.purpose==="rent"?"Rent":"Buy")+(state.source==="all"?"":" · "+(portalLabels[state.source]||state.source));
  q("#budgetLabel").textContent=state.purpose==="rent"?"monthly rent":"maximum sale price";
  q("#budgetValue").textContent=money(state.budget);
  q("#cards").innerHTML=rows.length?rows.map(card).join(""):"<div class=\"empty\"><div>⌂</div><h3>No homes match these filters.</h3><p>Try a wider budget, another city or another listing source.</p><button class=\"primary\" id=\"emptyReset\">Reset filters</button></div>";
  qa("[data-save]").forEach(b=>b.onclick=()=>toggleSave(b.dataset.save));
  qa("[data-detail]").forEach(b=>b.onclick=()=>openDetail(b.dataset.detail));
  const empty=q("#emptyReset");if(empty)empty.onclick=q("#reset").onclick;
  updateDashboardStats();
  updateMap(rows);
}
function toggleSave(id){
  if(state.saved.has(id))state.saved.delete(id);else state.saved.add(id);
  localStorage.setItem("ff-saved",JSON.stringify([...state.saved]));
  q("#savedCount").textContent=state.saved.size;
  render();
}

let map;
function updateMap(rows){
  const source=map?.getSource("homes");
  if(!source)return;
  const features=rows.filter(l=>Number.isFinite(Number(l.lat))&&Number.isFinite(Number(l.lng)))
    .map(l=>({
      type:"Feature",
      properties:{
        id:String(l.id),
        title:String(l.title||"Property"),
        source:String(l.source||"flatfinder"),
        sourceUrl:String(l.sourceUrl||""),
        priceLabel:money(Number(l.price)||0),
      },
      geometry:{type:"Point",coordinates:[Number(l.lng),Number(l.lat)]}
    }));
  source.setData({type:"FeatureCollection",features});
}
function initMap(){
  map=new maplibregl.Map({
    container:"map",
    style:import.meta.env.VITE_MAP_STYLE_URL||"https://tiles.openfreemap.org/styles/bright",
    center:[78.9629,22.5937],
    zoom:4.5,
    attributionControl:{compact:true}
  });
  map.addControl(new maplibregl.NavigationControl({showCompass:false}),"bottom-right");
  map.on("load",()=>{
    map.addSource("homes",{type:"geojson",data:{type:"FeatureCollection",features:[]},cluster:true,clusterMaxZoom:13,clusterRadius:52});
    map.addLayer({id:"home-clusters",type:"circle",source:"homes",filter:["has","point_count"],paint:{
      "circle-color":"#0f766e",
      "circle-radius":["step",["get","point_count"],15,25,19,100,25,500,31],
      "circle-stroke-color":"#ffffff","circle-stroke-width":2,"circle-opacity":0.94
    }});
    map.addLayer({id:"home-cluster-count",type:"symbol",source:"homes",filter:["has","point_count"],layout:{
      "text-field":["get","point_count_abbreviated"],"text-font":["Noto Sans Bold"],"text-size":12
    },paint:{"text-color":"#ffffff"}});
    map.addLayer({id:"home-points",type:"circle",source:"homes",filter:["!",["has","point_count"]],paint:{
      "circle-color":"#0f8b83","circle-radius":6,"circle-stroke-color":"#ffffff","circle-stroke-width":1.5
    }});
    map.addLayer({id:"home-labels",type:"symbol",source:"homes",minzoom:10.5,filter:["!",["has","point_count"]],layout:{
      "text-field":["get","priceLabel"],"text-font":["Noto Sans Bold"],"text-size":10,"text-offset":[0,1.3],"text-optional":true
    },paint:{"text-color":"#17433f","text-halo-color":"#ffffff","text-halo-width":1.6}});
    map.on("click","home-clusters",event=>{
      const feature=event.features?.[0];if(!feature)return;
      map.getSource("homes").getClusterExpansionZoom(feature.properties.cluster_id,(error,zoom)=>{
        if(!error)map.easeTo({center:feature.geometry.coordinates,zoom,duration:420});
      });
    });
    map.on("click","home-points",event=>{
      const props=event.features?.[0]?.properties;if(!props)return;
      const listing=listings.find(item=>String(item.id)===String(props.id));if(!listing)return;
      if(["99acres","nobroker","housing"].includes(listing.source)){
        const url=safePortalUrl(listing.sourceUrl,listing.source);
        if(url)window.open(url,"_blank","noopener,noreferrer");
      }else openDetail(listing.id);
    });
    for(const id of ["home-clusters","home-points"]){
      map.on("mouseenter",id,()=>map.getCanvas().style.cursor="pointer");
      map.on("mouseleave",id,()=>map.getCanvas().style.cursor="");
    }
    render();
  });
}

function loadPortalListings(){
  const cities=Object.keys(cityNames);
  Promise.all(cities.map(async city=>{
    try{
      const response=await fetch("/data/"+city+"-portal-listings.json");
      if(!response.ok)return [];
      const records=await response.json();
      if(!Array.isArray(records))return [];
      return records.map(item=>{
        const source=item.source;
        const sourceUrl=safePortalUrl(item.url,source);
        if(!sourceUrl||!["99acres","nobroker","housing"].includes(source))return null;
        const price=Number(item.price_inr)||0;
        if(!price)return null;
        return {
          id:"portal-"+source+"-"+String(item.source_id||item.id),
          source,
          city:cityNames[city],
          locality:item.locality||cityNames[city],
          title:item.title||item.society_name||"Property listing",
          purpose:item.operation==="rent"?"rent":"sale",
          type:propertyType(item.property_type),
          bhk:Number(item.bhk)||null,
          bath:0,
          area:Number(item.area_sqft)||0,
          price,
          deposit:0,
          furnishing:"",
          amenities:[],
          score:0,
          lat:item.latitude==null?null:Number(item.latitude),
          lng:item.longitude==null?null:Number(item.longitude),
          image:"",
          tag:portalLabels[source],
          distance:"",
          sourceUrl
        };
      }).filter(Boolean);
    }catch{return [];}
  })).then(groups=>{
    const imported=groups.flat();
    listings=[...listings.filter(l=>!["99acres","nobroker","housing"].includes(l.source)),...imported];
    render();
  });
}
async function getPhoneVerification(){
  if(!authUser)return {verified:false,phone:""};
  const {data,error}=await authClient.from("profiles")
    .select("phone,phone_verified_at")
    .eq("id",authUser.id)
    .maybeSingle();
  if(error)throw error;
  return {verified:Boolean(data?.phone_verified_at),phone:data?.phone||authUser.user_metadata?.phone||""};
}
async function openDetail(id){
  const listing=listings.find(item=>item.id===id);
  if(!listing)return;
  if(!authUser){pendingDetailId=id;showAuthForm("signin","Sign in or create a free account to continue to full property details.");return;}
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id))){
    q("#modalBody").innerHTML="<div class='auth-panel'><span class='eyebrow'>SAMPLE PREVIEW</span><h2>This is a demo property</h2><p class='muted'>This sample is not a real home and has no real owner or phone number. Paid access will apply only to live, approved listings with a verified owner.</p><button class='ghost wide' id='closeDetail'>Close</button></div>";
    q("#modal").hidden=false;q("#closeDetail").onclick=()=>q("#modal").hidden=true;return;
  }
  let phoneStatus;
  try{phoneStatus=await getPhoneVerification();}
  catch(error){showNotice("Mobile verification status unavailable",error?.message||"Please try again.");return;}
  if(!phoneStatus.verified){pendingDetailId=id;await beginPhoneVerification(phoneStatus.phone);return;}

  const {data:usageData,error:usageError}=await authClient.rpc("get_my_contact_usage");
  if(usageError){showNotice("Membership status unavailable",usageError.message);return;}
  const usage=Array.isArray(usageData)?usageData[0]:usageData;
  if(!usage||!usage.contacts_limit){openPlans(id,"Choose a paid plan to unlock full details and verified owner contacts.");return;}
  const {data:details,error}=await authClient.rpc("reveal_owner_contact",{p_listing_id:id});
  if(error){
    const reason=error.message||"CONTACT_LOOKUP_FAILED";
    if(reason.includes("SUBSCRIPTION_REQUIRED")||reason.includes("CONTACT_LIMIT_REACHED")){openPlans(id,reason.includes("CONTACT_LIMIT_REACHED")?"You've used all owner contacts in this period. Upgrade for more.":"Choose a paid plan to unlock this property.");return;}
    if(reason.includes("PHONE_VERIFICATION_REQUIRED")){pendingDetailId=id;beginPhoneVerification(authUser.phone||authUser.user_metadata?.phone||"");return;}
    showNotice("Contact cannot be released",reason.includes("OWNER_CONTACT_NOT_VERIFIED")?"This owner's mobile number has not been verified yet.":reason);return;
  }
  const detail=Array.isArray(details)?details[0]:details;
  if(!detail)return;
  const accessStamp=new Intl.DateTimeFormat("en-IN",{dateStyle:"medium",timeStyle:"short"}).format(new Date());
  q("#modalBody").innerHTML="<div class='auth-panel'><span class='eyebrow'>VERIFIED OWNER CONTACT</span><h2>"+authEscape(detail.title)+"</h2><p class='muted'>"+authEscape([detail.locality,detail.city,detail.state].filter(Boolean).join(", "))+"</p><div class='detailstats'><b>"+Number(detail.bedrooms||0)+" BHK<small>Bedrooms</small></b><b>"+Number(detail.area_sqft||0).toLocaleString("en-IN")+" sq.ft<small>Area</small></b><b>"+authEscape(detail.purpose==="rent"?"Rent":"For sale")+"</b></div><p>"+authEscape(detail.description||"")+"</p><div class='notice'><b>Owner details</b><br>"+authEscape(detail.owner_name||"Verified owner")+"<br><strong>"+authEscape(detail.owner_phone)+"</strong></div><p class='contact-audit-stamp'>Access recorded for "+authEscape(authUser.email||"your account")+" · "+authEscape(accessStamp)+"</p><p class='auth-footnote'>Do not resell or redistribute this owner's contact details. Unique owners used: "+detail.contacts_used+" of "+detail.contacts_limit+" this month.</p><button class='primary wide' id='closeDetail'>Close</button>";
  q("#modal").hidden=false;q("#closeDetail").onclick=()=>q("#modal").hidden=true;
}

let map;
function updateMap(rows){if(!map)return;qa(".map-marker").forEach(x=>x.remove());rows.filter(l=>Number.isFinite(l.lat)&&Number.isFinite(l.lng)).forEach(l=>{var el=document.createElement("button");el.className="map-marker";el.textContent=l.purpose==="rent"?money(l.price):money(l.price).replace("₹","₹");el.title=l.title;el.onclick=()=>{map.flyTo({center:[l.lng,l.lat],zoom:13});openDetail(l.id)};new maplibregl.Marker({element:el}).setLngLat([l.lng,l.lat]).addTo(map)})}
function initMap(){map=new maplibregl.Map({container:"map",style:import.meta.env.VITE_MAP_STYLE_URL||"https://tiles.openfreemap.org/styles/bright",center:[78.9629,22.5937],zoom:4.5});map.addControl(new maplibregl.NavigationControl({showCompass:false}),"bottom-right");map.on("load",render)}
qa(".seg button").forEach(b=>b.onclick=()=>{qa(".seg button").forEach(x=>x.classList.remove("on"));b.classList.add("on");state.purpose=b.dataset.purpose;state.budget=state.purpose==="rent"?50000:15000000;q("#budget").max=state.purpose==="rent"?100000:50000000;q("#budget").value=state.budget;render()});
q("#city").onchange=e=>{state.city=e.target.value;render()};q("#location").oninput=e=>{state.location=e.target.value.trim();render()};q("#budget").oninput=e=>{state.budget=Number(e.target.value);render()};q("#sort").onchange=e=>{state.sort=e.target.value;render()};q("#searchBtn").onclick=()=>{state.location=q("#location").value.trim();render()};q("#apply").onclick=render;
q("#reset").onclick=()=>{state.city="all";state.location="";state.type="Apartment";state.bhk="all";state.budget=state.purpose==="rent"?50000:15000000;q("#city").value="all";q("#location").value="";qa(".checks input").forEach(x=>x.checked=false);renderChips();render()};
q("#closeModal").onclick=()=>q("#modal").hidden=true;q("#modal").onclick=e=>{if(e.target.id==="modal")q("#modal").hidden=true};
let authUser=null;
let pendingDetailId=null;
let phoneOtpNumber="";
function authEscape(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));}
function mobileDigits(value){let digits=String(value||"").replace(/\D/g,"");if(digits.length===12&&digits.startsWith("91"))digits=digits.slice(2);return digits.slice(0,10);}
function validIndianMobile(value){return /^[6-9]\d{9}$/.test(mobileDigits(value));}
function updateAuthButton(){const signedIn=Boolean(authUser);q("#loginBtn").textContent=signedIn?"Account":"Sign in";if(window.parent!==window)window.parent.postMessage({type:"flat-finder:auth-state",signedIn},location.origin);}
function openPlans(id=null,note=""){q("#modal").hidden=true;if(window.parent!==window)window.parent.postMessage({type:"flat-finder:show-plans",listingId:id,note},location.origin);else location.href="/#plans";}
function showNotice(title,body){q("#modalBody").innerHTML="<div class='auth-panel'><h2>"+authEscape(title)+"</h2><p class='muted'>"+authEscape(body)+"</p><button class='ghost wide' id='closeDetail'>Close</button></div>";q("#modal").hidden=false;q("#closeDetail").onclick=()=>q("#modal").hidden=true;}
function showAuthForm(mode="signin",message=""){
  if(!authConfigured){showNotice("Account access unavailable","Please refresh the page and try again.");return;}
  const creating=mode==="signup";
  q("#modalBody").innerHTML="<div class='auth-panel'><span class='eyebrow'>FLAT FINDER ACCOUNT</span><h2>"+(creating?"Create your account":"Welcome back")+"</h2><p class='muted'>"+(creating?"Create a free account. Your mobile number must be verified before owner contacts can be unlocked.":"Sign in to continue to full property details.")+"</p><div class='auth-tabs'><button id='authSignInTab' class='"+(!creating?"active":"")+"' type='button'>Sign in</button><button id='authSignUpTab' class='"+(creating?"active":"")+"' type='button'>Create account</button></div><form id='authForm' class='auth-form'><label "+(creating?"":"hidden")+">Full name<input name='displayName' autocomplete='name' "+(creating?"required":"")+" maxlength='80' placeholder='Your name'></label><label "+(creating?"":"hidden")+">Indian mobile number<span class='auth-phone-field'><b>+91</b><input name='mobile' type='tel' inputmode='numeric' maxlength='10' pattern='[6-9][0-9]{9}' "+(creating?"required":"")+" placeholder='10-digit mobile number'></span></label><label>Email address<input name='email' type='email' autocomplete='email' required maxlength='254' placeholder='you@example.com'></label><label>Password<input name='password' type='password' autocomplete='"+(creating?"new-password":"current-password")+"' minlength='8' required placeholder='At least 8 characters'></label><p id='authMessage' class='auth-message' role='status' aria-live='polite'>"+authEscape(message)+"</p><button class='primary wide' type='submit'>"+(creating?"Create account":"Sign in")+"</button></form><p class='auth-footnote'>Email confirmation may be required. Mobile verification uses an SMS code.</p></div>";
  q("#modal").hidden=false;
  q("#authSignInTab").onclick=()=>showAuthForm("signin");
  q("#authSignUpTab").onclick=()=>showAuthForm("signup");
  const mobile=q("#authForm [name='mobile']");
  mobile?.addEventListener("input",()=>mobile.value=mobile.value.replace(/\D/g,"").slice(0,10));
  q("#authForm").onsubmit=async event=>{
    event.preventDefault();
    const form=event.currentTarget,submit=form.querySelector('[type="submit"]'),values=new FormData(form);
    const email=String(values.get("email")||"").trim().toLowerCase(),password=String(values.get("password")||"");
    const displayName=String(values.get("displayName")||"").trim(),digits=mobileDigits(values.get("mobile"));
    const status=q("#authMessage");
    if(creating&&!validIndianMobile(digits)){status.textContent="Enter a valid 10-digit Indian mobile number.";status.classList.add("error");return;}
    submit.disabled=true;submit.textContent=creating?"Creating account…":"Signing in…";status.textContent="";
    try{
      if(creating){
        const {data,error}=await authClient.auth.signUp({email,password,options:{data:{display_name:displayName,phone:"+91"+digits},emailRedirectTo:new URL("/",location.origin).href}});
        if(error)throw error;
        if(!data.session){showAuthForm("signin","Account created. Confirm your email, then sign in to verify your mobile number.");return;}
        authUser=data.user;updateAuthButton();afterSignIn();
      }else{
        const {data,error}=await authClient.auth.signInWithPassword({email,password});
        if(error)throw error;
        authUser=data.user;updateAuthButton();
        afterSignIn();
      }
    }catch(error){
      status.textContent=error?.message||"We could not complete that request. Please try again.";
      status.classList.add("error");submit.disabled=false;submit.textContent=creating?"Create account":"Sign in";
    }
  };
}
function afterSignIn(){updateAuthButton();q("#modal").hidden=true;if(pendingDetailId)openDetail(pendingDetailId);else if(window.parent!==window)window.parent.postMessage({type:"flat-finder:auth-complete"},location.origin);}
function showPhoneEntry(phone="",notice=""){
  q("#modalBody").innerHTML="<div class='auth-panel'><span class='eyebrow'>MOBILE VERIFICATION</span><h2>Verify your Indian mobile</h2><p class='muted'>We verify buyers before releasing any owner's contact details.</p><form id='phoneEntryForm' class='auth-form'><label>Mobile number<span class='auth-phone-field'><b>+91</b><input name='mobile' type='tel' inputmode='numeric' maxlength='10' pattern='[6-9][0-9]{9}' required value='"+authEscape(mobileDigits(phone))+"' placeholder='10-digit mobile number'></span></label><p id='phoneEntryMessage' class='auth-message'>"+authEscape(notice)+"</p><button class='primary wide' type='submit'>Send OTP</button></form></div>";
  q("#modal").hidden=false;
  const input=q("#phoneEntryForm [name='mobile']");
  input.addEventListener("input",()=>input.value=input.value.replace(/\D/g,"").slice(0,10));
  q("#phoneEntryForm").onsubmit=async event=>{
    event.preventDefault();
    const digits=mobileDigits(new FormData(event.currentTarget).get("mobile"));
    if(!validIndianMobile(digits)){q("#phoneEntryMessage").textContent="Enter a valid 10-digit Indian mobile number.";q("#phoneEntryMessage").classList.add("error");return;}
    await beginPhoneVerification("+91"+digits);
  };
}
async function beginPhoneVerification(phone){
  if(!authUser){showAuthForm("signin");return;}
  if(!phone||!validIndianMobile(phone)){showPhoneEntry(phone);return;}
  phoneOtpNumber="+91"+mobileDigits(phone);
  q("#modalBody").innerHTML="<div class='auth-panel'><span class='eyebrow'>MOBILE VERIFICATION</span><h2>Verify your Indian mobile</h2><p class='muted'>A 6-digit SMS code is being sent to "+authEscape(phoneOtpNumber)+".</p><form id='phoneOtpForm' class='auth-form'><label>6-digit code<input name='token' type='text' inputmode='numeric' autocomplete='one-time-code' maxlength='6' pattern='[0-9]{6}' required placeholder='123456'></label><p id='phoneOtpMessage' class='auth-message' role='status' aria-live='polite'>Enter the SMS code to verify this number.</p><button class='primary wide' type='submit'>Verify mobile number</button><button class='ghost wide' id='resendPhoneOtp' type='button'>Send code again</button></form></div>";
  q("#modal").hidden=false;
  const message=q("#phoneOtpMessage");
  const form=q("#phoneOtpForm");
  const sendCode=async()=>{
    const resend=q("#resendPhoneOtp");
    if(resend){resend.disabled=true;resend.textContent="Sending…";}
    try{
      const {data,error}=await authClient.functions.invoke("verify-phone",{body:{action:"send",phone:phoneOtpNumber}});
      if(error||!data?.success)throw new Error(data?.error||error?.message||"PHONE_VERIFICATION_FAILED");
      message.textContent="Code sent. It expires in 10 minutes. You can request another after 60 seconds.";
      message.classList.remove("error");
    }catch(error){
      message.textContent=error?.message||"We couldn't send the SMS code. Check the SMS provider setup.";
      message.classList.add("error");
    }finally{
      if(resend){resend.disabled=false;resend.textContent="Send code again";}
    }
  };
  form.onsubmit=async event=>{
    event.preventDefault();
    const submit=form.querySelector('[type="submit"]');
    const token=String(new FormData(form).get("token")||"").replace(/\D/g,"");
    if(token.length!==6){message.textContent="Enter the 6-digit code.";message.classList.add("error");return;}
    submit.disabled=true;submit.textContent="Verifying…";message.textContent="";
    try{
      const {data,error}=await authClient.functions.invoke("verify-phone",{
        body:{action:"verify",phone:phoneOtpNumber,code:token}
      });
      if(error||!data?.success)throw new Error(data?.error||error?.message||"PHONE_VERIFICATION_FAILED");
      updateAuthButton();
      q("#modal").hidden=true;
      if(pendingDetailId)openDetail(pendingDetailId);
      else afterSignIn();
    }catch(error){
      message.textContent=error?.message||"We couldn't verify that code. Please check it and try again.";
      message.classList.add("error");
      submit.disabled=false;submit.textContent="Verify mobile number";
    }
  };
  q("#resendPhoneOtp").onclick=sendCode;
  await sendCode();
}
function showAuthAccount(){
  if(!authUser){showAuthForm("signin");return;}
  q("#modalBody").innerHTML="<div class='auth-panel'><span class='eyebrow'>FLAT FINDER ACCOUNT</span><h2>You're signed in</h2><p class='muted'>"+authEscape(authUser.email)+"</p><p class='auth-message' id='mobileStatus'>Checking mobile verification…</p><button class='primary wide' id='viewPlansNow' type='button'>View membership plans</button><button class='ghost wide' id='signOutBtn' type='button'>Sign out</button></div>";
  q("#modal").hidden=false;
  getPhoneVerification().then(status=>{const el=q("#mobileStatus");if(el)el.textContent=status.verified?"Mobile verified: "+status.phone:"Mobile not verified yet.";}).catch(()=>{const el=q("#mobileStatus");if(el)el.textContent="Mobile verification status unavailable.";});
  q("#viewPlansNow").onclick=()=>openPlans(pendingDetailId);
  q("#signOutBtn").onclick=async()=>{
    const button=q("#signOutBtn");button.disabled=true;button.textContent="Signing out…";
    const {error}=await authClient.auth.signOut();
    if(error){button.disabled=false;button.textContent="Sign out";showNotice("Could not sign out",error.message);return;}
    authUser=null;updateAuthButton();showAuthForm("signin","You have been signed out.");
  };
}
if(authClient){
  authClient.auth.getSession().then(({data})=>{authUser=data.session?.user||null;updateAuthButton();}).catch(()=>{});
  authClient.auth.onAuthStateChange((_event,session)=>{authUser=session?.user||null;updateAuthButton();});
}
q("#loginBtn").onclick=()=>authUser?showAuthAccount():showAuthForm("signin");
window.addEventListener("message",event=>{
  if(event.origin!==location.origin||event.source!==window.parent)return;
  if(event.data?.type==="flat-finder:open-auth"){
    const mode=event.data.mode;
    if(mode==="account"&&authClient){
      authClient.auth.getSession().then(({data})=>{authUser=data.session?.user||authUser;if(authUser)showAuthAccount();else showAuthForm("signin");});
    }else showAuthForm(mode==="signup"?"signup":"signin");
  }
  if(event.data?.type==="flat-finder:reopen-detail"&&event.data.listingId){
    pendingDetailId=event.data.listingId;
    openDetail(pendingDetailId);
  }
});
q("#listBtn").onclick=()=>{q("#modalBody").innerHTML="<h2>List your property</h2><p class=\"muted\">Owner and agent submissions should remain private until moderation and verification checks pass.</p><div class=\"notice\">Production flow: account → ownership evidence → draft → admin review → approved listing → protected contact.</div><button class=\"primary wide\" id=\"modalClose3\">Got it</button>";q("#modal").hidden=false;q("#modalClose3").onclick=()=>q("#modal").hidden=true};
q("#gridBtn").onclick=()=>{q("#cards").classList.remove("list");q("#gridBtn").classList.add("on");q("#mapBtn").classList.remove("on")};q("#mapBtn").onclick=()=>{q("#cards").classList.add("list");q("#mapBtn").classList.add("on");q("#gridBtn").classList.remove("on");q("#map").scrollIntoView({behavior:"smooth"})};
q("#savedCount").textContent=state.saved.size;renderChips();initMap();
async function loadApprovedListings(){
  if(!authClient)return;
  const {data,error}=await authClient.from("listing_explore").select("*").limit(100);
  if(error||!data?.length)return;
  listings=data.map(item=>({
    id:item.id,city:item.city,locality:item.locality||item.city,title:item.title,purpose:item.purpose,
    type:item.property_type,bhk:item.bedrooms,bath:0,area:Number(item.area_sqft||0),
    price:item.purpose==="rent"?Number(item.rent_inr||0):Number(item.sale_price_inr||0),
    deposit:0,furnishing:"",amenities:[],score:0,lat:null,lng:null,image:"",tag:"Approved",distance:""
  }));
  render();
}
loadApprovedListings();