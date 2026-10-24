# 🏛️ MISSION MAÎTRESSE : Implémentation Intégrale de Talib v3 (23 Écrans & Options)

> **Projet :** `/Users/tayeb/Documents/law app`  
> **Source de référence officielle :** `docs/design_reference/talib-export/`  
> - Plan d'implémentation : `docs/design_reference/talib-export/IMPLEMENTATION_PLAN.md`  
> - Maquette Maîtresse (23 pages) : `docs/design_reference/talib-export/TalibStudio.dc.html`  
> - Centre d'Examens : `docs/design_reference/talib-export/TalibExamCenter.dc.html`  
> - Moteur juridique : `docs/design_reference/talib-export/law-profiles.js` et `shared-exams.js`  
> - Fonctions support : `docs/design_reference/talib-export/support.js`  

---

## 🎯 INSTRUCTION D'EXÉCUTION CRITIQUE POUR CLAUDE CODE

Lis et applique **`docs/design_reference/talib-export/IMPLEMENTATION_PLAN.md`** section par section.  
Le propriétaire a conçu une maquette complète de 23 pages en mode **Dark Navy (`#0b1220` / `#0b132b`)** avec accents vert émeraude, boutons tactiles 3D et des options complètes d'apprentissage. Ne simplifie rien, n'invente rien : porte fidèlement le code et les options conçus dans `TalibStudio.dc.html`.

### 1. AppShell & Navigation Desktop / Mobile (Étape 2 du Plan)
- **Header supérieur :**
  * Logo officiel `طالب FSJES عين الشق` avec la mascotte étudiante verte.
  * Recherche globale `ابحث عن مادة، درس، أو فصل قانوني...` (raccourci `⌘K`).
  * Compteur de série `9 🔥`, cloche de notifications `3`, et toggle de thème ☀️/🌙.
- **Sidebar droite (Desktop ≥ 1024px) :**
  * Carte profil étudiant : `يوسف الإدريسي` (S3 قانون خاص · فوج 02), anneau de progression circulaire `65%` (`الحصص 38/56 · المفاهيم 142`), `المستوى 6` et `1,290 XP`.
  * Les 5 Hubs officiels :
    1. 🏛️ **ملتقى الكلية** (`/law/community`)
    2. 📖 **تعلم** (`/law/today`) [Actif par défaut]
    3. 👥 **مجموعات القراءة** (`/law/community/squads`)
    4. ⚖️ **امتحان** (`/law/exam`)
    5. 📚 **خزانة القوانين المحينة** (`/law/library`)
  * Accordéon bas : `المسار الدراسي (S3)` (4 مواد · 75%).

### 2. Page d'Accueil « تعلم » (Étape 4 du Plan & `TalibStudio.dc.html`)
Mets à jour `frontend/src/pages/LawOS/Today.jsx` pour intégrer :
- Titre `تعلم` avec bouton tactile vert `+ مادة جديدة`.
- **Bannière Emploi du Temps :** `ابدأ من استعمال الزمن ديالك` avec boutons tactiles :
  * `ارفع استعمال الزمن` (upload image / PDF)
  * `اكتب المواد بيدك`
  * `جرب باستعمال زمن نموذجي ←`
- **Carte Reprise :** `تابع من حيث توقفت` ⬅️ `المسؤولية المدنية` (التالي: الضرر · 2/6 حصص, 33%, bouton tactile doré `تابع ←`).
- **Grille « موادي (3) » :**
  * Carte 1 : `المسؤولية المدنية` (options `مفصل` et `خطاطات`, 2/6 حصص, badge `عمومي`, bouton `فتح ←`).
  * Carte 2 : `قانون الشركات` (options `جداول`, `موجز`, `س/ج`, 0/2 حصص, badge `خاص`, bouton `فتح ←`).
  * Carte 3 : `قانون الشغل` (options `بطاقات`, `موجز`, badge `خاص`, bouton `فتح ←`).

### 3. Centre d'Examens & Hiérarchie Juridique (Étape 5 du Plan & `TalibExamCenter.dc.html`)
Mets à jour `frontend/src/pages/LawOS/ExamCenter.jsx` :
- Sélecteur de matières (المسؤولية المدنية، قانون الشركات، قانون الشغل).
- Carte d'identité de la branche : Droit civil (سلطة النص، دور العرف، دور الاجتهاد).
- Ordre des sources marocaines au cas pratique : 1. النص التشريعي 2. العقد شريعة المتعاقدين (ف. 230) 3. العرف والعادة (ف. 475).

### 4. Moteur des Profils Juridiques (`law-profiles.js`)
- Copie `docs/design_reference/talib-export/law-profiles.js` dans `frontend/src/components/LawOS/lib/lawProfiles.js`.

---

## 🧪 PROTOCOLE DE CONTRÔLE & BUILD

Exécute successivement :
```bash
./scripts/gate.sh --quick
LAWOS_TEST_FFMPEG=/path/to/ffmpeg npx -y node@24 node_modules/.bin/jest server/__tests__/law
VITE_API_BASE=/api yarn --cwd frontend build
```

Corrige toute divergence jusqu'au succès total.

---

## 🚀 DÉPLOIEMENT PRODUCTION

Dès validation du build :
```bash
rsync -az --delete frontend/dist/ 100.109.58.54:/tmp/lawos-dist/
ssh 100.109.58.54 "docker cp /tmp/lawos-dist/. lawos:/app/server/public/ && docker restart lawos"
curl -sk https://tayebhomeserver.tail94b594.ts.net/api/law/health
```
