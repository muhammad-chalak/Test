const express = require("express");
const path = require("path");
const helmet = require("helmet");
const compression = require("compression");
const multer = require("multer");
const Database = require("better-sqlite3");

// ============ ڕێکخستن ============
const PORT = process.env.PORT || 3000;

// قەبارەی زۆرترین فایل (MB) — دەتوانیت بیگۆڕیت
const MAX_FILE_MB = 50;

const upload = multer({
  storage: multer.memoryStorage(), // فایلەکان دەچن ناو RAM و پاشان دەچن ناو DB (BLOB)
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024 }
});

// ============ دەستپێکی ئەپ ============
const app = express();
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(compression());
app.use(express.static(__dirname));
app.use(express.json({ limit: "2mb" }));

// ============ DB ============
const db = new Database(path.join(__dirname, "library.sqlite"));

db.exec(`
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  year INTEGER,
  category TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  file_name TEXT,
  file_mime TEXT,
  file_blob BLOB,
  cover_name TEXT,
  cover_mime TEXT,
  cover_blob BLOB
);

CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);

CREATE TRIGGER IF NOT EXISTS trg_books_updated
AFTER UPDATE ON books
BEGIN
  UPDATE books SET updated_at = datetime('now') WHERE id = NEW.id;
END;
`);

function sanitizeInt(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function pickText(v, max = 2000) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}

// ============ API ============
app.get("/api/health", (req, res) => res.json({ ok: true }));

// لیستی کتێبەکان (public)
app.get("/api/books", (req, res) => {
  const q = (req.query.q || "").toString().trim();
  const cat = (req.query.category || "").toString().trim();

  let sql = `
    SELECT id, title, author, year, category, description, created_at, updated_at,
           CASE WHEN file_blob IS NOT NULL THEN 1 ELSE 0 END AS hasFile,
           CASE WHEN cover_blob IS NOT NULL THEN 1 ELSE 0 END AS hasCover
    FROM books
  `;
  const params = [];
  const where = [];

  if (q) {
    where.push("(title LIKE ? OR author LIKE ? OR category LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (cat) {
    where.push("category = ?");
    params.push(cat);
  }
  if (where.length) sql += " WHERE " + where.join(" AND ");
  sql += " ORDER BY id DESC LIMIT 500";

  res.json(db.prepare(sql).all(...params));
});

// زانیاری کتێبێک (public)
app.get("/api/books/:id", (req, res) => {
  const id = sanitizeInt(req.params.id);
  if (!id) return res.status(400).json({ error: "ID هەڵەیە" });

  const row = db.prepare(`
    SELECT id, title, author, year, category, description, created_at, updated_at,
           CASE WHEN file_blob IS NOT NULL THEN 1 ELSE 0 END AS hasFile,
           CASE WHEN cover_blob IS NOT NULL THEN 1 ELSE 0 END AS hasCover,
           file_name, file_mime, cover_name, cover_mime
    FROM books WHERE id = ?
  `).get(id);

  if (!row) return res.status(404).json({ error: "نەدۆزرایەوە" });
  res.json(row);
});

// کردنەوە/داگرتنی فایل (public)
app.get("/api/books/:id/file", (req, res) => {
  const id = sanitizeInt(req.params.id);
  if (!id) return res.status(400).send("ID هەڵەیە");

  const row = db.prepare(`SELECT file_name, file_mime, file_blob FROM books WHERE id = ?`).get(id);
  if (!row || !row.file_blob) return res.status(404).send("فایل نەدۆزرایەوە");

  res.setHeader("Content-Type", row.file_mime || "application/octet-stream");
  const safeName = (row.file_name || `book-${id}`).replace(/[\r\n"]/g, "");
  res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
  res.send(row.file_blob);
});

// وێنەی بەرگ (public)
app.get("/api/books/:id/cover", (req, res) => {
  const id = sanitizeInt(req.params.id);
  if (!id) return res.status(400).send("ID هەڵەیە");

  const row = db.prepare(`SELECT cover_mime, cover_blob FROM books WHERE id = ?`).get(id);
  if (!row || !row.cover_blob) return res.status(404).send("وێنەی بەرگ نەدۆزرایەوە");

  res.setHeader("Content-Type", row.cover_mime || "image/png");
  res.send(row.cover_blob);
});

// ✅ زیادکردن (هەر کەسێک)
app.post(
  "/api/books",
  upload.fields([{ name: "file", maxCount: 1 }, { name: "cover", maxCount: 1 }]),
  (req, res) => {
    const title = pickText(req.body.title, 200);
    const author = pickText(req.body.author, 200);
    const year = sanitizeInt(req.body.year);
    const category = pickText(req.body.category, 120);
    const description = pickText(req.body.description, 5000);

    if (!title || !author) return res.status(400).json({ error: "ناونیشان و نووسەر پێویستن" });

    const file = req.files?.file?.[0] || null;
    const cover = req.files?.cover?.[0] || null;

    const info = db.prepare(`
      INSERT INTO books (title, author, year, category, description,
                         file_name, file_mime, file_blob,
                         cover_name, cover_mime, cover_blob)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title, author, year, category, description,
      file ? file.originalname : null,
      file ? file.mimetype : null,
      file ? file.buffer : null,
      cover ? cover.originalname : null,
      cover ? cover.mimetype : null,
      cover ? cover.buffer : null
    );

    res.json({ ok: true, id: info.lastInsertRowid });
  }
);

// ✅ دەستکاری (هەر کەسێک)
app.put(
  "/api/books/:id",
  upload.fields([{ name: "file", maxCount: 1 }, { name: "cover", maxCount: 1 }]),
  (req, res) => {
    const id = sanitizeInt(req.params.id);
    if (!id) return res.status(400).json({ error: "ID هەڵەیە" });

    const exists = db.prepare(`SELECT id FROM books WHERE id = ?`).get(id);
    if (!exists) return res.status(404).json({ error: "نەدۆزرایەوە" });

    const title = pickText(req.body.title, 200);
    const author = pickText(req.body.author, 200);
    const year = sanitizeInt(req.body.year);
    const category = pickText(req.body.category, 120);
    const description = pickText(req.body.description, 5000);

    const file = req.files?.file?.[0] || null;
    const cover = req.files?.cover?.[0] || null;

    const removeFile = req.body.removeFile === "1";
    const removeCover = req.body.removeCover === "1";

    const current = db.prepare(`
      SELECT file_name, file_mime, file_blob, cover_name, cover_mime, cover_blob
      FROM books WHERE id = ?
    `).get(id);

    const newFileName = removeFile ? null : (file ? file.originalname : current.file_name);
    const newFileMime = removeFile ? null : (file ? file.mimetype : current.file_mime);
    const newFileBlob = removeFile ? null : (file ? file.buffer : current.file_blob);

    const newCoverName = removeCover ? null : (cover ? cover.originalname : current.cover_name);
    const newCoverMime = removeCover ? null : (cover ? cover.mimetype : current.cover_mime);
    const newCoverBlob = removeCover ? null : (cover ? cover.buffer : current.cover_blob);

    db.prepare(`
      UPDATE books
      SET title = COALESCE(?, title),
          author = COALESCE(?, author),
          year = ?,
          category = ?,
          description = ?,
          file_name = ?,
          file_mime = ?,
          file_blob = ?,
          cover_name = ?,
          cover_mime = ?,
          cover_blob = ?
      WHERE id = ?
    `).run(
      title, author, year, category, description,
      newFileName, newFileMime, newFileBlob,
      newCoverName, newCoverMime, newCoverBlob,
      id
    );

    res.json({ ok: true });
  }
);

// ✅ سڕینەوە (هەر کەسێک)
app.delete("/api/books/:id", (req, res) => {
  const id = sanitizeInt(req.params.id);
  if (!id) return res.status(400).json({ error: "ID هەڵەیە" });

  const info = db.prepare(`DELETE FROM books WHERE id = ?`).run(id);
  if (!info.changes) return res.status(404).json({ error: "نەدۆزرایەوە" });

  res.json({ ok: true });
});

// ============ پەڕەکان ============
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "admin.html")));

app.listen(PORT, () => {
  console.log(`✅ ئەپەکە کاردەکات: http://localhost:${PORT}`);
  console.log(`🧩 پەڕەی زیادکردن/دەستکاری: http://localhost:${PORT}/admin.html`);
});
