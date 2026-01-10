(() => {
  const html = document.documentElement;

  // Theme init (avoid flicker)
  const saved = localStorage.getItem("theme");
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initial = saved ?? (prefersDark ? "dark" : "light");
  if (initial === "dark") html.classList.add("dark");

  const themeBtn = document.getElementById("themeBtn");
  const setThemeIcon = () => {
    const isDark = html.classList.contains("dark");
    themeBtn.textContent = isDark ? "☀️" : "🌙";
  };
  setThemeIcon();

  themeBtn?.addEventListener("click", () => {
    html.classList.toggle("dark");
    localStorage.setItem("theme", html.classList.contains("dark") ? "dark" : "light");
    setThemeIcon();
  });

  // Mobile menu
  const menuBtn = document.getElementById("menuBtn");
  const mobileMenu = document.getElementById("mobileMenu");
  menuBtn?.addEventListener("click", () => {
    mobileMenu.classList.toggle("hidden");
  });
  mobileMenu?.querySelectorAll("a").forEach(a => {
    a.addEventListener("click", () => mobileMenu.classList.add("hidden"));
  });

  // Footer year
  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  // Contact form (demo)
  const form = document.getElementById("contactForm");
  const status = document.getElementById("formStatus");
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (status) status.textContent = "✅ Message prepared (demo). Connect a backend to actually send.";
    form.reset();
  });
})();
