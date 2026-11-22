import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { authClient, authConfigured } from "./auth.js";
import "./marketplace.css";

let listings=[];
listings=listings.map(item=>({...item,source:item.source||"demo"}));

const state={
  purpose:"rent",city:"Pune",location:"",type:"all",bhk:"all",
  budget:null,sort:"recommended",source:"all",nearby:null,
  mode:"campus",anchorId:"all",radiusKm:5,category:"all",activeTab:"home",
  saved:new Set(JSON.parse(localStorage.getItem("ff-saved")||"[]"))
};
const money=n=>n>=10000000?"₹"+(n/10000000).toFixed(2)+" Cr":n>=100000?"₹"+(n/100000).toFixed(1)+" L":"₹"+Math.round(n).toLocaleString("en-IN");
const q=s=>document.querySelector(s);
const qa=s=>[...document.querySelectorAll(s)];
let searchAnchors={
 campus:[
  {id:"pccoe",name:"PCCOE College of Engineering",city:"Pune",lat:18.6466,lng:73.7603},
  {id:"dypatil",name:"Dr. D. Y. Patil Institute",city:"Pune",lat:18.6480,lng:73.7612},
  {id:"mitwpu",name:"MIT World Peace University",city:"Pune",lat:18.5518,lng:73.8272},
  {id:"symbiosis",name:"Symbiosis International University",city:"Pune",lat:18.5362,lng:73.7276},
  {id:"vitpune",name:"VIT Pune",city:"Pune",lat:18.4635,lng:73.8677},
  {id:"christ",name:"Christ University",city:"Bengaluru",lat:12.9346,lng:77.6069},
  {id:"pes",name:"PES University",city:"Bengaluru",lat:12.9345,lng:77.5352},
  {id:"iitb",name:"IIT Bombay",city:"Mumbai",lat:19.1334,lng:72.9133},
  {id:"du",name:"Delhi University",city:"Delhi NCR",lat:28.6884,lng:77.2095},
  {id:"iiith",name:"IIIT Hyderabad",city:"Hyderabad",lat:17.4454,lng:78.3489},
  {id:"iitm",name:"IIT Madras",city:"Chennai",lat:12.9915,lng:80.2336}
 ],
 office:[
  {id:"hinjawadi",name:"Hinjawadi Phase 1",city:"Pune",lat:18.5911,lng:73.7389},
  {id:"eon",name:"EON IT Park, Kharadi",city:"Pune",lat:18.5512,lng:73.9478},
  {id:"magarpatta",name:"Magarpatta City",city:"Pune",lat:18.5165,lng:73.9274},
  {id:"baner",name:"Baner–Balewadi",city:"Pune",lat:18.5640,lng:73.7769},
  {id:"itpl",name:"ITPL Whitefield",city:"Bengaluru",lat:12.9847,lng:77.7363},
  {id:"bkc",name:"Bandra Kurla Complex",city:"Mumbai",lat:19.0610,lng:72.8659},
  {id:"cybercity",name:"Cyber City, Gurugram",city:"Gurugram",lat:28.4950,lng:77.0890},
  {id:"hitec",name:"HITEC City",city:"Hyderabad",lat:17.4435,lng:78.3772},
  {id:"omr",name:"OMR IT Corridor",city:"Chennai",lat:12.9582,lng:80.2455}
 ]
};
async function loadPuneSearchPlaces(){
  try{
    const response=await fetch("/data/pune-search-places.json",{cache:"no-cache"});
    if(!response.ok)throw new Error("Pune place catalogue is not published yet.");
    const directory=await response.json();
    const mergePlaces=(existing,places)=> {
      const merged=[...existing];
      for(const place of (places||[])){
        const candidate={id:place.id,name:place.name,city:"Pune",lat:Number(place.lat),lng:Number(place.lng),kind:place.kind||"place",address:place.address||"",source:place.source||"OpenStreetMap"};
        if(!candidate.name||!Number.isFinite(candidate.lat)||!Number.isFinite(candidate.lng))continue;
        const duplicate=merged.some(item=>item.city==="Pune"&&(
          String(item.name).trim().toLowerCase()===candidate.name.trim().toLowerCase()
          ||(!item.source&&distanceKm(item.lat,item.lng,candidate.lat,candidate.lng)<0.18)
        ));
        if(!duplicate)merged.push(candidate);
      }
      return merged;
    };
    searchAnchors.campus=mergePlaces(searchAnchors.campus,directory.campuses);
    searchAnchors.office=mergePlaces(searchAnchors.office,directory.offices);
    updateModeControls();
    updateAnchorMap();
    render();
    if(q("#modeSummary"))q("#modeSummary").textContent="Pune directory loaded: "+(directory.campuses||[]).length+" mapped colleges/universities and "+(directory.offices||[]).length+" office hubs. Select a place to see its radius.";
  }catch(error){console.info("Pune place catalogue unavailable:",error?.message||error);}
}
function activeAnchor(){
 if(state.anchorId==="all")return null;
 return (searchAnchors[state.mode]||[]).find(item=>item.id===state.anchorId)||null;
}
function updateModeControls(){
 const anchors=searchAnchors[state.mode]||[];
 if(state.anchorId!=="all"&&!anchors.some(item=>item.id===state.anchorId))state.anchorId=anchors[0]?.id||"all";
 const select=q("#anchorSelect");
 select.innerHTML="<option value=\"all\">"+(state.city==="all"?"All India":"Citywide · "+authEscape(state.city))+"</option>"+anchors.map(item=>"<option value=\""+authEscape(item.id)+"\">"+authEscape(item.name)+" · "+authEscape(item.city)+"</option>").join("");
 select.value=state.anchorId;
 const anchor=activeAnchor();if(anchor)state.city=anchor.city;q("#city").value=state.city;
 q("#anchorEyebrow").textContent=state.mode==="campus"?"CAMPUS SEARCH":"OFFICE SEARCH";
 q("#anchorLabel").textContent=state.mode==="campus"?"Choose your college":"Choose your workplace";
 q("#anchorCity").textContent=anchor?.city||(state.city==="all"?"All India":state.city);
 q("#radiusTitle").textContent=state.mode==="campus"?"Distance from campus":"Distance from office";
 q("#modeSummary").textContent=state.mode==="campus"?"Student-friendly stays and flats around colleges and universities.":"Homes and shared stays around IT parks and business districts.";
 q("#resultsEyebrow").textContent=state.mode==="campus"?"CAMPUS PICKS":"OFFICE PICKS";
 qa("[data-mode]").forEach(button=>{const on=button.dataset.mode===state.mode;button.classList.toggle("active",on);button.setAttribute("aria-selected",String(on));});
 q("#topNearbyTitle").textContent=anchor?"Top homes near "+anchor.name:(state.city==="all"?"Top homes across India":"Top homes across "+state.city);
 q("#propertySectionTitle").textContent=anchor?"Best picks near "+anchor.name:(state.city==="all"?"Homes across India":"Homes across "+state.city);
 qa("[data-radius]").forEach(button=>button.classList.toggle("active",Number(button.dataset.radius)===state.radiusKm));
 q("#radiusValue").textContent=state.radiusKm+" KM";
}
function setActiveTab(tab){
 state.activeTab=tab;qa("[data-mobile-tab]").forEach(button=>button.classList.toggle("active",button.dataset.mobileTab===tab));
 if(tab==="profile"){q("#loginBtn").click();state.activeTab="home";qa("[data-mobile-tab]").forEach(button=>button.classList.toggle("active",button.dataset.mobileTab==="home"));return;}
 if(tab==="messages"){showNotice("Messages","Owner messaging will appear here when the enquiry and chat feature is connected.");state.activeTab="home";qa("[data-mobile-tab]").forEach(button=>button.classList.toggle("active",button.dataset.mobileTab==="home"));return;}
 if(tab==="radar")q("#map").scrollIntoView({behavior:"smooth",block:"start"});
 if(tab==="home")window.scrollTo({top:0,behavior:"smooth"});
 render();
}
const typeList=["all","Apartment","Independent House","Villa","Studio","PG / Co-living"];
const bhkList=["all","1","2","3","4+"];
const portalLabels={"99acres":"99acres",nobroker:"NoBroker",housing:"Housing.com",magicbricks:"Magicbricks",flatfinder:"Flat Finder"};
const cityNames={gurgaon:"Gurugram",bangalore:"Bengaluru",mumbai:"Mumbai",pune:"Pune"};
const portalHosts={"99acres":["99acres.com","www.99acres.com"],nobroker:["nobroker.in","www.nobroker.in"],housing:["housing.com","www.housing.com"],magicbricks:["magicbricks.com","www.magicbricks.com"]};

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
  q("#types").innerHTML=typeList.map(x=>"<button class=\"chip "+(state.type===x?"on":"")+"\" data-type=\""+x+"\">"+(x==="all"?"All types":x)+"</button>").join("");
  q("#bhks").innerHTML=bhkList.map(x=>"<button class=\"chip "+(state.bhk===x?"on":"")+"\" data-bhk=\""+x+"\">"+(x==="all"?"Any":x)+"</button>").join("");
  qa("[data-type]").forEach(b=>b.onclick=()=>{state.type=b.dataset.type;renderChips();render()});
  qa("[data-bhk]").forEach(b=>b.onclick=()=>{state.bhk=b.dataset.bhk;renderChips();render()});
}
function distanceKm(lat1,lng1,lat2,lng2){
  const radians=value=>value*Math.PI/180;
  const dLat=radians(lat2-lat1),dLng=radians(lng2-lng1);
  const a=Math.sin(dLat/2)**2+Math.cos(radians(lat1))*Math.cos(radians(lat2))*Math.sin(dLng/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function matches(l){
  if(l.purpose!==state.purpose)return false;
  if(state.city!=="all"&&l.city!==state.city)return false;
  if(state.source!=="all"&&l.source!==state.source)return false;
  const text=(l.city+" "+l.locality+" "+l.title).toLowerCase();
  if(state.location&&!text.includes(state.location.toLowerCase()))return false;
  if(state.type!=="all"&&l.type!==state.type)return false;
  if(state.bhk!=="all"&&(state.bhk==="4+"?Number(l.bhk)<4:String(l.bhk)!==state.bhk))return false;
  if(state.budget!=null&&Number(l.price)>state.budget)return false;
  if(state.category==="flats"&&!["Apartment","Independent House","Villa","Studio"].includes(l.type))return false;
  if(state.category==="pg"&&!String(l.type||"").toLowerCase().includes("pg"))return false;
  if(state.category==="hostel"&&!String(l.type||"").toLowerCase().includes("hostel"))return false;
  if(state.category==="owner"&&!String(l.tag||"").toLowerCase().includes("owner")&&l.source!=="flatfinder")return false;
  if(state.nearby){
    if(l.source==="demo"||l.lat==null||l.lng==null)return false;
    l.nearbyDistanceKm=distanceKm(state.nearby.lat,state.nearby.lng,Number(l.lat),Number(l.lng));
    if(l.nearbyDistanceKm>state.nearby.radiusKm)return false;
  }else if(activeAnchor()&&l.lat!=null&&l.lng!=null){
    l.nearbyDistanceKm=distanceKm(activeAnchor().lat,activeAnchor().lng,Number(l.lat),Number(l.lng));
    if(l.nearbyDistanceKm>state.radiusKm)return false;
  }else if(activeAnchor()){return false;}
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
  const place=[l.city,Number.isFinite(l.nearbyDistanceKm)?l.nearbyDistanceKm.toFixed(1)+" km away":l.distance].filter(Boolean).map(authEscape).join(" · ");
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
  let rows=listings.filter(matches);
  if(state.activeTab==="saved")rows=rows.filter(item=>state.saved.has(item.id));
  if(state.sort==="priceAsc")rows.sort((a,b)=>a.price-b.price);
  if(state.sort==="priceDesc")rows.sort((a,b)=>b.price-a.price);
  if(state.sort==="area")rows.sort((a,b)=>b.area-a.area);
  q("#count").textContent=rows.length.toLocaleString("en-IN");
  const anchor=activeAnchor();
  q("#context").textContent=(anchor?anchor.city:"Across India")+" · "+(state.purpose==="rent"?"Rent":"Buy")+" · "+state.radiusKm+" km radius"+(state.activeTab==="saved"?" · Saved":"")+(state.source==="all"?"":" · "+(portalLabels[state.source]||state.source));
  q("#topNearbyTitle").textContent=state.activeTab==="saved"?"Your saved properties":anchor?"Top homes near "+anchor.name:(state.city==="all"?"Top homes across India":"Top homes across "+state.city);
  const propertyTitle=q("#propertySectionTitle");
  if(propertyTitle)propertyTitle.textContent=state.activeTab==="saved"?"Your saved properties":anchor?"Best picks near "+anchor.name:(state.city==="all"?"Homes across India":"Homes across "+state.city);
  q("#mobileSavedCount").textContent=state.saved.size;
  q("#budgetLabel").textContent=state.purpose==="rent"?"monthly rent":"maximum sale price";
  q("#budgetValue").textContent=state.budget==null?"Any budget":money(state.budget);
  if(q("#nearbyStatus")&&state.nearby)q("#nearbyStatus").textContent="Showing properties within "+state.nearby.radiusKm+" km. Your exact location is used for this search only.";
  if(q("#nearbyButton"))q("#nearbyButton").textContent=state.nearby?"Refresh nearby homes":"Find homes near me"; 
  if(q("#clearNearby"))q("#clearNearby").hidden=!state.nearby;
  if(q("#dataStatus")){
    const sampleCount=listings.filter(item=>item.source==="demo").length;
    const liveCount=listings.length-sampleCount;
    q("#dataStatus").textContent="Showing "+rows.length.toLocaleString("en-IN")+" matches from "+listings.length.toLocaleString("en-IN")+" records ("+sampleCount.toLocaleString("en-IN")+" clearly labelled samples, "+liveCount.toLocaleString("en-IN")+" imported/approved live listings)."+(liveCount===0?" No live portal feed imports or approved member properties are currently connected.":"");
  }
  q("#cards").innerHTML=rows.length?rows.map(card).join(""):"<div class=\"empty\"><div>⌂</div><h3>"+(state.activeTab==="saved"?"No saved homes yet.":"No homes found in this radius.")+"</h3><p>"+(state.activeTab==="saved"?"Tap the heart on a property to keep it here.":"Try a wider radius or another nearby campus or office. Live listings will appear here when available.")+"</p><button class=\"primary\" id=\"emptyReset\">"+(state.activeTab==="saved"?"Explore homes":"Change search")+"</button></div>";
  qa("[data-save]").forEach(b=>b.onclick=()=>toggleSave(b.dataset.save));
  qa("[data-detail]").forEach(b=>b.onclick=()=>openDetail(b.dataset.detail));
  const empty=q("#emptyReset");if(empty)empty.onclick=()=>state.activeTab==="saved"?setActiveTab("home"):q("#reset").click();
  updateDashboardStats();
  updateMap(rows);
  updateAnchorMap();
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
  const features=rows.filter(l=>l.lat!=null&&l.lng!=null&&Number.isFinite(Number(l.lat))&&Number.isFinite(Number(l.lng)))
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
function radiusFeature(lat,lng,radiusKm){
  const coordinates=[];
  const earthKm=6371,lat1=lat*Math.PI/180,lng1=lng*Math.PI/180,angular=radiusKm/earthKm;
  for(let i=0;i<=64;i++){
    const bearing=i*2*Math.PI/64;
    const lat2=Math.asin(Math.sin(lat1)*Math.cos(angular)+Math.cos(lat1)*Math.sin(angular)*Math.cos(bearing));
    const lng2=lng1+Math.atan2(Math.sin(bearing)*Math.sin(angular)*Math.cos(lat1),Math.cos(angular)-Math.sin(lat1)*Math.sin(lat2));
    coordinates.push([lng2*180/Math.PI,lat2*180/Math.PI]);
  }
  return {type:"Feature",properties:{radiusKm},geometry:{type:"Polygon",coordinates:[coordinates]}};
}
function updateAnchorMap(){
  if(!map||state.nearby)return;
  const anchor=activeAnchor(),source=map.getSource("anchor-radius"),origin=map.getSource("anchor-origin");
  map.getSource("nearby-radius")?.setData({type:"FeatureCollection",features:[]});
  map.getSource("nearby-origin")?.setData({type:"FeatureCollection",features:[]});
  if(!anchor){
    source?.setData({type:"FeatureCollection",features:[]});
    origin?.setData({type:"FeatureCollection",features:[]});
    const cityViews={
      "Pune":{center:[73.8567,18.5204],zoom:10.3},
      "Mumbai":{center:[72.8777,19.076],zoom:10.2},
      "Bengaluru":{center:[77.5946,12.9716],zoom:10.2},
      "Gurugram":{center:[77.0266,28.4595],zoom:10.2},
      "Delhi NCR":{center:[77.209,28.6139],zoom:9.8},
      "Hyderabad":{center:[78.4867,17.385],zoom:10.2},
      "Chennai":{center:[80.2707,13.0827],zoom:10.2}
    };
    const view=cityViews[state.city]||{center:[78.9629,22.5937],zoom:4.5};
    map.easeTo({...view,duration:420});
    return;
  }
  source?.setData({type:"FeatureCollection",features:[radiusFeature(anchor.lat,anchor.lng,state.radiusKm)]});
  origin?.setData({type:"FeatureCollection",features:[{type:"Feature",properties:{},geometry:{type:"Point",coordinates:[anchor.lng,anchor.lat]}}]});
  map.easeTo({center:[anchor.lng,anchor.lat],zoom:state.radiusKm<=1?14:state.radiusKm<=3?13:state.radiusKm<=5?12.3:state.radiusKm<=10?11.3:10.4,duration:420});
}
function showNearbyRadius(){
  const source=map?.getSource("nearby-radius");
  if(!source||!state.nearby)return;
  source.setData({type:"FeatureCollection",features:[radiusFeature(state.nearby.lat,state.nearby.lng,state.nearby.radiusKm)]});
  const origin=map.getSource("nearby-origin");
  if(origin)origin.setData({type:"FeatureCollection",features:[{type:"Feature",properties:{},geometry:{type:"Point",coordinates:[state.nearby.lng,state.nearby.lat]}}]});
  const zoom=state.nearby.radiusKm<=1?14:state.nearby.radiusKm<=3?13:state.nearby.radiusKm<=5?12.4:state.nearby.radiusKm<=10?11.5:10.5;
  map.easeTo({center:[state.nearby.lng,state.nearby.lat],zoom,duration:650});
}
function clearNearbySearch(){
  state.nearby=null;
  updateModeControls();
  const source=map?.getSource("nearby-radius");
  if(source)source.setData({type:"FeatureCollection",features:[]});
  const origin=map?.getSource("nearby-origin");
  if(origin)origin.setData({type:"FeatureCollection",features:[]});
  updateAnchorMap();
  if(q("#nearbyStatus"))q("#nearbyStatus").textContent="Pro-only GPS search is off. Campus/office radius search remains available.";
  render();
}
function setNearbyStatus(message,isError=false){
  const el=q("#nearbyStatus");
  if(!el)return;
  el.textContent=message;
  el.classList.toggle("error",Boolean(isError));
}
async function startNearbySearch(){
  if(!authUser){showAuthForm("signin","Sign in to use Pro GPS radius search.");return;}
  const button=q("#nearbyButton");
  const radiusKm=Number(q("#nearbyRadius").value)||5;
  button.disabled=true;button.textContent="Checking Pro membership…";
  setNearbyStatus("Checking your Pro membership…");
  try{
    const {data:usageData,error:usageError}=await authClient.rpc("get_my_contact_usage");
    if(usageError)throw usageError;
    const usage=Array.isArray(usageData)?usageData[0]:usageData;
    if(usage?.plan_id!=="pro"||Number(usage?.contacts_limit)<=0){
      button.disabled=false;button.textContent="Find homes near me";
      openPlans(null,"Premium GPS radius search is a Pro-only feature. Upgrade to Pro to search around your current location.");
      return;
    }
    if(!navigator.geolocation)throw new Error("Location is not available in this browser.");
    button.textContent="Getting your location…";
    setNearbyStatus("Allow location access when your browser asks. Your exact location is not saved.");
    const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{
      enableHighAccuracy:true,timeout:15000,maximumAge:60000
    }));
    const lat=Number(position.coords.latitude),lng=Number(position.coords.longitude);
    if(!Number.isFinite(lat)||!Number.isFinite(lng))throw new Error("Your browser returned an invalid location.");
    button.textContent="Finding nearby homes…";
    const {data,error}=await authClient.rpc("search_nearby_listings",{
      p_latitude:lat,p_longitude:lng,p_radius_km:radiusKm,p_limit:500
    });
    if(error)throw error;
    const live=(data||[]).map(item=>({
      id:item.id,source:"flatfinder",city:item.city,locality:item.locality||item.city,title:item.title,
      purpose:item.purpose,type:propertyType(item.property_type),bhk:Number(item.bedrooms)||null,
      bath:Number(item.bathrooms)||0,area:Number(item.area_sqft)||0,
      price:item.purpose==="rent"?Number(item.rent_inr||0):Number(item.sale_price_inr||0),
      deposit:0,furnishing:item.furnishing||"",amenities:item.amenities||[],score:0,
      lat:Number(item.lat),lng:Number(item.lng),image:"",
      tag:item.verification_status==="verified"?"Verified owner listing":"Approved member listing",
      distance:(Number(item.distance_m)/1000).toFixed(1)+" km away",
      distanceKm:Number(item.distance_m)/1000
    }));
    const merged=new Map(listings.map(item=>[String(item.id),item]));
    for(const item of live)merged.set(String(item.id),item);
    listings=[...merged.values()];
    state.city="all";
    q("#city").value="all";
    state.nearby={lat,lng,radiusKm};
    render();
    showNearbyRadius();
    const count=listings.filter(matches).length;
    setNearbyStatus(count+" properties match this "+radiusKm+" km radius and your current filters. Only approved properties with usable map coordinates can appear.");
  }catch(error){
    const message=error?.code===1?"Location permission was denied. Allow location access in your browser settings and try again."
      :error?.code===2?"Your device could not determine its location. Check GPS/location services and retry."
      :error?.code===3?"The location request timed out. Try again."
      :(error?.message||"Nearby search failed. Please try again.");
    setNearbyStatus(message,true);
    if(String(error?.message||"").includes("PRO_PLAN_REQUIRED")){
      openPlans(null,"Premium GPS radius search is available with Pro membership.");
    }
  }finally{
    button.disabled=false;
    if(!state.nearby)button.textContent="Find homes near me";
  }
}
function initMap(){
  map=new maplibregl.Map({
    container:"map",
    style:import.meta.env.VITE_MAP_STYLE_URL||"https://tiles.openfreemap.org/styles/bright",
    center:activeAnchor()?[activeAnchor().lng,activeAnchor().lat]:[78.9629,22.5937],
    zoom:activeAnchor()?11.5:4.5,
    attributionControl:{compact:true}
  });
  map.addControl(new maplibregl.NavigationControl({showCompass:false}),"bottom-right");
  map.on("load",()=>{
    map.addSource("anchor-radius",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
    map.addLayer({id:"anchor-radius-fill",type:"fill",source:"anchor-radius",paint:{"fill-color":"#6842ee","fill-opacity":0.07}});
    map.addLayer({id:"anchor-radius-line",type:"line",source:"anchor-radius",paint:{"line-color":"#6842ee","line-width":2,"line-dasharray":[2,2]}});
    map.addSource("anchor-origin",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
    map.addLayer({id:"anchor-origin-point",type:"circle",source:"anchor-origin",paint:{"circle-color":"#6842ee","circle-radius":10,"circle-stroke-color":"#ffffff","circle-stroke-width":4}});
    map.addSource("nearby-radius",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
    map.addLayer({id:"nearby-radius-fill",type:"fill",source:"nearby-radius",paint:{"fill-color":"#0f9b91","fill-opacity":0.09}});
    map.addLayer({id:"nearby-radius-line",type:"line",source:"nearby-radius",paint:{"line-color":"#0f766e","line-width":2,"line-dasharray":[2,2]}});
    map.addSource("nearby-origin",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
    map.addLayer({id:"nearby-origin-point",type:"circle",source:"nearby-origin",paint:{"circle-color":"#2563eb","circle-radius":8,"circle-stroke-color":"#ffffff","circle-stroke-width":3}});
    map.addSource("homes",{type:"geojson",data:{type:"FeatureCollection",features:[]},cluster:true,clusterMaxZoom:13,clusterRadius:52});
    map.addLayer({id:"home-clusters",type:"circle",source:"homes",filter:["has","point_count"],paint:{
      "circle-color":"#6842ee",
      "circle-radius":["step",["get","point_count"],15,25,19,100,25,500,31],
      "circle-stroke-color":"#ffffff","circle-stroke-width":2,"circle-opacity":0.94
    }});
    map.addLayer({id:"home-cluster-count",type:"symbol",source:"homes",filter:["has","point_count"],layout:{
      "text-field":["get","point_count_abbreviated"],"text-font":["Noto Sans Bold"],"text-size":12
    },paint:{"text-color":"#ffffff"}});
    map.addLayer({id:"home-points",type:"circle",source:"homes",filter:["!",["has","point_count"]],paint:{
      "circle-color":["match",["get","source"],"99acres","#f59e0b","nobroker","#2563eb","housing","#ef4444","flatfinder","#16a36c","#6842ee"],"circle-radius":7,"circle-stroke-color":"#ffffff","circle-stroke-width":2
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
    if(state.nearby)showNearbyRadius();else updateAnchorMap();
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
        if(!sourceUrl||!["99acres","nobroker","housing","magicbricks"].includes(source))return null;
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
    listings=[...listings.filter(l=>!["99acres","nobroker","housing","magicbricks"].includes(l.source)),...imported];
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
    const image=/^https:\/\//i.test(listing.image||"")?"<img class='detailimg' src='"+authEscape(listing.image)+"' alt='Sample property interior'>":"<div class='detailimg detail-placeholder'>⌂</div>";
    const amenities=(listing.amenities||[]).map(value=>"<span class='detail-amenity'>✓ "+authEscape(value)+"</span>").join("");
    q("#modalBody").innerHTML="<article class='property-detail'>"+image+"<div class='property-detail-body'><div class='detail-badges'><span class='detail-owner-badge'>SAMPLE PROPERTY</span><span class='detail-verified-badge'>Illustrative only</span></div><h1>"+authEscape(listing.title)+"</h1><p class='detail-location'>⌖ "+authEscape([listing.locality,listing.city].filter(Boolean).join(", "))+(Number.isFinite(listing.nearbyDistanceKm)?" · "+listing.nearbyDistanceKm.toFixed(1)+" km from "+authEscape(activeAnchor()?.name||"your search point"):"")+"</p><div class='detailstats'><b>"+(listing.bhk||"—")+" BHK<small>Type</small></b><b>"+Number(listing.area||0).toLocaleString("en-IN")+" sq.ft<small>Area</small></b><b>"+money(Number(listing.price)||0)+"<small>"+(listing.purpose==="rent"?"Rent / month":"Sale price")+"</small></b><b>"+money(Number(listing.deposit)||0)+"<small>Deposit</small></b></div><section class='detail-section'><h3>Property highlights</h3><p class='muted'>This sample card demonstrates the Flat Finder property-detail layout. It is not an actual home available for rent or purchase.</p><div class='detail-amenities'>"+(amenities||"<span class='detail-amenity'>Property facts are illustrative</span>")+"</div></section><section class='detail-warning'><b>Sample listing — no real owner or contact details</b><p>Only approved live listings can show verified owner information after the required membership and mobile checks.</p></section><button class='primary wide' id='closeDetail'>Close property details</button></div></article>";
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
  const detailAmenities=(detail.amenities||[]).map(value=>"<span class='detail-amenity'>✓ "+authEscape(value)+"</span>").join("");
  q("#modalBody").innerHTML="<article class='property-detail'><div class='detail-placeholder detailimg'>⌂</div><div class='property-detail-body'><div class='detail-badges'><span class='detail-owner-badge'>APPROVED LISTING</span><span class='detail-verified-badge'>✓ Verified access</span></div><h1>"+authEscape(detail.title)+"</h1><p class='detail-location'>⌖ "+authEscape([detail.locality,detail.city,detail.state].filter(Boolean).join(", "))+"</p><div class='detailstats'><b>"+Number(detail.bedrooms||0)+" BHK<small>Type</small></b><b>"+Number(detail.area_sqft||0).toLocaleString("en-IN")+" sq.ft<small>Area</small></b><b>"+(detail.purpose==="rent"?money(Number(detail.rent_inr)||0):money(Number(detail.sale_price_inr)||0))+"<small>"+(detail.purpose==="rent"?"Rent / month":"Sale price")+"</small></b><b>"+money(Number(detail.deposit_inr)||0)+"<small>Deposit</small></b></div><section class='detail-section'><h3>Property details</h3><p>"+authEscape(detail.description||"")+"</p><div class='detail-amenities'>"+detailAmenities+"</div></section><section class='owner-contact-panel'><h3>Verified owner</h3><b>"+authEscape(detail.owner_name||"Verified owner")+"</b><p class='owner-phone'>"+authEscape(detail.owner_phone)+"</p><div class='owner-contact-actions'><a href='tel:"+authEscape(detail.owner_phone)+"'>Call owner</a><a href='https://wa.me/91"+authEscape(mobileDigits(detail.owner_phone))+"' target='_blank' rel='noopener noreferrer'>WhatsApp</a></div></section><p class='contact-audit-stamp'>Access recorded for "+authEscape(authUser.email||"your account")+" · "+authEscape(accessStamp)+"</p><p class='auth-footnote'>Do not resell or redistribute this owner's contact details. Unique owners used: "+detail.contacts_used+" of "+detail.contacts_limit+" this month.</p><button class='primary wide' id='closeDetail'>Close property details</button></div></article>";
  q("#modal").hidden=false;q("#closeDetail").onclick=()=>q("#modal").hidden=true;
}


qa(".seg button").forEach(b=>b.onclick=()=>{
  qa(".seg button").forEach(x=>x.classList.toggle("on",x.dataset.purpose===b.dataset.purpose));
  state.purpose=b.dataset.purpose;state.budget=null;
  q("#budget").max=state.purpose==="rent"?100000:50000000;
  q("#budget").value=state.purpose==="rent"?50000:15000000;
  render();
});
q("#city").onchange=e=>{
  state.city=e.target.value;
  state.anchorId="all";
  state.nearby=null;
  updateModeControls();render();
};
q("#source").onchange=e=>{state.source=e.target.value;render()};
q("#location").oninput=e=>{state.location=e.target.value.trim();render()};
q("#budget").oninput=e=>{state.budget=Number(e.target.value);render()};
q("#nearbyButton").onclick=startNearbySearch;
q("#clearNearby").onclick=clearNearbySearch;
qa("[data-mode]").forEach(button=>button.onclick=()=>{state.mode=button.dataset.mode;state.nearby=null;updateModeControls();render();});
q("#anchorSelect").onchange=event=>{state.anchorId=event.target.value;state.nearby=null;updateModeControls();render();};
qa("[data-radius]").forEach(button=>button.onclick=()=>{state.radiusKm=Number(button.dataset.radius)||5;updateModeControls();render();});
qa("[data-category]").forEach(button=>button.onclick=()=>{state.category=button.dataset.category;qa("[data-category]").forEach(item=>item.classList.toggle("active",item===button));render();});
q("#openFilters").onclick=()=>q("#filtersPanel").classList.add("mobile-open");
q("#closeFilters").onclick=()=>q("#filtersPanel").classList.remove("mobile-open");
q("#apply").onclick=()=>{render();q("#filtersPanel").classList.remove("mobile-open");};
q("#seeAllHomes").onclick=()=>setActiveTab("home");
qa("[data-mobile-tab]").forEach(button=>button.onclick=()=>setActiveTab(button.dataset.mobileTab));
q("#sort").onchange=e=>{state.sort=e.target.value;render()};
q("#searchBtn").onclick=()=>{state.location=q("#location").value.trim();render()};
q("#reset").onclick=()=>{
  state.location="";state.type="all";state.bhk="all";state.source="all";state.category="all";state.activeTab="home";
  state.budget=null;state.nearby=null;state.radiusKm=5;
  qa("[data-mobile-tab]").forEach(button=>button.classList.toggle("active",button.dataset.mobileTab==="home"));
  for(const id of ["nearby-radius","nearby-origin"])map?.getSource(id)?.setData({type:"FeatureCollection",features:[]});
  qa("[data-category]").forEach(button=>button.classList.toggle("active",button.dataset.category==="all"));
  q("#nearbyStatus").textContent="Pro-only GPS search is off. Campus/office radius search remains available.";
  q("#source").value="all";q("#location").value="";
  q("#budget").max=state.purpose==="rent"?100000:50000000;
  q("#budget").value=state.purpose==="rent"?50000:15000000;
  qa(".checks input").forEach(x=>x.checked=false);
  updateModeControls();renderChips();render();q("#filtersPanel").classList.remove("mobile-open");
};
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
q("#savedCount").textContent=state.saved.size;
updateModeControls();renderChips();initMap();
async function loadApprovedListings(){
  if(!authClient)return;
  try{
    const pageSize=500;
    const all=[];
    for(let offset=0;;offset+=pageSize){
      const {data,error}=await authClient.from("listing_explore").select("*")
        .order("created_at",{ascending:false}).range(offset,offset+pageSize-1);
      if(error)throw error;
      const page=data||[];
      all.push(...page);
      if(page.length<pageSize)break;
    }
    const approved=all.map(item=>({
      id:item.id,source:"flatfinder",city:item.city,locality:item.locality||item.city,title:item.title,purpose:item.purpose,
      type:propertyType(item.property_type),bhk:Number(item.bedrooms)||null,bath:Number(item.bathrooms)||0,area:Number(item.area_sqft||0),
      price:item.purpose==="rent"?Number(item.rent_inr||0):Number(item.sale_price_inr||0),
      deposit:Number(item.deposit_inr||0),furnishing:item.furnishing||"",amenities:item.amenities||[],score:0,
      lat:item.lat==null?null:Number(item.lat),lng:item.lng==null?null:Number(item.lng),image:"",
      tag:item.verification_status==="verified"?"Verified owner listing":"Approved member listing",distance:"",featured:Boolean(item.is_featured)
    }));
    const merged=new Map(listings.map(item=>[String(item.id),item]));
    for(const item of approved)merged.set(String(item.id),item);
    listings=[...merged.values()];
    render();
  }catch(error){
    console.warn("Approved listings could not be loaded:",error);
    if(q("#dataStatus"))q("#dataStatus").textContent="Some approved member listings could not be loaded: "+(error?.message||"Unknown data error");
  }
}
async function loadResearchCityCount(){
  try{
    const response=await fetch("/data/cities.json");
    if(!response.ok)return;
    const cities=await response.json();
    if(q("#researchCityCount"))q("#researchCityCount").textContent=Object.keys(cities).length.toLocaleString("en-IN");
  }catch{}
}
loadApprovedListings();
loadPortalListings();
loadResearchCityCount();
loadPuneSearchPlaces();