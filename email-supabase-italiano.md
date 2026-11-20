# Email di Supabase in italiano: Primo Giocatore

Dove: Supabase → **Authentication** → **Emails** → **Templates**.
Per ogni modello: scegli la scheda, sostituisci **Subject** e **Body** (incolla tutto il blocco HTML), poi **Save**.

Non cambiare niente tra le doppie graffe `{{ … }}`: sono i segnaposto che Supabase riempie da solo
(il link, il codice, il nome della persona).

---

## 1. Confirm signup (conferma iscrizione)

**Subject**
```
Conferma la tua iscrizione a Primo Giocatore
```

**Body**
```html
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 520px; margin: 0 auto; color: #222; line-height: 1.5;">
  <h2 style="margin: 0 0 16px;">Benvenuto in Primo Giocatore!</h2>
  <p>{{ if .Data.nome }}Ciao {{ .Data.nome }},{{ else }}Ciao,{{ end }}</p>
  <p>grazie per esserti iscritto. Per attivare l'account conferma il tuo indirizzo email:</p>
  <p style="margin: 24px 0;">
    <a href="{{ .ConfirmationURL }}" style="background: #222; color: #fff; padding: 12px 20px; border-radius: 6px; text-decoration: none; display: inline-block;">Conferma l'email</a>
  </p>
  <p style="font-size: 13px; color: #666;">Se il pulsante non funziona, copia questo indirizzo nel browser:<br>{{ .ConfirmationURL }}</p>
  <p style="font-size: 13px; color: #666;">Se non ti sei iscritto tu, ignora questo messaggio.</p>
  <p style="font-size: 13px; color: #666;">Primo Giocatore by TdGroma</p>
</div>
```

---

## 2. Invite user (invito)

**Subject**
```
Sei stato invitato su Primo Giocatore
```

**Body**
```html
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 520px; margin: 0 auto; color: #222; line-height: 1.5;">
  <h2 style="margin: 0 0 16px;">Hai un invito</h2>
  <p>Ciao,</p>
  <p>sei stato invitato a entrare in Primo Giocatore. Clicca qui per accettare e creare il tuo account:</p>
  <p style="margin: 24px 0;">
    <a href="{{ .ConfirmationURL }}" style="background: #222; color: #fff; padding: 12px 20px; border-radius: 6px; text-decoration: none; display: inline-block;">Accetta l'invito</a>
  </p>
  <p style="font-size: 13px; color: #666;">Se il pulsante non funziona, copia questo indirizzo nel browser:<br>{{ .ConfirmationURL }}</p>
  <p style="font-size: 13px; color: #666;">Se non aspettavi questo invito, ignora questo messaggio.</p>
  <p style="font-size: 13px; color: #666;">Primo Giocatore by TdGroma</p>
</div>
```

---

## 3. Magic link (accesso senza password)

**Subject**
```
Il tuo link per entrare in Primo Giocatore
```

**Body**
```html
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 520px; margin: 0 auto; color: #222; line-height: 1.5;">
  <h2 style="margin: 0 0 16px;">Entra in Primo Giocatore</h2>
  <p>{{ if .Data.nome }}Ciao {{ .Data.nome }},{{ else }}Ciao,{{ end }}</p>
  <p>clicca qui per entrare. Il link vale una sola volta e scade dopo poco tempo.</p>
  <p style="margin: 24px 0;">
    <a href="{{ .ConfirmationURL }}" style="background: #222; color: #fff; padding: 12px 20px; border-radius: 6px; text-decoration: none; display: inline-block;">Entra</a>
  </p>
  <p style="font-size: 13px; color: #666;">Se il pulsante non funziona, copia questo indirizzo nel browser:<br>{{ .ConfirmationURL }}</p>
  <p style="font-size: 13px; color: #666;">Se non hai chiesto tu di entrare, ignora questo messaggio.</p>
  <p style="font-size: 13px; color: #666;">Primo Giocatore by TdGroma</p>
</div>
```

---

## 4. Change email address (cambio email)

**Subject**
```
Conferma il nuovo indirizzo email
```

**Body**
```html
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 520px; margin: 0 auto; color: #222; line-height: 1.5;">
  <h2 style="margin: 0 0 16px;">Cambio indirizzo email</h2>
  <p>{{ if .Data.nome }}Ciao {{ .Data.nome }},{{ else }}Ciao,{{ end }}</p>
  <p>hai chiesto di cambiare l'email del tuo account da <strong>{{ .Email }}</strong> a <strong>{{ .NewEmail }}</strong>. Conferma il cambio:</p>
  <p style="margin: 24px 0;">
    <a href="{{ .ConfirmationURL }}" style="background: #222; color: #fff; padding: 12px 20px; border-radius: 6px; text-decoration: none; display: inline-block;">Conferma il cambio</a>
  </p>
  <p style="font-size: 13px; color: #666;">Se il pulsante non funziona, copia questo indirizzo nel browser:<br>{{ .ConfirmationURL }}</p>
  <p style="font-size: 13px; color: #666;">Se non hai chiesto tu il cambio, ignora questo messaggio: il tuo indirizzo resta quello di prima.</p>
  <p style="font-size: 13px; color: #666;">Primo Giocatore by TdGroma</p>
</div>
```

---

## 5. Reset password (recupero password)

**Subject**
```
Scegli una nuova password per Primo Giocatore
```

**Body**
```html
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 520px; margin: 0 auto; color: #222; line-height: 1.5;">
  <h2 style="margin: 0 0 16px;">Nuova password</h2>
  <p>{{ if .Data.nome }}Ciao {{ .Data.nome }},{{ else }}Ciao,{{ end }}</p>
  <p>abbiamo ricevuto una richiesta per cambiare la password del tuo account. Clicca qui per sceglierne una nuova:</p>
  <p style="margin: 24px 0;">
    <a href="{{ .ConfirmationURL }}" style="background: #222; color: #fff; padding: 12px 20px; border-radius: 6px; text-decoration: none; display: inline-block;">Scegli la nuova password</a>
  </p>
  <p style="font-size: 13px; color: #666;">Se il pulsante non funziona, copia questo indirizzo nel browser:<br>{{ .ConfirmationURL }}</p>
  <p style="font-size: 13px; color: #666;">Se non l'hai chiesto tu, ignora questo messaggio: la password resta quella di prima.</p>
  <p style="font-size: 13px; color: #666;">Primo Giocatore by TdGroma</p>
</div>
```

---

## 6. Reauthentication (codice di conferma)

**Subject**
```
Il tuo codice di conferma
```

**Body**
```html
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 520px; margin: 0 auto; color: #222; line-height: 1.5;">
  <h2 style="margin: 0 0 16px;">Codice di conferma</h2>
  <p>{{ if .Data.nome }}Ciao {{ .Data.nome }},{{ else }}Ciao,{{ end }}</p>
  <p>per completare l'operazione inserisci questo codice:</p>
  <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; margin: 24px 0;">{{ .Token }}</p>
  <p style="font-size: 13px; color: #666;">Se non hai chiesto tu il codice, ignora questo messaggio.</p>
  <p style="font-size: 13px; color: #666;">Primo Giocatore by TdGroma</p>
</div>
```
