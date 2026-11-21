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

const state={purpose:"rent",city:"all",location:"",type:"Apartment",bhk:"all",budget:50000,sort:"recommended",saved:new Set(JSON.parse(localStorage.getItem("ff-saved")||"[]"))};
const money=n=>n>=10000000?"₹"+(n/10000000).toFixed(2)+" Cr":n>=100000?"₹"+(n/100000).toFixed(1)+" L":"₹"+n.toLocaleString("en-IN");
const q=s=>document.querySelector(s); const qa=s=>[...document.querySelectorAll(s)];
const typeList=["Apartment","Independent House","Villa","Studio","PG / Co-living"];
const bhkList=["all","1","2","3","4+"];
function renderChips(){q("#types").innerHTML=typeList.map(x=>"<button class=\"chip "+(state.type===x?"on":"")+" \" data-type=\""+x+"\">"+x+"</button>").join("");q("#bhks").innerHTML=bhkList.map(x=>"<button class=\"chip "+(state.bhk===x?"on":"")+" \" data-bhk=\""+x+"\">"+(x==="all"?"Any":x)+"</button>").join("");qa("[data-type]").forEach(b=>b.onclick=()=>{state.type=b.dataset.type;renderChips();render()});qa("[data-bhk]").forEach(b=>b.onclick=()=>{state.bhk=b.dataset.bhk;render()})}
function matches(l){if(l.purpose!==state.purpose)return false;if(state.city!=="all"&&l.city!==state.city)return false;var text=(l.city+" "+l.locality+" "+l.title).toLowerCase();if(state.location&&!text.includes(state.location.toLowerCase()))return false;if(state.type&&l.type!==state.type)return false;if(state.bhk!=="all"&&(state.bhk==="4+"?l.bhk<4:String(l.bhk)!==state.bhk))return false;if(l.price>state.budget)return false;var f=qa("#furnishing input:checked").map(x=>x.value);if(f.length&&!f.includes(l.furnishing))return false;var a=qa("#amenities input:checked").map(x=>x.value);if(a.some(v=>!l.amenities.includes(v)))return false;return true}
function card(l){var saved=state.saved.has(l.id);return "<article class=\"card\"><div class=\"photo\"><img src=\""+l.image+"\" alt=\"\" loading=\"lazy\"><span class=\"tag\">"+l.tag+"</span><button class=\"heart "+(saved?"saved":"")+" \" data-save=\""+l.id+"\">"+(saved?"♥":"♡")+"</button><span class=\"demo-pill\">DEMO</span></div><div class=\"cardbody\"><div class=\"meta\">"+l.bhk+" BHK · "+l.area.toLocaleString("en-IN")+" sq.ft · "+l.locality+"</div><h3>"+l.title+"</h3><p class=\"place\">⌖ "+l.city+" · "+l.distance+"</p><div class=\"price\">"+money(l.price)+" <small>"+(l.purpose==="rent"?"/ month":"sale")+"</small></div><div class=\"score\"><span>★ "+l.score+"</span><small>Bachelor-friendly score</small></div><button class=\"details\" data-detail=\""+l.id+"\">Unlock details & owner contact →</button></div></article>"}
function render(){var rows=listings.filter(matches);if(state.sort==="priceAsc")rows.sort((a,b)=>a.price-b.price);if(state.sort==="priceDesc")rows.sort((a,b)=>b.price-a.price);if(state.sort==="area")rows.sort((a,b)=>b.area-a.area);q("#count").textContent=rows.length;q("#context").textContent=(state.city==="all"?"Across India":state.city)+" · "+(state.purpose==="rent"?"Rent":"Buy");q("#budgetLabel").textContent=state.purpose==="rent"?"monthly rent":"maximum sale price";q("#budgetValue").textContent=money(state.budget);q("#cards").innerHTML=rows.length?rows.map(card).join(""):"<div class=\"empty\"><div>⌂</div><h3>No homes match these filters.</h3><p>Try a wider budget, another city or fewer filters.</p><button class=\"primary\" id=\"emptyReset\">Reset filters</button></div>";qa("[data-save]").forEach(b=>b.onclick=()=>toggleSave(b.dataset.save));qa("[data-detail]").forEach(b=>b.onclick=()=>openDetail(b.dataset.detail));var er=q("#emptyReset");if(er)er.onclick=q("#reset").onclick;updateMap(rows)}
function toggleSave(id){if(state.saved.has(id))state.saved.delete(id);else state.saved.add(id);localStorage.setItem("ff-saved",JSON.stringify([...state.saved]));q("#savedCount").textContent=state.saved.size;render()}
async function openDetail(id){
  const listing=listings.find(item=>item.id===id);
  if(!listing)return;
  if(!authUser){pendingDetailId=id;showAuthForm("signin","Sign in or create a free account to continue to full property details.");return;}
  if(!authUser.phone_confirmed_at){pendingDetailId=id;beginPhoneVerification(authUser.phone||authUser.user_metadata?.phone||"");return;}
  const {data:usageData,error:usageError}=await authClient.rpc("get_my_contact_usage");
  if(usageError){showNotice("Membership status unavailable",usageError.message);return;}
  const usage=Array.isArray(usageData)?usageData[0]:usageData;
  if(!usage||!usage.contacts_limit){openPlans(id,"Choose a paid plan to unlock full details and verified owner contacts.");return;}
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id))){
    q("#modalBody").innerHTML="<div class='auth-panel'><span class='eyebrow'>SAMPLE PREVIEW</span><h2>This is a demo property</h2><p class='muted'>This sample is not a real home and has no real owner or phone number. Owner contacts will appear only on live, approved listings.</p><button class='primary wide' id='demoPlans'>View plans</button><button class='ghost wide' id='closeDetail'>Close</button></div>";
    q("#modal").hidden=false;q("#demoPlans").onclick=()=>{q("#modal").hidden=true;openPlans(id)};q("#closeDetail").onclick=()=>q("#modal").hidden=true;return;
  }
  const {data:details,error}=await authClient.rpc("reveal_owner_contact",{p_listing_id:id});
  if(error){
    const reason=error.message||"CONTACT_LOOKUP_FAILED";
    if(reason.includes("SUBSCRIPTION_REQUIRED")||reason.includes("CONTACT_LIMIT_REACHED")){openPlans(id,reason.includes("CONTACT_LIMIT_REACHED")?"You've used all owner contacts in this period. Upgrade for more.":"Choose a paid plan to unlock this property.");return;}
    if(reason.includes("PHONE_VERIFICATION_REQUIRED")){pendingDetailId=id;beginPhoneVerification(authUser.phone||authUser.user_metadata?.phone||"");return;}
    showNotice("Contact cannot be released",reason.includes("OWNER_CONTACT_NOT_VERIFIED")?"This owner's mobile number has not been verified yet.":reason);return;
  }
  const detail=Array.isArray(details)?details[0]:details;
  if(!detail)return;
  q("#modalBody").innerHTML="<div class='auth-panel'><span class='eyebrow'>VERIFIED OWNER CONTACT</span><h2>"+authEscape(detail.title)+"</h2><p class='muted'>"+authEscape([detail.locality,detail.city,detail.state].filter(Boolean).join(", "))+"</p><div class='detailstats'><b>"+Number(detail.bedrooms||0)+" BHK<small>Bedrooms</small></b><b>"+Number(detail.area_sqft||0).toLocaleString("en-IN")+" sq.ft<small>Area</small></b><b>"+authEscape(detail.purpose==="rent"?"Rent":"For sale")+"</b></div><p>"+authEscape(detail.description||"")+"</p><div class='notice'><b>Owner details</b><br>"+authEscape(detail.owner_name||"Verified owner")+"<br><strong>"+authEscape(detail.owner_phone)+"</strong></div><p class='auth-footnote'>Unique owners used: "+detail.contacts_used+" of "+detail.contacts_limit+" this billing period.</p><button class='primary wide' id='closeDetail'>Close</button>";
  q("#modal").hidden=false;q("#closeDetail").onclick=()=>q("#modal").hidden=true;
}

let map;
function updateMap(rows){if(!map)return;qa(".map-marker").forEach(x=>x.remove());rows.forEach(l=>{var el=document.createElement("button");el.className="map-marker";el.textContent=l.purpose==="rent"?money(l.price):money(l.price).replace("₹","₹");el.title=l.title;el.onclick=()=>{map.flyTo({center:[l.lng,l.lat],zoom:13});openDetail(l.id)};new maplibregl.Marker({element:el}).setLngLat([l.lng,l.lat]).addTo(map)})}
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
function updateAuthButton(){const signedIn=Boolean(authUser);q("#loginBtn").textContent=signedIn?"Account":"Sign in";if(window.parent!==window)window.parent.postMessage({type:"flat-finder:auth-state",signedIn,phoneVerified:Boolean(authUser?.phone_confirmed_at)},location.origin);}
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
        authUser=data.user;updateAuthButton();await beginPhoneVerification("+91"+digits);
      }else{
        const {data,error}=await authClient.auth.signInWithPassword({email,password});
        if(error)throw error;
        authUser=data.user;updateAuthButton();
        if(!authUser.phone_confirmed_at)await beginPhoneVerification(authUser.phone||authUser.user_metadata?.phone||"");
        else afterSignIn();
      }
    }catch(error){
      status.textContent=error?.message||"We could not complete that request. Please try again.";
      status.classList.add("error");submit.disabled=false;submit.textContent=creating?"Create account":"Sign in";
    }
  };
}
function afterSignIn(){updateAuthButton();q("#modal").hidden=true;if(pendingDetailId)openPlans(pendingDetailId);else if(window.parent!==window)window.parent.postMessage({type:"flat-finder:auth-complete"},location.origin);}
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
  q("#modalBody").innerHTML="<div class='auth-panel'><span class='eyebrow'>MOBILE VERIFICATION</span><h2>Enter your OTP</h2><p class='muted'>A 6-digit code is being sent to "+authEscape(phoneOtpNumber)+".</p><form id='phoneOtpForm' class='auth-form'><label>6-digit code<input name='token' type='text' inputmode='numeric' autocomplete='one-time-code' maxlength='6' pattern='[0-9]{6}' required placeholder='123456'></label><p id='phoneOtpMessage' class='auth-message' role='status' aria-live='polite'>Enter the SMS code to verify this number.</p><button class='primary wide' type='submit'>Verify mobile number</button><button class='ghost wide' id='resendPhoneOtp' type='button'>Send code again</button></form></div>";
  q("#modal").hidden=false;
  const form=q("#phoneOtpForm");
  form.onsubmit=async event=>{
    event.preventDefault();
    const submit=form.querySelector('[type="submit"]'),token=String(new FormData(form).get("token")||"").replace(/\D/g,"");
    if(token.length!==6){q("#phoneOtpMessage").textContent="Enter the 6-digit code.";q("#phoneOtpMessage").classList.add("error");return;}
    submit.disabled=true;submit.textContent="Verifying…";
    try{
      const {data,error}=await authClient.auth.verifyOtp({phone:phoneOtpNumber,token,type:"phone_change"});
      if(error)throw error;
      authUser=data.user||authUser;
      await authClient.from("profiles").update({phone:phoneOtpNumber}).eq("id",authUser.id);
      afterSignIn();
    }catch(error){
      q("#phoneOtpMessage").textContent=error?.message||"We couldn't verify that code.";
      q("#phoneOtpMessage").classList.add("error");submit.disabled=false;submit.textContent="Verify mobile number";
    }
  };
  q("#resendPhoneOtp").onclick=async()=>{
    try{const {error}=await authClient.auth.updateUser({phone:phoneOtpNumber});if(error)throw error;q("#phoneOtpMessage").textContent="A new code was requested.";q("#phoneOtpMessage").classList.remove("error");}
    catch(error){q("#phoneOtpMessage").textContent=error?.message||"We couldn't resend the code.";q("#phoneOtpMessage").classList.add("error");}
  };
  try{
    const {data,error}=await authClient.auth.updateUser({phone:phoneOtpNumber});
    if(error)throw error;
    if(data.user)authUser=data.user;
  }catch(error){
    q("#phoneOtpMessage").textContent=error?.message||"SMS could not start. The SMS provider may not be configured yet.";
    q("#phoneOtpMessage").classList.add("error");
  }
}
function showAuthAccount(){
  if(!authUser){showAuthForm("signin");return;}
  q("#modalBody").innerHTML="<div class='auth-panel'><span class='eyebrow'>FLAT FINDER ACCOUNT</span><h2>You're signed in</h2><p class='muted'>"+authEscape(authUser.email)+"</p><p class='auth-message'>Mobile "+(authUser.phone_confirmed_at?"verified":"not yet verified")+".</p><button class='primary wide' id='viewPlansNow' type='button'>View membership plans</button><button class='ghost wide' id='signOutBtn' type='button'>Sign out</button></div>";
  q("#modal").hidden=false;
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
    id:item.id,city:item.city,locality:item.city,title:item.title,purpose:item.purpose,
    type:item.property_type,bhk:item.bedrooms,bath:0,area:0,
    price:item.purpose==="rent"?Number(item.rent_inr||0):Number(item.sale_price_inr||0),
    deposit:0,furnishing:"",amenities:[],score:0,lat:null,lng:null,image:"",tag:"Approved",distance:""
  }));
  render();
}
loadApprovedListings();