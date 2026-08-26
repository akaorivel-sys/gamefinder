
(() => {
  const CFG = "/data/monetization.json";

  const escapeAttr = (s) => String(s || "").replace(/"/g, "&quot;");
  const hide = (el) => { if (el) el.hidden = true; };

  async function loadConfig() {
    try {
      const res = await fetch(CFG, { cache: "no-store" });
      if (!res.ok) throw new Error("config");
      return await res.json();
    } catch {
      return null;
    }
  }

  function setupAffiliate(cfg) {
    const root = cfg && cfg.affiliate;
    document.querySelectorAll("[data-affiliate-key]").forEach(box => {
      const key = box.dataset.affiliateKey || "";
      const url = root && root.enabled && root.links ? root.links[key] : "";
      if (!url) {
        hide(box);
        return;
      }
      const a = box.querySelector("a");
      if (!a) return;
      a.href = url;
      a.textContent = root.label || "提携ストアで価格を見る";
      a.rel = "sponsored nofollow noopener noreferrer";
      a.target = "_blank";
      const note = box.querySelector("[data-affiliate-note]");
      if (note) note.textContent = root.disclosure || "広告リンクを含みます。";
      box.hidden = false;
    });
  }

  function loadAdsenseScript(client) {
    if (!client || document.querySelector('script[data-gf-adsense]')) return;
    const s = document.createElement("script");
    s.async = true;
    s.dataset.gfAdsense = "1";
    s.crossOrigin = "anonymous";
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(client);
    document.head.appendChild(s);
  }

  function setupAds(cfg) {
    const ads = cfg && cfg.adsense;
    const canUse = ads && ads.enabled && ads.client;
    document.querySelectorAll("[data-ad-slot-key]").forEach(box => {
      const key = box.dataset.adSlotKey;
      const slot = canUse && ads.slots ? ads.slots[key] : "";
      if (!slot) {
        hide(box);
        return;
      }
      box.hidden = false;
      const ins = box.querySelector("ins.adsbygoogle");
      if (!ins) return;
      ins.dataset.adClient = ads.client;
      ins.dataset.adSlot = slot;
      ins.dataset.adFormat = "auto";
      ins.dataset.fullWidthResponsive = "true";
    });
    if (!canUse) return;
    loadAdsenseScript(ads.client);
    const boot = () => {
      document.querySelectorAll("ins.adsbygoogle").forEach(ins => {
        if (ins.dataset.gfLoaded) return;
        ins.dataset.gfLoaded = "1";
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch {}
      });
    };
    setTimeout(boot, 500);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const cfg = await loadConfig();
    setupAffiliate(cfg);
    setupAds(cfg);
  });
})();
