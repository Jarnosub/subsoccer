# 🚀 Deploy Checklist

Ennen jokaista tuotantopäivitystä (staging → main), käy läpi nämä:

---

## Pre-deploy

- [ ] Kaikki muutokset pushattu **staging**-branchiin
- [ ] Testaa staging-ympäristössä: https://staging--subsoccer-pro-live.netlify.app
- [ ] Avaa selaimen konsoli — **ei punaisia virheitä**
- [ ] Kirjaudu sisään (username + Google)
- [ ] Avaa profiilisivu — latautuuko data
- [ ] Bumppaa `version.js` → `APP_VERSION` (esim. '1.0.0' → '1.0.1')

## Merge

- [ ] Tee backup-tagi: `git tag pre-merge-YYYY-MM-DD && git push origin --tags`
- [ ] Merge: `git checkout main && git merge staging`
- [ ] Push: `git push origin main --no-verify`

## Post-deploy

- [ ] Odota Netlify-build ~1-2 min
- [ ] Tarkista tuotanto: https://subsoccer.pro
- [ ] Avaa konsoli — ei virheitä

---

## ⚠️ Rollback

Jos jotain menee pieleen:

```bash
git checkout main
git reset --hard pre-merge-YYYY-MM-DD
git push --force origin main
```
