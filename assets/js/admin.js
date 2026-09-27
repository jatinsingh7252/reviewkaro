/* ReviewKaro admin — superadmin + client, mobile-first */
(function () {
  const $ = (id) => document.getElementById(id);
  let sb, role = null, myBiz = null, businesses = [], activeTab = "";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const timeAgo = (iso) => {
    const s = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + " min ago";
    if (s < 86400) return Math.floor(s / 3600) + " hrs ago";
    return Math.floor(s / 86400) + " days ago";
  };
  const dstr = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  async function doLogout() { await sb.auth.signOut(); location.reload(); }

  /* ---------- categories (shared by setup wizard + profile) ---------- */
  const CATS = ["Hospital", "Clinic", "Salon", "Barber Shop", "Restaurant", "Cafe", "Tea Shop", "Bakery", "Retail", "Mobile Repair", "Electronics", "Gym", "Boutique", "Pharmacy", "General"];
  const catOptions = (sel) => CATS.map((c) => `<option${sel === c ? " selected" : ""}>${c}</option>`).join("") +
    `<option${sel === "Other" ? " selected" : ""}>Other</option>`;
  const catState = (cat) => CATS.includes(cat) ? { sel: cat, other: "" } : { sel: "Other", other: cat || "" };
  const wireCatOther = (selId, wrapId) => {
    const t = () => $(wrapId).classList.toggle("hidden", $(selId).value !== "Other");
    $(selId).addEventListener("change", t); t();
  };
  const readCategory = (selId, otherId) => {
    if ($(selId).value !== "Other") return $(selId).value;
    const v = $(otherId).value.trim();
    return v || null;
  };

  function subPill(b) {
    const st = rkSubStatus(b), d = rkDaysLeft(b);
    const map = {
      active: ["pill-completed", `Active · ${d} days left`],
      trial: ["pill-opened", `Trial · ${d} days left`],
      grace: ["pill-new", `Grace · ${d} days left`],
      expired: ["pill-read", "Expired"]
    };
    const m = map[st];
    return `<span class="pill ${m[0]}">${m[1]}</span>`;
  }

  function subBanner(b) {
    const st = rkSubStatus(b), d = rkDaysLeft(b);
    if (st === "trial") return `<div class="sub-banner trial">🎉 <b>Free trial:</b> ${d} days left. After that, you'll need a plan to keep your QR running.</div>`;
    if (st === "grace") return `<div class="sub-banner grace">⚠️ <b>Grace period:</b> only ${d} days left! Pay now or your QR will stop working.</div>`;
    if (st === "expired") return `<div class="sub-banner expired">⛔ <b>Expired:</b> your QR is currently paused. Renew your plan so customers can review again.</div>`;
    return `<div class="sub-banner active">✅ <b>Active:</b> ${d} days left. Everything is running smoothly.</div>`;
  }

  function funnel(rows) {
    const c = {};
    rows.forEach((r) => { c[r.type] = (c[r.type] || 0) + 1; });
    return c;
  }

  /* ================= AUTH ================= */
  async function init() {
    try { sb = rkDb(); }
    catch (e) {
      $("loginErr").textContent = "Supabase is not connected. Check assets/js/config.js.";
      $("loginErr").classList.remove("hidden");
      return;
    }
    $("btnHamb").addEventListener("click", openDrawer);
    $("drawerClose").addEventListener("click", closeDrawer);
    $("drawerBack").addEventListener("click", closeDrawer);
    document.querySelectorAll('#drawer [data-legal]').forEach((a) =>
      a.addEventListener("click", (e) => { e.preventDefault(); closeDrawer(); showTab(a.dataset.legal); }));
    const gbtn = $("btnGoogle");
    if (gbtn) gbtn.addEventListener("click", async () => {
      const { error } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: location.origin + location.pathname }
      });
      if (error) { $("loginErr").textContent = error.message; $("loginErr").classList.remove("hidden"); }
    });
    const { data: { session } } = await sb.auth.getSession();
    if (session) return route();
    $("btnLogin").addEventListener("click", login);
    $("loginPass").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
    $("linkForgot").addEventListener("click", forgotPw);
  }

  async function login() {
    const err = $("loginErr"); err.classList.add("hidden");
    $("btnLogin").disabled = true;
    const { error } = await sb.auth.signInWithPassword({
      email: $("loginEmail").value.trim(), password: $("loginPass").value
    });
    $("btnLogin").disabled = false;
    if (error) { err.textContent = error.message; err.classList.remove("hidden"); return; }
    route();
  }

  async function forgotPw(e) {
    e.preventDefault();
    const email = prompt("Enter your login email:");
    if (!email) return;
    const { error } = await sb.auth.resetPasswordForEmail(email.trim());
    rkToast(error ? error.message : "Reset link sent — check your inbox");
  }

  async function route() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return location.reload();
    $("loginView").classList.add("hidden");
    $("appView").classList.remove("hidden");

    const { data: prof } = await sb.from("rk_profiles").select("role").eq("user_id", user.id).maybeSingle();
    if (prof) { role = "superadmin"; }
    else {
      const { data: biz } = await sb.from("rk_businesses").select("*")
        .eq("owner_email", user.email).maybeSingle();
      if (!biz) {
        $("mainContent").innerHTML = `<div class="panel"><div class="empty"><div class="big">🔗</div>
          Your account is not linked to a business yet.<br>Please contact KnownLabs.</div></div>`;
        $("roleBadge").textContent = "CLIENT";
        return;
      }
      role = "client"; myBiz = biz;
      /* unread feedback badge ke liye timestamps preload —
         warna fresh login pe badge kabhi nahi dikhega */
      try {
        const { data: fb0 } = await sb.from("rk_events").select("created_at")
          .eq("business_id", myBiz.id).eq("type", "feedback")
          .order("created_at", { ascending: false }).limit(100);
        myBiz._fb = fb0 || [];
      } catch (e) { myBiz._fb = []; }
    }
    $("roleBadge").textContent = role === "superadmin" ? "SUPERADMIN" : "CLIENT";
    /* navbar: user chip (Google profile photo when available) + drawer */
    const navName = role === "client" ? myBiz.name : user.email;
    const photo = user.user_metadata && (user.user_metadata.avatar_url || user.user_metadata.picture);
    const avaHTML = photo ? `<img src="${esc(photo)}" alt="">` : esc((navName.trim().charAt(0) || "•").toUpperCase());
    $("navAva").innerHTML = avaHTML;
    $("drawerAva").innerHTML = avaHTML;
    $("navName").textContent = navName;
    $("drawerName").textContent = navName;
    $("drawerMail").textContent = user.email;
    const navUser = $("navUser");
    navUser.classList.remove("hidden");
    if (role === "client") { navUser.classList.remove("no-click"); navUser.onclick = () => showTab("profile"); }
    else navUser.classList.add("no-click");
    $("brandHome").onclick = (e) => { e.preventDefault(); showTab("dash"); };
    buildDrawer();
    renderTabs();
    if (role === "client" && (!myBiz.google_review_url || !myBiz.name)) return showTab("setup");
    showTab(role === "superadmin" ? "dash" : "dash");
  }

  /* ================= TABS ================= */
  const SUPER_TABS = [["dash", "Dashboard"], ["clients", "Clients"], ["feedback", "Feedback"], ["profile", "Profile"]];
  const CLIENT_TABS = [["dash", "Dashboard"], ["qr", "My QR"], ["feedback", "Feedback"], ["sub", "Subscription"], ["profile", "Profile"]];

  function renderTabs() {
    const tabs = role === "superadmin" ? SUPER_TABS : CLIENT_TABS;
    const unread = role === "client" ? unreadCount() : 0;
    $("mainTabs").innerHTML = tabs.map(([k, label]) =>
      `<button data-tab="${k}" class="${k === activeTab ? "active" : ""}">${label}${k === "feedback" && unread ? ` <span class="pill pill-new" style="font-size:10px;padding:2px 8px">${unread}</span>` : ""}</button>`
    ).join("");
    $("mainTabs").querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => showTab(b.dataset.tab)));
    $("drawerNav").querySelectorAll("a").forEach((a) =>
      a.classList.toggle("active", a.dataset.tab === activeTab));
  }

  /* ---------- mobile drawer ---------- */
  function openDrawer() {
    if (!role) return;
    buildDrawer();
    $("drawer").classList.add("open");
    $("drawerBack").classList.remove("hidden");
    requestAnimationFrame(() => $("drawerBack").classList.add("open"));
    $("drawer").setAttribute("aria-hidden", "false");
  }
  function closeDrawer() {
    $("drawer").classList.remove("open");
    $("drawerBack").classList.remove("open");
    setTimeout(() => $("drawerBack").classList.add("hidden"), 260);
    $("drawer").setAttribute("aria-hidden", "true");
  }
  function buildDrawer() {
    const tabs = role === "superadmin" ? SUPER_TABS : CLIENT_TABS;
    const unread = role === "client" ? unreadCount() : 0;
    $("drawerNav").innerHTML = tabs.map(([k, label]) =>
      `<a href="#" data-tab="${k}" class="${k === activeTab ? "active" : ""}">${label}${k === "feedback" && unread ? ` <span class="pill pill-new" style="font-size:10px;padding:2px 8px">${unread}</span>` : ""}</a>`
    ).join("");
    $("drawerNav").querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", (e) => { e.preventDefault(); closeDrawer(); showTab(a.dataset.tab); }));
  }

  function showTab(k) {
    activeTab = k;
    renderTabs();
    window.scrollTo(0, 0);
    if (k === "privacy") return legalPage("privacy");
    if (k === "terms") return legalPage("terms");
    if (role === "superadmin") {
      if (k === "dash") return saDash();
      if (k === "clients") return saClients();
      if (k === "feedback") return saFeedback();
      if (k === "profile") return saProfile();
    } else {
      if (k === "setup") return clSetup();
      if (k === "dash") return clDash();
      if (k === "qr") return clQr();
      if (k === "feedback") return clFeedback();
      if (k === "sub") return clSub();
      if (k === "profile") return clAccount();
    }
  }

  /* ================= SUPERADMIN ================= */
  async function saDash() {
    const { data: ev } = await sb.from("rk_events").select("business_id,type");
    const { data: biz } = await sb.from("rk_businesses").select("*").order("created_at", { ascending: false });
    businesses = biz || [];
    const c = funnel(ev || []);
    let revenue = 0, nActive = 0, nTrial = 0, nGrace = 0, nExpired = 0;
    businesses.forEach((b) => {
      const st = rkSubStatus(b);
      if (st === "active") { nActive++; revenue += b.plan === "quarterly" ? 999 : 399; }
      else if (st === "trial") nTrial++;
      else if (st === "grace") nGrace++;
      else nExpired++;
    });
    $("mainContent").innerHTML = `
      <div class="admin-head"><div><h1>Dashboard</h1><p>All clients, on one screen.</p></div></div>
      <div class="stat-grid">
        <div class="stat"><div class="k">Clients</div><div class="v">${businesses.length}</div><div class="s">${nActive} active · ${nTrial} trial</div></div>
        <div class="stat"><div class="k">Active revenue</div><div class="v">₹${revenue.toLocaleString("en-IN")}</div><div class="s">per cycle</div></div>
        <div class="stat"><div class="k">QR scans</div><div class="v">${c.scan || 0}</div><div class="s">total</div></div>
        <div class="stat"><div class="k">Google clicks</div><div class="v">${c.google_click || 0}</div><div class="s">went to post reviews</div></div>
        <div class="stat"><div class="k">Attention</div><div class="v">${nGrace + nExpired}</div><div class="s">${nGrace} grace · ${nExpired} expired</div></div>
        <div class="stat"><div class="k">Feedback</div><div class="v">${c.feedback || 0}</div><div class="s">private complaints</div></div>
      </div>
      <div class="panel"><h2>Clients — status</h2>
        <div class="tbl-wrap"><table class="tbl"><thead>
          <tr><th>Business</th><th>Status</th><th>Valid till</th><th>Scans</th><th>Google</th><th></th></tr>
        </thead><tbody>
        ${businesses.map((b) => {
          const f = funnel((ev || []).filter((e) => e.business_id === b.id));
          return `<tr>
            <td><b>${esc(b.name)}</b><div style="font-size:12px;color:var(--muted)">${esc(b.owner_email)}</div></td>
            <td>${subPill(b)}</td>
            <td>${dstr(b.expires_at)}</td>
            <td>${f.scan || 0}</td><td><b style="color:var(--amber)">${f.google_click || 0}</b></td>
            <td><div class="row-actions"><button class="btn btn-ghost btn-sm" data-goto="clients">Manage</button></div></td>
          </tr>`;
        }).join("")}
        </tbody></table></div>
      </div>`;
    $("mainContent").querySelectorAll("[data-goto]").forEach((x) =>
      x.addEventListener("click", () => showTab(x.dataset.goto)));
  }

  async function saClients() {
    const { data: biz } = await sb.from("rk_businesses").select("*").order("created_at", { ascending: false });
    businesses = biz || [];
    const { data: ev } = await sb.from("rk_events").select("business_id,type");
    $("mainContent").innerHTML = `
      <div class="admin-head">
        <div><h1>Clients</h1><p>₹399/month · ₹999/3 months. Hit extend as soon as payment arrives.</p></div>
        <button class="btn btn-dark btn-sm" id="btnAddClient">+ Add client</button>
      </div>
      ${businesses.map((b) => {
        const f = funnel((ev || []).filter((e) => e.business_id === b.id));
        return `<div class="panel">
          <div style="display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:flex-start">
            <div>
              <h2 style="margin-bottom:4px">${esc(b.name)} ${subPill(b)}</h2>
              <p class="desc" style="margin:0">${esc(b.category)} · ${esc(b.city)} · ${esc(b.owner_email)}<br>
              Valid till <b>${dstr(b.expires_at)}</b> · ${f.scan || 0} scans · ${f.google_click || 0} Google clicks<br>
              <span class="link-chip">r.html?b=${esc(b.slug)}</span></p>
            </div>
            <div class="row-actions" style="flex-direction:column;align-items:stretch;gap:8px;min-width:170px">
              <button class="btn btn-amber btn-sm" data-ext1="${b.id}">+ 1 month (₹399)</button>
              <button class="btn btn-amber btn-sm" data-ext3="${b.id}">+ 3 months (₹999)</button>
              <div class="row-actions">
                <button class="btn btn-ghost btn-sm" data-qr="${b.slug}" data-nm="${esc(b.name)}">QR</button>
                <button class="btn btn-ghost btn-sm" data-exp="${b.id}">Expire now</button>
                <button class="btn btn-danger btn-sm" data-del="${b.id}">Delete</button>
              </div>
            </div>
          </div>
        </div>`;
      }).join("") || `<div class="panel"><div class="empty"><div class="big">🏪</div>Add your first client.</div></div>`}`;

    $("btnAddClient").addEventListener("click", () => $("clientModal").classList.remove("hidden"));
    const q = (sel) => $("mainContent").querySelectorAll(sel);
    q("[data-qr]").forEach((x) => x.addEventListener("click", () => openQr(x.dataset.qr, x.dataset.nm)));
    q("[data-ext1]").forEach((x) => x.addEventListener("click", () => extendPlan(x.dataset.ext1, "monthly", 30)));
    q("[data-ext3]").forEach((x) => x.addEventListener("click", () => extendPlan(x.dataset.ext3, "quarterly", 90)));
    q("[data-exp]").forEach((x) => x.addEventListener("click", async () => {
      if (!confirm("Expire now? The QR will pause after the 3-day grace period.")) return;
      await sb.from("rk_businesses").update({ expires_at: new Date().toISOString() }).eq("id", x.dataset.exp);
      showTab("clients"); rkToast("Expired — grace period started");
    }));
    q("[data-del]").forEach((x) => x.addEventListener("click", async () => {
      if (!confirm("Delete this client and all their data? This cannot be undone.")) return;
      await sb.from("rk_businesses").delete().eq("id", x.dataset.del);
      showTab("clients"); rkToast("Deleted");
    }));
  }

  async function extendPlan(id, plan, days) {
    const b = businesses.find((x) => x.id === id);
    const base = Math.max(Date.now(), new Date(b.expires_at).getTime());
    const { error } = await sb.from("rk_businesses").update({
      plan: plan, expires_at: new Date(base + days * 864e5).toISOString()
    }).eq("id", id);
    if (error) return rkToast("Fail: " + error.message);
    showTab("clients"); rkToast(`Extended ✓ — now valid till ${dstr(new Date(base + days * 864e5).toISOString())}`);
  }

  $("btnClientCancel").addEventListener("click", () => $("clientModal").classList.add("hidden"));
  $("btnClientSave").addEventListener("click", async () => {
    const email = $("cEmail").value.trim().toLowerCase();
    const name = $("cName").value.trim();
    if (!email || !name) return rkToast("Email and business name are required");
    let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "business";
    const { data: ex } = await sb.from("rk_businesses").select("id").eq("slug", slug).maybeSingle();
    if (ex) slug = slug + "-" + Math.floor(100 + Math.random() * 900);
    $("btnClientSave").disabled = true;
    const { error } = await sb.from("rk_businesses").insert({
      slug: slug, name: name, owner_email: email, plan: "trial",
      expires_at: new Date(Date.now() + RK_CONFIG.TRIAL_DAYS * 864e5).toISOString()
    });
    $("btnClientSave").disabled = false;
    if (error) return rkToast("Fail: " + error.message);
    $("clientModal").classList.add("hidden");
    $("cEmail").value = ""; $("cName").value = "";
    rkToast("Client added ✓ — 3-day trial started");
    if (activeTab === "clients") showTab("clients"); else showTab("dash");
  });

  async function saFeedback() {
    const { data } = await sb.from("rk_events").select("*").eq("type", "feedback")
      .order("created_at", { ascending: false }).limit(100);
    const { data: biz } = await sb.from("rk_businesses").select("id,name");
    const nm = {}; (biz || []).forEach((b) => nm[b.id] = b.name);
    $("mainContent").innerHTML = `
      <div class="admin-head"><div><h1>Feedback</h1><p>Private complaints from all clients.</p></div></div>
      ${(data || []).map((x) => `
        <div class="fb-item">
          <div class="fb-top"><div><span class="fb-name">${esc(nm[x.business_id] || "—")}</span>
          <span class="fb-meta"> · ${timeAgo(x.created_at)}</span></div></div>
          <div class="fb-msg">${esc((x.meta && x.meta.message) || "")}</div>
          <div class="row-actions"><button class="btn btn-danger btn-sm" data-fdel="${x.id}">Delete</button></div>
        </div>`).join("") || `<div class="panel"><div class="empty"><div class="big">🎉</div>No complaints!</div></div>`}`;
    $("mainContent").querySelectorAll("[data-fdel]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Delete this?")) return;
      await sb.from("rk_events").delete().eq("id", b.dataset.fdel);
      showTab("feedback");
    }));
  }

  /* ================= CLIENT ================= */
  function unreadCount() {
    try {
      const last = parseInt(localStorage.getItem("rk_read_" + myBiz.id) || "0", 10);
      return (myBiz._fb || []).filter((x) => new Date(x.created_at).getTime() > last).length;
    } catch (e) { return 0; }
  }

  async function clSetup() {
    activeTab = "setup"; renderTabs();
    $("mainContent").innerHTML = `
      <div class="admin-head"><div><h1>Setup</h1><p>First time here — fill in your business details (2 min).</p></div></div>
      <div class="panel" style="max-width:560px">
        <div class="field"><label>Business name *</label><input id="sName" value="${esc(myBiz.name)}" placeholder="City Care Hospital"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="field"><label>Category *</label><select id="sCat">${catOptions(myBiz.category)}</select></div>
          <div class="field hidden" id="sCatOtherWrap"><label>Your business type *</label><input id="sCatOther" placeholder="e.g. Bakery, Gym, Pet shop"></div>
          <div class="field"><label>City</label><input id="sCity" value="${esc(myBiz.city || "")}" placeholder="Patna"></div>
        </div>
        <div class="field"><label>Google review link *</label><input id="sGoogle" value="${esc(myBiz.google_review_url || "")}" placeholder="https://g.page/r/.../review">
          <p class="desc" style="margin:6px 0 0">Open your business on Google Maps → Share → copy the review link.</p></div>
        <div class="field"><label>Owner WhatsApp *</label><input id="sPhone" value="${esc(myBiz.owner_phone || "")}" placeholder="9198XXXXXXXX"></div>
        <button class="btn btn-amber" id="btnSetupSave" style="width:100%">Save & create my QR</button>
      </div>`;
    wireCatOther("sCat", "sCatOtherWrap");
    $("btnSetupSave").addEventListener("click", async () => {
      const name = $("sName").value.trim(), google = $("sGoogle").value.trim(), phone = $("sPhone").value.trim();
      if (!name || !google || !phone) return rkToast("Name, Google link and WhatsApp are required");
      const category = readCategory("sCat", "sCatOther");
      if (!category) return rkToast("Please write your business type");
      $("btnSetupSave").disabled = true;
      const { error, data } = await sb.from("rk_businesses").update({
        name: name, category: category, city: $("sCity").value.trim(),
        google_review_url: google, owner_phone: phone.replace(/\D/g, "")
      }).eq("id", myBiz.id).select().single();
      $("btnSetupSave").disabled = false;
      if (error) return rkToast("Fail: " + error.message);
      myBiz = data;
      rkToast("Setup complete ✓ — your QR is ready");
      showTab("qr");
    });
  }

  async function clDash() {
    const { data: ev, error: evErr } = await sb.from("rk_events").select("type,created_at")
      .eq("business_id", myBiz.id).order("created_at", { ascending: false });
    if (evErr) console.warn("[ReviewKaro] dashboard stats failed:", evErr.message);
    const c = funnel(ev || []);
    const scans = c.scan || 0;
    $("mainContent").innerHTML = `
      <div class="admin-head"><div><h1>${esc(myBiz.name)}</h1><p>Your review dashboard.</p></div></div>
      ${subBanner(myBiz)}
      <div class="stat-grid">
        <div class="stat"><div class="k">QR scans</div><div class="v">${scans}</div><div class="s">customers opened it</div></div>
        <div class="stat"><div class="k">Happy</div><div class="v">${scans ? Math.round(((c.like || 0) / scans) * 100) + "%" : "–"}</div><div class="s">tapped like</div></div>
        <div class="stat"><div class="k">Reviews copied</div><div class="v">${c.copied || 0}</div><div class="s">tapped copy</div></div>
        <div class="stat"><div class="k">Went to Google</div><div class="v">${c.google_click || 0}</div><div class="s">to post a review</div></div>
      </div>
      <div class="panel"><h2>Funnel</h2><p class="desc">Scan → Like → Copy → Google. See where customers drop off.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:14px">
          <span class="pill pill-read">${scans} scans</span> →
          <span class="pill pill-opened">${c.like || 0} likes</span> →
          <span class="pill pill-opened">${c.copied || 0} copied</span> →
          <span class="pill pill-completed">⭐ ${c.google_click || 0} Google</span>
        </div></div>`;
  }

  function clQr() {
    $("mainContent").innerHTML = `
      <div class="admin-head"><div><h1>My QR</h1><p>Print it and place it at your counter.</p></div></div>
      <div class="qr-big" style="max-width:440px;margin:0 auto">
        <h2 style="margin-bottom:4px">${esc(myBiz.name)}</h2>
        <p class="desc">Scan → leave a review</p>
        <div id="qrBox"></div>
        <div class="link-chip" id="qrLinkText" style="margin-bottom:16px"></div>
        <div class="row-actions" style="justify-content:center">
          <button class="btn btn-ghost btn-sm" id="btnQrCopy2">Copy link</button>
          <button class="btn btn-amber btn-sm" id="btnQrDl2">⬇ Download PNG</button>
        </div>
      </div>`;
    const link = rkPageUrl(myBiz.slug);
    $("qrLinkText").textContent = link;
    if (typeof QRCode === "undefined") {
      $("qrBox").innerHTML = `<p style="color:var(--muted);font-size:14px">The QR library failed to load.<br>Please use the copy link instead.</p>`;
    } else new QRCode($("qrBox"), { text: link, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
    $("btnQrCopy2").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(link); rkToast("Link copied ✓"); }
      catch (e) { rkToast("Copy failed — long-press the link to copy it"); }
    });
    $("btnQrDl2").addEventListener("click", () => downloadQr(link, myBiz.slug));
  }

  function downloadQr(link, slug) {
    const box = $("qrBox") || document.querySelector("#qrModal #qrBox");
    const img = box ? box.querySelector("img") : null;
    const canvas = box ? box.querySelector("canvas") : null;
    const src = img ? img.src : (canvas ? canvas.toDataURL("image/png") : null);
    if (!src) return rkToast("QR isn't ready yet — please wait a moment");
    const a = document.createElement("a");
    a.href = src; a.download = "reviewkaro-" + slug + ".png";
    document.body.appendChild(a); a.click(); a.remove();
    rkToast("QR downloaded ✓");
  }

  async function clFeedback() {
    const { data, error: fbErr } = await sb.from("rk_events").select("*").eq("business_id", myBiz.id)
      .eq("type", "feedback").order("created_at", { ascending: false }).limit(100);
    if (fbErr) console.warn("[ReviewKaro] feedback load failed:", fbErr.message);
    myBiz._fb = data || [];
    try { localStorage.setItem("rk_read_" + myBiz.id, String(Date.now())); } catch (e) {}
    renderTabs();
    $("mainContent").innerHTML = `
      <div class="admin-head"><div><h1>Feedback</h1><p>Private complaints — never posted on Google. Read and fix them here.</p></div></div>
      ${(data || []).map((x) => `
        <div class="fb-item">
          <div class="fb-top"><div><span class="fb-name">Private feedback</span>
          <span class="fb-meta"> · ${timeAgo(x.created_at)}</span></div></div>
          <div class="fb-msg">${esc((x.meta && x.meta.message) || "")}</div>
          <div class="row-actions"><button class="btn btn-danger btn-sm" data-fdel="${x.id}">Delete</button></div>
        </div>`).join("") || `<div class="panel"><div class="empty"><div class="big">🎉</div>No complaints — everyone is happy! 🎉</div></div>`}`;
    $("mainContent").querySelectorAll("[data-fdel]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Delete this?")) return;
      const { error: delErr } = await sb.from("rk_events").delete().eq("id", b.dataset.fdel);
      if (delErr) return rkToast("Delete failed: " + delErr.message);
      showTab("feedback");
    }));
  }

  function clSub() {
    const upi = RK_CONFIG.KNOWNLABS_UPI || "— UPI ID not set —";
    const PLANS = {
      monthly: { label: "1 month", amt: 399 },
      quarterly: { label: "3 months", amt: 999 }
    };
    let plan = "quarterly";
    $("mainContent").innerHTML = `
      <div class="admin-head"><div><h1>Subscription</h1><p>Keep your plan active so your QR keeps running.</p></div></div>
      ${subBanner(myBiz)}
      <div class="panel" style="max-width:560px;margin:0 auto">
        <h2>1 · Choose your plan</h2>
        <div class="plan-pick">
          <button data-plan="monthly"><div class="pp">1 MONTH</div><div class="pa">₹399</div><div class="pd">per month</div></button>
          <button data-plan="quarterly" class="sel"><div class="pp">3 MONTHS</div><div class="pa">₹999</div><div class="pd">₹333/month · save ₹198</div></button>
        </div>
        <h2>2 · Pay on UPI</h2>
        <p class="desc">Send <b id="payAmt">₹999</b> to the UPI ID below, then tap <b>"I've paid"</b>.</p>
        <div class="upi-box"><div style="font-size:12px;color:var(--muted);font-weight:700;letter-spacing:.08em">KNOWNLABS UPI ID</div>
          <div class="id">${esc(upi)}</div>
          <button class="btn btn-ghost btn-sm" id="btnUpiCopy" style="margin-top:8px">Copy UPI ID</button></div>
        <button class="btn btn-amber" id="btnPaid" style="width:100%">I've paid — send on WhatsApp</button>
        <p class="desc" style="text-align:center;margin-bottom:0">Your plan will be activated once your payment is verified.</p>
      </div>`;
    $("mainContent").querySelectorAll(".plan-pick button").forEach((b) =>
      b.addEventListener("click", () => {
        plan = b.dataset.plan;
        $("mainContent").querySelectorAll(".plan-pick button").forEach((x) => x.classList.toggle("sel", x === b));
        $("payAmt").textContent = "₹" + PLANS[plan].amt;
      }));
    $("btnUpiCopy").addEventListener("click", async () => {
      if (!RK_CONFIG.KNOWNLABS_UPI) return rkToast("UPI ID is not set yet — please contact KnownLabs");
      try { await navigator.clipboard.writeText(RK_CONFIG.KNOWNLABS_UPI); rkToast("UPI ID copied ✓"); }
      catch (e) { rkToast("Copy failed — please note the UPI ID manually"); }
    });
    $("btnPaid").addEventListener("click", () => {
      const p = PLANS[plan];
      const msg = "Hello KnownLabs, I have completed the payment for ReviewKaro.%0A%0A" +
        "Business: " + encodeURIComponent(myBiz.name) + "%0A" +
        "Plan: " + encodeURIComponent(p.label + " (Rs. " + p.amt + ")") + "%0A%0A" +
        "Please activate my subscription.";
      window.open("https://wa.me/" + RK_CONFIG.KNOWNLABS_WHATSAPP + "?text=" + msg, "_blank");
      rkToast("WhatsApp opened — just hit send ✓");
    });
  }

  async function clAccount() {
    const { data: { user } } = await sb.auth.getUser();
    const isGoogle = user.app_metadata && user.app_metadata.provider === "google";
    const cs = catState(myBiz.category);
    const pwSection = isGoogle
      ? `<p class="desc" style="margin:18px 0 0">Signed in with Google — no password needed for this account.</p>`
      : `<h2 style="margin:20px 0 4px">Change password</h2>
        <div class="field"><label>New password</label><input type="password" id="pw1" placeholder="••••••••"></div>
        <div class="field"><label>Repeat it</label><input type="password" id="pw2" placeholder="••••••••"></div>
        <button class="btn btn-dark btn-sm" id="btnPwSave">Update password</button>`;
    $("mainContent").innerHTML = `
      <div class="admin-head"><div><h1>Profile</h1><p>Update your business details anytime.</p></div></div>
      <div class="panel" style="max-width:560px">
        <div class="acct-row"><span style="color:var(--muted)">Email</span><b>${esc(user.email)}</b></div>
        <div class="acct-row"><span style="color:var(--muted)">QR link</span><span class="link-chip">r.html?b=${esc(myBiz.slug)}</span></div>
        <h2 style="margin:20px 0 4px">Business details</h2>
        <div class="field"><label>Business name *</label><input id="pName" value="${esc(myBiz.name)}" placeholder="City Care Hospital"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="field"><label>Category *</label><select id="pCat">${catOptions(cs.sel)}</select></div>
          <div class="field"><label>City</label><input id="pCity" value="${esc(myBiz.city || "")}" placeholder="Patna"></div>
        </div>
        <div class="field hidden" id="pCatOtherWrap"><label>Your business type *</label><input id="pCatOther" value="${esc(cs.other)}" placeholder="e.g. Bakery, Gym, Pet shop"></div>
        <div class="field"><label>Google review link *</label><input id="pGoogle" value="${esc(myBiz.google_review_url || "")}" placeholder="https://g.page/r/.../review"></div>
        <div class="field"><label>Owner WhatsApp *</label><input id="pPhone" value="${esc(myBiz.owner_phone || "")}" placeholder="9198XXXXXXXX"></div>
        <p class="desc" style="margin:0 0 12px">Changing your name won't change your QR link — already printed QRs keep working.</p>
        <button class="btn btn-amber" id="btnProfileSave" style="width:100%">Save changes</button>
        ${pwSection}
        <div style="margin:22px 0 14px;border-top:1px solid var(--line);padding-top:18px">
          <button class="btn-logout" id="btnLogout2">Logout</button>
        </div>
        <p class="desc" style="text-align:center;margin-bottom:0">
          <a href="#" id="linkPrivacy" style="color:var(--muted)">Privacy Policy</a> ·
          <a href="#" id="linkTerms" style="color:var(--muted)">Terms &amp; Conditions</a>
        </p>
      </div>`;
    wireCatOther("pCat", "pCatOtherWrap");
    $("btnLogout2").addEventListener("click", doLogout);
    $("linkPrivacy").addEventListener("click", (e) => { e.preventDefault(); showTab("privacy"); });
    $("linkTerms").addEventListener("click", (e) => { e.preventDefault(); showTab("terms"); });
    $("btnProfileSave").addEventListener("click", async () => {
      const name = $("pName").value.trim(), google = $("pGoogle").value.trim(), phone = $("pPhone").value.trim();
      if (!name || !google || !phone) return rkToast("Name, Google link and WhatsApp are required");
      const category = readCategory("pCat", "pCatOther");
      if (!category) return rkToast("Please write your business type");
      $("btnProfileSave").disabled = true;
      const { error, data } = await sb.from("rk_businesses").update({
        name: name, category: category, city: $("pCity").value.trim(),
        google_review_url: google, owner_phone: phone.replace(/\D/g, "")
      }).eq("id", myBiz.id).select().single();
      $("btnProfileSave").disabled = false;
      if (error) return rkToast("Fail: " + error.message);
      myBiz = data;
      $("navName").textContent = myBiz.name;
      $("navAva").textContent = (myBiz.name.trim().charAt(0) || "•").toUpperCase();
      rkToast("Profile updated ✓");
    });
    if (!isGoogle) {
      $("btnPwSave").addEventListener("click", async () => {
        const a = $("pw1").value, b = $("pw2").value;
        if (a.length < 6) return rkToast("Password must be at least 6 characters");
        if (a !== b) return rkToast("The two passwords don't match");
        const { error } = await sb.auth.updateUser({ password: a });
        rkToast(error ? error.message : "Password changed ✓");
        if (!error) { $("pw1").value = ""; $("pw2").value = ""; }
      });
    }
  }

  /* ================= SUPERADMIN PROFILE ================= */
  async function saProfile() {
    const { data: { user } } = await sb.auth.getUser();
    const isGoogle = user.app_metadata && user.app_metadata.provider === "google";
    $("mainContent").innerHTML = `
      <div class="admin-head"><div><h1>Profile</h1><p>Your superadmin account.</p></div></div>
      <div class="panel" style="max-width:560px">
        <div class="acct-row"><span style="color:var(--muted)">Email</span><b>${esc(user.email)}</b></div>
        <div class="acct-row"><span style="color:var(--muted)">Role</span><b>Superadmin</b></div>
        <div class="acct-row"><span style="color:var(--muted)">Sign-in</span><b>${isGoogle ? "Google" : "Email + password"}</b></div>
        <div style="margin:22px 0 14px;border-top:1px solid var(--line);padding-top:18px">
          <button class="btn-logout" id="btnLogout2">Logout</button>
        </div>
        <p class="desc" style="text-align:center;margin-bottom:0">
          <a href="#" id="linkPrivacy" style="color:var(--muted)">Privacy Policy</a> ·
          <a href="#" id="linkTerms" style="color:var(--muted)">Terms &amp; Conditions</a>
        </p>
      </div>`;
    $("btnLogout2").addEventListener("click", doLogout);
    $("linkPrivacy").addEventListener("click", (e) => { e.preventDefault(); showTab("privacy"); });
    $("linkTerms").addEventListener("click", (e) => { e.preventDefault(); showTab("terms"); });
  }

  /* ================= LEGAL ================= */
  function legalPage(kind) {
    const isP = kind === "privacy";
    const body = isP ? `
      <p class="updated">Last updated: 27 September 2026 · ReviewKaro by KnownLabs</p>
      <p>ReviewKaro ("we", "our") is a QR-based review and feedback product for local businesses, built and operated by KnownLabs. This policy explains what data we collect and how we use it.</p>
      <h2>What we collect</h2>
      <ul>
        <li><b>Business details</b> — business name, category, city, Google review link and WhatsApp number, provided by the business owner during setup.</li>
        <li><b>Account details</b> — email address and Google profile information (name, profile photo) when you sign in with Google.</li>
        <li><b>Customer feedback</b> — messages customers write when they tap "Not great". These stay private and are visible only in the business owner's dashboard.</li>
        <li><b>Usage events</b> — anonymous counters such as QR scans, review generations and button taps, used to show business statistics.</li>
      </ul>
      <h2>AI-generated reviews</h2>
      <p>When a customer asks for a review, the business name, category and city are sent to Google's Gemini API to generate the review text. Nothing else is shared. Generated text is never posted anywhere automatically — the customer copies it and posts it themselves.</p>
      <h2>How we use data</h2>
      <ul>
        <li>To run the product: dashboards, QR links, feedback inbox and subscription status.</li>
        <li>To contact business owners about their subscription and support.</li>
      </ul>
      <p>We do not sell personal data. We do not share it with advertisers.</p>
      <h2>Data retention</h2>
      <p>Business and feedback data is kept while the account is active. If an account is deleted, associated business data is removed on request.</p>
      <h2>Your rights</h2>
      <p>Write to us on WhatsApp at the KnownLabs number shown in your Subscription page for access, correction or deletion of your data.</p>
      <h2>Changes</h2>
      <p>We may update this policy; the latest version is always available here.</p>` : `
      <p class="updated">Last updated: 27 September 2026 · ReviewKaro by KnownLabs</p>
      <h2>1. The service</h2>
      <p>ReviewKaro provides businesses with a QR code that opens a customer page: happy customers get an AI-written review draft they can copy and post on Google; unhappy customers can send private feedback to the business owner.</p>
      <h2>2. Trial and subscription</h2>
      <ul>
        <li>Every new business gets a <b>3-day free trial</b>.</li>
        <li>After the trial there is a <b>3-day grace period</b> with reminders in the dashboard.</li>
        <li>If no plan is activated, the QR page is <b>automatically paused</b> until a plan is active again.</li>
        <li>Plans: <b>₹399 per month</b> or <b>₹999 for 3 months</b>.</li>
      </ul>
      <h2>3. Payment</h2>
      <p>Payment is manual via UPI to the KnownLabs UPI ID shown in the Subscription page. After paying, the business taps "I've paid" which opens WhatsApp with the payment details. The plan is activated after the payment is verified. Activation is manual and may take a few hours.</p>
      <h2>4. Refunds</h2>
      <p>Plans are non-refundable once activated. If a payment was made but the plan was never activated, contact KnownLabs on WhatsApp for a resolution.</p>
      <h2>5. Fair use and reviews</h2>
      <ul>
        <li>Businesses are responsible for how reviews are used. Reviews must comply with Google's review policies; incentivised or misleading reviews may be removed by Google.</li>
        <li>Private feedback sent through the product must not be published by the business without the customer's consent.</li>
        <li>The QR code and dashboard are for the subscribing business only and may not be resold or shared with other businesses.</li>
      </ul>
      <h2>6. Availability</h2>
      <p>We aim for reliable service but do not guarantee uninterrupted availability. AI review generation depends on Google's Gemini API and may occasionally be unavailable, in which case a ready-made review template is shown instead.</p>
      <h2>7. Termination</h2>
      <p>KnownLabs may suspend accounts for misuse, non-payment or violation of these terms. Businesses may stop using the service anytime; the subscription simply lapses at the end of the paid period.</p>
      <h2>8. Contact</h2>
      <p>For billing, support or legal questions, reach KnownLabs on WhatsApp via the number in your Subscription page.</p>`;
    $("mainContent").innerHTML = `
      <div class="admin-head"><div><h1>${isP ? "Privacy Policy" : "Terms & Conditions"}</h1>
      <p>ReviewKaro · by KnownLabs</p></div></div>
      <div class="panel legal-doc" style="max-width:720px">${body}</div>`;
  }

  /* ================= QR MODAL (shared) ================= */
  let qrLink = "", qrSlug = "";
  function openQr(slug, name) {
    qrLink = rkPageUrl(slug); qrSlug = slug;
    $("qrTitle").textContent = name;
    $("qrLink").textContent = qrLink;
    $("qrBox").innerHTML = "";
    if (typeof QRCode === "undefined") {
      $("qrBox").innerHTML = `<p style="font-size:14px;color:var(--muted);padding:24px 12px">QR library failed to load.<br>Use <b>Copy link</b> instead.</p>`;
    } else new QRCode($("qrBox"), { text: qrLink, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M });
    $("qrModal").classList.remove("hidden");
  }
  $("btnQrClose").addEventListener("click", () => $("qrModal").classList.add("hidden"));
  $("qrModal").addEventListener("click", (e) => { if (e.target === $("qrModal")) $("qrModal").classList.add("hidden"); });
  $("btnQrCopy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(qrLink); rkToast("Link copied ✓"); }
    catch (e) { rkToast("Copy failed — long-press the link to copy it"); }
  });
  $("btnQrDl").addEventListener("click", () => downloadQr(qrLink, qrSlug));

  init();
})();
