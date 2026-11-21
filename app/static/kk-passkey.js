/* WhatsApp passkey step — admin (home number), owner app (dukaan ka number),
   control panel (sales number). Teeno ek hi component use karte hain.

   Kyun: WhatsApp kuch numbers par QR / code scan ke baad passkey maangta hai.
   WAHA session PASSKEY_REQUIRED par ruk jaata hai. Passkey sirf
   web.whatsapp.com ke page par sign ho sakti hai (WebAuthn origin se bandha
   hai), isliye:
     1. WAHA ka free "WhatsApp Browser Extension" laga ho -> ek button, wo
        web.whatsapp.com tab kholkar sign karta hai.
     2. Na ho -> haath se: script copy, web.whatsapp.com ke Console mein
        chipkao, jawab wapas yahan chipkao.
     3. Android -> Chrome mein extension nahi chalta, par Firefox (Android) mein
        WAHA ka add-on chalta hai: Firefox + add-on ke steps. Firefox mein add-on
        aa gaya to upar wala (1) ka button hi dikhta hai.
        iPhone -> koi rasta nahi: "computer par kholo".
   Kabhi-kabhi WhatsApp phone par 4 ank dikhata hai
   (PASSKEY_CONFIRMATION_REQUIRED): wahi yahan dikhao, owner "haan" dabaye.

   KKPasskey.mount(box, { api, base, lang, onDone, onRestart })
     api(path, opts)  page ka apna JSON helper ({ method, body })
     base             GET = haal, POST = jawab, POST base + "/confirm" = code sahi
     lang             "hi" ya "en" (default "en")
     onDone()         session WORKING
     onRestart(state) passkey wala haal khatam par WORKING nahi (QR expire / FAILED)

   Markup mein koi inline style / handler nahi (control + owner app ka CSP). */
(function () {
  "use strict";

  const EXT_ID = "ghpdcgnjffaaekflfpcgkgpbafmjldcp";
  const CHROME_STORE = "https://chromewebstore.google.com/detail/" + EXT_ID;
  const FIREFOX_STORE = "https://addons.mozilla.org/firefox/addon/whatsapp-browser-extension/";
  const STATES = ["PASSKEY_REQUIRED", "PASSKEY_CONFIRMATION_REQUIRED"];
  const POLL_MS = 4000;
  const SENT_GRACE_MS = 20000;

  const S = {
    title: ["पासकी से पक्का करें", "Confirm with passkey"],
    why: ["WhatsApp ने जोड़ने के लिए एक बार पासकी माँगी है। यह आपके फ़ोन का फ़िंगरप्रिंट, चेहरा या PIN है, कोई पासवर्ड नहीं।",
      "WhatsApp asked for a passkey to finish linking. It is a one-time step with your phone's fingerprint, face or PIN, not a password."],
    ext_steps: ["नीचे बटन दबाएँ। WhatsApp Web का टैब खुलेगा: वहाँ \"Confirm connection\" दबाएँ और फ़िंगरप्रिंट या PIN दें। टैब अपने आप बंद होगा।",
      "Press the button below. A WhatsApp Web tab opens: press \"Confirm connection\" there and use your fingerprint, face or PIN. The tab closes by itself."],
    sign_btn: ["पासकी से पक्का करें", "Confirm with passkey"],
    install: ["मुफ़्त WhatsApp Browser Extension लगाएँ", "Install the free WhatsApp Browser Extension"],
    install_note: ["एक बार लगाना है। Chrome, Edge, Brave और Firefox में चलता है। लगाकर यह पेज खुला रखें।",
      "One-time install. Works in Chrome, Edge, Brave and Firefox. Keep this page open while you install it."],
    installed: ["लगा लिया, फिर देखें", "I installed it, check again"],
    not_found: ["एक्सटेंशन अभी नहीं मिला। लगाने के बाद पेज एक बार रीलोड करें।", "The extension was not found. After installing, reload this page once."],
    mobile: ["यह कदम फ़ोन के ब्राउज़र में नहीं होता। कंप्यूटर पर Chrome या Edge में यही पेज खोलें, लॉगिन करें और WhatsApp वाले हिस्से में यह कदम पूरा करें। फ़ोन पास रखें।",
      "This step can't be done in a phone browser. Open this same page in Chrome or Edge on a computer, log in, and finish this step in the WhatsApp section. Keep your phone close."],
    copy_link: ["लिंक कॉपी करें", "Copy link"],
    android_ff: ["Android फ़ोन पर यह कदम Firefox ब्राउज़र से हो जाता है:", "On an Android phone you can finish this in the Firefox browser:"],
    af1: ["Play Store से Firefox लगाएँ:", "Install Firefox from the Play Store:"],
    af2: ["Firefox में यही पेज खोलें और लॉगिन करें:", "Open this same page in Firefox and log in:"],
    af3: ["Firefox में यह एक्सटेंशन जोड़ें (\"Add to Firefox\" दबाएँ):", "In Firefox, add this extension (press \"Add to Firefox\"):"],
    af4: ["यहाँ WhatsApp वाले हिस्से में लौटें: \"पासकी से पक्का करें\" बटन आएगा। उसे दबाकर फ़िंगरप्रिंट दें।",
      "Come back to the WhatsApp section: a \"Confirm with passkey\" button appears. Press it and use your fingerprint."],
    af_time: ["2-3 मिनट से ज़्यादा लगे तो कोई बात नहीं: Firefox में ही नया कोड लेकर फिर जोड़ें।",
      "If it takes more than 2-3 minutes, no problem: get a new code in Firefox and link again."],
    ff_add: ["बस एक कदम बाकी: Firefox में WhatsApp Browser Extension जोड़ें, फिर \"लगा लिया, फिर देखें\" दबाएँ।",
      "One step left: add the WhatsApp Browser Extension to Firefox, then press \"I installed it, check again\"."],
    or_computer: ["या यही कदम कंप्यूटर पर करें, फ़ोन पास रखें।", "Or do this step on a computer, with your phone close by."],
    manual: ["एक्सटेंशन नहीं लगा सकते? हाथ से करें", "Can't install the extension? Do it by hand"],
    m1: ["यह कोड कॉपी करें:", "Copy this code:"],
    copy_code: ["कोड कॉपी करें", "Copy code"],
    m2: ["नए टैब में खोलें:", "Open in a new tab:"],
    m3: ["वहाँ F12 दबाएँ और Console खोलें। Chrome चिपकाने से रोके तो allow pasting लिखकर Enter दबाएँ। कोड चिपकाकर Enter दबाएँ। ऊपर नीला बटन आएगा: उसे दबाकर फ़िंगरप्रिंट या PIN दें।",
      "There press F12 and open Console. If Chrome blocks pasting, type allow pasting and press Enter. Paste the code and press Enter. A blue button appears at the top: press it and use your fingerprint, face or PIN."],
    m4: ["जो जवाब कॉपी हुआ, यहाँ चिपकाएँ:", "Paste the answer it copied here:"],
    send: ["भेजें", "Send"],
    copied: ["कॉपी हो गया", "Copied"],
    copy_fail: ["कॉपी नहीं हुआ। नीचे से ख़ुद चुनकर कॉपी करें।", "Could not copy. Select the text below and copy it yourself."],
    bad_paste: ["यह सही जवाब नहीं है। पूरा टेक्स्ट फिर से कॉपी करके चिपकाएँ।", "This is not the passkey answer. Copy the whole text again and paste it."],
    sent: ["भेज दिया। WhatsApp जोड़ रहा है…", "Sent. WhatsApp is finishing the link…"],
    done: ["WhatsApp जुड़ गया ✅", "WhatsApp connected ✅"],
    code_title: ["कोड मिलाएँ", "Match the code"],
    code_q: ["क्या आपके फ़ोन पर WhatsApp में भी यही कोड दिख रहा है?", "Does WhatsApp on your phone show this same code?"],
    code_yes: ["हाँ, यही कोड है", "Yes, it matches"],
    code_no: ["अलग है तो कुछ न दबाएँ। नया QR लेकर फिर जोड़ें।", "If it is different, don't press anything. Get a new QR and link again."],
    no_challenge: ["WhatsApp अभी पासकी नहीं माँग रहा। नया QR लेकर फिर स्कैन करें।", "WhatsApp is not asking for a passkey right now. Get a new QR and scan again."],
    ext_fail: ["एक्सटेंशन से नहीं हुआ:", "The extension could not finish:"],
  };

  const isFirefox = () => /firefox/i.test(navigator.userAgent);
  const isMobile = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  // Android Firefox mein add-on chalta hai (AMO: android 120+); Android Chrome mein nahi
  const isAndroid = () => /Android/i.test(navigator.userAgent);
  const FIREFOX_PLAY = "https://play.google.com/store/apps/details?id=org.mozilla.firefox";
  const isPasskey = (s) => STATES.includes(String(s || "").toUpperCase());

  /* ---- Extension se baat (WAHA guide: waha.devlike.pro/blog/waha-passkey) ---- */
  function pingChrome() {
    return new Promise((resolve) => {
      const rt = window.chrome && window.chrome.runtime;
      if (!rt || !rt.sendMessage) return resolve(false);
      const timer = setTimeout(() => resolve(false), 400);
      try {
        rt.sendMessage(EXT_ID, { type: "waha-passkey-ping" }, (resp) => {
          clearTimeout(timer);
          resolve(!rt.lastError && !!resp && resp.ok === true);
        });
      } catch (e) { clearTimeout(timer); resolve(false); }
    });
  }

  // Firefox: content script window.postMessage se. Sign mein owner ka samay
  // lagta hai (click + fingerprint), isliye minute bhar; ping jaldi.
  function callFirefox(type, challenge, timeoutMs) {
    return new Promise((resolve, reject) => {
      const requestId = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random();
      const timer = setTimeout(() => { cleanup(); reject(new Error("No response from the extension")); }, timeoutMs || 180000);
      function onMessage(ev) {
        if (ev.source !== window) return;
        const d = ev.data;
        if (!d || d.source !== "waha-passkey-extension" || d.requestId !== requestId) return;
        cleanup();
        if (!d.ok) return reject(new Error(d.error || "Signing failed"));
        resolve(d);
      }
      function cleanup() { clearTimeout(timer); window.removeEventListener("message", onMessage); }
      window.addEventListener("message", onMessage);
      window.postMessage({ source: "waha-passkey-page", requestId, type, challenge }, window.location.origin);
    });
  }

  const ping = () => (isFirefox()
    ? callFirefox("waha-passkey-ping", null, 400).then(() => true, () => false)
    : pingChrome());

  function sign(challenge) {
    if (isFirefox()) return callFirefox("waha-passkey-sign", challenge).then((d) => d.assertion);
    return new Promise((resolve, reject) => {
      window.chrome.runtime.sendMessage(EXT_ID, { type: "waha-passkey-sign", challenge }, (resp) => {
        const err = window.chrome.runtime.lastError;
        if (err) return reject(new Error(err.message));
        if (!resp || !resp.ok) return reject(new Error((resp && resp.error) || "Signing failed"));
        resolve(resp.assertion);
      });
    });
  }

  /* ---- Haath wala rasta: web.whatsapp.com ke Console mein chalne wali script ----
     Ye function apne aap mein poora hai (toString karke challenge ke saath
     copy hota hai); bahar ki koi cheez use nahi karta. */
  function consoleStep(o) {
    const b64 = (s) => {
      s = String(s).replace(/-/g, "+").replace(/_/g, "/");
      while (s.length % 4) s += "=";
      const r = atob(s); const u = new Uint8Array(r.length);
      for (let i = 0; i < r.length; i++) u[i] = r.charCodeAt(i);
      return u.buffer;
    };
    const enc = (buf) => {
      const u = new Uint8Array(buf); let s = "";
      for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
      return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    };
    const opts = () => (PublicKeyCredential.parseRequestOptionsFromJSON
      ? PublicKeyCredential.parseRequestOptionsFromJSON(o)
      : Object.assign({}, o, {
        challenge: b64(o.challenge),
        allowCredentials: (o.allowCredentials || []).map((c) => Object.assign({}, c, { id: b64(c.id) })),
      }));
    const toJson = (c) => {
      if (c.toJSON) { try { return c.toJSON(); } catch (e) { /* neeche wala */ } }
      const r = c.response;
      return {
        id: c.id, rawId: enc(c.rawId), type: c.type,
        response: {
          clientDataJSON: enc(r.clientDataJSON), authenticatorData: enc(r.authenticatorData),
          signature: enc(r.signature), userHandle: r.userHandle ? enc(r.userHandle) : undefined,
        },
      };
    };
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#fff;color:#111;"
      + "padding:16px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.3);width:min(440px,92vw);font:15px system-ui;display:grid;gap:10px";
    const b = document.createElement("button");
    b.textContent = "Confirm connection";
    b.style.cssText = "padding:14px;font:600 16px system-ui;background:#1f5af0;color:#fff;border:0;border-radius:10px;cursor:pointer";
    const msg = document.createElement("div");
    const out = document.createElement("textarea");
    out.readOnly = true;
    out.style.cssText = "display:none;min-height:80px;font:12px monospace";
    box.append(b, msg, out);
    document.body.appendChild(box);
    b.onclick = async () => {
      b.disabled = true;
      msg.textContent = "Use your fingerprint, face, PIN or phone…";
      try {
        const cred = await navigator.credentials.get({ publicKey: opts() });
        const text = JSON.stringify(toJson(cred));
        out.value = text; out.style.display = "block"; out.select();
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { try { ok = document.execCommand("copy"); } catch (e2) { ok = false; } }
        msg.textContent = ok ? "Done. The answer is copied: go back and paste it." : "Done. Copy the text below and paste it back.";
        b.textContent = "Done";
      } catch (e) {
        msg.textContent = "Did not work: " + ((e && e.message) || e) + ". Press the button to try again.";
        b.disabled = false;
      }
    };
  }

  const scriptFor = (challenge) => "(" + consoleStep.toString() + ")(" + JSON.stringify(challenge) + ");";

  /* ---- Chhote DOM helpers ---- */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function button(text, ghost) { const b = el("button", ghost ? "kkpk-btn ghost" : "kkpk-btn", text); b.type = "button"; return b; }
  function link(href, text) { const a = el("a", null, text || href); a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; return a; }

  async function copyText(text, fallbackArea) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* neeche */ }
    if (fallbackArea) { fallbackArea.value = text; fallbackArea.hidden = false; fallbackArea.select(); }
    try { return document.execCommand("copy"); } catch (e) { return false; }
  }

  function mount(box, o) {
    const L = o.lang === "hi" ? 0 : 1;
    const T = (k) => (S[k] ? S[k][L] : k);
    const api = o.api, base = o.base;
    const root = el("div", "kkpk");
    root.setAttribute("aria-live", "polite");
    box.replaceChildren(root);
    let alive = true, timer = 0, shown = "", sentAt = 0, busy = false;
    const gone = () => !alive || !root.isConnected;
    const stop = () => { alive = false; clearTimeout(timer); };
    const schedule = () => { clearTimeout(timer); if (!gone()) timer = setTimeout(() => refresh(), POLL_MS); };

    async function run(btn, err, fn) {
      if (busy) return;
      busy = true; btn.disabled = true; err.hidden = true;
      try { await fn(); } catch (e) { err.textContent = (e && e.message) || String(e); err.hidden = false; } finally { busy = false; btn.disabled = false; }
    }

    async function send(assertion) {
      const v = await api(base, { method: "POST", body: { assertion } });
      sentAt = Date.now(); shown = "sent";
      root.replaceChildren(el("h4", null, T("title")), el("p", null, T("sent")));
      await refresh(v);
    }

    async function drawSign(v) {
      const has = await ping();
      if (gone()) return;
      const err = el("p", "kkpk-err"); err.hidden = true; err.setAttribute("role", "alert");
      const kids = [el("h4", null, T("title")), el("p", null, T("why"))];
      if (has) {
        const b = button(T("sign_btn"));
        b.addEventListener("click", () => run(b, err, async () => {
          const fresh = await api(base);
          const ch = (fresh && fresh.challenge) || v.challenge;
          if (!ch) throw new Error(T("no_challenge"));
          let a;
          try { a = await sign(ch); } catch (e) { throw new Error(T("ext_fail") + " " + e.message); }
          await send(a);
        }));
        kids.push(el("p", null, T("ext_steps")), b);
      } else if (isAndroid() && isFirefox()) {
        // Firefox mein aa gaye, bas add-on baaki (Console wala haath ka rasta phone par nahi)
        const row = el("div", "kkpk-row");
        row.append(link(FIREFOX_STORE, T("install")), checkAgain(err));
        kids.push(el("p", null, T("ff_add")), row, el("p", "kkpk-muted", T("or_computer")));
      } else if (isAndroid()) {
        const url = location.origin + location.pathname;
        const ol = el("ol");
        const li1 = el("li"); li1.append(el("span", null, T("af1") + " "), link(FIREFOX_PLAY, "Firefox"));
        const li2 = el("li"); li2.append(el("span", null, T("af2") + " "), copyLink(url), el("span", "kkpk-muted", " " + url));
        const li3 = el("li"); li3.append(el("span", null, T("af3") + " "), link(FIREFOX_STORE, "WhatsApp Browser Extension"));
        ol.append(li1, li2, li3, el("li", null, T("af4")));
        kids.push(el("p", null, T("android_ff")), ol, el("p", "kkpk-muted", T("af_time")), el("p", "kkpk-muted", T("or_computer")));
      } else if (isMobile()) {
        const url = location.origin + location.pathname;
        kids.push(el("p", null, T("mobile")), el("p", "kkpk-muted", url), copyLink(url));
      } else {
        const row = el("div", "kkpk-row");
        row.append(link(isFirefox() ? FIREFOX_STORE : CHROME_STORE, T("install")), checkAgain(err));
        kids.push(row, el("p", "kkpk-muted", T("install_note")), manual(err));
      }
      kids.push(err);
      root.replaceChildren(...kids);
    }

    function checkAgain(err) {
      const again = button(T("installed"), true);
      again.addEventListener("click", () => run(again, err, async () => {
        if (!(await ping())) throw new Error(T("not_found"));
        shown = ""; await refresh();
      }));
      return again;
    }

    function copyLink(url) {
      const c = button(T("copy_link"), true);
      c.addEventListener("click", async () => { if (await copyText(url)) c.textContent = T("copied"); });
      return c;
    }

    function manual(err) {
      const d = el("details");
      d.append(el("summary", null, T("manual")));
      const ol = el("ol");
      const scriptArea = el("textarea"); scriptArea.readOnly = true; scriptArea.hidden = true;
      scriptArea.setAttribute("aria-label", T("copy_code"));
      const copy = button(T("copy_code"), true);
      copy.addEventListener("click", () => run(copy, err, async () => {
        const v = await api(base);
        if (!v || !v.challenge) throw new Error(T("no_challenge"));
        const ok = await copyText(scriptFor(v.challenge), scriptArea);
        copy.textContent = ok ? T("copied") : T("copy_fail");
      }));
      const li1 = el("li"); li1.append(el("span", null, T("m1") + " "), copy, scriptArea);
      const li2 = el("li"); li2.append(el("span", null, T("m2") + " "), link("https://web.whatsapp.com/", "web.whatsapp.com"));
      const li3 = el("li", null, T("m3"));
      const paste = el("textarea"); paste.setAttribute("aria-label", T("m4")); paste.spellcheck = false;
      const go = button(T("send"));
      go.addEventListener("click", () => run(go, err, async () => {
        let a;
        try { a = JSON.parse(paste.value.trim()); } catch (e) { throw new Error(T("bad_paste")); }
        if (!a || typeof a !== "object" || !a.response) throw new Error(T("bad_paste"));
        await send(a);
      }));
      const li4 = el("li"); li4.append(el("span", null, T("m4")), paste, go);
      ol.append(li1, li2, li3, li4);
      d.append(ol);
      return d;
    }

    function drawCode(v) {
      const err = el("p", "kkpk-err"); err.hidden = true; err.setAttribute("role", "alert");
      const yes = button(T("code_yes"));
      yes.addEventListener("click", () => run(yes, err, async () => {
        const r = await api(base + "/confirm", { method: "POST", body: {} });
        sentAt = Date.now(); shown = "sent";
        root.replaceChildren(el("h4", null, T("code_title")), el("p", null, T("sent")));
        await refresh(r);
      }));
      root.replaceChildren(el("h4", null, T("code_title")), el("p", null, T("code_q")),
        el("div", "kkpk-code", v.code || "····"), yes, el("p", "kkpk-muted", T("code_no")), err);
    }

    async function refresh(view) {
      if (gone()) return stop();
      let v = view;
      if (!v) {
        try { v = await api(base); } catch (e) { schedule(); return; }
      }
      if (gone()) return stop();
      const st = String((v && v.state) || "").toUpperCase();
      if (st === "WORKING") {
        stop();
        root.replaceChildren(el("p", "kkpk-ok", T("done")));
        if (o.onDone) o.onDone();
        return;
      }
      if (!isPasskey(st)) {
        // Jawab bhejne ke turant baad WAHA thodi der purani haalat bata sakta hai
        if (sentAt && Date.now() - sentAt < SENT_GRACE_MS) { schedule(); return; }
        stop();
        if (o.onRestart) o.onRestart(st);
        return;
      }
      const key = st + "|" + ((v && v.code) || "");
      const waiting = shown === "sent" && Date.now() - sentAt < SENT_GRACE_MS && st === STATES[0];
      if (key !== shown && !busy && !waiting) {
        shown = key;
        if (st === STATES[1]) drawCode(v); else await drawSign(v);
      }
      schedule();
    }

    refresh(o.view || null);
    return { stop };
  }

  window.KKPasskey = { STATES, isPasskey, mount };
})();
