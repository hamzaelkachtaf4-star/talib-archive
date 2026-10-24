# Talib (طالب) — Moroccan Legal Learning Operating System
> **نظام التشغيل الدراسي والمرافق الذكي لطلبة كليات العلوم القانونية والاقتصادية والاجتماعية بالمغرب (FSJES)**

Talib is a specialized AI-powered legal learning operating system built specifically for Moroccan law students (Droit Privé & Droit Public, S1–S6 and Masters). It transforms fragmented amphithéâtre lecture notes, Moroccan statutory codes (DOC, Code Pénal, Code de Commerce, Moudawana), and judicial decisions into structured, source-anchored, and methodology-verified study workflows.

---

## 🏛️ Core Architectural Pillars

### 1. The Moroccan Legal Pyramid (الهرم القانوني المغربي)
Built on a strict 7-tier Kelsenian constitutional hierarchy reflecting Moroccan law:
1. **الدستور (Constitution 2011)** — Supreme norm.
2. **الاتفاقيات الدولية المصادق عليها (International Conventions)** — Directly ratified treaties with primacy over domestic law.
3. **القوانين التنظيمية (Lois Organiques)** — Complementary constitutional statutes (Loi 130.13, 100.13, 106.13, etc.).
4. **القوانين الإطار (Lois-Cadres)** — National policy frameworks (Investment charter, health system, social protection).
5. **القوانين العادية والمدونات (Ordinary Codes)** — DOC (Dahir des Obligations et Contrats), Code Pénal, Code de Commerce, Code de Procédure Civile/Pénale, Moudawana.
6. **المراسيم التنظيمية والقرارات (Décrets & Arrêtés)** — Executive and regulatory orders.
7. **العمل القضائي والاجتهاد (Jurisprudence)** — Decisions of the Court of Cassation (محكمة النقض) and appellate courts.

### 2. Strict Doctrinal Examination Engines (منهجية الامتحانات)
Rather than generic generative AI chat, Talib enforces the exact legal syllogism methodologies demanded by Moroccan university examiners:
- **Cas Pratique (النازلة / الاستشارة القانونية)**: 5-step strict legal syllogism:
  1. عرض الوقائع (Statement of material facts)
  2. المشكل القانوني (Abstract doctrinal legal issue)
  3. النصوص والقواعد المطبقة (Applicable statutory articles e.g., DOC arts 77, 78, 230)
  4. المناقشة والتطبيق (Doctrinal subsumption)
  5. الحل والنتيجة (Definitive legal outcome)
- **Dissertation Juridique (الموضوع المقالي)**: Dual-part Franco-Moroccan binary plan (I. A, B / II. A, B) with introduction, chapeaux, and transitions.
- **Commentaire d'Arrêt (التعليق على القرار القضائي)**: Structured judicial ruling critique.

### 3. The 7 Multimodal Learning Angles (زوايا التعلم السبع)
Every subject module can be reviewed through 7 distinct cognitive angles:
1. **خطاطات شجرية (Concept Trees)**: Interactive hierarchical mind maps.
2. **جداول مقارنة (Comparative Tables)**: Cross-cutting doctrinal differences.
3. **شامل (Comprehensive Master Note)**: Exhaustive synthesized lecture notes.
4. **موجز (Executive Summary)**: Rapid high-yield exam cramming.
5. **مفصل (Deep Doctrinal Dive)**: Detailed article-by-article commentary.
6. **بطاقات استذكار (Spaced Flashcards)**: Active recall flashcards with SM-2 spacing.
7. **سؤال / جواب (Diagnostic Q&A)**: Spot-check oral exam simulators.

### 4. Interactive Study Workspace (`TalibWorkspace.jsx`)
Vertical milestone session rails, progress tracking, inline curriculum tree navigation, and an intelligent assistant drawer grounded exclusively in verified course material.

### 5. Exam Simulation Center (`ExamCenter.jsx`)
Timed full-dress exam drills, professor-style multiple-choice questions (QCM), real-time feedback, and granular weak-spot diagnostics mapped to specific syllabus chapters.

### 6. Collaborative Reading Squads (`SquadWorkspace.jsx`)
Peer study groups with color-coded multi-student note attribution, revision proposals, and unified master note synthesis.

---

## 📂 Codebase Directory Map

| Path | Purpose | Key Files |
|---|---|---|
| `frontend/src/components/LawOS/` | Core LawOS UI components | `module/TalibWorkspace.jsx`, `exam/`, `kit/`, `Graph/`, `Timetable/` |
| `frontend/src/pages/LawOS/` | Primary Hub Routes | `ExamCenter.jsx`, `SquadWorkspace.jsx`, `LegalGraph.jsx`, `Library.jsx`, `Today.jsx`, `Method.jsx` |
| `docs/MASTER_SPEC.md` | Master System Specification | Definitive system prompt, non-negotiables, student persona |
| `docs/MOROCCAN_LEGAL_HIERARCHY.md` | Moroccan Legal Hierarchy Spec | 7-tier classification of Moroccan codes and dahirs |
| `server/utils/law/prompts/` | Specialized Legal AI Prompts | `case_critique.v1.md`, `dissertation_critique.v1.md`, `legal_tutor.v3.md`, `align_polycopie.v1.md` |
| `docs/design_reference/talib-export/` | Design Reference & Mockups | `TalibStudio.dc.html` (23-screen master mockup), `IMPLEMENTATION_PLAN.md`, `law-profiles.js` |
| `server/models/` & `server/routes/` | Backend APIs & SQLite DB | Prisma schema, legal corpus storage, timetable models |

---

## 🛠️ Architecture & Underpinnings
Talib is engineered as a unified offline-capable Progressive Web Application (PWA) built on top of a specialized fork of **AnythingLLM** (Node.js/Express, React, TailwindCSS, SQLite via Prisma, embedded LanceDB vector storage).
Original upstream AnythingLLM documentation is preserved in [README_UPSTREAM_ANYTHINGLLM.md](README_UPSTREAM_ANYTHINGLLM.md).

---

## ⚖️ License & Credits
- **Talib Moroccan Law OS**: Developed for Moroccan higher education (FSJES).
- Base Engine: Forked from [Mintplex Labs AnythingLLM](https://github.com/Mintplex-Labs/anything-llm) under the MIT License.
