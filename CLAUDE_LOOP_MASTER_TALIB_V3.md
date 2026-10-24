# 🚀 CLAUDE MASTER LOOP : DÉPLOIEMENT TALIB V3 (23 PAGES & OPTIONS COMPLÈTES)

> **Projet :** `/Users/tayeb/Documents/law app`  
> **Branche de travail :** `qanouni-delivery`  
> **Serveur cible :** `100.109.58.54` (Tailscale `tayebhomeserver.tail94b594.ts.net`)  
> **Sources de vérité absolues :**
> 1. `docs/design_reference/talib-export/TalibStudio.dc.html` (Accueil « تعلم », options d'apprentissage, emploi du temps, workspace)
> 2. `docs/design_reference/talib-export/TalibExamCenter.dc.html` + `law-profiles.js` (Identité des branches juridiques, examen)
> 3. `docs/design_reference/talib-export/IMPLEMENTATION_PLAN.md` (Architecture des 23 pages)
> 4. Captures d'écran utilisateur de référence :
>    - `تعلم` (Learn Home & Options) : `media_1792710233889_5bd65883.png`
>    - `مجموعات القراءة` (Collaborative Reading Groups) : `media_1792710238094_3531634d.png`
>    - `ملتقى الكلية` (Forum de Faculté & Projets) : `media_1792710233892_3df83000.png`
>    - `امتحان` (Centre d'examen & Identité de branche) : `media_1792710233896_e6582ff3.png`

---

## 🎯 OBJECTIF & DIRECTIVE STRICTE

Ne t'arrête sous aucun prétexte. N'invente pas des interfaces plates simplifiées à la place des maquettes de l'utilisateur.
L'utilisateur a conçu un design riche **Dark Navy (`#0b1220` / `#0b132b`)** avec boutons 3D tactiles émeraude et dorés, 5 hubs de navigation, et surtout les **7 Options d'apprentissage personnalisées** qu'il a créées.
Tu dois intégrer fidèlement ces écrans dans le code React, passer tous les tests et le gate, builder et déployer sur le serveur distant en une boucle autonome continue (Loop Engineering).

---

## 📋 1. LES 4 ÉCRANS CLÉS À METTRE EN PLACE IMMÉDIATEMENT

### 1.1 Écran 1 : « تعلم » (Learn Home, Options & Workspace)
* **Composant :** `frontend/src/components/LawOS/Today/LearnHome.jsx` & `frontend/src/pages/LawOS/Today.jsx`
* **Éléments obligatoires :**
  1. **En-tête :** Titre « تعلم », sous-titre « موادك من استعمال الزمن ديالك، وكل مادة كتحفظ طريقة التعلم ديالها. », bouton 3D émeraude « + مادة جديدة ».
  2. **Bannière Emploi du Temps (« ابدأ من استعمال الزمن ديالك ») :**
     - Icône calendrier 📅
     - Bouton tactile émeraude « 📎 ارفع استعمال الزمن » (simulation d'extraction OCR de l'emploi du temps S3 Droit Privé).
     - Bouton tactile neutre « ✍️ اكتب المواد بيدك » (ouvre le champ texte pour coller les matières).
     - Lien texte « جرّب باستعمال زمن نموذجي ← » (charge immédiatement les matières de démo).
     - Note explicative : « في هذا النموذج، قراءة الصورة مُحاكاة: كنستعملو استعمال زمن تجريبي ديال S3 قانون خاص. ».
  3. **Carte Reprise (« تابع من حيث توقفت ») :**
     - Anneau de progression SVG (ex: 33%), titre de matière (« المسؤولية المدنية »), leçon suivante (« التالي: الضرر · 2/6 حصص »), bouton doré 3D « تابع ← ».
  4. **Grille des matières (« موادي ») avec LES 7 OPTIONS :**
     - Les 7 formats de `TalibStudio.dc.html` doivent être affichés sous forme de badges distincts sur chaque matière :
       - `tree` : `خطاطات` (خطاطات شجرية)
       - `table` : `جداول`
       - `full` : `شامل` (ملخص شامل)
       - `brief` : `موجز` (ملخص موجز)
       - `detailed` : `مفصل` (شرح مفصل مع أمثلة)
       - `cards` : `بطاقات` (بطاقات مراجعة)
       - `qa` : `س/ج` (سؤال وجواب)
     - Exemple carte 1 (المسؤولية المدنية) : badges `خطاطات` + `مفصل`, progression `2 / 6 حصص`, bouton visibilité `عمومي` / `خاص`, bouton `فتح ←`.
     - Exemple carte 2 (قانون الشركات) : badges `جداول` + `موجز` + `س/ج`.
     - Exemple carte 3 (قانون الشغل) : badges `بطاقات` + `موجز`.
     - Carte d'ajout pointillée : « + مادة جديدة · اختر طريقتك مرة واحدة، والمساعد يلتزم بها ».
  5. **Assistant de configuration de matière (`isForm`) :**
     - Choix du nom, du semestre (S1...S6, ماستر), pastille de couleur.
     - Question : « كيف تحب أن تتعلم هذه المادة؟ » avec sélection multiple ordonnée (badges 1, 2, 3...) parmi les 7 options.
     - التقسيم : `حسب الحصص` ou `حسب المحاور والمباحث`.
     - Panneau latéral : `مساعد طالب : يرافقك خطوة بخطوة`.

### 1.2 Écran 2 : « مجموعات القراءة » (Collaborative Reading Groups)
* **Composant :** `frontend/src/pages/LawOS/Squad.jsx` / `frontend/src/pages/LawOS/SquadWorkspace.jsx` (accessible via `/law/squad` et `/law/community`)
* **Éléments obligatoires :**
  1. **Sous-navigation droite :**
     - Bouton tactile vert `+ إنشاء`.
     - Section « مجموعاتي » : cartes des groupes (ex: « فوج 02 · المسؤولية المدنية · خاصة · 4 أعضاء », « تحضير امتحان قانون الشركات »).
     - Section « اكتشف مجموعات » : cartes publiques avec bouton « طلب الانضمام » (ex: « نادي النوازل - S3 »).
  2. **Panneau d'édition partagé :**
     - En-tête : avatar stack des membres (ح, م, س, ي), titre du groupe, badge « خاصة », « المسؤول: يوسف ».
     - Explication : « داخل المجموعة، كل عضو يعدّل الدرس مباشرة دون طلب، ويظهر كل تعديل بلون صاحبه. يمكن الرجوع لأي نسخة سابقة. ».
     - Onglets : `الدرس الموحد`, `الأعضاء 2`, `النسخ السابقة`.
     - Barre de contrôle avec toggle `الألوان` et légende des contributeurs :
       - 🟢 أنت (`#10b981`)
       - 🟣 سلمى (`#a855f7`)
       - 🟠 محمد (`#f97316`)
       - 🔵 حمزة (`#06b6d4`)
     - Texte collaboratif surligné en ligne selon l'auteur :
       - Section 1 : « المسؤولية عن فعل الغير » (الأب والأم [أنت/أخضر] ... المخدوم [سلمى/بنفسجي]).
       - Section 2 : « المسؤولية عن الأشياء » (حراسة الأشياء [محمد/برتقالي] ... منع الضرر [أنت/أخضر]).
       - Section 3 : « المسؤولية عن الحيوان والبناء » (حارس الحيوان [حمزة/سماوي] ... مالك البناء [أزرق]).
     - Bouton « تعديل » sur chaque bloc pour éditer le paragraphe dans la couleur de l'étudiant.

### 1.3 Écran 3 : « ملتقى الكلية » (Faculty Forum)
* **Composant :** `frontend/src/pages/LawOS/Community.jsx`
* **Éléments obligatoires :**
  1. **Carte examen épinglée :**
     - Auteur : « أمين المنصوري · نشر امتحاناً تجريبياً · S3 · قانون الشركات ».
     - Titre : « امتحان تجريبي: مصادر القانون التجاري والعمل المختلط ».
     - Badges : `QCU`, `نوازل`, `متدرج`, `6 أسئلة`, `للمراجعة`. Stats : `41 جربوه · 21 مفيد`. Bouton 3D « جرب الامتحان ← ».
  2. **Compositeur d'interaction :**
     - Placeholder : « اطرح استفساراً قانونياً أو شارك اجتهاداً قضائياً... ».
     - 2 boutons d'action : `استفسار قانوني` (icône ? rouge) et `اجتهاد قضائي` (icône tribunal).
     - Bannière : « دروسك تُنشر من «تعلم» - اجعل الدرس الذي تشتغل عليه عمومياً ليظهر هنا ← ».
  3. **Onglets de filtrage :**
     - `الكل`, `مواد كاملة (A-Z)`, `حصص وتفريغات`, `تلخيصات ومذكرات`, `مراجع ومطبوعات`, `نوازل وتطبيقات`.
  4. **Fil des projets publics :**
     - Cartes des cours partagés avec badge « + مشروع عمومي », compteur de demandes de modification (« 3 طلبات تعديل »), et bouton « فتح المشروع ».

### 1.4 Écran 4 : « امتحان » (Centre d'Examen & Identité de Branche)
* **Composant :** `frontend/src/pages/LawOS/ExamCenter.jsx` & `frontend/src/components/LawOS/exam/BranchCard.jsx`
* **Éléments obligatoires :**
  1. Commutateur d'onglets : `موادي` vs `امتحانات الزملاء`.
  2. Sélecteur de matière : « المسؤولية المدنية », « قانون الشركات », « قانون الشغل ».
  3. **Carte d'identité de la branche (« هوية الفرع : القانون المدني ») :**
     - « الشريعة العامة: النص أولاً، ثم إرادة الأطراف، والعرف لا يخالف نصاً صريحاً. ».
     - Jauges et descriptions :
       - `سلطة النص` : قوي · إذا كانت ألفاظ العقد صريحة امتنع البحث عن قصد صاحبها...
       - `دور العرف` : مكمّل · مفسّر، ولا يجوز أن يخالف نصاً صريحاً.
       - `دور الاجتهاد` : مكمّل · يفسّر ويملأ الفراغ في حدود النصوص.
     - **ترتيب المصادر عند الحل :**
       1. النص التشريعي (ق.ل.ع والقوانين الخاصة)
       2. العقد شريعة المتعاقدين (ف.230 ق.ل.ع)
       3. العرف والعادة دون مخالفة نص صريح (ف.475 ق.ل.ع)
  4. Bloc de configuration : « كيف تحب أن تتدرب على هذه المادة؟ ».

---

## 🎨 2. RÈGLES DE STYLE ET DESIGN SYSTEM

1. **Thème Dark Navy par défaut :**
   - Fond d'écran : `#0b1220` (ou `#0b132b`).
   - Surfaces de cartes : `#121b2f` (bordure `#2a3654`, ombre subtile).
   - Texte principal : `#f1f5f9` / `#eeece6`. Texte secondaire : `#94a3b8` / `#9aa3b5`.
   - Boutons 3D émeraude : `bg-emerald-700 shadow-[0_4px_0_#035a32] active:translate-y-[4px]`.
   - Boutons 3D dorés : `bg-amber-600 shadow-[0_4px_0_#b45309] active:translate-y-[4px]`.
2. **Conformité stricte `CLAUDE.md` :**
   - CSS logique uniquement (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`).
   - Aucun emoji direct dans le JSX (interdit par `gate.sh:game-terms`) : utilise les icônes `@phosphor-icons/react` (`<Flame />`, `<ShieldCheck />`, `<TreeStructure />`, `<BookOpen />`, `<Check />`, etc.).
   - Utilise `<bdi dir="ltr">` pour tous les chiffres, pourcentages et codes d'articles.

---

## 🔄 3. LOOP D'EXÉCUTION & DÉPLOIEMENT AUTONOME

Exécute et répare en boucle jusqu'au succès complet :

```bash
# Étape 1 : Vérification Gate
./scripts/gate.sh --quick

# Étape 2 : Tests unitaires et intégration
LAWOS_TEST_FFMPEG=/opt/homebrew/bin/ffmpeg npx -y node@24 node_modules/.bin/jest server/__tests__/law

# Étape 3 : Build Vite
VITE_API_BASE=/api yarn --cwd frontend build

# Étape 4 : Déploiement serveur distant
rsync -az --delete frontend/dist/ 100.109.58.54:/tmp/lawos-dist/
ssh 100.109.58.54 "docker cp /tmp/lawos-dist/. lawos:/app/server/public/ && docker restart lawos"

# Étape 5 : Vérification santé serveur
curl -sk https://tayebhomeserver.tail94b594.ts.net/api/law/health
```

Termine uniquement lorsque le déploiement est en ligne, vérifié en 200 OK, et que toutes les options et écrans demandés sont fonctionnels.
