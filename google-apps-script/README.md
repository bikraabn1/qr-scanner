# Google Apps Script Setup Guide

To link your Google Sheet with the **QR Book Testing Tool**:

1. Open your target Google Sheet.
2. In the top menu, click **Extensions** > **Apps Script**.
3. Replace any code in `Code.gs` with the code inside `Code.gs` in this repository.
4. Click **Save** (disk icon).
5. Click **Deploy** > **New deployment**.
6. Click the gear icon next to "Select type" and choose **Web app**.
7. Configure:
   - **Description**: `QR Book Tester API`
   - **Execute as**: `Me (your email)`
   - **Who has access**: `Anyone` *(Crucial: allows the browser web app to submit test records)*
8. Click **Deploy**.
9. Grant the necessary permissions when prompted.
10. Copy the **Web App URL** (looks like `https://script.google.com/macros/s/.../exec`).
11. Paste this URL into the **Settings** view in the QR Book Testing Tool web app and click **Test Connection**.
