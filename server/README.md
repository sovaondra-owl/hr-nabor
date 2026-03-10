# Backend API – zabezpečení HR Nábor

- **Přihlášení / odhlášení / session** (cookie)
- **Nastavení hesla** z pozvánky
- **Reset hesla** (zapomenuté heslo)
- **Změna hesla** (přihlášený uživatel)
- **Pozvánky** (jen role admin)

## Instalace a spuštění

```bash
cd server
npm install
npm start
```

Server běží na `http://localhost:3001`. Frontend musí být nasměrován na tuto URL (nebo nastavte `APP_URL` a CORS).

## První admin

Po prvním spuštění neexistuje žádný uživatel. Prvního admina vytvořte jedním z postupů:

1. **Skript pro vytvoření admina** (doporučeno):
   ```bash
   node scripts/create-admin.js admin@example.com MojeHeslo123
   ```
2. **Pozvánka**: Pokud byste měli „bootstrap“ pozvánku vytvořenou mimo API (např. ruční vložení do tabulky `invitations` s tokenem), pak lze použít stránku „Nastavení hesla“ s tímto tokenem a tím vytvořit prvního admina.

## Proměnné prostředí

- `PORT` – port serveru (výchozí 3001)
- `DB_PATH` – cesta k SQLite souboru (výchozí `./hr-auth.db`)
- `APP_URL` – základní URL frontendu pro odkazy v pozvánkách (výchozí http://localhost:3000)
- `NODE_ENV=production` – zapne secure cookies
- **E-mail pozvánek** (volitelné): pokud chcete, aby aplikace posílala pozvánky e-mailem, nastavte:
  - `SMTP_HOST` – SMTP server (např. smtp.gmail.com, smtp.office365.com)
  - `SMTP_PORT` – port (587 nebo 465)
  - `SMTP_USER` – přihlašovací jméno
  - `SMTP_PASS` – heslo (u Gmailu „heslo aplikace“)
  - `SMTP_SECURE` – true pro port 465
  - `MAIL_FROM` – adresa odesílatele (volitelné, výchozí SMTP_USER)
  Pokud SMTP není nastaveno, pozvánka se jen vytvoří a **odkaz se zobrazí v aplikaci** – zkopírujte ho a pošlete pozvanému sami.

## API (shrnutí)

| Metoda | Endpoint | Popis |
|--------|----------|--------|
| POST | /api/auth/login | Přihlášení (email, password) |
| POST | /api/auth/logout | Odhlášení |
| GET | /api/auth/me | Aktuální uživatel (cookie) |
| POST | /api/auth/set-password | Nastavení hesla z pozvánky (token, password) |
| POST | /api/auth/forgot-password | Žádost o reset (email) |
| POST | /api/auth/reset-password | Nové heslo po resetu (token, password) |
| POST | /api/auth/change-password | Změna hesla (currentPassword, newPassword) |
| GET | /api/invitations/validate?token=... | Ověření tokenu pozvánky |
| POST | /api/invitations | Vytvoření pozvánky (email, role) – jen admin |

Podrobnosti viz `docs/NAVRH-ZABEZPECENI.md`.
