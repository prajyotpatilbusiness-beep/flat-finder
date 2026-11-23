export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  if(!process.env.OPENAI_API_KEY) return res.status(503).json({error:"AI model is not configured"});

  try{
    const body=req.body||{};
    const message=String(body.message||"").trim();
    if(!message) return res.status(400).json({error:"message is required"});

    const requirements=body.requirements||{};
    const localProperties=Array.isArray(body.properties)?body.properties.slice(0,12):[];

    const instructions=[
      "You are Flat Finder AI, an India-focused real-estate research and decision assistant.",
      "The internet is your primary research layer. Search the web for current, relevant information before answering property-discovery questions.",
      "Prefer primary/authoritative sources when available: official developer/property pages, government or RERA sources, official transit/infrastructure sources, and reputable listing pages.",
      "Do not claim that a property is available, verified, current, or accurately priced unless the source supports that claim.",
      "Never invent property facts, prices, addresses, amenities, distances, commute times, legal status, RERA status, or availability.",
      "Clearly distinguish SOURCE-REPORTED facts, CALCULATED estimates, and your RECOMMENDATION.",
      "If sources disagree, say so and show the conflict rather than silently choosing one.",
      "Respect website terms, robots restrictions, paywalls, authentication, and access controls. Use search-indexed/publicly accessible information and do not bypass protections.",
      "For calculations, show the assumptions. Do not present estimates as official quotes.",
      "If the user asks for homes, return useful candidate properties or projects found during research, with source links where possible.",
      "Do not use the supplied local property records as the primary source; they are only optional context/fallback candidates.",
      "Answer in a practical format with: Best matches, Why they match, What to verify, and Sources when appropriate."
    ].join("\n");

    const input=[
      instructions,
      "",
      "USER REQUEST:",
      message,
      "",
      "STRUCTURED REQUIREMENTS:",
      JSON.stringify(requirements),
      "",
      "OPTIONAL LOCAL/CACHED CANDIDATES (do not treat as verified current data):",
      JSON.stringify(localProperties)
    ].join("\n");

    const response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":"Bearer "+process.env.OPENAI_API_KEY
      },
      body:JSON.stringify({
        model:process.env.OPENAI_MODEL||"gpt-6.2-sol",
        tools:[{type:"web_search"}],
        input
      })
    });

    if(!response.ok){
      const detail=await response.text().catch(()=> "");
      return res.status(502).json({error:"OpenAI web research request failed",detail:detail.slice(0,500)});
    }

    const data=await response.json();
    const sources=[];
    for(const item of (data.output||[])){
      for(const content of (item.content||[])){
        for(const ann of (content.annotations||[])){
          if(ann.type==="url_citation" && ann.url){
            if(!sources.some(s=>s.url===ann.url)){
              sources.push({title:ann.title||ann.url,url:ann.url});
            }
          }
        }
      }
    }

    return res.status(200).json({
      answer:data.output_text||"I completed the web research, but no answer text was returned.",
      sources:sources.slice(0,12),
      researchUsed:true
    });
  }catch(error){
    return res.status(500).json({error:"AI web research failed",detail:error?.message||"Unknown error"});
  }
}
