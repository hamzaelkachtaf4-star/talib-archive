# 🔄 CLAUDE AUTONOMOUS ENGINEERING LOOP : Refonte Complète UI & Options Talib

> **Directive d'exécution :** Tu es en mode **Engineering Loop autonome (Ralph Loop)**.  
> Tu ne dois PAS t'arrêter, ni abandonner, ni prendre des raccourcis feignants.  
> Tu itères, inspectes, implémentes, vérifies et corriges en boucle jusqu'à ce que le résultat visuel corresponde EXACTEMENT à la maquette et soit déployé en production.

---

## 🎯 1. LA MISSION ET LES OPTIONS MANQUANTES (À IMPLÉMENTER FIDÈLEMENT)

La maquette de référence se trouve en local dans :  
👉 **`docs/design_reference/talib_final_experience.html`**

### A. Écran Profil Complet (`frontend/src/pages/LawOS/Profile.jsx`)
Ouvre la maquette HTML et reproduis fidèlement la section **`view-profile-full`** (lignes 600 à 840) :
1. **En-tête Étudiant Apple-Grade :**
   - Avatar cliquable (`صمم شخصيتك`) avec badge **المستوى 3** (`<Flame />`).
   - Nom de l'étudiant et badge d'authentification (`Google · email` ou `طالب معتمد`).
   - Sous-titre académique complet : `طالب قانون خاص · الفصل الثالث (S3) · كلية الحقوق عين الشق الدار البيضاء`.
   - Les 4 compteurs académiques en cartes propres :
     * **المشاريع : 12**
     * **التلاخيص : 28**
     * **المجموعات : 4**
     * **الأصدقاء : 142**
   - 2 Boutons tactiles 3D : `صمم شخصيتك` (ouvre AvatarBuilder) et `تعديل الملف` (`/law/settings`).

2. **Les 3 Onglets Interactifs du Profil :**
   - **Onglet 1 : `الأعمال والمشاريع`**
     * Sélecteur de tri : `الأحدث` / `الأكثر تفاعلاً`.
     * Cartes de réalisations avec badge sans retour à la ligne et compteurs sur une seule ligne :
       - `🎙️ حصة صوتية` : تسجيل صوتي: شرح أركان المسؤولية التقصيرية (الفصل 77 و 78) | ♥ 48 | 👁 312
       - `📊 خريطة ذهنية` : خريطة مفاهيم: التمييز بين البطلان والإبطال | ♥ 95 | 👁 740
       - `⚖️ نازلة محلولة` : حل نازلة امتحان الدورة العادية (2025) | ♥ 114 | 👁 1.2k
   - **Onglet 2 : `المساهمات والملخصات`**
     * En-tête avec bouton tactile : `+ إضافة ملخص جديد`.
     * Badges de statut propres : `✓ مقبول ومنشور` (vert émeraude) et `⏳ قيد مراجعة المشرفين` (orange ambre).
   - **Onglet 3 : `مجموعاتي ولقاءات المراجعة`**
     * En-tête avec bouton : `+ إنشاء فوج مراجعة`.
     * Sessions d'étude en direct :
       - Badge `● مباشر الليلة 20:30` pulsant + bouton d'action tactile `انضم / سأحضر ✓`.
       - Session planifiée `السبت 16:00` + bouton `مسجل بالفعل ✓`.

### B. Les 4 Angles d'Étude dans `SubjectView.jsx`
- Ne mets pas de simples boutons vides ! Rends les 4 tuiles interactives et tactiles :
  1. **الخطاطات (Schémas / Mindmaps) :** Mode cartographie conceptuelle.
  2. **الجداول (Tableaux) :** Tableaux comparatifs des règles et articles.
  3. **الملخصات (Résumés) :** Fiches de synthèse de cours.
  4. **البطاقات (Flashcards) :** Lien direct vers la révision espacée FSRS (`/law/exam`).

### C. Règles de Code & Design Système
- Règle Brain **L-0047** validée : les boutons 3D tactiles émeraude et le thème clair haute définition sont autorisés.
- Ne code pas de couleurs hex brutes `#...` dans le JSX (utilise des variables CSS `--law-*` ou les classes Tailwind `emerald-700`, `slate-900`, `slate-50`, `rgb(...)`).
- Utilise les icônes Phosphor (`<Flame />`, `<ShieldCheck />`, `<Microphone />`, `<TreeStructure />`, `<Scales />`, `<Heart />`, `<Eye />`).
- Strictement du CSS logique (`ps-*`, `pe-*`, `ms-*`, `me-*`, `start-*`, `end-*`).

---

## 🔁 2. L'ENGINEERING LOOP (BOUCLE D'AUTO-CORRECTION)

Tu dois exécuter cette séquence de manière itérative jusqu'à validation totale :

```text
[ 1. MODIFIER LE CODE ]
       │
       ▼
[ 2. TESTER & CONTRÔLER ]
   ├── ./scripts/gate.sh --quick
   ├── LAWOS_TEST_FFMPEG=/path/to/ffmpeg npx -y node@24 node_modules/.bin/jest server/__tests__/law
   └── VITE_API_BASE=/api yarn --cwd frontend build
       │
       ├─► SI ERREUR OU MANQUE : Corriger immédiatement le code et recommencer à l'étape 1.
       │
       ▼ (Si 100% SUCCÈS)
[ 3. DÉPLOYER SUR LE SERVEUR ]
   ├── rsync -az --delete frontend/dist/ 100.109.58.54:/tmp/lawos-dist/
   ├── ssh 100.109.58.54 "docker cp /tmp/lawos-dist/. lawos:/app/server/public/ && docker restart lawos"
   └── curl -sk https://tayebhomeserver.tail94b594.ts.net/api/law/health
```

---

## 🏁 3. CRITÈRE DE SORTIE
Ne termine ton exécution que lorsque :
1. Les 3 onglets du profil et les 4 angles d'étude sont fidèlement codés et fonctionnels.
2. `gate.sh` affiche `GATE PASS`.
3. Le build Vite réussit.
4. Le conteneur Docker sur le serveur est redémarré et `health` renvoie `{"status":"ok"}`.
