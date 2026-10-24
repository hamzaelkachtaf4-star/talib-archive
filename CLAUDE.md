# 🏛️ CLAUDE.md — LAW-OS Development Protocols & Token Optimization

> **Project:** LAW-OS (Standalone Moroccan Legal OS for FSJES Ain Chock S3 Private Law)  
> **Target Deployment:** Debian 13 (`tayebhomeserver`), Docker Compose, port 3005, Tailscale Serve HTTPS  
> **Master Specification:** See `docs/MASTER_SPEC.md` for full requirements and domain model.

---

## ⚡ TOKEN ECONOMY & PERFORMANCE DIRECTIVES (STRICT)

1. **Targeted Search Only:** Never run `ls -R` or search whole directories blindly. Use `rg` with file limits and `--files` with path prefixes.
2. **Surgical Diffs:** Make minimal, contiguous, targeted edits. Never rewrite an entire 500-line file when modifying a 10-line function.
3. **Cache & Memory Awareness:** Do not repeatedly re-read the same file in consecutive turns. Trust earlier inspections.
4. **No Verbose Fluff:** Keep terminal and conversational output concise. State what was changed, show the test/build result, and list next steps.
5. **Use Installed MCP Superpowers:**
   - Use `sequential-thinking` before complex multi-file architectural changes to test assumptions first.
   - Use `sqlite` MCP to inspect DB schema and query `anythingllm.db` directly instead of writing throwaway node scripts.
   - Use `fetch` MCP to pull official documentation (Prisma, Vite, Tailwind, Docker) when syntax is unverified.
   - Use `repomix` to bundle token-efficient context packs if transferring context.

---

## 🛑 NON-NEGOTIABLE ARCHITECTURAL RULES

1. **One App (All-in-One):** LAW-OS is a single, unified web app / PWA. Zero external dependencies in user flow (NO external Anki, NO external Immich, NO Paperless).
2. **Namespace Everything:** Keep the AnythingLLM upstream fork mergeable.
   - Backend routes: `server/endpoints/law.js`
   - Backend models/services: `server/models/law*.js` and `server/utils/law/`
   - Frontend UI: `frontend/src/components/LawOS/` and `frontend/src/pages/LawOS/`
   - Prisma models: Prefix all with `Law` (e.g., `LawSubject`, `LawFlashcard`, `LawArticle`)
   - Document any upstream touchpoints in `docs/UPSTREAM_TOUCHPOINTS.md`.
3. **Hardware Discipline (HP Pavilion dv6):**
   - Memory limit: 1.5 GB RAM hard limit in Docker Compose.
   - Zero local model inference. Multimodal = Gemini Flash API; Legal Logic = DeepSeek Flash API.
   - Client-side image resize before upload (in PWA) to protect server RAM/CPU.
   - Database: SQLite in WAL mode (`PRAGMA journal_mode=WAL`).
4. **Moroccan Law Grounding:**
   - The AI is NEVER an authoritative legal source. All cited articles must resolve to records in the local corpus (`LawArticle`). Unresolved citations must be stripped and flagged.
   - Generation Effect: Write first, critique second. Never output model answers before the student submits their attempt.
   - Two Lenses: Exam Mode (Professor lecture + statute only) vs Jurist Mode (Cassation rulings + Doctrine + Mention Bridge).
   - Arabic RTL first (`dir="rtl"`) with bidirectional isolation (`<bdi>`) for French technical terms and article numbers.

---

## 🛠️ BUILD & VERIFICATION COMMANDS

```bash
# Server & DB
yarn --cwd server prisma generate    # Generate Prisma client
yarn --cwd server prisma migrate dev --name law_<phase>_<change>  # Create additive migration (never edit applied ones, never `db push`)
yarn --cwd server prisma migrate deploy  # Apply migrations (Docker entrypoint does this on boot)
LAWOS_TEST_FFMPEG=/path/to/ffmpeg npx -y node@24 node_modules/.bin/jest server/__tests__/law server/__tests__/utils/law server/__tests__/models  # LAW-OS tests (jest at repo root; temp SQLite DB + fake Gemini server; the 90-min ffmpeg test skips without LAWOS_TEST_FFMPEG)

# Frontend
VITE_API_BASE=/api yarn --cwd frontend build  # Verify React + Vite build (MUST succeed). /api matches Docker; frontend/.env points at :3001 for dev

# Runtime: Node 24 LTS (Docker + .nvmrc). Local default node is 26, which crashes upstream deps (SlowBuffer);
# prefix server/test commands with `npx -y node@24`. Browser e2e: deploy/e2e/*.cjs (offline shell, offline review sync, offline capture/upload resume)

# Full Local Dev
yarn dev                             # Runs server (:3001), collector (:8888), frontend (:3000)
```

---

## 🎯 PHASED EXECUTION ROADMAP

Follow the phases in `docs/MASTER_SPEC.md` sequentially. Do not jump ahead:
- **Phase 0:** Foundation (Fork structure, `law` namespaces, Prisma schema, Docker Compose 1.5GB limit, PWA shell).
- **Phase 1:** Review Core (FSRS flashcards, offline pack, idempotent sync, streak).
- **Phase 2:** Capture & Inbox (Chunked upload, Gemini OCR & Audio transcription, derivative review).
- **Phase 3:** Legal Corpus (Pre-seeded codes: DOC, Penal, CPC 58.25, Moudawana, Arabic normalization FTS).
- **Phase 4:** Notes & Two Lenses (Exam Mode vs Jurist Mode, lockdown timer).
- **Phase 5:** Grounded AI Methodology (Cas pratique 5-step stepper, Bipartite dissertation architect).
- **Phase 6:** Legislative Radar & Weekly Recap.

---

## 🧠 BRAIN & GATES (Qanouni spec)

Before any edit: read `brain/memories/corrections.json` and `docs/RECON.md`. Every bug fixed / owner correction becomes a new Brain entry **with a guard** (test, or a section registered in `scripts/gate.sh`). Run `scripts/gate.sh` (or `--quick`) at each phase gate; it includes `node scripts/brain-check.mjs`. Brand name literals live only in `config/brand.js` (Phase 1+); logical CSS only in new code.
