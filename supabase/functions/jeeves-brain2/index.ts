import { createClient } from "npm:@supabase/supabase-js@2.119.2";

const origins = new Set(["https://richiejeeves-eng.github.io","http://localhost:8000","http://127.0.0.1:8000"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const types = new Set(["fact","preference","event","goal","person","habit","task","reflection"]);
const json = (data: unknown, status=200, origin: string|null=null) => new Response(JSON.stringify(data), {
  status, headers: {
    "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store", "Vary":"Origin",
    "Access-Control-Allow-Origin": origin && origins.has(origin) ? origin : "https://richiejeeves-eng.github.io",
    "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods":"POST, OPTIONS"
  }
});
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v==="object" && !Array.isArray(v);

Deno.serve(async (req) => {
  const origin=req.headers.get("Origin");
  if(req.method==="OPTIONS") return new Response("ok",{headers:{
    "Access-Control-Allow-Origin":origin && origins.has(origin)?origin:"https://richiejeeves-eng.github.io",
    "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"
  }});
  if(req.method!=="POST") return json({error:"POST required"},405,origin);
  try {
    const auth=req.headers.get("Authorization")??"";
    const token=auth.match(/^Bearer\s+(.+)$/i)?.[1];
    if(!token) return json({error:"Sign in required"},401,origin);
    const raw=await req.text();
    if(new TextEncoder().encode(raw).byteLength>32000) return json({error:"Request too large"},413,origin);
    let body:Record<string,unknown>;
    try { const parsed=JSON.parse(raw); if(!isObj(parsed)) throw new Error(); body=parsed; }
    catch { return json({error:"Valid JSON object required"},400,origin); }
    const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{
      global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}
    });
    const {data:{user},error:authError}=await supabase.auth.getUser(token);
    if(authError||!user) return json({error:"Invalid or expired session"},401,origin);
    const action=body.action;
    if(action==="list"){
      const limit=Number.isInteger(body.limit)?Math.max(1,Math.min(Number(body.limit),100)):50;
      const {data,error}=await supabase.from("memories")
        .select("id,content,category,memory_type,importance,status,source,created_at,last_accessed_at,expires_at,pinned,sensitive,superseded_by")
        .eq("user_id",user.id).order("pinned",{ascending:false}).order("created_at",{ascending:false}).limit(limit);
      if(error) throw error;
      return json({items:data??[]},200,origin);
    }
    if(action==="search"){
      const query=typeof body.query==="string"?body.query.trim().slice(0,500):"";
      if(query.length<2) return json({error:"Enter at least two characters"},400,origin);
      const {data,error}=await supabase.rpc("search_memories",{search_text:query,max_results:Math.max(1,Math.min(Number(body.limit)||10,20))});
      if(error) throw error;
      return json({results:data??[]},200,origin);
    }
    if(action==="remember"){
      const content=typeof body.content==="string"?body.content.trim():"";
      if(!content||content.length>6000) return json({error:"Memory must be 1–6000 characters"},400,origin);
      const type=typeof body.memory_type==="string"&&types.has(body.memory_type)?body.memory_type:"fact";
      const importance=Number.isInteger(body.importance)?Math.max(1,Math.min(Number(body.importance),5)):3;
      const category=type;
      const row={content,category,memory_type:type,importance,status:"active",source:"user",
        pinned:body.pinned===true,sensitive:body.sensitive!==false,user_id:user.id};
      const {data,error}=await supabase.from("memories").insert(row)
        .select("id,content,category,memory_type,importance,status,source,created_at,pinned,sensitive").single();
      if(error) throw error;
      return json({saved:true,item:data},201,origin);
    }
    if(action==="sensitivity"){
      const id=typeof body.id==="string"?body.id:"";
      if(!uuid.test(id)||typeof body.sensitive!=="boolean") return json({error:"Valid memory ID and sensitivity value required"},400,origin);
      const {data,error}=await supabase.rpc("set_memory_sensitivity",{
        p_memory_id:id,p_sensitive:body.sensitive,p_confirm_review:body.confirm_review===true
      });
      if(error) {
        if(error.message?.includes("Explicit review confirmation")) return json({error:"Explicit review confirmation is required before sharing this memory with Brain 1."},403,origin);
        throw error;
      }
      if(data!==true) return json({error:"Memory not found"},404,origin);
      return json({updated:true,sensitive:body.sensitive},200,origin);
    }
    if(action==="update"||action==="pin"||action==="archive"||action==="restore"||action==="delete"||action==="resolve"){
      const id=typeof body.id==="string"?body.id:"";
      if(!uuid.test(id)) return json({error:"Valid memory id required"},400,origin);
      if(action==="delete"&&body.confirm_delete!==true) return json({error:"Explicit confirmation required"},403,origin);
      if(action==="update"){
        const content=typeof body.content==="string"?body.content.trim():"";
        if(!content||content.length>6000) return json({error:"Memory must be 1–6000 characters"},400,origin);
        const patch:Record<string,unknown>={content};
        if(typeof body.memory_type==="string"&&types.has(body.memory_type)) {patch.memory_type=body.memory_type;patch.category=body.memory_type;}
        if(Number.isInteger(body.importance)) patch.importance=Math.max(1,Math.min(Number(body.importance),5));
        if(typeof body.sensitive==="boolean") patch.sensitive=body.sensitive;
        const {data,error}=await supabase.from("memories").update(patch).eq("id",id).eq("user_id",user.id).select("id,content,memory_type,importance,sensitive,status").maybeSingle();
        if(error) throw error; if(!data) return json({error:"Memory not found"},404,origin);
        return json({updated:true,item:data},200,origin);
      }
      if(action==="pin"){
        if(typeof body.pinned!=="boolean") return json({error:"pinned boolean required"},400,origin);
        const {data,error}=await supabase.from("memories").update({pinned:body.pinned}).eq("id",id).eq("user_id",user.id).select("id,pinned").maybeSingle();
        if(error) throw error; if(!data) return json({error:"Memory not found"},404,origin);
        return json({updated:true,item:data},200,origin);
      }
      if(action==="archive"){
        const {data,error}=await supabase.from("memories").update({status:"archived"}).eq("id",id).eq("user_id",user.id).select("id,status").maybeSingle();
        if(error) throw error; if(!data) return json({error:"Memory not found"},404,origin);
        return json({updated:true,item:data},200,origin);
      }
      if(action==="restore"){
        const {data,error}=await supabase.from("memories").update({status:"active",superseded_by:null}).eq("id",id).eq("user_id",user.id).eq("status","archived").select("id,status").maybeSingle();
        if(error) throw error; if(!data) return json({error:"Archived memory not found"},404,origin);
        return json({updated:true,item:data},200,origin);
      }
      if(action==="resolve"){
        const other=typeof body.superseded_id==="string"?body.superseded_id:"";
        if(!uuid.test(other)||other===id) return json({error:"A different valid superseded_id is required"},400,origin);
        const {data:chosen,error:e1}=await supabase.from("memories").update({status:"active",superseded_by:null}).eq("id",id).eq("user_id",user.id).select("id").maybeSingle();
        if(e1) throw e1; if(!chosen) return json({error:"Chosen memory not found"},404,origin);
        const {data:old,error:e2}=await supabase.from("memories").update({status:"archived",superseded_by:id}).eq("id",other).eq("user_id",user.id).select("id").maybeSingle();
        if(e2) throw e2; if(!old) return json({error:"Other memory not found for this account"},404,origin);
        return json({resolved:true},200,origin);
      }
      const {data,error}=await supabase.from("memories").delete().eq("id",id).eq("user_id",user.id).select("id").maybeSingle();
      if(error) throw error; if(!data) return json({error:"Memory not found"},404,origin);
      return json({deleted:true},200,origin);
    }
    if(action==="link"){
      const from=String(body.from_memory_id??""),to=String(body.to_memory_id??""),relation=String(body.relation??"").trim().slice(0,80);
      if(!uuid.test(from)||!uuid.test(to)||from===to||!relation) return json({error:"Two different memory IDs and a relation are required"},400,origin);
      const {data,error}=await supabase.from("memory_links").insert({user_id:user.id,from_memory_id:from,to_memory_id:to,relation})
        .select("id,from_memory_id,to_memory_id,relation,created_at").single();
      if(error) throw error; return json({linked:true,link:data},201,origin);
    }
    if(action==="links"){
      const id=typeof body.id==="string"?body.id:"";
      if(!uuid.test(id)) return json({error:"Valid memory id required"},400,origin);
      const {data,error}=await supabase.from("memory_links").select("id,from_memory_id,to_memory_id,relation,created_at")
        .eq("user_id",user.id).or("from_memory_id.eq."+id+",to_memory_id.eq."+id).order("created_at",{ascending:false}).limit(50);
      if(error) throw error; return json({links:data??[]},200,origin);
    }
    if(action==="unlink"){
      const id=typeof body.id==="string"?body.id:"";
      if(!uuid.test(id)) return json({error:"Valid link id required"},400,origin);
      const {data,error}=await supabase.from("memory_links").delete().eq("id",id).eq("user_id",user.id).select("id").maybeSingle();
      if(error) throw error; if(!data) return json({error:"Link not found"},404,origin);
      return json({unlinked:true},200,origin);
    }
    return json({error:"Unknown action"},400,origin);
  } catch(error) {
    // Do not log memory text, health information, tokens, or database row contents.
    console.error("Brain 2 request failed:",error instanceof Error?error.message:"unknown error");
    return json({error:"Memory service unavailable. Check that the Brain 2 migration has been applied."},503,origin);
  }
});
