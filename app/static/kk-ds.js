/* Kwik Klin Design System — chhote shared helpers, /admin aur /staff + /solo
   dono mein. Business logic yahan nahi hai: bill ka hisaab aur API apni jagah
   rehte hain. CSS: kk-ds.css. Reference: docs/DESIGN-SYSTEM.md. */
window.KKDS = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* Poora cart dobara banta hai (innerHTML): chips ki aadi patti apni jagah
     rahe. Upar-neeche ka scroll KKBill.keep sambhalta hai. */
  function keepScroll(fn, ids = []) {
    const xs = ids.map((id) => [id, document.getElementById(id)?.scrollLeft || 0]);
    fn();
    xs.forEach(([id, x]) => { const el = document.getElementById(id); if (el) el.scrollLeft = x; });
  }

  /* Draft: server par bill-draft hota hi nahi, isliye sirf isi device par, us
     user ke naam, 7 din. Band storage (private window) par chup-chaap kuch nahi. */
  const DRAFT_DAYS = 7;
  const draftKey = (scope) => `kk.billdraft.v1.${scope}`;
  const draft = {
    save(scope, data) {
      try { localStorage.setItem(draftKey(scope), JSON.stringify({ ...data, at: Date.now() })); return true; }
      catch (e) { return false; }
    },
    load(scope) {
      try {
        const d = JSON.parse(localStorage.getItem(draftKey(scope)) || "null");
        if (d && Date.now() - d.at < DRAFT_DAYS * 864e5) return d;
        if (d) localStorage.removeItem(draftKey(scope));
      } catch (e) { /* kharab draft = koi draft nahi */ }
      return null;
    },
    clear(scope) { try { localStorage.removeItem(draftKey(scope)); } catch (e) { /* storage band */ } },
    label(d) {
      const n = (d.items || []).length;
      const when = new Date(d.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
      return `${d.customer || "Customer not set"} · ${n} item${n === 1 ? "" : "s"} · saved ${when}`;
    },
  };
  /* Autocomplete: bahar tap ya agle khaane par jaate hi band. */
  const closeSuggestions = (e) => {
    // KKBill.combo apni list khud sambhalta hai (role=listbox)
    document.querySelectorAll('.kb-acp:not([role="listbox"])').forEach((p) => {
      if (p.innerHTML && !p.closest(".kb-ac")?.contains(e.target)) p.innerHTML = "";
    });
  };
  document.addEventListener("pointerdown", closeSuggestions);
  document.addEventListener("focusin", closeSuggestions);

  return { esc, keepScroll, draft };
})();
