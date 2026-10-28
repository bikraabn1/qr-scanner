# PRD — QR Book Testing Tool

**Version:** 1.0  
**Status:** MVP specification  
**Product type:** Lightweight web application  
**Primary use case:** Recording and validating QR codes printed across multiple pages of a book  
**Primary integration:** Direct write to an existing Google Sheets spreadsheet  
**Initial environment:** Local development with dummy QR URLs, followed by integration with the actual spreadsheet

## 1. Product Overview

QR Book Testing Tool is a lightweight web application designed to streamline manual QR-code testing in printed books.

Testers scan QR codes, record the book page number, inspect the decoded URL, enter test results and additional metadata, and submit records directly to a designated Google Sheets spreadsheet.

The application must support configurable fields and column mappings so it can adapt to different spreadsheet structures without requiring source-code changes.

The initial prototype must work with dummy URLs and simulated spreadsheet integration before the actual spreadsheet becomes available.

## 2. Problem Statement

The current manual workflow requires testers to repeatedly:

1. Scan a QR code.
2. Read or copy its URL.
3. Identify the corresponding book page.
4. Open a spreadsheet.
5. Locate the correct row and columns.
6. Enter the results manually.
7. Repeat the process for every QR code.

This creates unnecessary context switching, slows down testing, and increases the risk of incorrect entries, duplicate records, and inconsistent data.

The application should minimize manual interaction while maintaining accurate, traceable test records.

## 3. Product Goals

- Make QR scanning and recording fast and repetitive-task friendly.
- Record page numbers, decoded URLs, test results, and custom metadata.
- Write records directly to the actual Google Sheets spreadsheet.
- Allow users to configure spreadsheet destinations and column mappings through the UI.
- Support different spreadsheet schemas without code modifications.
- Provide clear feedback for successful and failed submissions.
- Prevent accidental duplicate submissions and unintended overwrites.
- Support a dummy-data workflow before the real spreadsheet is connected.

### Non-goals for MVP

- User management and role-based access control.
- A general-purpose spreadsheet editor.
- PDF book processing or OCR.
- Automatic generation of QR codes.
- Automated testing of every possible destination website behavior.
- Enterprise analytics, reporting, or multi-tenant administration.
- AI-based QR classification.

## 4. Target User and Usage Scenario

The primary user is a tester responsible for checking multiple QR codes printed throughout one or more books.

Typical session:

1. Open the application.
2. Configure the spreadsheet connection and target sheet.
3. Configure the fields and destination columns.
4. Enter the current book page number.
5. Scan a QR code.
6. Review its decoded contents and enter the required test information.
7. Submit the record.
8. Receive confirmation that the record was written to Google Sheets.
9. Continue to the next QR code with minimal interaction.

The user must be able to update the page number without resetting the spreadsheet connection or field configuration.

## 5. Functional Requirements

### FR-01 — QR Scanner

- Support QR scanning through a compatible device camera.
- Support external USB/Bluetooth scanners that behave like keyboard input.
- Provide a manual URL/text input fallback.
- Display the decoded QR content before submission.
- Handle invalid, unreadable, and unsupported QR contents.
- Allow rescanning without reloading the entire application.
- Preserve the current page number until the tester changes it.
- After a successful submission, prepare the interface for the next scan.

Camera access requires HTTPS or localhost in supported browsers and explicit user permission.

### FR-02 — Book Page Tracking

- Provide a dedicated page-number input.
- Accept configurable validation rules, including positive integers by default.
- Retain the page number across consecutive scans.
- Allow the tester to change the page number at any time.
- Associate each record with the page number active when the QR was scanned or submitted.
- Support multiple QR codes on the same page.

Do not assume that one page corresponds to exactly one QR code.

### FR-03 — Dynamic Form Fields

Users must be able to configure custom data fields through the application UI.

Supported initial field types:

- Text
- URL
- Number
- Single-select
- Boolean or checkbox
- Date/time
- Long text

Each field should support:

- Display label
- Stable internal field identifier
- Field type
- Required/optional setting
- Default value, when applicable
- Validation rules
- Optional mapping to a spreadsheet column

Provide built-in fields for page number, decoded QR content, test status, notes, and scan timestamp.

Built-in fields may be enabled or disabled where appropriate. Custom fields must be addable, editable, reorderable, and removable.

Changing a field label must not silently break its existing mapping.

### FR-04 — Google Sheets Connection

The application must write directly to Google Sheets, not generate an Excel/CSV file as its primary integration.

Connection configuration must support:

- Spreadsheet URL or spreadsheet ID.
- Target worksheet/tab name.
- Connection status and validation.
- A test-connection or test-write operation.
- Clear feedback for authorization and permission failures.

The integration layer must be isolated from the UI so the backend implementation can change without rewriting the scanner or form.

Preferred initial implementation: Google Apps Script deployed as a web app, subject to successful cross-origin, authentication, and response-handling validation.

If the Apps Script approach cannot reliably provide secure writes and observable success/failure responses, implement a suitable server-side proxy or authenticated Google Sheets API integration instead.

Never embed private OAuth credentials or service-account secrets in frontend code.

### FR-05 — Configurable Column Mapping

Users must be able to map application fields to spreadsheet columns without editing source code.

Example:

| Application field | Destination |
|---|---|
| Page number | Column C |
| Decoded QR URL | Column F |
| Test status | Column H |
| Notes | Column J |
| Scan timestamp | Column K |

Requirements:

- Allow destination columns to be selected or entered.
- Support spreadsheet columns beyond Z.
- Allow mapping to be edited independently of the field definition.
- Validate duplicate mappings and require explicit confirmation when appropriate.
- Allow unmapped fields to remain local or be excluded from submission.
- Allow a field to be mapped to an existing spreadsheet header.
- Provide an optional header-row detection feature.
- Preview the resulting mapping before saving.
- Persist configuration across page reloads.
- Never silently change unrelated spreadsheet columns.

If the target spreadsheet contains headers, provide a way to load them and select the matching header rather than relying only on column letters.

The application must distinguish between a field's internal identifier, its displayed label, its spreadsheet header, and its destination column.

### FR-06 — Write Strategy

Support two explicit modes.

**Append mode**

- Add one new record per successful submission.
- Write mapped values to the configured columns.
- Preserve unrelated columns and existing rows.
- Prevent accidental duplicate submissions caused by repeated button clicks or network retries.

**Update mode**

- Locate an existing record using a configured unique identifier or composite key.
- Update only the explicitly mapped cells.
- Never identify a record using page number alone when multiple QR codes may exist on the same page.
- Require a clear match strategy and define behavior for zero or multiple matches.
- Do not overwrite existing data when the target record is ambiguous.

Append mode is the default for the initial MVP.

### FR-07 — Submission Feedback

After each submission, display an explicit state:

- Ready
- Reading QR
- Processing
- Saving
- Saved successfully
- Validation failed
- Connection failed
- Submission outcome unknown

The UI must not display success until the integration confirms that the record was saved.

If the request times out after being sent, distinguish an unknown outcome from a confirmed failure. Provide a safe recovery mechanism that checks or retries the operation without creating duplicate rows.

Keep error messages actionable and concise.

### FR-08 — Session History

Display records captured during the current session.

Each entry should show, at minimum:

- Page number
- Decoded URL or QR content
- Test status
- Submission state
- Timestamp

Allow the tester to inspect a record and correct invalid data before submission.

Provide a way to identify failed or pending submissions and retry them safely.

Session history must clearly distinguish locally recorded data from data confirmed as saved to Google Sheets.

### FR-09 — Configuration Persistence

Persist user configuration, including:

- Spreadsheet ID or URL.
- Worksheet name.
- Field definitions.
- Column mappings.
- Write strategy.
- Relevant scanner preferences.

Use local persistence for non-secret settings where appropriate.

Do not store private OAuth tokens or sensitive credentials in browser storage. Any local queue of unsent records must be clearly identified and must not be mistaken for records already saved to the spreadsheet.

### FR-10 — Dummy Mode

Provide a development/demo mode that works without a real Google Sheets connection.

Requirements:

- Use clearly labeled dummy QR URLs, such as `https://example.com/qr-test-001`.
- Allow simulated scans through manual input.
- Simulate successful and failed submissions.
- Test dynamic fields and column mappings.
- Show a preview of the record that would be sent.
- Clearly indicate that data is simulated and has not been written to Google Sheets.

Dummy mode must never report simulated writes as real spreadsheet writes.

## 6. User Interface Requirements

The interface should prioritize operational efficiency rather than a marketing-style dashboard.

### Main Testing View

Primary layout:

1. Compact application header with connection status.
2. Persistent page-number input.
3. Prominent scanner or manual input area.
4. Decoded QR content and validation details.
5. Dynamic metadata form.
6. Primary submission action.
7. Immediate success/error feedback.
8. Recent session records.

The scanner and page number should be visible without excessive scrolling.

After successful submission, reset only fields that should be cleared for the next QR. Preserve the page number and reusable settings.

### Settings View

Organize settings into clear sections:

- Spreadsheet connection
- Worksheet selection
- Field configuration
- Column mapping
- Append/update strategy
- Scanner preferences
- Dummy/production mode

Use a clear preview before applying changes.

### Interaction Principles

- Keyboard-friendly workflow.
- Predictable focus management after each scan.
- Visible saving state and submission result.
- Accessible labels and sufficient contrast.
- Avoid unnecessary dialogs and navigation.
- Confirmation dialogs for destructive actions or risky mapping changes.
- Responsive layout for laptop and mobile use.

## 7. Recommended Technical Stack

### Frontend

- Svelte 5
- Vite
- TypeScript
- Native CSS or a lightweight styling solution
- A QR-scanning library selected after verifying camera and external-scanner compatibility

Svelte + Vite is the preferred stack for this prototype because it keeps the architecture focused on an interactive browser application without requiring a full-stack framework.

### Integration

- Google Apps Script as the initial Google Sheets write adapter.
- Google Sheets API or a secure server-side proxy as the fallback if required by authentication, CORS, or deployment constraints.

### Persistence

- localStorage for small non-sensitive configuration.
- IndexedDB if a durable local submission queue becomes necessary.

### Deployment

- Static frontend deployment, for example on Vercel.
- Google Apps Script deployed separately if selected as the integration endpoint.

Do not add a database, authentication provider, state-management framework, or full-stack framework unless a concrete requirement justifies it.

## 8. Data Model

Each QR test record should use a stable internal representation.

Example:

```json
{
  "recordId": "generated-unique-id",
  "pageNumber": 12,
  "qrContent": "https://example.com/qr-test-001",
  "testStatus": "PASS",
  "notes": "Destination opened successfully",
  "scannedAt": "ISO-8601 timestamp",
  "customFields": {},
  "submissionStatus": "saved"
}
```

The record schema must support additional user-defined fields without requiring a source-code change.

Use a unique record ID for idempotency and safe retry handling. Treat `submissionStatus` as application metadata rather than assuming it belongs in the spreadsheet.

The exact spreadsheet columns are determined by the active mapping configuration.

## 9. Security and Data Integrity

- Validate submitted fields on the receiving side.
- Restrict writes to the configured spreadsheet and worksheet.
- Do not expose reusable write credentials in frontend bundles.
- Avoid publicly accessible unrestricted write endpoints.
- Apply authorization and access restrictions appropriate to the intended testers.
- Do not overwrite unmapped cells.
- Use idempotency keys or an equivalent mechanism for safe retries.
- Validate URL schemes and handle QR contents as untrusted input.
- Do not automatically navigate to arbitrary scanned URLs without an explicit user action.
- Avoid loading scanned URL content in a way that exposes the tester's session or credentials.
- Log actionable integration errors without exposing secrets.

## 10. Non-functional Requirements

### Performance

- Scanner interface should become usable promptly after page load.
- Avoid unnecessary dependencies and large UI frameworks.
- Do not reload the entire application after each scan.
- Keep scanning and local form interactions responsive during repeated use.

### Reliability

- Preserve the current page number and configuration during repeated scans.
- Prevent duplicate submissions from double-clicks and retries.
- Clearly identify failed, pending, and confirmed submissions.
- Never silently discard a record that has not been saved.

### Compatibility

- Support current versions of major desktop browsers.
- Support mobile browsers where camera access is available.
- Handle unavailable cameras and denied permissions gracefully.
- Validate scanner compatibility on the actual test device before deployment.

### Maintainability

- Separate UI components, QR scanning, record validation, configuration, and spreadsheet integration.
- Use a typed internal data model.
- Keep column mapping independent of component layout.
- Document deployment and spreadsheet authorization steps.

## 11. MVP Scope and Implementation Phases

### Phase 1 — Local Prototype

- Main testing interface.
- Manual QR URL input.
- Page number tracking.
- Dynamic form fields.
- Configurable column mapping.
- Dummy submission mode.
- Session history.

### Phase 2 — Spreadsheet Integration

- Connect to the target spreadsheet.
- Select a worksheet.
- Configure column mappings.
- Implement append mode.
- Verify actual saved values.
- Handle authorization, CORS, and error states.

### Phase 3 — Operational Reliability

- Add duplicate-submission protection.
- Add safe retry handling.
- Add update mode if needed.
- Improve keyboard workflow.
- Validate camera and external scanner behavior on the real device.

### Out of Scope Until Validated

- Multi-user collaboration.
- Advanced reporting.
- Automated crawling of destination websites.
- Large-scale background processing.
- Complex permissions administration.

## 12. Acceptance Criteria

The MVP is considered complete when:

1. A tester can scan a QR code or manually enter its content.
2. A tester can associate multiple QR codes with the same page number.
3. The decoded URL and configured metadata appear in the resulting record.
4. Fields can be added, edited, reordered, and removed through the UI.
5. Column mappings can be changed without modifying source code.
6. Configuration persists after a page reload.
7. Dummy mode works without a Google account or spreadsheet.
8. The application can write to a real Google Sheets spreadsheet after appropriate authorization.
9. Submitted values appear in the intended worksheet and columns.
10. Unmapped columns and unrelated existing records remain unchanged.
11. A failed or ambiguous submission is not incorrectly reported as successful.
12. Repeated clicks or safe retries do not silently create duplicate records.
13. The page number remains available for consecutive scans.
14. The application works with at least one supported camera or external scanner on the intended testing device.
15. Setup and deployment instructions are sufficient for another developer to reproduce the integration.

## 13. Definition of Done

Deliver:

- Working source code.
- Responsive main testing interface.
- Configurable field and column mapping UI.
- Dummy mode.
- Real Google Sheets write integration.
- Error handling and duplicate-submission protection.
- Environment and deployment instructions.
- A sample configuration.
- A short manual testing checklist.

The final application must be a functional testing tool, not merely a static UI mockup.
