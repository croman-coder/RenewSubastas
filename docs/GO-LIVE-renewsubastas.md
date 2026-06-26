# Puesta en producción — renewsubastas.com.py

Guía paso a paso para dejar CARBID / Renew Subastas en vivo en
**https://renewsubastas.com.py**, con Firebase de producción
(`carbid-59ef5`), emails por Resend y el dominio conectado.

> Lo que ya quedó hecho en el código (no tenés que tocarlo):
> los emails y sus links ahora apuntan a `https://renewsubastas.com.py`,
> el remitente por defecto es `subastas@renewsubastas.com.py`, y el
> campo "From" del panel de admin ahora sí se respeta al enviar.

---

## 0. Mapa rápido: ¿qué se cambia y dónde?

| Qué                                | Dónde se cambia                                                       |
| ---------------------------------- | --------------------------------------------------------------------- |
| Dominio público del sitio          | Netlify (o Vercel) → Domains + DNS de `renewsubastas.com.py`          |
| Dominio en links de email + logo   | **Ya en el código** (`functions/src/lib/email-templates.ts`)          |
| Remitente de emails (From)         | **Ya en el código** + panel `/admin/config` (Emails) en runtime       |
| Verificación del dominio de email  | Resend → Domains → `renewsubastas.com.py` (registros SPF/DKIM en DNS) |
| API key de Resend                  | `firebase functions:secrets:set RESEND_API_KEY` (staging y prod)      |
| Proyecto Firebase de prod          | `carbid-59ef5` (ya configurado en `.firebaserc`)                      |
| Login en el dominio nuevo          | Firebase Console → Auth → Settings → Authorized domains               |
| Claves Firebase del front (prod)   | Secrets de GitHub `PROD_NEXT_PUBLIC_FIREBASE_*` + env de Netlify      |
| Reglas Firestore/Storage + índices | `firebase deploy --only firestore:rules,storage,firestore:indexes`    |

---

## 1. Firebase — proyecto de producción (`carbid-59ef5`)

En la [Consola de Firebase](https://console.firebase.google.com/project/carbid-59ef5):

1. **Authentication → Sign-in method:** habilitar **Email/Password**.
2. **Authentication → Settings → Authorized domains:** agregar
   **`renewsubastas.com.py`** (y `www.renewsubastas.com.py` si vas a usar www).
   Sin esto, el login falla en el dominio nuevo.
3. **Firestore Database:** crear en modo _Native_, región
   `southamerica-east1`.
4. **Storage:** activar, misma región.
5. **App Check:** registrar la app web con proveedor **reCAPTCHA v3**, copiar
   el _site key_ (va como `PROD_RECAPTCHA_SITE_KEY`). Dejar **enforcement
   ACTIVADO** para Firestore y Functions antes de abrir al público.
6. **Project settings → Service accounts → Generate new private key:**
   descargar el JSON (va como `PROD_FIREBASE_SA_JSON`).

### 1.1 Restringir la API key del navegador (GCP)

En https://console.cloud.google.com/apis/credentials?project=carbid-59ef5 →
editar la _Browser key_ autogenerada:

- **Application restrictions → HTTP referrers:**
  `renewsubastas.com.py/*`, `www.renewsubastas.com.py/*`, `*.netlify.app/*`
- **API restrictions:** Identity Toolkit, Cloud Firestore, Cloud Storage,
  Cloud Functions, Firebase App Check, Firebase Installations.

---

## 2. Resend (emails transaccionales)

Los emails (bienvenida, te-superaron, ganaste, comprobante) salen por Resend.
Hoy el remitente es **`subastas@renewsubastas.com.py`**.

1. Crear cuenta en https://resend.com.
2. **Domains → Add domain →** `renewsubastas.com.py`.
3. Resend te da registros **SPF, DKIM** (y opcional **DMARC**). Cargalos en el
   DNS de `renewsubastas.com.py` (mismo panel donde apuntás el dominio).
   Esperar a que Resend marque el dominio como **Verified**.
4. **API Keys → Create** (full access por ahora). Guardar la key `re_...`.
5. Cargar la key como _secret_ de Functions, en **ambos** proyectos:

   ```bash
   cd functions
   firebase use carbid-staging
   firebase functions:secrets:set RESEND_API_KEY   # pegar la key

   firebase use carbid-59ef5
   firebase functions:secrets:set RESEND_API_KEY   # pegar la key
   ```

> Nota: si el dominio todavía no está verificado en Resend, los emails no se
> envían pero **la app no se rompe** (el código lo loguea y sigue). Verificá el
> dominio para que empiecen a salir.
>
> El remitente y el nombre también se pueden ajustar en vivo desde
> **`/admin/config` → Emails** (sin redeploy). El destinatario de los avisos de
> comprobante usa `contactEmail` de esa misma pantalla, o cae a
> `croman@santarosa.com.py` si está vacío.

---

## 3. El dominio renewsubastas.com.py

El sitio se hostea en **Netlify** (config en `netlify.toml`) — también hay
`vercel.json` por si preferís Vercel. Elegí UNO.

### Opción Netlify (recomendada, ya configurada)

1. Netlify → tu sitio → **Domain management → Add a domain** →
   `renewsubastas.com.py`.
2. Apuntar el DNS según lo que indique Netlify:
   - Apex (`renewsubastas.com.py`): registro **A/ALIAS** a Netlify, o usar
     Netlify DNS.
   - `www`: **CNAME** a tu sitio `*.netlify.app`.
3. Netlify emite el certificado HTTPS automáticamente (Let's Encrypt).
4. Cargar las variables de entorno de producción (sección 4) en
   **Site settings → Environment variables**.

Headers de seguridad (CSP, HSTS, etc.) ya vienen en `netlify.toml` y el CSP ya
permite Firebase/Resend/reCAPTCHA. No hace falta tocarlo.

---

## 4. Variables de entorno de producción (frontend)

El front necesita las claves **públicas** de Firebase del proyecto
`carbid-59ef5`. Se sacan de Firebase Console → Project settings → _Your apps_ →
SDK setup and configuration.

Cargarlas en Netlify (Environment variables) **y** como GitHub Secrets
`PROD_*` (las usa el deploy por CI):

```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=carbid-59ef5.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=carbid-59ef5
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=carbid-59ef5.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=...            # el de App Check
NEXT_PUBLIC_SENTRY_DSN=...                    # opcional
```

⚠️ **MUY IMPORTANTE — en producción NO debe existir ninguna de estas:**
`NEXT_PUBLIC_USE_FIREBASE_EMULATORS`, `FIREBASE_AUTH_EMULATOR_HOST`,
`FIRESTORE_EMULATOR_HOST`. Si alguna queda seteada, la app se conecta a un
emulador inexistente o se inicializa **sin credenciales** y nadie puede entrar.

(El archivo `apps/web/.env.local` con valores `demo-emulator-key` es **solo
para desarrollo local** y no se sube a producción — está en `.gitignore`.)

---

## 5. GitHub Secrets para el deploy por CI

En el repo → Settings → Secrets and variables → Actions:

- **Producción:** `PROD_NEXT_PUBLIC_FIREBASE_*` (sección 4),
  `PROD_RECAPTCHA_SITE_KEY`, `PROD_SENTRY_DSN`, `PROD_FIREBASE_SA_JSON`
  (contenido del JSON de la service account), `NETLIFY_SITE_ID_PROD`.
- **Staging:** los mismos en versión `STAGING_*` apuntando a `carbid-staging`.
- **Compartidos:** `NETLIFY_AUTH_TOKEN`, `SENTRY_AUTH_TOKEN`.

---

## 6. Deploy

### Reglas, índices y functions (Firebase)

```bash
firebase use carbid-59ef5
# Reglas e índices (incluye los cambios de seguridad de esta auditoría):
firebase deploy --only firestore:rules,storage,firestore:indexes
# Cloud Functions (incluye la nueva getWinnerContact y los fixes):
firebase deploy --only functions
```

### Web (Netlify)

- Automático: el workflow `deploy-prod` corre al **pushear un tag**:
  ```bash
  git tag v1.0.0 && git push origin v1.0.0
  ```
- O manual desde Netlify (Deploys → Trigger deploy) / GitHub Actions →
  Deploy Production → Run workflow.

> Staging se deploya solo al pushear a `main`.

---

## 7. Primer admin en producción

Después del primer deploy de functions:

```bash
cd functions
GOOGLE_APPLICATION_CREDENTIALS=/ruta/al/prod-sa.json \
GCLOUD_PROJECT=carbid-59ef5 \
  pnpm bootstrap-admin admin@santarosa.com.py "Nombre" "Apellido" "1234567" "UnaPasswordFuerte#1"
```

Después entrá a **https://renewsubastas.com.py/es/login**, y cambiá la
contraseña desde Configuración → Seguridad.

> El dominio de los emails de admin/staff (`santarosa.com.py`) es independiente
> del dominio del sitio — es la regla de qué correos pueden ser admin/staff. Se
> puede cambiar en `/admin/config` si querés que el staff use otro dominio.

---

## 8. Checklist final antes de abrir al público

- [ ] Login funciona en `https://renewsubastas.com.py` (dominio en _Authorized
      domains_ de Firebase Auth).
- [ ] App Check **enforcement ON** en Firestore + Functions; `RECAPTCHA_SITE_KEY`
      cargado en prod.
- [ ] **Sin** variables de emulador en el entorno de producción (sección 4).
- [ ] Resend: dominio `renewsubastas.com.py` **Verified**; `RESEND_API_KEY`
      seteado como secret en `carbid-59ef5`.
- [ ] Reglas Firestore/Storage e índices desplegados (`firebase deploy`).
- [ ] Functions desplegadas (incluida `getWinnerContact`).
- [ ] Datos bancarios y de pago cargados en `/admin/config` (cuenta, RUC, seña %,
      plazo, instrucciones, contactEmail).
- [ ] Probar un flujo real en staging: crear vehículo → subasta → pujar con una
      cuenta comprador → cerrar → subir comprobante → confirmar seña.
- [ ] Backups de Firestore programados (ver `PRODUCTION_RUNBOOK.md` §4).

---

Para operación, rollback, monitoreo e incidentes, ver
[`PRODUCTION_RUNBOOK.md`](./PRODUCTION_RUNBOOK.md).
