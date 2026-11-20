# ribattseke.co.za — Full Handover for GitHub Copilot

**Last updated:** 20 November 2026  
**Handed over by:** Claude (Anthropic)  
**Repo:** https://github.com/Ribatt/ribattseke-website  
**Live site:** https://ribattseke.co.za  
**Deployment:** Cloudflare Pages — auto-deploys on push to `main`

---

## 1. The Person Behind the Site

**Riba T Tseke** — sole proprietor, South African engineering education professional.

- Registered Person under the OHS Act Electrical Installation Regulations (DOeL)
- Runs live YouTube sessions on Installation Rules (Paper 1 & Paper 2)
- Sells digital study packs for the South African IE (Installation Electrician) exam
- Provides electrical engineering tutoring, mentorship, trade test preparation

**Brand name:** `Riba T Tseke` — NEVER append "Electrical Services" or any suffix. The brand is exactly that.

---

## 2. Architecture — Single-File SPA Split Across 4 Files

```
ribattseke-website/
├── index.html          ← Main SPA shell: all CSS, tabs scaffold, companion widget,
│                         floating buttons, footer, inline JS stubs, full companion T data
├── admin.js            ← 489KB admin panel (lazy-loaded on demand). Contains:
│                         lmsAdminEntry(), real engageShowDonate() overlay,
│                         client/quote/session management, banking overlay,
│                         PayShap + EFT details
├── tab-resources.html  ← Lazy-loaded into #tab-resources via fetch()
└── tab-study.html      ← Lazy-loaded into #tab-study via fetch(); also loads admin.js
                           for the hidden Admin button
```

### Tab Routing

Navigation happens by showing/hiding `<section id="tab-{name}">` elements.

```javascript
function showTab(name, skipPush) {
  // 1. hide all .tab-panel sections
  // 2. lazy-load tab-{name}.html if not yet loaded (fetch → inject innerHTML)
  // 3. show #tab-{name}
  // 4. pushState to /{name} — WRAPPED in try-catch (SecurityError in preview iframes)
}
```

**Lazy loading** fires once per tab per session. Spinner `.tab-lazy-spinner` is in the placeholder until loaded.

### Admin Loading

admin.js is NOT bundled at page load — it is injected on demand:

```javascript
function _loadAdmin() {
  var s = document.createElement('script');
  s.src = '/admin.js?v=4';   // ← bump version here on every admin.js change
  s.onload  = function() { window._adminLoaded = true; };
  s.onerror = function() { _showDonateInline(); };  // graceful fallback
  document.head.appendChild(s);
}
```

**Version bump rule:** Every time you change admin.js, bump the `?v=N` query string in:
- `index.html` — the `_loadAdmin()` function
- `tab-study.html` — the Admin button onclick

Current version: **v4**

### Donate Button Flow

```
User clicks Donate button (float-pay)
  → engageShowDonate() [stub in index.html]
      → checks if real function already loaded (typeof _engageShowDonateFull)
      → if not, calls _loadAdmin(), polls for _adminLoaded flag
      → on success: calls real engageShowDonate() from admin.js (shows full modal)
      → on failure (4s timeout OR onerror): calls _showDonateInline()
            → inline modal with PayShap 072 474 8888 + EFT details, no admin.js needed
```

---

## 3. Security Constraints — MUST READ

| Constraint | Rule |
|---|---|
| Admin PIN | `20171125` — NEVER use `prompt()` dialog |
| Admin email | `ribattseke@gmail.com` — private, never expose in public HTML |
| Brand name | `Riba T Tseke` only — no suffix ever |
| ECASA vs ECSA | User means ECA(SA) = Electrical Contractors Association SA, NOT ECSA |
| localStorage namespace | `biz_` prefix on ALL admin keys |
| POPIA | Do NOT collect ID numbers from anyone |
| Employer restrictions | No Solar PV, no DB upgrades, no CoC issuance, no "electrical contractor" in public content |
| Admin.js | Contains sensitive banking logic — not for public inspection |

---

## 4. Banking Details (embedded in admin.js AND _showDonateInline)

```
PayShap:  072 474 8888    (Riba T Tseke)
EFT Bank: Capitec Bank
Account:  2605150883
Branch:   470010
Ref:      DONATE (or buyer's name + phone for study keys)
```

---

## 5. The Study Key Business

Two tiers:

| Plan | Price | Access |
|---|---|---|
| Trial | R50 | 4-month access, 90% pass mark, P1 & P2 notes, worked examples |
| IR Companion | R1,000 | Lifetime access, full PDF guide, 10 years past papers + solutions, direct WhatsApp support |

**How keys work:** Buyer pays (PayShap/EFT), sends proof via WhatsApp to 072 474 8888 with their name. Tseke issues the key manually from admin panel (admin.js → `lmsAdminEntry()`).

**Session counter** (used in Study tab UI):
```javascript
var done  = document.querySelectorAll('.snum.done').length;
var total = 20;  // hardcoded
```

---

## 6. Exam Countdown — Auto-Advance Schedule

The countdown cards auto-pick the next upcoming sitting:

```javascript
var sched = [
  {label:'November 2026', p1:{iso:'2026-11-24'}, p2:{iso:'2026-11-30'}},
  {label:'April 2027',    p1:{iso:'2027-04-15'}, p2:{iso:'2027-04-22'}},
  {label:'August 2027',   p1:{iso:'2027-08-19'}, p2:{iso:'2027-08-25'}},
  {label:'November 2027', p1:{iso:'2027-11-24'}, p2:{iso:'2027-11-30'}}
];
// Finds first sitting where p2.iso >= today
```

SA IE exam sittings: April, August, November. When adding new dates, append to the `sched` array — do NOT hardcode.

---

## 7. Tseke's Companion Widget

Floating chat widget — bottom-right, pill-shaped button (60×68px, border-radius 30px).

**Languages supported (as of commit fe929a3):**

| Code | Language | Notes |
|---|---|---|
| en | English | 23 FAQs |
| nso | Sepedi (Northern Sotho) | 18 FAQs — pure Sesotho sa Leboa, NOT Southern Sotho |
| af | Afrikaans | |
| zu | IsiZulu | |
| sn | Shona | |
| xh | IsiXhosa | 11 FAQs (added Nov 2026) |
| nr | isiNdebele | 11 FAQs (added Nov 2026) |

**Data structure:**
```javascript
var T = {
  en: {
    greeting: "...",
    faqs: ["Question 1", "Question 2", ...],
    answers: { "Question 1": "Answer text..." },
    wa: "Chat on WhatsApp"   // WhatsApp button label
  },
  // ... per language
};
```

**Sepedi note:** Use pure Northern Sotho vocabulary. Key words: `go hwetša` (to get/receive), `nkotšiše` (ask me), `ats'ha` (quote). Do NOT use Southern Sotho: `ho fumana`, `bolela le rena`, etc.

**No RTL logic needed** — Arabic was removed in Nov 2026, all languages are LTR.

---

## 8. Floating Buttons

Two pill-shaped buttons (60×68px, border-radius 30px) stacked bottom-right:

```
[ Chat  ]  ← .companion-btn, bottom: calc(96px + env(safe-area-inset-bottom,0px))
[ ♥ Donate ]  ← .float-pay, bottom: calc(20px + env(safe-area-inset-bottom,0px))
```

**#companion-panel** floats above: `bottom: calc(172px + env(safe-area-inset-bottom,0px))`

If you change button heights, recalculate these offsets:
```
donate_bottom = 20px
companion_bottom = donate_bottom + donate_height + 8px gap
panel_bottom = companion_bottom + companion_height + 8px gap
```

---

## 9. Wisdom Quotes Strip

Added Nov 2026 — between `</main>` and `<footer>`:
- Quran 96:1 (Iqra)
- Proverbs 4:7 (Bible)
- Bhagavad Gita 4:38 (Vedas)

3-column grid on desktop, stacked on mobile. CSS class `.wisdom-strip`.

---

## 10. Services Tseke Offers (Public-Facing)

- Electrical compliance inspections
- General electrical installation / repair
- Electrical contracting (project/sub-contract)
- Trade test preparation
- Installation Rules tutoring / mentorship
- Technical consultation
- EWSETA training panel construction

**NOT public (employer restriction):** Solar PV, DB upgrades, CoC issuance.

---

## 11. Key External Links

- YouTube: Search "Riba T Tseke"
- WhatsApp: 072 474 8888
- ECA(SA): https://www.ecasa.co.za
- DOeL (exam registration): https://www.labour.gov.za
- ECSA (engineering council, different from ECA(SA)): https://www.ecsa.co.za

---

## 12. What Was Done in This Claude Session (History)

| Commit | What Changed |
|---|---|
| `0004005` | Exam countdowns restored + auto-advance schedule; Sepedi rewritten to pure Northern Sotho; service FAQs added |
| `fc0daaa` | Circle buttons; companion panel position; 23-entry EN FAQ; 18-entry Sepedi FAQ |
| `fe929a3` | Donate fallback (_showDonateInline); Xhosa+Ndebele companion; wisdom quotes; footer update; delete booking form from about; circle labels; pushState try-catch; v4 cache bust |

---

## 13. Known Quirks & Gotchas

1. **Preview vs production errors:** `history.pushState` and `/admin.js` path both fail in claudeusercontent.com preview iframes — these are not production bugs. pushState is now wrapped in try-catch.

2. **admin.js is 489KB** — deliberately large. It contains the entire admin panel inline. Do not minify without careful testing.

3. **Tab-lazy loading race:** If `showTab('resources')` is called before the fetch completes, the spinner shows until the fetch resolves. This is intentional behaviour.

4. **companionLang key matching:** FAQ chip text must exactly match the key in `answers{}`. A mismatch causes "I don't have an answer for that" fallback. Always keep them in sync.

5. **biz_ prefix on localStorage:** All admin data uses `biz_` prefix. Do not store non-admin data under this prefix.

6. **Cloudflare Pages:** All files in the repo root are served. No build step. No `_redirects` or `_headers` file exists currently — if SPA routing breaks on hard refresh, add a `_redirects` file: `/* /index.html 200`.

---

## 14. Recommended Next Steps (Future Development)

1. **Add `_redirects` file** for SPA deep-link support: `/* /index.html 200`
2. **Services tab booking form** — a WhatsApp pre-fill booking form belongs in tab-resources.html (Services section), not on the about page (already removed from about)
3. **Exam dates for 2028** — append to the `sched` array when confirmed by DOeL
4. **IsiZulu/Shona/Afrikaans FAQ expansion** — currently minimal compared to EN/Sepedi
5. **Performance:** admin.js (489KB) could be code-split; lazy load is already in place but the file itself is unminified
6. **PWA manifest** — add `manifest.json` and service worker for offline study pack access

---

*End of handover. Contact: ribattseke@gmail.com (private — do not publish)*
