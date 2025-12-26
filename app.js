const grid = document.getElementById("grid");
const q = document.getElementById("q");
const category = document.getElementById("category");
const btnSearch = document.getElementById("btnSearch");
const btnClear = document.getElementById("btnClear");

const modal = document.getElementById("modal");
const mClose = document.getElementById("mClose");
const mTitle = document.getElementById("mTitle");
const mCover = document.getElementById("mCover");
const mMeta = document.getElementById("mMeta");
const mDesc = document.getElementById("mDesc");
const mBadge1 = document.getElementById("mBadge1");
const mBadge2 = document.getElementById("mBadge2");
const mDownload = document.getElementById("mDownload");

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function clamp(s, n=120){
  s = String(s ?? "");
  return s.length > n ? s.slice(0,n-1) + "…" : s;
}

async function fetchBooks(){
  const params = new URLSearchParams();
  if (q.value.trim()) params.set("q", q.value.trim());
  if (category.value.trim()) params.set("category", category.value.trim());

  const res = await fetch(`/api/books?${params.toString()}`);
  const data = await res.json();
  render(data);
}

function coverUrl(book){
  return book.hasCover ? `/api/books/${book.id}/cover` : "";
}

function render(books){
  grid.innerHTML = "";
  if (!books.length){
    grid.innerHTML = `<div style="grid-column: span 12; padding:10px 14px; color: rgba(233,236,241,.75);">
      هیچ کتێبێک نەدۆزرایەوە.
    </div>`;
    return;
  }

  for (const b of books){
    const card = document.createElement("div");
    card.className = "card";
    const cv = coverUrl(b);

    card.innerHTML = `
      <div class="cover">
        ${cv ? `<img src="${cv}" alt="وێنەی بەرگ">` : `<div class="small">وێنەی بەرگ نییە</div>`}
      </div>
      <div class="body">
        <div class="kicker">
          <span>نووسەر: <strong>${escapeHtml(b.author)}</strong></span>
          <span>ساڵ: <strong>${escapeHtml(b.year ?? "—")}</strong></span>
        </div>
        <h3>${escapeHtml(b.title)}</h3>
        <div class="desc">${escapeHtml(clamp(b.description ?? "—", 150))}</div>
        <div class="row">
          <span class="badge">${escapeHtml(b.category ?? "پۆل نییە")}</span>
          <span class="badge">${b.hasFile ? "فایل هەیە ✅" : "فایل نییە ❌"}</span>
          <button class="btn" data-id="${b.id}">بینین</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  }

  grid.querySelectorAll("button[data-id]").forEach(btn=>{
    btn.addEventListener("click", ()=> openModal(btn.getAttribute("data-id")));
  });
}

async function openModal(id){
  const res = await fetch(`/api/books/${id}`);
  if (!res.ok) return alert("نەتوانرا زانیاری کتێب وەرگیرێت");
  const b = await res.json();

  mTitle.textContent = b.title;
  mDesc.textContent = b.description || "—";
  mMeta.innerHTML = `
    <div><strong>نووسەر:</strong> ${escapeHtml(b.author)}</div>
    <div><strong>ساڵ:</strong> ${escapeHtml(b.year ?? "—")}</div>
    <div><strong>پۆل:</strong> ${escapeHtml(b.category ?? "—")}</div>
    <div><strong>دروستکراو:</strong> ${escapeHtml(b.created_at)}</div>
    <div><strong>نوێکراوە:</strong> ${escapeHtml(b.updated_at)}</div>
  `;

  if (b.hasCover){
    mCover.src = `/api/books/${b.id}/cover`;
    mCover.style.display = "block";
  } else {
    mCover.removeAttribute("src");
    mCover.style.display = "none";
  }

  mBadge1.textContent = b.hasFile ? "فایل: ئامادە ✅" : "فایل: نییە ❌";
  mBadge2.textContent = b.file_mime ? `جۆر: ${b.file_mime}` : "جۆر: —";

  if (b.hasFile){
    mDownload.href = `/api/books/${b.id}/file`;
    mDownload.style.pointerEvents = "auto";
    mDownload.style.opacity = "1";
    mDownload.textContent = "کردنەوە / داگرتن";
  } else {
    mDownload.href = "#";
    mDownload.style.pointerEvents = "none";
    mDownload.style.opacity = ".55";
    mDownload.textContent = "فایل نییە";
  }

  modal.classList.add("show");
}

function closeModal(){
  modal.classList.remove("show");
}

btnSearch.addEventListener("click", fetchBooks);
btnClear.addEventListener("click", ()=>{
  q.value = "";
  category.value = "";
  fetchBooks();
});
[q, category].forEach(el=>{
  el.addEventListener("keydown", (e)=>{ if (e.key === "Enter") fetchBooks(); });
});

mClose.addEventListener("click", closeModal);
modal.addEventListener("click", (e)=>{ if (e.target === modal) closeModal(); });

fetchBooks();
