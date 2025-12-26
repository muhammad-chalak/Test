const form = document.getElementById("form");
const bookId = document.getElementById("bookId");
const titleEl = document.getElementById("title");
const authorEl = document.getElementById("author");
const yearEl = document.getElementById("year");
const categoryEl = document.getElementById("category");
const descriptionEl = document.getElementById("description");
const fileEl = document.getElementById("file");
const coverEl = document.getElementById("cover");
const removeFileEl = document.getElementById("removeFile");
const removeCoverEl = document.getElementById("removeCover");
const btnReset = document.getElementById("btnReset");

const qEl = document.getElementById("q");
const btnRefresh = document.getElementById("btnRefresh");
const tbody = document.querySelector("#table tbody");

btnRefresh.addEventListener("click", load);
qEl.addEventListener("keydown", (e)=>{ if(e.key==="Enter") load(); });
btnReset.addEventListener("click", resetForm);

function resetForm(){
  bookId.value = "";
  titleEl.value = "";
  authorEl.value = "";
  yearEl.value = "";
  categoryEl.value = "";
  descriptionEl.value = "";
  fileEl.value = "";
  coverEl.value = "";
  removeFileEl.checked = false;
  removeCoverEl.checked = false;
}

function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

async function load(){
  const params = new URLSearchParams();
  if (qEl.value.trim()) params.set("q", qEl.value.trim());

  const res = await fetch(`/api/books?${params.toString()}`);
  const books = await res.json();

  tbody.innerHTML = "";
  for (const b of books){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${b.id}</td>
      <td><strong>${esc(b.title)}</strong></td>
      <td>${esc(b.author)}</td>
      <td>${esc(b.category ?? "—")}</td>
      <td>${b.hasFile ? "✅" : "❌"}</td>
      <td>${b.hasCover ? "✅" : "❌"}</td>
      <td>
        <button class="btn ghost" data-edit="${b.id}">دەستکاری</button>
        <button class="btn danger" data-del="${b.id}">سڕینەوە</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("button[data-edit]").forEach(btn=>{
    btn.addEventListener("click", ()=> startEdit(btn.getAttribute("data-edit")));
  });
  tbody.querySelectorAll("button[data-del]").forEach(btn=>{
    btn.addEventListener("click", ()=> del(btn.getAttribute("data-del")));
  });
}

async function startEdit(id){
  const res = await fetch(`/api/books/${id}`);
  if (!res.ok) return alert("نەتوانرا زانیاری وەرگیرێت");
  const b = await res.json();

  bookId.value = b.id;
  titleEl.value = b.title || "";
  authorEl.value = b.author || "";
  yearEl.value = b.year ?? "";
  categoryEl.value = b.category || "";
  descriptionEl.value = b.description || "";
  fileEl.value = "";
  coverEl.value = "";
  removeFileEl.checked = false;
  removeCoverEl.checked = false;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function del(id){
  if (!confirm(`دڵنیایت لە سڕینەوەی کتێب #${id} ؟`)) return;

  const res = await fetch(`/api/books/${id}`, { method: "DELETE" });
  const data = await res.json().catch(()=> ({}));
  if (!res.ok) return alert(data.error || "هەڵە");
  await load();
}

form.addEventListener("submit", async (e)=>{
  e.preventDefault();

  if (!titleEl.value.trim() || !authorEl.value.trim()){
    return alert("ناونیشان و نووسەر پێویستن");
  }

  const fd = new FormData();
  fd.append("title", titleEl.value.trim());
  fd.append("author", authorEl.value.trim());
  fd.append("year", yearEl.value.trim());
  fd.append("category", categoryEl.value.trim());
  fd.append("description", descriptionEl.value.trim());
  if (fileEl.files[0]) fd.append("file", fileEl.files[0]);
  if (coverEl.files[0]) fd.append("cover", coverEl.files[0]);
  fd.append("removeFile", removeFileEl.checked ? "1" : "0");
  fd.append("removeCover", removeCoverEl.checked ? "1" : "0");

  const id = bookId.value.trim();
  const url = id ? `/api/books/${id}` : "/api/books";
  const method = id ? "PUT" : "POST";

  const res = await fetch(url, { method, body: fd });
  const data = await res.json().catch(()=> ({}));
  if (!res.ok) return alert(data.error || "هەڵە");

  resetForm();
  await load();
  alert("سەرکەوتوو بوو ✅");
});

load();
