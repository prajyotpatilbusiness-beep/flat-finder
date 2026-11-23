export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  if(!process.env.OPENAI_API_KEY) return res.status(503).json({error:"AI model is not configured"});

  try{
    const body=req.body||{};
    const message=String(body.message||"").trim();
    if(!message) return res.status(400).json({error:"message is required"});

    const requirements=body.requirements||{};
    const localProperties=Array.isArray(body.properties)?body.properties.slice(0,12):[];

    const schema={
      type:"object",
      additionalProperties:false,
      required:["answer","summary","recommendation","candidates","sources"],
      properties:{
        answer:{type:"string"},
        summary:{type:"string"},
        recommendation:{type:"string"},
        candidates:{
          type:"array",
          maxItems:8,
          items:{
            type:"object",
            additionalProperties:false,
            required:["title","location","price","currency","bedrooms","bathrooms","area","matchScore","confidence","sourceType","sourceUrl","why","verify","reasons","badge"],
            properties:{
              title:{type:"string"},
              location:{type:"string"},
              price:{type:["number","null"]},
              currency:{type:"string"},
              bedrooms:{type:"string"},
              bathrooms:{type:"string"},
              area:{type:"string"},
              matchScore:{type:"number"},
              confidence:{type:"string"},
              sourceType:{type:"string"},
              sourceUrl:{type:"string"},
              why:{type:"string"},
              verify:{type:"string"},
              reasons:{type:"array",items:{type:"string"}},
              badge:{type:"string"}
            }
          }
        },
        sources:{
          type:"array",
          maxItems:12,
          items:{
            type:"object",
            additionalProperties:false,
            required:["title","url"],
            properties:{title:{type:"string"},url:{type:"string"}}
          }
        }
      }
    };

    const instructions=[
      "You are Flat Finder AI, a GLOBAL real-estate research and decision assistant.",
      "Flat Finder is free during its launch period. Do not mention subscriptions or payments unless the user asks.",
      "The internet is the primary research layer. Search the web for current, relevant information before answering property-discovery questions.",
      "Prefer primary/authoritative sources when available: official developer/property pages, government or regulatory sources, official transit/infrastructure sources, and reputable listing pages.",
      "Never invent property facts, prices, addresses, amenities, distances, commute times, legal status, regulatory status, or availability.",
      "A candidate must be grounded in a source found during this research. Use a real source URL from the research for sourceUrl. If no reliable candidate can be found, return an empty candidates array instead of inventing one.",
      "Clearly distinguish source-reported facts from calculated estimates and recommendations.",
      "If sources disagree, say so in verify or recommendation.",
      "Respect website terms, robots restrictions, paywalls, authentication, and access controls. Do not bypass protections.",
      "Do not treat the supplied local/cached properties as verified current data; they are optional context only.",
      "Match the user's budget, location, purpose, bedrooms and stated priorities as closely as the evidence allows.",
      "Return concise, useful results for a property-search UI. Match scores are your recommendation scores, not factual measurements.",
      "If price is not supported by the source, set price to null. If a field is unavailable, use an honest value such as 'Not stated'.",
      "Return JSON matching the supplied schema."
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
      "OPTIONAL LOCAL/CACHED CANDIDATES:",
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
        input,
        text:{format:{type:"json_schema",name:"flat_finder_research",strict:true,schema}}
      })
    });

    if(!response.ok){
      const detail=await response.text().catch(()=> "");
      return res.status(502).json({error:"OpenAI web research request failed",detail:detail.slice(0,500)});
    }

    const data=await response.json();
    const raw=data.output_text||"";
    let structured;
    try{structured=JSON.parse(raw);}catch(e){
      return res.status(502).json({error:"Research response was not valid structured data"});
    }

    const sources=[];
    for(const item of (data.output||[])){
      for(const content of (item.content||[])){
        for(const ann of (content.annotations||[])){
          if(ann.type==="url_citation"&&ann.url&&!sources.some(s=>s.url===ann.url)){
            sources.push({title:ann.title||ann.url,url:ann.url});
          }
        }
      }
    }

    const mergedSources=[...(structured.sources||[])];
    for(const s of sources) if(!mergedSources.some(x=>x.url===s.url)) mergedSources.push(s);

    return res.status(200).json({
      ...structured,
      sources:mergedSources.slice(0,12),
      researchUsed:true
    });
  }catch(error){
    return res.status(500).json({error:"AI web research failed",detail:error?.message||"Unknown error"});
  }
}