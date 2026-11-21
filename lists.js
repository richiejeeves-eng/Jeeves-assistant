window.jeevesListCache = window.jeevesListCache || {};
async function getListRows(key, query, force) {
  const cached = window.jeevesListCache[key];
  if (!force && cached && Date.now() - cached.time < 30000) return { data: cached.data, error: null };
  const result = await query();
  if (!result.error) window.jeevesListCache[key] = { data: result.data || [], time: Date.now() };
  return result;
}
function invalidateListCache(key) { if (window.jeevesListCache) delete window.jeevesListCache[key]; }

async function showMemories() {
  if (!(await requireSession())) return;
  const invoke = async (action, payload = {}) => {
    const { data, error } = await db.functions.invoke("jeeves-brain2", { body: { action, ...payload } });
    if (error) throw new Error(data?.error || error.message || "Memory service unavailable");
    if (data?.error) throw new Error(data.error);
    return data;
  };
  let items = [];
  try { const result = await invoke("list", { limit: 100 }); items = result.items || []; }
  catch (error) { addMessage("Brain 2: " + error.message, "bot"); return; }

  const box = addMessage("JEEVES BRAIN 2 · MEMORY & KNOWLEDGE", "bot");
  box.classList.add("memory-manager");
  const intro = document.createElement("p");
  intro.textContent = "Your long-term knowledge base. Search, classify, connect and maintain memories. Unreviewed memories are treated as sensitive by default.";
  box.appendChild(intro);

  const toolbar = document.createElement("div");
  toolbar.className = "memory-toolbar";
  const search = document.createElement("input");
  search.type = "search"; search.placeholder = "Search saved knowledge…"; search.setAttribute("aria-label","Search saved knowledge");
  const filter = document.createElement("select");
  filter.setAttribute("aria-label","Filter memory status");
  [["","All statuses"],["active","Active"],["archived","Archived"],["conflict","Conflicts"]].forEach(([v,t])=>{const o=document.createElement("option");o.value=v;o.textContent=t;filter.appendChild(o);});
  const typeFilter = document.createElement("select");
  typeFilter.setAttribute("aria-label","Filter memory type");
  [["","All types"],["fact","Fact"],["preference","Preference"],["event","Event"],["goal","Goal"],["person","Person"],["habit","Habit"],["task","Task"],["reflection","Reflection"]].forEach(([v,t])=>{const o=document.createElement("option");o.value=v;o.textContent=t;typeFilter.appendChild(o);});
  const add = makeButton("+ Remember", async () => {
    const content=window.prompt("What should Jeeves remember?");
    if(!content||!content.trim()) return;
    const memory_type=(window.prompt("Type: fact, preference, event, goal, person, habit, task or reflection","fact")||"fact").trim().toLowerCase();
    if(!["fact","preference","event","goal","person","habit","task","reflection"].includes(memory_type)){addNote("Unknown memory type. Nothing saved.");return;}
    const importance=Number(window.prompt("Importance from 1 (low) to 5 (critical)","3")||"3");
    const sensitive=window.confirm("Treat this memory as sensitive? Choose OK to protect it; Cancel only if it is clearly non-sensitive.");
    try { await invoke("remember",{content:content.trim(),memory_type,importance:Number.isFinite(importance)?importance:3,sensitive}); addNote("Memory saved."); await refresh(); }
    catch(error){addNote("Could not save memory: "+error.message);}
  });
  const refreshButton=makeButton("Refresh",refresh);
  const searchAll=makeButton("Search all",async()=>{
    if(search.value.trim().length<2){addNote("Enter at least two characters to search.");return;}
    try{
      const result=await invoke("search",{query:search.value.trim(),limit:15});
      list.textContent="";
      count.textContent=(result.results||[]).length+" matching memories from secure full-text retrieval";
      (result.results||[]).forEach(item=>{
        const row=document.createElement("article");row.className="memory-row";
        const details=document.createElement("div");details.className="memory-details";
        const content=document.createElement("p");content.textContent=item.content;
        const meta=document.createElement("small");meta.className="memory-date";meta.textContent="Matched by text relevance · "+(item.created_at?new Date(item.created_at).toLocaleDateString():"");
        details.append(content,meta);row.append(details);list.appendChild(row);
      });
      if(!(result.results||[]).length){const empty=document.createElement("p");empty.textContent="No matching non-sensitive active memories found.";list.appendChild(empty);}
    }catch(error){addNote("Search failed: "+error.message);}
  });
  toolbar.append(search,filter,typeFilter,searchAll,add,refreshButton); box.appendChild(toolbar);
  const count=document.createElement("p");count.className="memory-count";box.appendChild(count);
  const list=document.createElement("div");list.className="memory-list";box.appendChild(list);

  async function refresh(){
    try { const result=await invoke("list",{limit:100});items=result.items||[];render(); }
    catch(error){addNote("Could not refresh memories: "+error.message);}
  }
  function actionButton(label,fn){const b=makeButton(label,fn);return b;}
  async function runAction(label,fn){try{await fn();addNote(label);await refresh();}catch(error){addNote("Action failed: "+error.message);}}
  function render(){
    list.textContent="";
    const term=search.value.trim().toLowerCase();
    const visible=items.filter(m=>(!filter.value||m.status===filter.value)&&(!typeFilter.value||m.memory_type===typeFilter.value)&&(!term||String(m.content||"").toLowerCase().includes(term)||String(m.memory_type||"").includes(term)));
    count.textContent=visible.length+" shown · "+items.length+" loaded · "+items.filter(m=>m.pinned).length+" pinned";
    if(!visible.length){const empty=document.createElement("p");empty.textContent="No matching memories. Use Remember to add durable knowledge.";list.appendChild(empty);return;}
    visible.forEach(item=>{
      const row=document.createElement("article");row.className="memory-row";
      const details=document.createElement("div");details.className="memory-details";
      const tag=document.createElement("small");tag.className="memory-category";tag.textContent=(item.memory_type||item.category||"fact")+" · "+(item.status||"active")+(item.sensitive?" · sensitive":"");
      const content=document.createElement("p");content.textContent=item.content;
      const meta=document.createElement("small");meta.className="memory-date";meta.textContent="Importance "+item.importance+" / 5 · "+(item.created_at?new Date(item.created_at).toLocaleDateString():"")+(item.pinned?" · pinned":"");
      details.append(tag,content,meta);
      const actions=document.createElement("div");actions.className="memory-actions";
      actions.append(
        actionButton("Edit",async()=>{const text=window.prompt("Edit memory",item.content);if(text===null||!text.trim())return;await runAction("Memory updated.",()=>invoke("update",{id:item.id,content:text.trim(),memory_type:item.memory_type,importance:item.importance,sensitive:item.sensitive}));}),
        actionButton(item.sensitive?"Mark non-sensitive":"Mark sensitive",()=>{if(item.sensitive&&!window.confirm("Confirm this memory contains no health, financial, relationship, identity or other private information. Allow it to be used in Gemini context?"))return;return runAction(item.sensitive?"Memory marked non-sensitive.":"Memory protected.",()=>invoke("update",{id:item.id,content:item.content,memory_type:item.memory_type,importance:item.importance,sensitive:!item.sensitive}));}),
        actionButton(item.pinned?"Unpin":"Pin",()=>runAction(item.pinned?"Memory unpinned.":"Memory pinned.",()=>invoke("pin",{id:item.id,pinned:!item.pinned}))),
        item.status==="archived"
          ? actionButton("Restore",()=>runAction("Memory restored.",()=>invoke("restore",{id:item.id})))
          : actionButton("Archive",()=>{if(window.confirm("Archive this memory?"))return runAction("Memory archived.",()=>invoke("archive",{id:item.id}));}),
        actionButton("Link",async()=>{
          const choices=items.filter(m=>m.id!==item.id&&m.status==="active");
          if(!choices.length){addNote("Add another active memory before creating a link.");return;}
          const menu=choices.map((m,i)=>(i+1)+". "+String(m.content||"").slice(0,100)).join("\n");
          const selected=window.prompt("Choose the memory number to link:\n"+menu);
          if(selected===null)return;
          const index=Number(selected)-1;
          if(!Number.isInteger(index)||index<0||index>=choices.length){addNote("Invalid memory selection.");return;}
          const relation=window.prompt("How are these memories related?","related_to");
          if(!relation||!relation.trim())return;
          await runAction("Memories linked.",()=>invoke("link",{from_memory_id:item.id,to_memory_id:choices[index].id,relation:relation.trim()}));
        }),
        actionButton("Links",async()=>{try{const result=await invoke("links",{id:item.id});const links=result.links||[];const panel=addMessage("MEMORY CONNECTIONS", "bot");panel.classList.add("memory-manager");if(!links.length){panel.appendChild(document.createTextNode("No links for this memory."));return;}links.forEach(link=>{const line=document.createElement("div");line.className="memory-row";const label=document.createElement("span");label.textContent=link.relation+" · "+link.from_memory_id+" → "+link.to_memory_id;const remove=makeButton("Unlink",()=>runAction("Memory link removed.",()=>invoke("unlink",{id:link.id})));line.append(label,remove);panel.appendChild(line);});}catch(error){addNote(error.message);}}),
        actionButton("Delete",()=>{if(window.confirm("Permanently delete this memory?"))return runAction("Memory deleted.",()=>invoke("delete",{id:item.id,confirm_delete:true}));})
      );
      if(item.status==="conflict") actions.append(actionButton("Resolve",async()=>{const other=window.prompt("ID of the memory this one supersedes");if(!other)return;await runAction("Conflict resolved.",()=>invoke("resolve",{id:item.id,superseded_id:other.trim()}));}));
      row.append(details,actions);list.appendChild(row);
    });
  }
  search.addEventListener("input",render);filter.addEventListener("change",render);typeFilter.addEventListener("change",render);
  render();scrollChat();
}

async function showTasks(filter = "open") {
  if (!(await requireSession())) return;

  const { data, error } = await getListRows("tasks", () => db
    .from("tasks")
    .select("id, title, due_at, source, google_task_id, google_tasklist_id, group_name")
    .eq("status", "pending")
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(200));

  if (error) {
    addMessage("Task error: " + error.message, "bot");
    return;
  }

  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const matching = data.filter(function (task) {
    if (!task.due_at) return filter === "open";
    const due = new Date(task.due_at);
    if (filter === "overdue") return due < now;
    if (filter === "today") return due >= start && due < end;
    return true;
  });
  const headingText = filter === "overdue" ? "OVERDUE TASKS" : filter === "today" ? "TASKS DUE TODAY" : "YOUR OPEN TASKS";
  if (matching.length === 0) {
    addMessage(filter === "overdue" ? "No overdue tasks." : filter === "today" ? "No tasks due today." : "No pending tasks.", "bot");
    scrollChat();
    return;
  }

  const box = addMessage(headingText, "bot");
  box.classList.add("task-groups");

  const groups = new Map();
  matching.forEach(function (task) {
    const group = task.group_name || (task.source === "google_tasks" ? "Google Tasks" : "Jeeves tasks");
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(task);
  });

  groups.forEach(function (tasks, groupName) {
    const section = document.createElement("section");
    section.className = "task-group";

    const heading = document.createElement("h3");
    heading.className = "task-group-heading";
    heading.textContent = groupName + " (" + tasks.length + ")";
    section.appendChild(heading);

    tasks.forEach(function (task) {
      const row = document.createElement("div");
      row.className = "taskrow";

      const label = document.createElement("span");
      let text = "• " + task.title;
      if (task.due_at) text += "\n   due " + new Date(task.due_at).toLocaleString();
      label.textContent = text + (task.source === "google_tasks" ? "\n   ↳ Google Tasks" : "");

      const buttons = document.createElement("div");

      const doneButton = makeButton("Done", async function () {
        if (task.google_task_id && task.google_tasklist_id) {
          const remote = await db.functions.invoke("google-calendar", {
            body: { action: "completeTask", google_task_id: task.google_task_id, google_tasklist_id: task.google_tasklist_id }
          });
          if (remote.error) {
            addMessage("Could not complete Google Task: " + remote.error.message, "bot");
            return;
          }
        }
        const { error: updateError } = await db.from("tasks").update({ status: "done" }).eq("id", task.id);
        invalidateListCache("tasks");
        if (updateError) {
          addMessage("Task error: " + updateError.message, "bot");
          return;
        }
        label.className = "done";
        buttons.remove();
        if (typeof speak === "function") speak("Completed: " + task.title);
        checkAlerts();
      });

      const deleteButton = makeButton("Delete", async function () {
        if (!confirm("Delete this task?")) return;
        if (task.source === "google_tasks") {
          const remote = await db.functions.invoke("google-calendar", { body: { action: "deleteTask", task_id: task.id } });
          if (remote.error || remote.data?.error) {
            addMessage("Google Task delete failed: " + (remote.data?.error || remote.error.message), "bot");
            return;
          }
        } else {
          const { error: deleteError } = await db.from("tasks").delete().eq("id", task.id);
          if (deleteError) {
            addMessage("Task error: " + deleteError.message, "bot");
            return;
          }
        }
        invalidateListCache("tasks");
        row.remove();
        heading.textContent = groupName + " (" + section.querySelectorAll(".taskrow").length + ")";
        checkAlerts();
      });

      buttons.append(doneButton, deleteButton);
      row.append(label, buttons);
      section.appendChild(row);
    });

    box.appendChild(section);
  });
  scrollChat();
}

document.getElementById("command").addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    send();
  }
});

setInterval(checkAlerts, 60000);

addMessage("JARVIS online. How can I help?", "bot");