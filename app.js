/* Premium Tafsir Reader — PDF.js + search + bookmarks + notes (offline local) */

const $ = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => Array.from(el.querySelectorAll(q));

const PDF_URL = "assets/tafsir-nami.pdf";

const state = {
  pdf: null,
  page: 1,
  pageCount: 0,
  scale: 1.0,
  fitMode: "width", // width | page
  theme: "dark",
  defaultZoom: 100,
  preload: false,
  rendering: false,
  pendingPage: null,
};

const els = {
  drawer: $("#drawer"),
  btnMenu: $("#btnMenu"),
  btnCloseDrawer: $("#btnCloseDrawer"),
  tabs: $$(".tab"),
  panels: {
    toc: $("#panel-toc"),
    bookmarks: $("#panel-bookmarks"),
    notes: $("#panel-notes"),
  },

  canvas: $("#pdfCanvas"),
  textLayer: $("#textLayer"),
  status: $("#status"),
  statusSub: $("#statusSub"),

  btnPrev: $("#btnPrev"),
  btnNext: $("#btnNext"),
  pageNumber: $("#pageNumber"),
  pageCount: $("#pageCount"),
  zoomLabel: $("#zoomLabel"),
  btnZoomIn: $("#btnZoomIn"),
  btnZoomOut: $("#btnZoomOut"),
  btnFit: $("#btnFit"),
  progressBar: $("#progressBar"),

  btnTheme: $("#btnTheme"),
  btnSettings: $("#btnSettings"),
  settingsModal: $("#settingsModal"),
  searchModal: $("#searchModal"),
  btnSearch: $("#btnSearch"),
  btnDoSearch: $("#btnDoSearch"),
  btnBuildIndex: $("#btnBuildIndex"),
  searchInput: $("#searchInput"),
  searchResults: $("#searchResults"),
  searchStatus: $("#searchStatus"),

  toc: $("#toc"),

  btnBookmark: $("#btnBookmark"),
  noteText: $("#noteText"),
  notePage: $("#notePage"),
  noteStatus: $("#noteStatus"),
  btnClearNote: $("#btnClearNote"),
  noteList: $("#noteList"),

  bookmarkList: $("#bookmarkList"),
  btnExport: $("#btnExport"),
  importFile: $("#importFile"),
  btnReset: $("#btnReset"),

  btnShare: $("#btnShare"),
};

const storage = {
  get(k, fallback){
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(k, v){
    localStorage.setItem(k, JSON.stringify(v));
  }
};

function setTheme(theme){
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  storage.set("theme", theme);
  // update segmented buttons
  $$(".segBtn").forEach(b => b.classList.toggle("isActive", b.dataset.theme === theme));
}

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function showStatus(on, text){
  els.status.hidden = !on;
  if(text) els.statusSub.textContent = text;
}

function toast(msg){
  // lightweight toast using status bar
  els.noteStatus.textContent = msg;
  els.noteStatus.style.opacity = "1";
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>{ els.noteStatus.style.opacity = ".85"; }, 2200);
}

/** IndexedDB tiny helper (no deps) */
const idb = (() => {
  const DB_NAME = "tafsir_reader_db";
  const DB_VER = 1;
  const STORE = "pageText";
  let _db = null;

  function open(){
    if(_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if(!db.objectStoreNames.contains(STORE)){
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  async function get(key){
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const st = tx.objectStore(STORE);
      const rq = st.get(key);
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    });
  }

  async function set(key, val){
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put(val, key);
    });
  }

  async function clear(){
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const rq = tx.objectStore(STORE).clear();
      rq.onsuccess = () => resolve(true);
      rq.onerror = () => reject(rq.error);
    });
  }

  return { get, set, clear };
})();

function getBookmarks(){
  return storage.get("bookmarks", []);
}
function setBookmarks(list){
  storage.set("bookmarks", list);
  renderBookmarks();
}
function getNotes(){
  return storage.get("notes", {}); // {page: text}
}
function setNotes(obj){
  storage.set("notes", obj);
  renderNoteList();
}

function pageKey(p){ return `p:${p}`; }

async function loadPdf(){
  showStatus(true, "کتێب بار دەکرێت…");
  const loadingTask = pdfjsLib.getDocument({
    url: PDF_URL,
    withCredentials: false
  });

  state.pdf = await loadingTask.promise;
  state.pageCount = state.pdf.numPages;
  els.pageCount.textContent = state.pageCount;

  // Restore state
  state.page = storage.get("lastPage", 1);
  state.defaultZoom = storage.get("defaultZoom", 100);
  state.preload = storage.get("preload", false);
  $("#defaultZoom").value = state.defaultZoom;
  $("#preloadToggle").checked = state.preload;

  await loadOutline();
  await goToPage(clamp(state.page, 1, state.pageCount), { silent: true });

  showStatus(false);

  // Preload neighbors if enabled
  if(state.preload) preloadNeighbors();
}

async function loadOutline(){
  try{
    const outline = await state.pdf.getOutline();
    if(!outline || !outline.length){
      els.toc.innerHTML = `<div class="muted">هیچ Outline ـێک نەدۆزرایەوە. دەتوانیت بە گەڕان و پەڕە بگەڕێیت.</div>`;
      return;
    }
    els.toc.innerHTML = "";
    const frag = document.createDocumentFragment();

    const renderNode = (node, depth=0) => {
      const item = document.createElement("div");
      item.className = "tocItem";
      item.style.marginInlineStart = `${depth * 10}px`;
      item.innerHTML = `
        <div class="tocTitle">${escapeHtml(node.title || "—")}</div>
        <div class="tocMeta">کلیک بکە بۆ چوون</div>
      `;
      item.addEventListener("click", async () => {
        try{
          const dest = await state.pdf.getDestination(node.dest);
          const pageIndex = await state.pdf.getPageIndex(dest[0]);
          await goToPage(pageIndex + 1);
          closeDrawerMobile();
        }catch(e){
          toast("نەتوانرا چوون بۆ ئەم بەشە.");
        }
      });
      frag.appendChild(item);
      if(node.items && node.items.length){
        node.items.forEach(ch => renderNode(ch, depth+1));
      }
    };

    outline.forEach(n => renderNode(n, 0));
    els.toc.appendChild(frag);
  }catch(e){
    els.toc.innerHTML = `<div class="muted">Outline نەتوانرا بخوێنرێتەوە.</div>`;
  }
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function computeScale(viewport){
  // fit width by default
  const stage = $(".pdfStage");
  const padding = 32; // stage padding
  const maxW = stage.clientWidth - padding;
  const maxH = stage.clientHeight - padding;
  if(state.fitMode === "page"){
    const sW = maxW / viewport.width;
    const sH = maxH / viewport.height;
    return Math.min(sW, sH);
  }
  // width
  return maxW / viewport.width;
}

async function renderPage(num){
  if(state.rendering){
    state.pendingPage = num;
    return;
  }
  state.rendering = true;

  const page = await state.pdf.getPage(num);

  // Base viewport
  const baseViewport = page.getViewport({ scale: 1.0 });

  // Determine scale
  const fitScale = computeScale(baseViewport);
  const scaleFromZoom = (state.defaultZoom / 100);
  // Blend: keep fitScale as base then multiply with zoom scale relative to 1
  state.scale = fitScale * scaleFromZoom;

  const viewport = page.getViewport({ scale: state.scale });

  // Canvas size
  const canvas = els.canvas;
  const context = canvas.getContext("2d", { alpha: false });
  const outputScale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  context.setTransform(outputScale, 0, 0, outputScale, 0, 0);

  // Clear text layer
  els.textLayer.innerHTML = "";
  els.textLayer.style.width = `${Math.floor(viewport.width)}px`;
  els.textLayer.style.height = `${Math.floor(viewport.height)}px`;

  showStatus(true, `پەڕە ${num} لە ${state.pageCount} بار دەکرێت…`);

  // Render
  const renderTask = page.render({ canvasContext: context, viewport });
  await renderTask.promise;

  // Text layer (for selection/search accuracy if needed)
  try{
    const textContent = await page.getTextContent();
    await pdfjsLib.renderTextLayer({
      textContent,
      container: els.textLayer,
      viewport,
      textDivs: [],
      enhanceTextSelection: false
    }).promise;
  }catch(_){ /* ignore */ }

  // UI updates
  els.pageNumber.value = num;
  els.notePage.textContent = num;
  els.zoomLabel.textContent = `${Math.round(state.defaultZoom)}%`;
  storage.set("lastPage", num);
  updateProgress();

  // Load note
  loadNoteForPage(num);

  showStatus(false);
  state.rendering = false;

  // Preload neighbors
  if(state.preload) preloadNeighbors();

  // If render was requested while busy
  if(state.pendingPage && state.pendingPage !== num){
    const p = state.pendingPage;
    state.pendingPage = null;
    await renderPage(p);
  }else{
    state.pendingPage = null;
  }
}

function updateProgress(){
  const pct = state.pageCount ? (state.page / state.pageCount) * 100 : 0;
  els.progressBar.style.width = `${pct}%`;
}

async function goToPage(num, {silent=false} = {}){
  num = clamp(parseInt(num, 10) || 1, 1, state.pageCount || 1);
  state.page = num;
  if(!silent){
    // keep drawer notes synced
    els.notePage.textContent = num;
  }
  await renderPage(num);
}

function preloadNeighbors(){
  // Warm up text cache for search + smoother nav: current-1, current+1
  const targets = [state.page-1, state.page+1].filter(p => p>=1 && p<=state.pageCount);
  targets.forEach(p => cachePageText(p).catch(()=>{}));
}

async function cachePageText(pageNum){
  const key = pageKey(pageNum);
  const cached = await idb.get(key);
  if(cached) return cached;

  const page = await state.pdf.getPage(pageNum);
  const textContent = await page.getTextContent();
  const text = textContent.items.map(it => it.str).join(" ").replace(/\s+/g," ").trim();
  await idb.set(key, text);
  return text;
}

/** Search */
async function doSearch(query){
  query = (query || "").trim();
  if(!query){
    els.searchStatus.textContent = "هیچ وشەیەک نەنووسراوە.";
    return;
  }
  els.searchResults.innerHTML = "";
  els.searchStatus.textContent = "گەڕان دەکرێت…";
  const q = query.toLowerCase();

  const hits = [];
  // Fast path: scan cached first; if missing, load progressively.
  for(let p=1; p<=state.pageCount; p++){
    let text = await idb.get(pageKey(p));
    if(!text){
      // On-demand caching for this page
      try{
        text = await cachePageText(p);
      }catch{
        text = "";
      }
    }
    if(!text) continue;

    const idx = text.toLowerCase().indexOf(q);
    if(idx !== -1){
      const start = Math.max(0, idx - 45);
      const end = Math.min(text.length, idx + q.length + 90);
      const snippet = text.slice(start, end);
      hits.push({ page: p, snippet });
      if(hits.length >= 50) break; // cap
    }

    if(p % 20 === 0){
      els.searchStatus.textContent = `گەڕان… (${p}/${state.pageCount}) — دۆزراوە: ${hits.length}`;
      await new Promise(r => setTimeout(r, 0));
    }
  }

  els.searchStatus.textContent = hits.length
    ? `کۆی دۆزراوە: ${hits.length} (زیاترین 50 پیشان دەدرێت)`
    : "هیچ ئەنجامێک نەدۆزرایەوە.";

  renderResults(hits, query);
}

function renderResults(hits, query){
  els.searchResults.innerHTML = "";
  if(!hits.length) return;

  const frag = document.createDocumentFragment();
  hits.forEach(h => {
    const d = document.createElement("div");
    d.className = "result";
    d.innerHTML = `
      <div class="resultTitle">پەڕە ${h.page}</div>
      <div class="resultSnippet">${highlight(escapeHtml(h.snippet), query)}</div>
    `;
    d.addEventListener("click", async () => {
      els.searchModal.close();
      await goToPage(h.page);
    });
    frag.appendChild(d);
  });
  els.searchResults.appendChild(frag);
}
function highlight(html, query){
  const q = escapeRegExp(query);
  return html.replace(new RegExp(q, "gi"), m => `<mark style="background:rgba(124,92,255,.25);color:inherit;padding:.06em .18em;border-radius:8px;border:1px solid rgba(124,92,255,.35)">${m}</mark>`);
}
function escapeRegExp(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

async function buildIndex(){
  els.searchStatus.textContent = "ئیندێکس دەسازرێت… (ئەم کارە یەکجار دەکرێت)";
  for(let p=1; p<=state.pageCount; p++){
    await cachePageText(p);
    if(p % 20 === 0){
      els.searchStatus.textContent = `ئیندێکس… (${p}/${state.pageCount})`;
      await new Promise(r => setTimeout(r, 0));
    }
  }
  els.searchStatus.textContent = "ئیندێکس تەواو بوو ✅";
}

/** Bookmarks & Notes */
function renderBookmarks(){
  const list = getBookmarks().sort((a,b)=>a.page-b.page);
  els.bookmarkList.innerHTML = "";
  if(!list.length){
    els.bookmarkList.innerHTML = `<div class="muted">هیچ نیشانەیەک نییە.</div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  list.forEach(b => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div class="rowMain">
        <div class="rowTitle">پەڕە ${b.page}</div>
        <div class="rowSub">${escapeHtml(b.label || "نیشانە")}</div>
      </div>
      <div class="rowBtns">
        <button class="smallbtn" data-act="go">چوون</button>
        <button class="smallbtn" data-act="del">سڕینەوە</button>
      </div>
    `;
    row.querySelector('[data-act="go"]').addEventListener("click", async ()=>{
      await goToPage(b.page);
      closeDrawerMobile();
    });
    row.querySelector('[data-act="del"]').addEventListener("click", ()=>{
      setBookmarks(getBookmarks().filter(x => x.id !== b.id));
      toast("نیشانە سڕایەوە.");
    });
    frag.appendChild(row);
  });
  els.bookmarkList.appendChild(frag);
}

function renderNoteList(){
  const notes = getNotes();
  const entries = Object.entries(notes)
    .filter(([,t]) => (t||"").trim().length)
    .map(([p,t]) => ({ page: Number(p), text: t }))
    .sort((a,b)=>a.page-b.page);

  els.noteList.innerHTML = "";
  if(!entries.length){
    els.noteList.innerHTML = `<div class="muted">هیچ تێبینییەک نییە.</div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  entries.forEach(n => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div class="rowMain">
        <div class="rowTitle">تێبینی — پەڕە ${n.page}</div>
        <div class="rowSub">${escapeHtml(n.text).slice(0, 120)}</div>
      </div>
      <div class="rowBtns">
        <button class="smallbtn" data-act="go">چوون</button>
        <button class="smallbtn" data-act="del">سڕینەوە</button>
      </div>
    `;
    row.querySelector('[data-act="go"]').addEventListener("click", async ()=>{
      await goToPage(n.page);
      closeDrawerMobile();
    });
    row.querySelector('[data-act="del"]').addEventListener("click", ()=>{
      const obj = getNotes();
      delete obj[n.page];
      setNotes(obj);
      toast("تێبینی سڕایەوە.");
    });
    frag.appendChild(row);
  });
  els.noteList.appendChild(frag);
}

function loadNoteForPage(pageNum){
  const notes = getNotes();
  const txt = notes[String(pageNum)] || "";
  els.noteText.value = txt;
  els.noteStatus.textContent = txt.trim() ? "تێبینی هەیە ✅" : "تێبینی نییە.";
}

function saveNoteForPage(pageNum, text){
  const notes = getNotes();
  const t = (text || "").trimEnd();
  if(t.trim().length){
    notes[String(pageNum)] = t;
  }else{
    delete notes[String(pageNum)];
  }
  setNotes(notes);
}

function addBookmark(pageNum){
  const list = getBookmarks();
  if(list.some(b => b.page === pageNum)){
    toast("ئەم پەڕەیە پێشتر نیشانەکراوە.");
    return;
  }
  const label = (getNotes()[String(pageNum)] || "").slice(0, 30) || "نیشانە";
  list.push({ id: crypto.randomUUID(), page: pageNum, label });
  setBookmarks(list);
  toast("نیشانە زیادکرا ✅");
}

function exportData(){
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    bookmarks: getBookmarks(),
    notes: getNotes(),
    settings: {
      theme: state.theme,
      defaultZoom: state.defaultZoom,
      preload: state.preload
    }
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "tafsir-reader-data.json";
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}

async function importData(file){
  const text = await file.text();
  const data = JSON.parse(text);
  if(data.bookmarks) setBookmarks(data.bookmarks);
  if(data.notes) setNotes(data.notes);

  if(data.settings){
    if(data.settings.theme) setTheme(data.settings.theme);
    if(data.settings.defaultZoom){
      state.defaultZoom = clamp(Number(data.settings.defaultZoom), 60, 200);
      storage.set("defaultZoom", state.defaultZoom);
      $("#defaultZoom").value = state.defaultZoom;
      els.zoomLabel.textContent = `${Math.round(state.defaultZoom)}%`;
    }
    if(typeof data.settings.preload === "boolean"){
      state.preload = data.settings.preload;
      storage.set("preload", state.preload);
      $("#preloadToggle").checked = state.preload;
    }
  }
  toast("داتاکان هاوردە کران ✅");
}

async function resetAll(){
  if(!confirm("دڵنیایت؟ هەموو نیشانەکان و تێبینیەکان و ئیندێکس دەسڕێنەوە.")) return;
  localStorage.clear();
  await idb.clear();
  location.reload();
}

/** Drawer behavior (mobile) */
function openDrawer(){
  els.drawer.setAttribute("aria-hidden", "false");
}
function closeDrawer(){
  els.drawer.setAttribute("aria-hidden", "true");
}
function closeDrawerMobile(){
  // On desktop drawer is persistent, but safe to close only if fixed
  if(window.matchMedia("(min-width: 980px)").matches) return;
  closeDrawer();
}

/** Events */
function bindEvents(){
  // Menu
  els.btnMenu.addEventListener("click", ()=> {
    const hidden = els.drawer.getAttribute("aria-hidden") === "true";
    hidden ? openDrawer() : closeDrawer();
  });
  els.btnCloseDrawer.addEventListener("click", closeDrawer);

  // Tabs
  els.tabs.forEach(t => t.addEventListener("click", ()=>{
    els.tabs.forEach(x=>x.classList.remove("isActive"));
    t.classList.add("isActive");
    const tab = t.dataset.tab;
    Object.values(els.panels).forEach(p=>p.classList.remove("isActive"));
    $("#panel-"+tab).classList.add("isActive");
  }));

  // Paging
  els.btnPrev.addEventListener("click", ()=> goToPage(state.page - 1));
  els.btnNext.addEventListener("click", ()=> goToPage(state.page + 1));
  els.pageNumber.addEventListener("change", ()=> goToPage(els.pageNumber.value));

  // Zoom
  els.btnZoomIn.addEventListener("click", ()=>{
    state.defaultZoom = clamp(state.defaultZoom + 10, 60, 200);
    storage.set("defaultZoom", state.defaultZoom);
    $("#defaultZoom").value = state.defaultZoom;
    goToPage(state.page);
  });
  els.btnZoomOut.addEventListener("click", ()=>{
    state.defaultZoom = clamp(state.defaultZoom - 10, 60, 200);
    storage.set("defaultZoom", state.defaultZoom);
    $("#defaultZoom").value = state.defaultZoom;
    goToPage(state.page);
  });
  els.btnFit.addEventListener("click", ()=>{
    state.fitMode = state.fitMode === "width" ? "page" : "width";
    toast(state.fitMode === "width" ? "پێوانە: بەپێی پانی" : "پێوانە: پەڕەی تەواو");
    goToPage(state.page);
  });

  // Theme
  els.btnTheme.addEventListener("click", ()=>{
    const next = state.theme === "dark" ? "light" : "dark";
    setTheme(next);
  });

  // Settings
  els.btnSettings.addEventListener("click", ()=> els.settingsModal.showModal());
  $$(".segBtn").forEach(b => b.addEventListener("click", ()=>{
    setTheme(b.dataset.theme);
  }));
  $("#defaultZoom").addEventListener("input", (e)=>{
    state.defaultZoom = clamp(Number(e.target.value), 60, 200);
    storage.set("defaultZoom", state.defaultZoom);
    els.zoomLabel.textContent = `${Math.round(state.defaultZoom)}%`;
  });
  $("#defaultZoom").addEventListener("change", ()=> goToPage(state.page));
  $("#preloadToggle").addEventListener("change", (e)=>{
    state.preload = !!e.target.checked;
    storage.set("preload", state.preload);
    toast(state.preload ? "پێشبارکردن چالاک بوو" : "پێشبارکردن ناچالاک بوو");
    if(state.preload) preloadNeighbors();
  });

  // Search
  els.btnSearch.addEventListener("click", ()=> {
    els.searchModal.showModal();
    setTimeout(()=>els.searchInput.focus(), 50);
  });
  els.btnDoSearch.addEventListener("click", ()=> doSearch(els.searchInput.value));
  els.searchInput.addEventListener("keydown", (e)=>{
    if(e.key === "Enter"){
      e.preventDefault();
      doSearch(els.searchInput.value);
    }
  });
  els.btnBuildIndex.addEventListener("click", ()=> buildIndex());

  // Notes
  els.noteText.addEventListener("input", ()=>{
    saveNoteForPage(state.page, els.noteText.value);
    toast("پاشەکەوت کرا.");
  });
  els.btnClearNote.addEventListener("click", ()=>{
    els.noteText.value = "";
    saveNoteForPage(state.page, "");
    toast("تێبینی سڕایەوە.");
  });

  // Bookmark current page
  els.btnBookmark.addEventListener("click", ()=> addBookmark(state.page));

  // Export/Import
  els.btnExport.addEventListener("click", exportData);
  els.importFile.addEventListener("change", async (e)=>{
    const f = e.target.files && e.target.files[0];
    if(f) await importData(f);
    e.target.value = "";
  });
  els.btnReset.addEventListener("click", resetAll);

  // Share
  els.btnShare.addEventListener("click", async ()=>{
    const url = location.href.split("#")[0] + `#p=${state.page}`;
    try{
      if(navigator.share){
        await navigator.share({ title: "تەفسیری نامی", text: `پەڕە ${state.page}`, url });
      }else{
        await navigator.clipboard.writeText(url);
        toast("لینک کۆپی کرا ✅");
      }
    }catch{
      // ignore
    }
  });

  // Keyboard shortcuts
  window.addEventListener("keydown", (e)=>{
    if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k"){
      e.preventDefault();
      els.searchModal.showModal();
      setTimeout(()=>els.searchInput.focus(), 50);
    }
    if(e.key === "ArrowLeft") goToPage(state.page - 1);
    if(e.key === "ArrowRight") goToPage(state.page + 1);
    if(e.key.toLowerCase() === "b") addBookmark(state.page);
    if(e.key.toLowerCase() === "d") setTheme(state.theme === "dark" ? "light" : "dark");
  });

  // Resize rerender (debounced)
  let t = null;
  window.addEventListener("resize", ()=>{
    clearTimeout(t);
    t = setTimeout(()=> goToPage(state.page, {silent:true}), 220);
  });

  // Deep link page hash (#p=123)
  window.addEventListener("hashchange", ()=>{
    const p = parseHashPage();
    if(p) goToPage(p);
  });
}

function parseHashPage(){
  const m = location.hash.match(/p=(\d+)/);
  return m ? Number(m[1]) : null;
}

/** Init */
(async function init(){
  // Theme from storage
  setTheme(storage.get("theme", "dark"));

  // Render saved bookmarks/notes
  renderBookmarks();
  renderNoteList();

  bindEvents();

  // Register service worker for offline
  if("serviceWorker" in navigator){
    try{ await navigator.serviceWorker.register("sw.js"); }catch(_){}
  }

  await loadPdf();
})();
