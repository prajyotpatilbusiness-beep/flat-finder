export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  if(!process.env.OPENAI_API_KEY) return res.status(503).json({error:"AI model is not configured"});
  try{
    const body=req.body||{}, message=String(body.message||"").trim();
    if(!message) return res.status(400).json({error:"message is required"});
    const prompt=[
      "You are Flat Finder AI, a real-estate decision assistant for India.",
      "Use only supplied property records for property-specific facts. Never invent price, availability, distance, area, amenities or verification.",
      "Explain the strongest matches briefly and distinguish estimates from verified facts.",
      "User request: "+message,
      "Structured requirements and candidate properties: "+JSON.stringify({requirements:body.requirements||{},properties:body.properties||[]})
    ].join("\n\n");
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+process.env.OPENAI_API_KEY},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-6.2-sol",input:prompt})});
    if(!response.ok)return res.status(502).json({error:"OpenAI request failed"});
    const data=await response.json();return res.status(200).json({answer:data.output_text||""});
  }catch(error){return res.status(500).json({error:"AI request failed",detail:error?.message||"Unknown error"});}
}
