# Setup Google OAuth Client ID

Panduan mendapatkan Google Client ID dan mendaftarkan origin `localhost` dan Vercel.

Dipakai oleh: `src/lib/google-auth.ts` (env `VITE_GOOGLE_CLIENT_ID`).
Scope yang diminta: `spreadsheets`, `userinfo.profile`, `userinfo.email`.

---

## 1. Buat project di Google Cloud

1. Buka https://console.cloud.google.com/
2. Klik dropdown project (kiri atas) → **New Project**.
3. Isi nama, mis. `qr-logbook` → **Create**.
4. Pastikan project tersebut terpilih di dropdown.

## 2. Aktifkan Google Sheets API

1. Menu ☰ → **APIs & Services** → **Library**.
2. Cari **Google Sheets API** → **Enable**.

## 3. Atur OAuth Consent Screen

1. **APIs & Services** → **OAuth consent screen**.
2. User type: **External** → **Create**.
3. Isi:
   - App name: `QR Logbook`
   - User support email: email Anda
   - Developer contact email: email Anda
4. **Scopes** → **Add or remove scopes**, centang:
   - `.../auth/spreadsheets`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
5. **Test users** → **Add users** → masukkan email Google yang akan login.
   (Selama status *Testing*, hanya test user yang bisa login.)
6. Simpan.

## 4. Buat OAuth Client ID

1. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**.
2. Application type: **Web application**.
3. Name: `qr-logbook-web`.
4. **Authorized JavaScript origins** → **Add URI**, isi dua origin ini
   (tanpa path, tanpa slash di akhir):

   ```
   http://localhost:5173
   http://localhost:5188
   https://qr-scanner-two-jet.vercel.app
   ```

   Catatan:
   - Vite default port `5173`. Jika bentrok, Vite pakai port lain (mis. `5188`). Daftarkan port yang muncul di terminal.
   - Jika nanti pakai domain Vercel lain / custom domain, tambahkan juga di sini.
   - Preview deployment Vercel (URL berbeda tiap deploy, mis. `qr-scanner-xxxx-user.vercel.app`) harus didaftarkan satu per satu, atau pakai production URL saja.

5. **Authorized redirect URIs**: **tidak perlu** untuk flow ini (Google Identity Services popup/token client).
6. Klik **Create**. Salin **Client ID** (format: `xxxxxxxx.apps.googleusercontent.com`).

## 5. Pasang Client ID di localhost

Buat file `.env` di root project (jangan di-commit):

```env
VITE_GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
```

Lalu restart dev server (`npm run dev`). Vite hanya membaca `.env` saat start.

## 6. Pasang Client ID di Vercel

1. Buka https://vercel.com/dashboard → project `qr-scanner`.
2. **Settings** → **Environment Variables**.
3. Tambahkan:
   - Key: `VITE_GOOGLE_CLIENT_ID`
   - Value: `xxxxxxxx.apps.googleusercontent.com`
   - Environment: **Production** (dan **Preview** bila perlu)
4. **Penting:** variabel `VITE_*` ditanam saat build. Setelah menambah/mengubah, deploy ulang:

   ```bash
   vercel deploy --prod
   ```

   atau klik **Redeploy** di tab Deployments.

## 7. Verifikasi

1. Buka `http://localhost:5188/` (atau port yang tampil) → klik login Google.
2. Ulangi di https://qr-scanner-two-jet.vercel.app.
3. Jika muncul error `redirect_uri_mismatch` atau `origin_mismatch`: origin di browser belum terdaftar di langkah 4. Cek ulang protokol (`http` vs `https`), port, dan tanpa slash di akhir.
4. Jika muncul `access_denied` / "app not verified": akun belum ada di **Test users** (langkah 3.5).

## Ringkasan origin

| Lingkungan | Origin |
|---|---|
| Lokal | `http://localhost:5173` / `http://localhost:5188` |
| Vercel production | `https://qr-scanner-two-jet.vercel.app` |

## Catatan keamanan

- Client ID bersifat publik (boleh terlihat di bundle frontend). Yang dijaga adalah daftar origin.
- Jangan commit file `.env`. Pastikan `.gitignore` memuat `.env`.
- Untuk dipakai publik (bukan test user), scope `spreadsheets` butuh verifikasi Google OAuth.
