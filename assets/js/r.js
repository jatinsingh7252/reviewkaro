/* ReviewKaro — customer page: like/dislike → Gemini AI review → copy → Google */
(function () {
  const $ = (id) => document.getElementById(id);
  const STATES = ["st-loading", "st-error", "st-paused", "st-choice", "st-review", "st-feedback", "st-done"];
  let sb = null, business = null, lang = "en", currentReview = "", genIndex = 0;

  /* SEO review angles per category: natural keywords + kya praise karna hai.
     Custom ("Other") category ke liye client ke apne shabdon se auto-fallback. */
  const CAT_SEO = {
    Hospital: { kw: ["hospital", "doctor"], angles: [
      "praise the doctor's treatment and diagnosis",
      "praise the staff's care, cleanliness and facilities",
      "praise the quick attention and overall hospital experience" ] },
    Clinic: { kw: ["clinic", "doctor"], angles: [
      "praise the doctor's treatment and personal attention",
      "praise the clinic's service and fair pricing",
      "praise the overall care and quick recovery" ] },
    Salon: { kw: ["salon"], angles: [
      "praise the stylist's skill and the service result",
      "praise hygiene, ambience and staff behaviour",
      "praise value for money and honest suggestions" ] },
    "Barber Shop": { kw: ["barber shop"], angles: [
      "praise the barber's cutting skill",
      "praise hygiene and quick service",
      "praise fair pricing and friendly behaviour" ] },
    Restaurant: { kw: ["restaurant", "food"], angles: [
      "praise the food taste",
      "praise the serving staff and ambience",
      "praise value for money and family-friendly experience" ] },
    Cafe: { kw: ["cafe", "coffee"], angles: [
      "praise the coffee and snacks quality",
      "praise the ambience and seating comfort",
      "praise quick service and fair pricing" ] },
    "Tea Shop": { kw: ["tea shop", "chai"], angles: [
      "praise the chai taste",
      "praise quick service and low prices",
      "praise the friendly staff" ] },
    Bakery: { kw: ["bakery", "cake"], angles: [
      "praise the taste and freshness",
      "praise variety and custom orders",
      "praise fair pricing and packaging" ] },
    Retail: { kw: ["store"], angles: [
      "praise the product range and quality",
      "praise fair pricing and genuine products",
      "praise the staff's helpfulness" ] },
    "Mobile Repair": { kw: ["mobile repair shop", "phone repair"], angles: [
      "praise the repair quality and genuine parts",
      "praise fair pricing and quick turnaround",
      "praise honest advice and behaviour" ] },
    Electronics: { kw: ["electronics store"], angles: [
      "praise genuine products and fair pricing",
      "praise the staff's product knowledge",
      "praise after-sales support" ] },
    Gym: { kw: ["gym"], angles: [
      "praise the trainers and equipment",
      "praise cleanliness and crowd management",
      "praise flexible timings and fair fees" ] },
    Boutique: { kw: ["boutique"], angles: [
      "praise the stitching and fitting quality",
      "praise design suggestions and fabric quality",
      "praise on-time delivery and fair pricing" ] },
    Pharmacy: { kw: ["pharmacy", "medical store"], angles: [
      "praise genuine medicines and availability",
      "praise fair pricing and quick service",
      "praise the pharmacist's guidance" ] },
    General: { kw: ["service"], angles: [
      "praise the service quality and staff behaviour",
      "praise fair pricing and honest dealing",
      "praise the overall experience" ] }
  };

  function seoFor(category) {
    if (CAT_SEO[category]) return CAT_SEO[category];
    const kw = (category || "service").toLowerCase();
    return { kw: [kw], angles: [
      "praise the service quality and staff behaviour",
      "praise fair pricing and honest dealing",
      "praise the overall experience and quick service" ] };
  }

  /* fallback templates — jab Gemini key na ho ya API fail ho.
     Category keyword + city se thoda SEO flavour rakha gaya hai. */
  function tplEn(name, kw, city) {
    const c = city ? " in " + city : "";
    return [
      "Had a good experience at " + name + ". The " + kw + " is well maintained, staff is polite and the service was quick. Good " + kw + c + ".",
      "Visited " + name + " recently. Genuine " + kw + ", fair dealing and no unnecessary waiting. Staff behaves well with customers" + c + ".",
      "Happy with my visit to " + name + ". Clean place, skilled staff and good service. Would definitely visit again" + c + "."
    ];
  }
  function tplHi(name, kw, city) {
    const c = city ? " " + city + " me" : "";
    return [
      name + " ka experience achha raha. " + kw + " saaf-suthra hai, staff polite hai aur service quick mili" + c + ".",
      name + " gaya tha, kaam genuine laga. Rate fair hai, koi unnecessary wait nahi" + c + ".",
      name + " jaake khush hua. Staff ka behaviour achha hai, service badhiya. Wapas bhi jaunga" + c + "."
    ];
  }

  function show(id) {
    STATES.forEach((s) => $(s).classList.add("hidden"));
    $(id).classList.remove("hidden");
    window.scrollTo(0, 0);
  }

  async function logEvent(type, meta) {
    if (!sb || !business) return;
    try {
      const { error } = await sb.from("rk_events")
        .insert({ business_id: business.id, type: type, meta: meta || {} });
      /* tracking kabhi silent fail nahi hona chahiye — flow nahi rukega,
         lekin console me wajah zaroor dikhegi */
      if (error) console.warn("[ReviewKaro] event not logged:", type, "-", error.message);
    } catch (e) { console.warn("[ReviewKaro] event failed:", type, "-", (e && e.message) || e); }
  }

  /* Model kabhi meta-text ("Review:", word-count notes, quotes) na chipkaye —
     uske liye defensive cleanup. */
  function cleanReview(t) {
    let s = (t || "").trim();
    s = s.replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, "").trim();
    /* leading meta line strip: "Review:", "Title: My Review",
       "Review & Word Count Check:**" — poori pehli line hatao */
    const m = s.match(/^([^\n:]{1,60}:[^\n]{0,80})\n?/);
    if (m && /review|word\s*count|title/i.test(m[1])) s = s.slice(m[0].length).trim();
    s = s.replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, "").trim();
    return s;
  }

  function aiPrompt() {
    const seo = seoFor(business.category);
    const angle = seo.angles[genIndex % seo.angles.length];
    const cityLine = business.city
      ? " Mention \"" + business.city + "\" once if it fits naturally."
      : "";
    const langLine = lang === "hinglish"
      ? "Language: Hinglish — Hindi in Roman script mixed naturally with English, exactly how Indians write Google reviews."
      : "Language: simple, natural English.";
    return "You are a happy customer writing a quick 5-star Google review for \"" + business.name +
      "\", a " + business.category + " in " + (business.city || "India") + ".\n" +
      "Rules:\n" +
      "- Output ONLY the review text. No titles, no labels, no word counts, no quotation marks, no explanations.\n" +
      "- 2 to 4 short sentences, first person, casual like texting a friend.\n" +
      "- " + angle.charAt(0).toUpperCase() + angle.slice(1) + ".\n" +
      "- Write the way real customers write: naturally use 1-2 of these words: " +
      seo.kw.join(", ") + " (no keyword stuffing)." + cityLine + "\n" +
      "- NEVER use these words: phenomenal, exquisite, hidden gem, must visit, highly recommended, above and beyond, top-notch, impeccable.\n" +
      "- No emojis, no hashtags, max one exclamation mark in the whole review.\n" +
      langLine;
  }

  async function geminiGenerate() {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
      RK_CONFIG.GEMINI_MODEL + ":generateContent?key=" + RK_CONFIG.GEMINI_KEY;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: aiPrompt() }] }],
        generationConfig: { temperature: 0.75, maxOutputTokens: 160 }
      })
    });
    if (!res.ok) throw new Error("gemini " + res.status);
    const j = await res.json();
    const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
    const text = parts.map((p) => p.text || "").join("").trim();
    if (!text) throw new Error("empty");
    return text;
  }

  async function generateReview() {
    $("genLoading").classList.remove("hidden");
    $("genDone").classList.add("hidden");
    let text = "", viaAI = false;

    if (RK_CONFIG.GEMINI_KEY) {
      try { text = cleanReview(await geminiGenerate()); viaAI = !!text; }
      catch (e) { /* fallback neeche */ }
    }
    if (!text) {
      const seo = seoFor(business.category);
      const kw = seo.kw[0];
      const arr = lang === "hinglish"
        ? tplHi(business.name, kw, business.city)
        : tplEn(business.name, kw, business.city);
      text = arr[genIndex % arr.length];
    }
    genIndex++;

    currentReview = text;
    $("reviewText").textContent = text;
    const badge = $("genBadge");
    if (viaAI) { badge.className = "ai-badge"; badge.textContent = "✨ Written by AI"; }
    else { badge.className = "tpl-badge"; badge.textContent = "✍️ Ready review"; }
    $("genLoading").classList.add("hidden");
    $("genDone").classList.remove("hidden");
    logEvent("generated", { via: viaAI ? "gemini" : "template", lang: lang });
  }

  async function init() {
    const slug = new URLSearchParams(location.search).get("b");
    if (!slug) return show("st-error");
    try { sb = rkAnonDb(); } catch (e) { return show("st-error"); }

    const { data, error } = await sb.from("rk_businesses")
      .select("*").eq("slug", slug).maybeSingle();
    if (error || !data) return show("st-error");
    business = data;

    // subscription check — expired = paused page (scan phir bhi log hota hai)
    logEvent("scan");
    if (rkSubStatus(business) === "expired") {
      $("pausedBiz").textContent = business.name;
      return show("st-paused");
    }

    const initial = (business.name.trim().charAt(0) || "★").toUpperCase();
    ["bizName", "bizName2", "bizName3"].forEach((id) => { $(id).textContent = business.name; });
    ["bizMark", "bizMark2", "bizMark3"].forEach((id) => { $(id).textContent = initial; });
    show("st-choice");
  }

  /* ---------- wiring ---------- */
  $("btnLike").addEventListener("click", () => {
    logEvent("like");
    show("st-review");
    generateReview();
  });
  $("btnDislike").addEventListener("click", () => {
    logEvent("dislike");
    show("st-feedback");
  });
  $("langEn").addEventListener("click", () => {
    if (lang === "en") return;
    lang = "en";
    $("langEn").classList.add("on"); $("langHi").classList.remove("on");
    generateReview();
  });
  $("langHi").addEventListener("click", () => {
    if (lang === "hinglish") return;
    lang = "hinglish";
    $("langHi").classList.add("on"); $("langEn").classList.remove("on");
    generateReview();
  });
  $("btnRegen").addEventListener("click", generateReview);

  $("btnCopy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(currentReview); }
    catch (e) {
      const ta = document.createElement("textarea");
      ta.value = currentReview; document.body.appendChild(ta);
      ta.select(); try { document.execCommand("copy"); } catch (_) {}
      ta.remove();
    }
    logEvent("copied");
    rkToast("Copied ✓ Now tap the Google button below");
    $("btnGoogle").focus();
  });

  $("btnGoogle").addEventListener("click", () => {
    logEvent("google_click");
    if (business.google_review_url) window.open(business.google_review_url, "_blank");
    $("doneIcon").textContent = "⭐";
    $("doneTitle").textContent = "Thank you!";
    $("doneSub").textContent = "Don't forget to paste and post your review — it means a lot to " + business.name + ".";
    show("st-done");
  });

  $("btnSendFeedback").addEventListener("click", async () => {
    const msg = $("fbText").value.trim();
    if (!msg) { rkToast("Please write a line or two first"); $("fbText").focus(); return; }
    $("btnSendFeedback").disabled = true;
    await logEvent("feedback", { message: msg });
    $("doneIcon").textContent = "🙏";
    $("doneTitle").textContent = "Feedback received";
    $("doneSub").textContent = "The owner will read it personally. Nothing was posted on Google.";
    show("st-done");
  });

  init();
})();
