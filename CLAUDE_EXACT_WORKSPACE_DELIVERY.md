# 🎯 MISSION CRITIQUE : REFONTE TOTALE DU WORKSPACE D'ÉTUDE & DE L'EXAMEN SELON LES CAPTURES REÇUES

> **Projet :** `/Users/tayeb/Documents/law app`  
> **Source de référence absolue :**  
> 1. `docs/design_reference/talib-export/TalibStudio.dc.html` (lignes 260 à 550)  
> 2. `docs/design_reference/talib-export/TalibExamCenter.dc.html`  
> 3. Captures d'écran utilisateur réelles :
>    - Capture 5 : Workspace complet avec rail vertical de séances et arbre visuel (`media_1792727018249_789308bd.png`)
>    - Capture 4 : Explications détaillées avec exemples et boutons de validation (`media_1792727018247_a068cbfc.png`)
>    - Capture 3 : Configuration complète de l'examen « كيف تحب أن تتدرب على هذه المادة؟ » (`media_1792727018216_51a763cb.png`)
>    - Capture 2 : Hub d'examen avec identité de branche (`media_1792727018210_4efcbb27.png`)

---

## 🛑 LE PROBLÈME À RÉSOUDRE IMMÉDIATEMENT

L'utilisateur trouve l'interface actuelle « معربزة » (brouillonne et désorganisée). Au lieu d'afficher le magnifique Workspace conçu dans Canvas, le code affiche une ancienne page avec 5 boutons texte au sommet.
Tu dois **remplacer complètement** cette vue par la reproduction fidèle du Workspace de `TalibStudio.dc.html` et de l'écran d'examen de `TalibExamCenter.dc.html`.

---

## 🏗️ 1. LE NOUVEAU WORKSPACE D'ÉTUDE (`TalibWorkspace.jsx`)

À afficher lorsque l'étudiant clique sur « فتح » depuis la page « تعلم » (`/law/today`) ou navigue dans une matière (`/law/path/m/:id`).

### A. La colonne latérale des séances (Rail vertical)
* Largeur fixe (~180px) à droite (en RTL) du contenu de la séance.
* Liste verticale de nœuds numérotés :
  - Cercle 3D de 58-62px avec numéro ou coche :
    - Séances terminées : fond vert émeraude avec coche blanche `✓`.
    - Séance active (ex: Séance 3 « الضرر ») : fond doré/ambre avec numéro en gras et anneau lumineux (`ring`).
    - Séances futures (4 « السببية », 5 « فعل الغير والأشياء », 6 « الإعفاء والتقادم ») : fond neutre/sombre avec numéro.
  - Titre court sous chaque cercle (ex: « المفهوم والأنواع », « الخطأ », « الضرر », « السببية »).
  - Ligne verticale de connexion entre les cercles.
  - Bouton pointillé en bas : `+ حصة جديدة`.

### B. Le panneau de contenu de la séance active
1. **En-tête de séance :**
   - Numéro et total : « الحصة 3 من 6 » (en texte atténué).
   - Titre principal : « الضرر » (texte grand et gras).
   - Pastille des références légales : `ف. 77 · ف. 98`.
   - Badge : `ⓘ محتوى للمراجعة`.
   - Bouton d'action à gauche : `✎ عدّل بيدك`.

2. **Bloc 1 : « خطاطات شجرية » (L'arbre conceptuel visuel) :**
   - Nœud racine émeraude en haut : « الضرر » (carte arrondie 3D).
   - Connecteur vertical centré (`width: 2px, height: 20px, bg: border`).
   - Ligne horizontale reliant les 3 branches enfants.
   - Grille des 3 cartes enfants :
     1. « الضرر المادي (ف. 98) » ➔ « مساس بالذمة المالية أو بالجسد »
     2. « الضرر المعنوي (ف. 77) » ➔ « مساس بالشعور أو السمعة »
     3. « شروط الضرر (ف. 98) » ➔ « محقق، مباشر، شخصي »

3. **Bloc 2 : « شرح مفصل مع أمثلة » :**
   - Sous-titre : « لا مسؤولية دون ضرر، فهو مناط التعويض ومقياسه. ».
   - Cartes pour chaque concept avec pastille d'article à droite (`ف. 98`, `ف. 77`) :
     - Titre en gras (« الضرر المادي »).
     - Définition (« يشمل الخسارة الفعلية والمصروفات الضرورية وما فات المتضرر من كسب. »).
     - Boîte d'exemple intégrée avec fond sombre/gris (« مثال: مصاريف علاج ضحية حادثة وأجرها الضائع خلال مدة العجز. »).
     - Idem pour « الضرر المعنوي » (Exemple : التشهير على وسائل التواصل).
     - Idem pour « شروط الضرر » (Exemple : أرباح تاجر متوهمة).

4. **Barre d'action inférieure :**
   - Bouton 3D vert tactile : `✓ تحقق من فهمك`.
   - Bouton 3D sombre tactile : `«شنو فهمت؟»`.
   - Lien discret : `⚑ بلّغ عن خطأ`.

5. **Pastille assistant en bas :**
   - `مساعد طالب : يلتزم بطريقتك: خطاطات + مفصل` (icône étincelle ✦).

---

## 📝 2. L'ÉCRAN DE CONFIGURATION D'EXAMEN (`TalibExamSetup.jsx`)

À intégrer directement dans `/law/exam` sous la carte d'identité de branche.

* **Titre :** « كيف تحب أن تتدرب على هذه المادة؟ »  
* **Sous-titre :** « تختار مرة واحدة، وأبني لك مسار امتحان بمراحل. يمكنك تغيير الإعدادات متى شئت. »

1. **Section « أنواع التمارين » (Grille de cartes avec coches) :**
   - `بطاقات التعلم` : مفهوم في الوجه وتعريفه في الظهر (icône cartes)
   - `QCU` : سؤال بجواب صحيح واحد (icône coche unique)
   - `QCM` : قد يكون أكثر من جواب صحيح (icône double coche)
   - `أسئلة مباشرة` : تعريف وتمييز بين المفاهيم (icône stylo)
   - `أسئلة تحليلية` : حلّل وناقش بحجج قانونية (icône cerveau)
   - `النوازل` : حل نازلة خطوة بخطوة بالمنهجية (icône balance)
   - `موضوع إنشائي` : إشكالية وتصميم ثنائي (icône document)

2. **Section « مستوى الصعوبة » :**
   - Pastilles : `سهل`, `متوسط`, `صعب`, `متدرج ↗` (sélectionné par défaut : « تبدأ المراحل الأولى سهلة وتصعب تدريجياً حتى مستوى الامتحان »).

3. **Section « عدد الأسئلة في كل مرحلة » :**
   - Pastilles : `5` (sélectionné), `10`, `15`.

4. **Section « مصدر النوازل » :**
   - Pastilles :
     - `نوازل حقيقية` : من امتحانات سابقة وبنك نوازل الفوج
     - `مولدة بالذكاء الاصطناعي` : نوازل جديدة من مضمون دروسك
     - `الاثنان معاً` : الحقيقية أولاً ثم المولدة (sélectionné)

5. **Bouton principal tactile émeraude :**
   - `ابنِ مسار الامتحان ✦` (shadow 3D, active translate-y).

---

## 🔄 3. CONSIGNES DE QUALITÉ ET VALIDATION

1. Conserve les 7 vraies matières importées de Tayeb (المسؤولية المدنية، الجنائي الخاص، المالية العامة...) : chaque matière s'affiche dans ce nouveau template propre et structuré.
2. Respecte `CLAUDE.md` : CSS logique uniquement (`ms-`, `me-`, `ps-`, `pe-`), pas d'emojis directs dans le JSX (utilise `@phosphor-icons/react`), `<bdi>` pour les nombres et articles.
3. Exécute :
   - `./scripts/gate.sh --quick`
   - `LAWOS_TEST_FFMPEG=/opt/homebrew/bin/ffmpeg npx -y node@24 node_modules/.bin/jest server/__tests__/law`
   - `VITE_API_BASE=/api yarn --cwd frontend build`
   - Déploie sur le serveur : `rsync -az --delete frontend/dist/ 100.109.58.54:/tmp/lawos-dist/ && ssh 100.109.58.54 "docker cp /tmp/lawos-dist/. lawos:/app/server/public/ && docker restart lawos"`
   - Vérifie `curl -sk https://tayebhomeserver.tail94b594.ts.net/api/law/health`.
