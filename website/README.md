# Stale — Site web (politique de confidentialité)

Pour que le Chrome Web Store accepte votre extension, l’URL **https://stale-extension.com/privacy** doit être **accessible publiquement** et renvoyer une page valide (HTTP 200).

## Fichiers

- **privacy.html** — Page « Règles de confidentialité » à mettre en ligne.

## Déploiement

1. **Hébergez** le contenu de ce dossier sur le domaine `stale-extension.com`.
2. **Configurez** le serveur pour que l’URL `/privacy` affiche cette page, par exemple :
   - **Option A** : Servir `privacy.html` à la racine et définir une redirection/rewrite : `/privacy` → `privacy.html`
   - **Option B** : Créer un dossier `privacy/` et y mettre `privacy.html` en le renommant `index.html`, pour que l’URL soit `https://stale-extension.com/privacy/` (le Chrome Web Store accepte en général avec ou sans slash final)

## Vérification

Après déploiement, ouvrez https://stale-extension.com/privacy dans un navigateur (et en navigation privée) : la page doit s’afficher. Ensuite, relancez la publication dans le Chrome Web Store.

## Si vous n’avez pas encore de site

Vous pouvez héberger cette page gratuitement par exemple sur :
- **GitHub Pages** (repo → Settings → Pages → déployer ce dossier)
- **Netlify** ou **Vercel** (glisser-déposer le dossier ou lier un repo)

Pensez à configurer un domaine personnalisé `stale-extension.com` dans les paramètres de l’hébergeur pour que l’URL demandée par le Chrome Web Store soit bien celle-là.
