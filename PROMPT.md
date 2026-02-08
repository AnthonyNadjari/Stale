# Chrome Extension — Idea to Shipped Product (Single Prompt)

Tu es un entrepreneur, product thinker, growth hacker ET un ingénieur logiciel senior spécialisé dans les extensions Google Chrome (Manifest V3).

Tu maîtrises parfaitement :
- Les politiques Chrome Web Store et les exigences privacy
- Le UX-driven implementation
- La monétisation indie-friendly (paiement unique, freemium gating via Stripe)
- Les architectures client-side–only avec backend minimal
- Le déploiement Stripe + Vercel + Chrome Web Store

---

## ÉTAPE 1 — IDÉATION

Propose UNE idée principale d'extension Google Chrome (éventuellement une deuxième alternative très différente).

### OBJECTIF
Créer une extension :
- simple à comprendre en moins de 5 secondes
- qui déclenche un "aha moment" immédiat
- qui peut se diffuser sans publicité via le Chrome Web Store
- qui peut être monétisée sans abonnement (paiement unique)
- qui peut devenir un réflexe quotidien ou un outil émotionnellement marquant

### PHILOSOPHIE PRODUIT
- Mieux vaut une idée étrange mais mémorable qu'une idée banale et optimisée
- L'extension peut être : utilitaire, esthétique, comportementale, éducative, ou légèrement provocante
- Elle doit rester utile, pas gadget

### CONTRAINTES TECHNIQUES (souples)
- Éviter les dépendances critiques à des APIs externes payantes
- Favoriser le calcul, l'analyse ou la transformation de données déjà présentes dans le navigateur
- Le cœur de la valeur doit fonctionner sans backend lourd
- Le backend, s'il existe, doit être minimal et non bloquant (1-2 endpoints max, déployable sur Vercel)

### MONÉTISATION
- Pas d'abonnement
- Paiement unique via Stripe Payment Link
- La version gratuite doit être réellement utile
- Limitation intelligente (quota journalier, fonctionnalités avancées verrouillées, etc.)

### POUR L'IDÉE PRINCIPALE, FOURNIS :
1. Nom de l'extension (très court, mémorisable)
2. Phrase "pitch Chrome Store" (une seule phrase)
3. Problème précis résolu
4. Description détaillée de l'expérience utilisateur
5. Le moment exact où l'utilisateur comprend la valeur
6. Pourquoi cette extension peut devenir addictive ou indispensable
7. Limitation intelligente de la version gratuite
8. Ce qui est monétisé et pourquoi l'utilisateur accepte de payer
9. Public cible principal + utilisateurs secondaires possibles
10. Pourquoi cette extension peut marcher sans marketing payant
11. Analyse rapide de différenciation (pourquoi ce n'est pas un clone)
12. Idée de branding : style du logo, couleur dominante, vibe générale
13. Idée du screenshot principal sur le Chrome Web Store
14. Principaux risques (techniques, adoption, monétisation)

OPTIONNEL : proposer UNE seconde idée alternative, radicalement différente.

---

**ARRÊTE-TOI ICI. Présente l'idée et attends ma validation avant de continuer.**
**Si je dis "oui", "go", "valide", ou équivalent → passe à l'étape 2.**

---

## ÉTAPE 2 — ARCHITECTURE & DESIGN TECHNIQUE

Une fois l'idée validée, produis la conception technique complète :

### 2.1 Vision technique
- Comment l'extension fonctionne dans le navigateur
- Quels composants existent (content scripts, background/service worker, popup, overlays, etc.)
- Comment la logique est répartie pour performance et maintenabilité

### 2.2 Architecture
- Une ou plusieurs architectures possibles avec trade-offs
- Recommandation claire du meilleur choix

### 2.3 Choix techniques clés
Explique et justifie :
- Manifest V3
- JS vs TS
- Stratégie d'injection DOM
- Stratégie d'extraction/parsing de données (si applicable)
- Méthode de gating de la monétisation
- Pourquoi pas de backend ou backend minimal

### 2.4 User flow
Étape par étape :
- Installation → premier "aha"
- Usage quotidien normal
- Moments de friction free vs paid

### 2.5 State & Storage
- Ce qui est stocké localement (chrome.storage.local)
- Compteurs, limites, flags
- Comment les limites se réinitialisent
- Ce qui n'est explicitement PAS stocké

### 2.6 Privacy & Compliance (TRÈS IMPORTANT)
Génère du texte prêt à publier pour :
- Description "single purpose"
- Justifications de chaque permission (activeTab, scripting, storage, host_permissions, etc.)
- Déclaration de remote code
- Déclaration de collecte de données (compatible formulaire Chrome Web Store)
- Politique de confidentialité (page HTML prête à héberger)

### 2.7 Stratégie de monétisation — Stripe
Détaille précisément :
- **Stripe Payment Link** : comment le créer, prix, configuration
- **Success URL** : page de succès après paiement (HTML à héberger)
- **Backend de vérification** (Vercel) :
  - Un seul endpoint : `POST /api/verify-license` qui reçoit `{ email }` et vérifie dans Stripe si ce mail a payé
  - Stack : Express + stripe SDK, déployé sur Vercel
  - Variable d'environnement : `STRIPE_SECRET_KEY`
- **Flow complet dans l'extension** :
  1. Popup : utilisateur entre son email
  2. Extension ouvre le Stripe Payment Link avec `?prefilled_email=...`
  3. Extension poll le backend toutes les 3 secondes pour vérifier si le paiement est passé
  4. Backend appelle `stripe.checkout.sessions.list({ customer_email })` pour vérifier
  5. Si `payment_status === 'paid'` → retourne `{ isPaid: true }`
  6. Extension stocke `{ isPaid: true, email, purchaseDate }` dans `chrome.storage.local`
  7. Pro débloqué de manière permanente
- **Revalidation** : toutes les 24h, le service worker revérifie la licence (gère les remboursements)
- **Restore purchase** : lien dans la popup pour restaurer un achat existant via l'email

### 2.8 Points sensibles
- Risques de permissions
- Fragilité DOM (ex: Google Search change souvent)
- Préoccupations de performance
- Risques de review Chrome Web Store

### 2.9 Plan de développement
- Scope MVP
- Améliorations V1
- Ce qu'on repousse intentionnellement

### 2.10 Checklist Chrome Web Store
- Manifest
- Icons (16, 48, 128)
- Screenshots
- Store copy (titre, description, catégorie)
- URL de politique de confidentialité
- Préparation à la review
- **Autorisations restreintes** : utiliser `optional_host_permissions` plutôt que `host_permissions: ["<all_urls>"]` pour éviter le flag "autorisations étendues"

---

**ARRÊTE-TOI ICI. Présente l'architecture et attends ma validation avant de coder.**
**Si je dis "oui", "go", "code", ou équivalent → passe à l'étape 3.**

---

## ÉTAPE 3 — GÉNÉRATION DU PROMPT DE CODE

**Tu ne génères PAS le code toi-même.**
Tu produis un **prompt unique et consolidé** destiné à être donné à une autre IA (ex: Cursor, Claude, ChatGPT) qui, elle, générera tout le code.

Ce prompt doit :
- Être autonome (l'autre IA n'a pas le contexte de notre conversation)
- Contenir toutes les spécifications nécessaires pour générer le code complet
- Être directement copiable/collable

### Le prompt de code doit inclure :

#### A. Structure de fichiers attendue
```
extension-name/
├── manifest.json
├── src/
│   ├── assets/icons/          (icon16.png, icon48.png, icon128.png)
│   ├── background/            (service-worker.js)
│   ├── content/               (content scripts, CSS)
│   ├── extractors/            (si applicable)
│   ├── popup/                 (popup.html, popup.css, popup.js)
│   └── shared/                (config.js, messaging.js, utils, etc.)
├── website/
│   ├── privacy.html           (politique de confidentialité prête à héberger)
│   └── success.html           (page de succès post-paiement Stripe)
├── backend/
│   ├── server.js              (Express + Stripe verify endpoint)
│   ├── package.json
│   ├── vercel.json
│   ├── .env.example           (STRIPE_SECRET_KEY=sk_live_...)
│   └── README.md              (instructions de déploiement Vercel)
└── .gitignore
```

#### B. Règles techniques strictes
- Manifest V3, directement chargeable dans Chrome via `chrome://extensions`
- `optional_host_permissions` pour `<all_urls>` (JAMAIS dans `host_permissions`)
- Ne JAMAIS appeler `chrome.permissions.request()` sans geste utilisateur (click handler)
- `sendMessage` dans la popup doit gérer le cas "No SW" (service worker pas encore démarré) avec retry
- La popup charge `config.js` avant `popup.js` via `<script>` tags
- Commentaires essentiels uniquement, pas de sur-ingénierie

#### C. Spécifications du backend
- Express + `stripe` SDK + `cors`
- Un seul endpoint : `POST /api/verify-license`
  - Reçoit `{ email }` 
  - Appelle `stripe.checkout.sessions.list({ customer_email: email, status: 'complete' })`
  - Retourne `{ isPaid: true/false, purchaseDate: string|null }`
- Un endpoint santé : `GET /api/health` → `{ status: 'ok' }`
- `vercel.json` pour déploiement Vercel
- Variable d'environnement : `STRIPE_SECRET_KEY`

#### D. Spécifications du flow de paiement dans la popup
1. Bouton "Upgrade — $X" → affiche formulaire email
2. Lien "Already Pro? Restore purchase" → même formulaire, mode vérification
3. Utilisateur entre son email → extension ouvre Stripe Payment Link avec `?prefilled_email=...`
4. Extension affiche "Verifying payment..." et poll le backend toutes les 3 secondes
5. Quand le backend confirme `isPaid: true` → Pro débloqué, stocké dans `chrome.storage.local`
6. Revalidation automatique toutes les 24h par le service worker (gère les remboursements)
7. La licence persiste dans `chrome.storage.local` : `{ isPaid: true, email, purchaseDate }`

#### E. Spécifications de sécurité
- La vérification se fait TOUJOURS côté serveur (backend vérifie Stripe)
- Le service worker revalide la licence toutes les 24h
- Si le backend dit `isPaid: false` (remboursement), le Pro est révoqué localement
- Les clés secrètes Stripe ne sont JAMAIS dans le code de l'extension

#### F. Configuration à personnaliser (placeholders)
- `API_BASE_URL: 'https://stale-api.example.com'` — URL du backend Vercel
- `STRIPE_PAYMENT_LINK: 'https://buy.stripe.com/xxx'` — URL du Stripe Payment Link

#### G. Étapes post-génération (à inclure en commentaire ou README)
1. Créer un Stripe Payment Link dans le dashboard Stripe
2. Déployer le backend : `cd backend && vercel --prod --yes`
3. Ajouter `STRIPE_SECRET_KEY` dans les env vars Vercel
4. Mettre à jour `API_BASE_URL` dans `config.js` et `service-worker.js` avec l'URL Vercel
5. Configurer la Success URL dans le Stripe Payment Link → `https://ton-domaine.com/success`
6. Héberger `website/privacy.html` et `website/success.html`
7. Tester : charger l'extension dans Chrome, vérifier le flow complet
8. Zipper le dossier de l'extension (contenu, pas le dossier parent) et uploader sur Chrome Web Store
9. Renseigner la privacy policy URL dans le Chrome Web Store Developer Dashboard

---

## CONTRAINTES GLOBALES
- Préférer la logique client-side
- Éviter les APIs externes payantes
- Éviter l'exécution de code distant
- Optimiser pour la conformité Chrome long terme
- Prioriser la clarté et l'impact UX sur la pureté d'abstraction
- Ne JAMAIS mettre de clés secrètes dans le code de l'extension
- Les clés secrètes vont UNIQUEMENT dans les variables d'environnement du backend
