# Návrh zabezpečení HR systému

## 1. Přehled

Aplikace je dnes čistě frontendová (IndexedDB v prohlížeči). Pro **pozvánky, reset hesel a bezpečné ukládání hesel** je nutné zavést **backend** s databází uživatelů a API pro přihlášení. Tento dokument popisuje návrh rolí, stylu přístupu, pozvánek, nastavení a resetu hesel a ukládání hesel.

---

## 2. Architektura

- **Frontend** (stávající): `index.html` + `app.js` – po přihlášení běží jako dnes, přidá se přihlašovací obrazovka a kontrola session.
- **Backend** (nový): např. **Node.js + Express** (nebo jiný stack), REST API.
- **Databáze**: na backendu **uživatelé, pozvánky, session**; citlivá firemní data (kandidáti, výběrky) mohou zůstat v IndexedDB s volitelným pozdějším přesunem na server.

Doporučení: nejdříve přidat **auth backend** (uživatelé, přihlášení, pozvánky, hesla), frontend dál pracuje s IndexedDB; později lze část dat přesunout na server a API omezit podle rolí.

---

## 3. Uživatelské role a styl přístupu

### 3.1 Role

| Role        | Popis                    | Přístup |
|------------|---------------------------|--------|
| **admin**  | Správce systému            | Vše: kandidáti, výběrky, pozice, nastavení, **správa uživatelů a pozvánek**. |
| **manager**| Vedoucí náboru / HR        | Vše kromě správy uživatelů: kandidáti, výběrky, pozice, dashboard, import/export. |
| **recruiter** | Náborář                  | Kandidáti, výběrky, pipeline, vyhledávání; nemůže mazat výběrky ani měnit pozice. |
| **viewer** | Jen čtení                  | Pouze čtení kandidátů a výběrek, žádné úpravy, žádný import. |

### 3.2 Styl přístupu

- **Řízení přístupu na frontendu**: po načtení aplikace se z API získá aktuální uživatel a jeho `role`. Podle role se:
  - skrývají nebo zobrazují sekce (např. „Nastavení“, „Uživatelé“ jen pro admina),
  - zakazují akce (tlačítka „Smazat“, „Import“, „Export“ podle oprávnění).
- **Řízení na backendu** (až budou data na serveru): každé API volání ověří session a oprávnění (middleware „requireRole(['admin','manager'])“ atd.). Prozatím může backend vracet jen údaje o přihlášeném uživateli a roli; kontrola zůstane hlavně na frontendu.
- **Jednoduchá matice oprávnění** (lze rozšířit):

| Akce / oblast      | admin | manager | recruiter | viewer |
|--------------------|-------|--------|-----------|--------|
| Přihlášení         | ✓     | ✓      | ✓         | ✓      |
| Dashboard          | ✓     | ✓      | ✓         | ✓      |
| Kandidáti (čtení)  | ✓     | ✓      | ✓         | ✓      |
| Kandidáti (úpravy) | ✓     | ✓      | ✓         | ✓      |
| Výběrky (čtení)    | ✓     | ✓      | ✓         | ✓      |
| Výběrky (úpravy)   | ✓     | ✓      | ✓         | —      |
| Pozice             | ✓     | ✓      | —         | —      |
| Import / Export    | ✓     | ✓      | —         | —      |
| Uživatelé, pozvánky| ✓     | —      | —         | —      |
| Nastavení systému  | ✓     | —      | —         | —      |

---

## 4. Ukládání hesel

- **Nikdy neukládat heslo v čitelné podobě.** Na backendu ukládat pouze **hash** hesla.
- **Algoritmus**: např. **bcrypt** (nebo argon2). Bcrypt: cost factor 10–12, sůl součástí hashě.
- **Úložiště**: sloupec např. `passwordHash` v tabulce `users`; žádné pole `password` v DB.
- Při přihlášení: na serveru porovnat zadané heslo s `passwordHash` pomocí `bcrypt.compare(plainPassword, user.passwordHash)`.
- Při nastavení / změně hesla: `bcrypt.hash(plainPassword, 10)` a uložit pouze výsledný hash.

---

## 5. Pozvánky do systému

### 5.1 Tok

1. **Admin** zadá e-mail a vybere roli, klikne „Pozvat“.
2. Backend:
   - vytvoří záznam v tabulce **invitations** (email, role, token, expiresAt, createdBy),
   - vygeneruje **jedinečný token** (např. crypto.randomBytes(32).toString('hex')),
   - uloží např. platnost 7 dní,
   - (volitelně) pošle e-mail s odkazem: `https://vase-app.cz/set-password?token=...`.
3. Pozvaný uživatel klikne na odkaz → otevře se stránka **Nastavení hesla** (viz níže).
4. Po úspěšném nastavení hesla:
   - backend vytvoří uživatele v tabulce **users** (email, role, passwordHash),
   - pozvánku označí jako použitou (nebo smaže),
   - uživatel je přihlášen (session) a přesměrován do aplikace.

### 5.2 Datový model pozvánky

- `id`, `email`, `role`, `token` (unikátní), `expiresAt`, `usedAt` (null = nevyužita), `createdBy` (userId), `createdAt`.

### 5.3 API

- `POST /api/invitations` – vytvoření pozvánky (jen admin), body: `{ email, role }`. Odpověď: `{ token, inviteLink }` (odkaz pro e-mail nebo zobrazení adminovi).
- `GET /api/invitations/validate?token=...` – ověření tokenu před zobrazením formuláře „Nastavení hesla“ (vrací email a roli, ne heslo).
- Po nastavení hesla přes `POST /api/auth/set-password` (viz níže) backend uživatele vytvoří a pozvánku uzavře.

---

## 6. Nastavení hesla (první přístup po pozvánce)

- Stránka např. `/set-password.html?token=...` (nebo hash `#/set-password?token=...`).
- Frontend volá `GET /api/invitations/validate?token=...`; pokud je token platný, zobrazí formulář: **Heslo**, **Heslo znovu**.
- Odeslání: `POST /api/auth/set-password` s body `{ token, password }`.
- Backend:
  - ověří token a platnost pozvánky,
  - zhashuje heslo (bcrypt),
  - vytvoří uživatele (`users`),
  - označí pozvánku jako použitou,
  - vytvoří session a vrátí např. `{ user, sessionToken }` nebo nastaví cookie.
- Frontend uloží session (cookie nebo např. localStorage pro token) a přesměruje do hlavní aplikace.

---

## 7. Reset hesla (zapomenuté heslo)

### 7.1 Tok

1. Uživatel na přihlašovací stránce klikne „Zapomněl jsem heslo“, zadá **e-mail**.
2. Frontend: `POST /api/auth/forgot-password` s `{ email }`.
3. Backend:
   - pokud účet s tímto e-mailem existuje, vygeneruje **reset token** (jako u pozvánky), uloží ho do tabulky **password_resets** s platností (např. 1 hodina),
   - odešle e-mail s odkazem: `https://vase-app.cz/reset-password?token=...`.
   - Vždy vrátí stejnou odpověď („Pokud účet existuje, přijde e-mail“), aby nešlo vyzvědět existenci e-mailu.
4. Uživatel klikne na odkaz → stránka **Reset hesla** s formulářem: Heslo, Heslo znovu.
5. Odeslání: `POST /api/auth/reset-password` s `{ token, password }`.
6. Backend ověří token, aktualizuje `users.passwordHash`, smaže nebo zneplatní reset token, přihlásí uživatele (session) a vrátí úspěch.
7. Frontend přesměruje do aplikace.

### 7.2 Datový model resetu

- Tabulka **password_resets**: `id`, `userId` (nebo email), `token`, `expiresAt`, `usedAt`, `createdAt`.

---

## 8. Přihlášení a session

- **Přihlášení**: `POST /api/auth/login` s `{ email, password }`. Backend ověří heslo (bcrypt), vytvoří session (např. uloží do tabulky **sessions** nebo vydá JWT), nastaví cookie nebo vrátí token.
- **Odhlášení**: `POST /api/auth/logout` – zrušení session na serveru a smazání cookie/tokenu na klientu.
- **Kontrola session**: např. `GET /api/auth/me` – vrací aktuálního uživatele a roli. Frontend při startu aplikace zavolá tento endpoint; pokud 401, přesměruje na přihlášení.
- **Ukládání na klientu**: preferovat **httpOnly cookie** pro session token (bezpečnější než localStorage). Alternativa: JWT v localStorage a posílání v hlavičce `Authorization`; pak nutné řešit XSS.

---

## 9. Změna hesla (přihlášený uživatel)

- V nastavení účtu: formulář **Aktuální heslo**, **Nové heslo**, **Nové heslo znovu**.
- `POST /api/auth/change-password` s `{ currentPassword, newPassword }` (autorizováno session).
- Backend ověří `currentPassword` proti `user.passwordHash`, pak uloží hash `newPassword`.

---

## 10. Shrnutí API (auth)

| Metoda | Endpoint | Kdo | Popis |
|--------|----------|-----|--------|
| POST   | /api/auth/login           | —   | Přihlášení (email, password). |
| POST   | /api/auth/logout          | přihlášen | Odhlášení. |
| GET    | /api/auth/me              | přihlášen | Aktuální uživatel a role. |
| POST   | /api/auth/set-password    | —   | Nastavení hesla z pozvánky (token, password). |
| POST   | /api/auth/forgot-password  | —   | Žádost o reset (email). |
| POST   | /api/auth/reset-password  | —   | Nové heslo po resetu (token, password). |
| POST   | /api/auth/change-password | přihlášen | Změna hesla (currentPassword, newPassword). |
| POST   | /api/invitations          | admin | Vytvoření pozvánky (email, role). |
| GET    | /api/invitations/validate | —   | Ověření tokenu pozvánky (query: token). |

---

## 11. Návazná implementace

1. **Backend**: Node + Express, databáze (SQLite pro start nebo PostgreSQL), tabulky `users`, `invitations`, `password_resets`, `sessions` (nebo JWT bez tabulky).
2. **Frontend**: přidat přihlašovací stránku, stránky `set-password.html`, `reset-password.html`, v hlavní aplikaci na začátku volat `GET /api/auth/me` a podle role skrývat/omezovat prvky.
3. **E-maily**: pro pozvánky a reset hesla připojit odesílání e-mailů (nodemailer + SMTP nebo služba typu SendGrid). Pro vývoj lze zatím vracet odkaz v API odpovědi a posílat e-mail ručně nebo logovat do konzole.

Pokud chcete, mohu připravit konkrétní strukturu backendu (složky, soubory, příklad kódu pro registraci, přihlášení a bcrypt) a úpravy `index.html`/`app.js` pro přihlášení a role.
