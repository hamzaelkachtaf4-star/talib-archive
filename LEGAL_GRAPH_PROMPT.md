# 🏛️ MISSION: Build the Moroccan Legal Knowledge Graph ("خريطة المفاهيم والقواعد القانونية") for LAW-OS

> **Project:** LAW-OS (Moroccan Legal OS for FSJES Ain Chock S3 Private Law)  
> **Workspace:** `/Users/tayeb/Documents/law app`  
> **Architecture Inspiration:** Adapted from `Understand-Anything` (Knowledge Graph + Claims + Entities + Guided Tours), completely re-engineered for Moroccan Law, Kelsen's Pyramid, Offline PWA, and FSRS.

---

## 🎯 Executive Summary & Context

We want to empower Moroccan law students to master complex legal relationships (e.g., between articles of *DOC / ق.ل.ع*, *Penal Code / القانون الجنائي*, and *CPC / المسطرة المدنية*) through an **interactive, offline-first Legal Knowledge Graph**.

Instead of a heavy external developer tool, we are building a native, lightweight, offline-ready feature inside LAW-OS that:
1. **Parses & Maps Legal Cross-References:** Resolves explicit legal references (e.g., *"طبقا لمقتضيات الفصل 77"* or *"مع مراعاة أحكام المادة 12"*) deterministically, and connects them with `LawConcept` and `LawConfusionPair` models.
2. **Generates an Offline Graph Bundle:** Exports a compact, cached JSON graph structure that loads instantaneously in the PWA/APK without internet.
3. **Renders a Tactile Visual Explorer (RTL):** A mobile-first interactive graph & relation tree using logical Tailwind CSS and Duolingo-style tactile controls.
4. **Provides Guided Review Tours (مسارات المراجعة الموجهة):** Step-by-step curated paths through legal concepts (e.g. *"تكوين العقد من التراضي إلى الجزاء"*).
5. **Integrates with FSRS Review:** One-click conversion of legal claims and relations into FSRS flashcards for spaced repetition.

---

## 🛑 STRICT CLAUDE.MD & GATE RULES (NON-NEGOTIABLE)

1. **Brand String Isolation (scripts/gate.sh Rule 3):**
   - NEVER hard-code product names like `Qanouni`, `LAW-OS`, or `رفيق` in user-facing UI code or components. Always import from `config/brand.js` or use i18n (`tr(...)`).
2. **Logical CSS Only (scripts/gate.sh Rule 4):**
   - Strictly forbidden: `ml-*`, `mr-*`, `pl-*`, `pr-*`, `left-*`, `right-*`, `text-left`, `text-right`, `border-l`, `border-r`, `rounded-l`, `rounded-r`.
   - Always use logical CSS: `ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`, `text-end`, `border-s`, `border-e`, `rounded-s`, `rounded-e`.
3. **Arabic RTL First & Bidirectional Isolation:**
   - Root elements must respect `dir="rtl"`.
   - Wrap all article numbers, Latin terms, and codes (`DOC:77`, `CP:3`, `FSRS`) inside `<bdi>...</bdi>` tags to prevent layout corruption.
4. **Namespaces & Upstream Purity:**
   - Server endpoints: in `server/endpoints/law.js` (or imported helper in `server/utils/law/`).
   - Server services: `server/utils/law/legalGraph.js`.
   - Frontend UI: `frontend/src/pages/LawOS/LegalGraph.jsx` and components in `frontend/src/components/LawOS/Graph/`.
   - Models: Utilize existing Prisma models (`LawArticle`, `LawLink`, `LawConcept`, `LawConfusionPair`). Do not break existing migrations; additive changes only if strictly needed.
5. **Runtime Discipline:**
   - Node 24 LTS target (`npx -y node@24`).
   - Hardware: 1.5 GB RAM hard limit. No heavy local browser canvas engines or multi-megabyte bundle bloat.

---

## 🛠️ EXISTING ARCHITECTURE TO LEVERAGE

Check these existing files before writing code:
- **Prisma Schema (`server/prisma/schema.prisma`):**
  - `LawArticle` (`id`, `codeId`, `canonicalId`, `articleNumber`)
  - `LawLink` (`fromType`, `fromId`, `toType`, `toId`, `relation`, `note`, `userId`) with relations:
    `references | applies | interprets | confirms | reverses | contradicts | cites | divergesFrom`
  - `LawConcept` (`slug`, `titleAr`, `titleFr`, `domain`, `legalRefs`, `reviewed`)
  - `LawConfusionPair` (`conceptAId`, `conceptBId`, `labelAr`, `contrastMd`, `reviewed`)
- **Frontend References:**
  - `frontend/src/pages/LawOS/CorpusArticle.jsx` (already contains `RELATIONS` i18n mapping: `يحيل على`, `يطبق`, `يفسر`, `يعارض`...).
  - `frontend/src/pages/LawOS/AdminConcepts.jsx` (already links concepts to articles).
  - `frontend/src/components/LawOS/lib/legalOffline.js` (offline storage for corpus).

---

## 📋 DETAILED IMPLEMENTATION SPECIFICATION

### Step 1: Backend Extraction & Graph Compiler (`server/utils/law/legalGraph.js`)
Create `server/utils/law/legalGraph.js` with functions:
1. `extractExplicitReferences(articleText, currentCodeSlug)`:
   - Regular expressions tailored for Moroccan legal statutes:
     - `/(?:الفصل|المادة)\s+(\d+(?:\s*(?:مكرر|-\d+))?)(?:\s+(?:من|في)\s+(?:هذا\s+القانون|ق\.ل\.ع|مجموعة\s+القانون\s+الجنائي|قانون\s+المسطرة\s+المدنية))?/g`
   - Normalizes references to `canonicalId` (e.g. `DOC:77`, `CP:129`, `CPC:32`).
   - Validates that target canonicalIds exist in `LawArticle`. Discard or flag hallucinations.
2. `compileLegalGraphBundle(userId)`:
   - Aggregates nodes:
     - **Articles**: canonicalId, articleNumber, codeTitle, summary.
     - **Concepts**: id, slug, titleAr, domain, reviewed.
     - **Confusion Pairs**: conceptA, conceptB, labelAr.
   - Aggregates edges:
     - `LawLink` records (verified relations).
     - Implicit relations from `LawConcept.legalRefs`.
     - Explicit citations discovered by regex (marked `explicit: true`).
   - Outputs a compact, indexed JSON payload `{ nodes: [...], edges: [...], tours: [...] }`.
3. Add API Endpoints in `server/endpoints/law.js`:
   - `GET /api/law/graph/bundle`: Returns the compiled graph bundle (supports ETag / caching).
   - `POST /api/law/graph/auto-link`: Admin endpoint to scan corpus articles and propose new `LawLink` records.

### Step 2: Offline Graph Storage & Sync (`frontend/src/components/LawOS/lib/graphOffline.js`)
1. Extend IndexedDB or offline cache via `graphOffline.js`:
   - Store the compiled graph bundle locally on device when online.
   - Provide offline query methods:
     - `getRelatedNodes(canonicalId)`: Returns parents, children, and peers.
     - `getConceptGraph(conceptSlug)`: Returns the concept, its linked articles, and confusion pairs.
     - `searchGraph(query)`: Quick fuzzy search across concepts and article numbers.

### Step 3: Tactile Frontend Graph Explorer (`frontend/src/pages/LawOS/LegalGraph.jsx`)
Create a responsive, mobile-first graph visualizer with two switchable viewing modes:
1. **Interactive Node Map (Visual Mode):**
   - Lightweight SVG / Canvas rendering (or force-directed tree without heavy node dependencies).
   - Moroccan legal color coding:
     - 🟢 الأخضر: نصوص قانون الالتزامات والعقود (DOC).
     - 🔴 الأحمر: نصوص القانون الجنائي (Penal).
     - 🔵 الأزرق: مفاهيم قانونية (`LawConcept`).
     - 🟡 البرتقالي: أزواج الخلط (`LawConfusionPair`).
   - Click a node to open a bottom sheet/drawer displaying:
     - النص الكامل للمادة مع إمكانية القراءة المريحة.
     - قائمة الإحالات (يحيل على / مستثنى من / يفسر).
     - زر الإضافة إلى بطاقات المراجعة (FSRS).
2. **Hierarchical Tree / Kelsen Pyramid Mode (Linear Mode):**
   - Accessible, fast list-tree view for quick mobile navigation on lower-end devices (HP dv6 / budget Android phones).
   - Groups articles by legal code, then chapter, then article with accordion arrows showing incoming/outgoing links.

### Step 4: Guided Tours (مسارات المراجعة الموجهة)
Include predefined interactive guided review tours for S3 Private Law students:
1. **مسار المسؤولية التقصيرية:**
   `الفصل 77 (العمل غير المشروع) ➔ الفصل 78 (الإهمال وركن الخطأ) ➔ الفصل 85 (مسؤولية حارس الشيء) ➔ أزواج الخلط (المسؤولية العقدية ↔ التقصيرية)`.
2. **مسار بطلان وإبطال العقد:**
   `الفصل 306 (البطلان المطلق) ↔ الفصل 311 (الإبطال والنسبي) ➔ شروط التمسك ➔ آثار البطلان بين المتعاقدين وبالنسبة للغير`.
3. Each tour node displays:
   - Explanation in student-friendly Moroccan legal pedagogy.
   - The verified statute text.
   - "اختبر فهمك" button linking directly to FSRS flashcards or case exercises (`LawCaseExercise`).

### Step 5: FSRS Flashcard Bridge
Inside the graph drawer/modal:
- Add a 1-click button: **"حفظ كبطاقة مراجعة (FSRS)"** (`Law.createFlashcard(...)`).
- Automatically formats the card:
  - **Front:** *"ما هي العلاقة القانونية بين [المادة A] و [المادة B]؟"* أو *"ما هو مآل العقد في حالة [المفهوم C] وفق الفصل [X]؟"*
  - **Back:** Legal rule extracted from the graph edge note with canonical citations.

---

## 🧪 VERIFICATION & QUALITY GATES

After completing the implementation, execute and verify all gate checks:

```bash
# 1. Run gate script (MUST PASS without any brand or physical CSS errors)
./scripts/gate.sh --quick

# 2. Verify Frontend Vite build
VITE_API_BASE=/api yarn --cwd frontend build

# 3. Verify Server Unit Tests
LAWOS_TEST_FFMPEG=/path/to/ffmpeg npx -y node@24 node_modules/.bin/jest server/__tests__/law
```

---

## 🚀 Execution Instructions for Claude Code
1. Read `CLAUDE.md`, `server/prisma/schema.prisma`, and `frontend/src/pages/LawOS/CorpusArticle.jsx`.
2. Implement backend compiler in `server/utils/law/legalGraph.js` and register routes in `server/endpoints/law.js`.
3. Implement frontend graph explorer in `frontend/src/pages/LawOS/LegalGraph.jsx` and register the route in `frontend/src/pages/LawOS/routes.jsx`.
4. Ensure 100% adherence to logical CSS (`ms-*`, `me-*`, no `ml-*`/`mr-*`) and brand-string rules.
5. Run `./scripts/gate.sh --quick` and `VITE_API_BASE=/api yarn --cwd frontend build` to verify clean delivery.
