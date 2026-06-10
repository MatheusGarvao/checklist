# Checklist da Casa

App simples para organizar itens de compra da casa, com links, observacoes, favoritos e status de comprado.

## Rodar localmente

```bash
npm install
cp .env.example .env
npm run dev
```

Preencha o `.env` com as configuracoes do Firebase Web App.

## Firebase

1. Crie um projeto no Firebase.
2. Ative Authentication com provedor Google.
3. Crie um banco Firestore.
4. Edite `firestore.rules` trocando os dois e-mails permitidos.
5. Publique as regras no console do Firebase.

As variaveis `VITE_*` sao publicas no navegador. A protecao real fica nas regras do Firestore.

## GitHub Pages

Se o site for publicado em `https://usuario.github.io/repositorio/`, configure:

```env
VITE_BASE_PATH=/repositorio/
```

Depois rode:

```bash
npm run build
```

O workflow em `.github/workflows/pages.yml` publica automaticamente quando houver push na branch `main`.
