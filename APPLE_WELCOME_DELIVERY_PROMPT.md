# 🍏 MISSION CRITIQUE : Portage du Design Apple-Grade (Welcome Onboarding & Portal) + Build & Vérification Automatique

> **Emplacement du projet :** `/Users/tayeb/Documents/law app`  
> **Directive d'exécution :** Exécute cette mission de bout en bout de manière autonome, sans interruption. Applique les modifications, résous les avertissements, lance les vérifications (`gate.sh`), exécute le build de production, et affiche le rapport final complet.

---

## 🎯 1. OBJECTIFS D'IMPLÉMENTATION DE L'ONBOARDING (`Welcome.jsx`)

Mets à jour intégralement `frontend/src/pages/LawOS/Welcome.jsx` et ses composants satellites (`frontend/src/components/LawOS/kit/`, `avatar/`, `Portal/`) pour implémenter fidèlement la maquette Apple-Grade validée :

### A. Étape 1 : Accueil immersif & Piliers Pédagogiques
1. **Correction orthographique obligatoire :** Remplacer impérativement toute mention erronée par le terme juridique exact :
   * Texte officiel : `« دروسك، نوازلك، ومراجعاتك في مكان واحد، وتعمل حتى بدون إنترنت »` (veiller à écrire **نوازلك** et JAMAIS نوافلك).
2. **Carte Profil Étudiant (Aperçu personnalisé) :**
   * Avatar en tenue juridique officielle / بذلة المحاماة مع قبعة التخرج.
   * Nom de l'étudiant (`tayeb` ou nom de session), Faculté (`كلية الحقوق عين الشق`), et badges élégants : `قانون خاص` · `S1` · `العربية`.
   * Badge de confiance & confidentialité locale : `🛡️ بياناتك تُحفظ محلياً على جهازك`.
3. **Les 3 Piliers Vectoriels (Cartes 3D Apple-Grade) :**
   * **المسار الدراسي :** Icône épurée 📖 · `موادك من استعمال الزمن، بطريقة التعلم التي تختارها: خطاطات، جداول، ملخصات أو بطاقات.`
   * **مركز الامتحانات والنوازل :** Icône balance ⚖️ · `QCM، أسئلة تحليلية ونوازل تُصحح خطوة بخطوة بالمنهجية المعتمدة.`
   * **مجتمع الطلبة :** Icône groupe 👥 · `شارك ملخصاتك، اقترح تعديلات على مشاريع زملائك، ونظموا لقاءات المراجعة.`

### B. Étapes 2, 3 et 4 (Design Épuré & Expérience Mobile)
1. **Étape 2 (Personnage & Avatar) :** Sélecteur d'avatar tactile avec prise en charge automatique de la photo de session Google si présente (`talib.auth.v1`), sinon costumes juridiques personnalisés.
2. **Étape 3 (Facultés du Maroc) :** Champ de recherche fluide et cartes cliquables avec validation instantanée (عين الشق، السويسي، أكدال، القاضي عياض، فاس، طنجة، وجدة...).
3. **Étape 4 (Filière & Semestre) :** Sélecteurs segmentés pour Droit Privé / Public, Arabe / Français, S1 à S6, code groupe G01.., et objectif de concours (المحاماة / القضاء / المفوضون).
4. **Ergonomie Mobile (Thumb-Friendly) :** Bouton tactile 3D pleine largeur en bas `متابعة ←`, zéro débordement horizontal (`overflow-x: hidden`), typographie fluide sans coupure de mots.

---

## 🛑 2. RÈGLES STRICTES DU PROJET (CLAUDE.MD & GATE.SH)

1. **Logical CSS Exclusif :**
   * STRICTEMENT INTERDIT : `ml-*`, `mr-*`, `pl-*`, `pr-*`, `left-*`, `right-*`, `text-left`, `text-right`.
   * OBLIGATOIRE : `ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`, `text-end`.
2. **Isolation Bidirectionnelle :**
   * Isoler tous les chiffres, codes d'articles et termes techniques latins avec `<bdi>...</bdi>` (ex : `<bdi>S1</bdi>`, `<bdi>G01</bdi>`, `<bdi>DOC:77</bdi>`).
3. **Zéro Hard-Coding de Marque :**
   * Ne jamais coder en dur le nom de l'application dans l'UI. Utiliser `brandName(lang())` ou les helpers i18n `tr(...)`.
4. **Discipline Matérielle & Mémoire :**
   * Contrainte RAM 1.5 GB. Pas de bibliothèques lourdes superflues.

---

## 🧪 3. PROTOCOLE DE VÉRIFICATION & BUILD AUTOMATIQUE

Une fois le code implémenté, lance immédiatement les vérifications suivantes dans l'ordre :

```bash
# 1. Vérification stricte des règles du projet (Gate check)
./scripts/gate.sh --quick

# 2. Exécution des tests automatisés
LAWOS_TEST_FFMPEG=/path/to/ffmpeg npx -y node@24 node_modules/.bin/jest server/__tests__/law

# 3. Build de production Frontend (Vite)
VITE_API_BASE=/api yarn --cwd frontend build
```

Si une erreur apparaît lors du gate ou du build, corrige-la immédiatement et relance la vérification jusqu'à obtention du succès complet (`GATE PASS` et `built in ...s`).

---

## 📋 4. RAPPORT FINAL DE SORTIE
Termine ton exécution en affichant un rapport clair contenant :
1. La liste des fichiers modifiés et créés.
2. Le statut de `./scripts/gate.sh --quick` (`GATE PASS`).
3. Le résultat des tests Jest (`X passed`).
4. La confirmation du build Vite (`built in Xs`).
