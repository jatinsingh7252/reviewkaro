/* ============================================================
   ReviewKaro by KnownLabs — config
   1. SUPABASE_ANON_KEY: "anon public" key (Project Settings → API).
      Service_role key KABHI mat dalna.
   2. GEMINI_KEY: https://aistudio.google.com/apikey → Create API key.
      FREE hai, card nahi chahiye. Khali rakha toh ready-made
      templates chalenge (product rukega nahi).
   3. KNOWNLABS_UPI: client tumhe isi UPI ID pe ₹399 / ₹999 bhejenge.
   4. PUBLIC_BASE_URL: site live host ho tab dalo
      (jaise "https://reviews.knownlabs.in"). QR code isi se banega.
      Khali rakha toh current address use hoga (testing OK).
   ============================================================ */
const RK_CONFIG = {
  SUPABASE_URL: "https://fppozbmsvmkmucndkrwz.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwcG96Ym1zdm1rbXVjbmRrcnd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0Mzk0NjksImV4cCI6MjEwNjAxNTQ2OX0.y0-rkshwM4Rg89UiyWcwXX759b2gM5v-7qQNu1AA5Z0",
  GEMINI_KEY: "AQ.Ab8RN6KVH8wJOq9ecZLui_QmjSHfoXg-rHzoF6vgpoD8G5vnGQ",
  GEMINI_MODEL: "gemini-3.8-flash",
  KNOWNLABS_UPI: "9835059241@naviaxis",
  KNOWNLABS_WHATSAPP: "919835059241",
  PUBLIC_BASE_URL: "",
  PRICE_MONTHLY: 399,
  PRICE_QUARTERLY: 999,
  TRIAL_DAYS: 3,
  GRACE_DAYS: 3
};

const rkSupabase = (() => {
  if (!RK_CONFIG.SUPABASE_URL || !RK_CONFIG.SUPABASE_ANON_KEY) return null;
  return window.supabase.createClient(RK_CONFIG.SUPABASE_URL, RK_CONFIG.SUPABASE_ANON_KEY);
})();

function rkDb() {
  if (!rkSupabase) {
    alert("Supabase is not connected.\n\nCheck SUPABASE_URL and SUPABASE_ANON_KEY in assets/js/config.js.");
    throw new Error("supabase not configured");
  }
  return rkSupabase;
}

/* Public customer page (r.html) ke liye session-less client.
   Customer page hamesha anonymous rehna chahiye — agar browser me
   admin/client ka login session ho tab bhi. Warna tracking inserts
   (scan/feedback) logged-in role se jaake RLS pe reject ho jate hain. */
let rkAnonSupabase = null;
function rkAnonDb() {
  if (!RK_CONFIG.SUPABASE_URL || !RK_CONFIG.SUPABASE_ANON_KEY) {
    alert("Supabase is not connected.\n\nCheck SUPABASE_URL and SUPABASE_ANON_KEY in assets/js/config.js.");
    throw new Error("supabase not configured");
  }
  if (!rkAnonSupabase) {
    rkAnonSupabase = window.supabase.createClient(
      RK_CONFIG.SUPABASE_URL,
      RK_CONFIG.SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    );
  }
  return rkAnonSupabase;
}

/* subscription status: active | trial | grace | expired */
function rkSubStatus(b) {
  const now = Date.now();
  const exp = new Date(b.expires_at).getTime();
  if (now < exp) return b.plan === "trial" ? "trial" : "active";
  if (now < exp + RK_CONFIG.GRACE_DAYS * 864e5) return "grace";
  return "expired";
}
function rkDaysLeft(b) {
  const now = Date.now();
  const exp = new Date(b.expires_at).getTime();
  if (now < exp) return Math.ceil((exp - now) / 864e5);
  return Math.max(0, Math.ceil((exp + RK_CONFIG.GRACE_DAYS * 864e5 - now) / 864e5));
}

function rkToast(msg) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

function rkPageUrl(slug) {
  // r.html always lives at the site root (admin/ is one level below it)
  let base = (RK_CONFIG.PUBLIC_BASE_URL || "").trim();
  if (!base) base = new URL("../r.html", location.href).href.replace(/r\.html$/, "");
  if (!base.endsWith("/")) base += "/";
  return base + "r.html?b=" + slug;
}
