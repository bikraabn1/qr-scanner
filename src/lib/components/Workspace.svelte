<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { appState } from '../store.svelte';
  import { submitRecord } from '../api';
  import { generateRecordId, yesNoLabels, isYoutubeUrl, YOUTUBE_CROSSCHECK } from '../utils';
  import { parseDestination } from '../url-parser';
  import { playScanBeep } from '../audio';
  import { buildSheetIndex, findSkuField, findNameField, type KnownBook } from '../book-index';
  import { YES_RE } from '../column-sync';
  import { columnLetterToIndex } from '../utils';
  import MediaPreview from './MediaPreview.svelte';
  import type { QRRecord, TestStatus } from '../types';
  import {
    Camera,
    CameraOff,
    CheckCircle2,
    AlertCircle,
    Undo2,
    RotateCcw
  } from '@lucide/svelte';

  let { onRecordSubmitted }: { onRecordSubmitted?: () => void } = $props();

  // Active fields derived directly from store (guaranteed 100% in sync with Config & Sheet headers)
  // Read-only columns (verification verdict) are filled in the sheet by hand, so they are shown
  // greyed out and never submitted — otherwise a submit would blank whatever the reviewer typed.
  let activeFields = $derived(appState.fields.filter((f) => f.enabled && !f.readOnly));
  let readOnlyFields = $derived(appState.fields.filter((f) => f.enabled && f.readOnly));
  /** Everything shown in the form; read-only columns render greyed out in their real position. */
  let formFields = $derived(appState.fields.filter((f) => f.enabled));

  /**
   * Group columns into the three things the operator actually does: identify the book, confirm the
   * link content, then record the verdict. Order inside a group follows the sheet's column order.
   */
  const GROUPS: { title: string; test: RegExp }[] = [
    { title: 'Buku', test: /sku|judul|kategori|halaman|page|title|penulis|author/i },
    { title: 'Tautan dan konten', test: /link|url|qr|jenis|content|konten|tautan/i },
    { title: 'Hasil uji', test: /.*/ }
  ];
  let groupedFields = $derived.by(() => {
    const buckets = GROUPS.map((g) => ({ title: g.title, fields: [] as typeof formFields }));
    for (const f of formFields) {
      const idx = GROUPS.findIndex((g) => g.test.test(f.label));
      (buckets[idx === -1 ? buckets.length - 1 : idx]).fields.push(f);
    }
    return buckets.filter((b) => b.fields.length > 0);
  });

  /** Keyboard focus lands on the first field the operator must fill. */
  let firstFieldId = $derived(formFields.find((f) => !f.readOnly)?.id);

  /** Current value of a read-only column, taken from the matched sheet row. */
  function readOnlyValue(field: { id: string }): string {
    if (!matchedBook) return '';
    const letter = appState.mappings.find((m) => m.fieldId === field.id)?.columnLetter;
    if (!letter) return '';
    try {
      return (matchedBook.cells[columnLetterToIndex(letter) - 1] ?? '').trim();
    } catch {
      return '';
    }
  }

  // Field values dynamically keyed by field.id
  let formValues = $state<Record<string, any>>({});

  let isSubmitting = $state(false);

  // Per-field inline camera state
  let scanningFieldId = $state<string | null>(null);
  let isStartingCamera = $state(false);
  let cameraError = $state<string | null>(null);
  let html5QrCodeInstance: any = null;
  let isThrottled = false;
  let frameFlashed = $state(false);

  // Undo state (5 seconds)
  let lastSubmittedRecord = $state<QRRecord | null>(null);
  let undoTimeoutId: any = null;
  let undoRemainingSeconds = $state(5);
  let undoIntervalId: any = null;

  // Feedback banner state
  let feedback = $state<{
    type: 'success' | 'error' | 'warning' | null;
    message: string;
    details?: string;
  }>({ type: null, message: '' });

  // Quick preset sample links for testing
  const SAMPLE_QRS = [
    { label: 'YouTube Video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    { label: 'Sample Link', url: 'https://example.com/books/ch1/qr-01' },
    { label: 'Audio MP3', url: 'https://podcast.org/episode-1.mp3' }
  ];

  /**
   * Helper to detect whether a column represents a link/URL/destination
   */
  function isLinkField(field: { id: string; label: string; type: string }): boolean {
    if (field.type === 'url') return true;
    const norm = (field.label + ' ' + field.id).toLowerCase();
    return (
      norm.includes('link') ||
      norm.includes('url') ||
      norm.includes('qr') ||
      norm.includes('destinasi') ||
      norm.includes('destination') ||
      norm.includes('barcode') ||
      norm.includes('tautan') ||
      norm.includes('web')
    );
  }

  /**
   * "HASIL CROSS CHECK TS READER" is the operator's answer about what the reader shows. A YouTube
   * link always means the same thing, so it is filled in automatically — and only overwritten while
   * it still holds our own auto text, never a sentence the operator typed.
   */
  let autoCrosscheck = '';
  $effect(() => {
    const crosscheck = activeFields.find((f) => /cross\s*check/i.test(f.label));
    if (!crosscheck) return;
    const hasYoutube = activeFields.some(
      (f) => isLinkField(f) && isYoutubeUrl(String(formValues[f.id] ?? ''))
    );
    const current = String(formValues[crosscheck.id] ?? '').trim();
    if (hasYoutube) {
      if (current && current !== autoCrosscheck) return; // operator's own wording wins
      if (current !== YOUTUBE_CROSSCHECK) formValues[crosscheck.id] = YOUTUBE_CROSSCHECK;
      autoCrosscheck = YOUTUBE_CROSSCHECK;
    } else if (current && current === autoCrosscheck) {
      formValues[crosscheck.id] = '';
      autoCrosscheck = '';
    }
  });

  // Validation
  let disabledReason = $derived.by(() => {
    if (!appState.accessToken) return 'Sign in with Google untuk mulai mencatat';
    if (!appState.config.spreadsheetId) return 'Spreadsheet ID belum diisi (cek Config)';
    if (!appState.config.sheetName) return 'Tab Sheet belum dipilih (cek Config)';
    if (activeFields.length === 0) return 'Belum ada kolom sheet yang terkonfigurasi';

    for (const f of activeFields) {
      if (f.required && (formValues[f.id] === undefined || formValues[f.id] === '')) {
        return `Kolom "${f.label}" wajib diisi`;
      }
    }
    return null;
  });

  onMount(() => {
    initDefaultValues();
    // Focus the first field the operator has to fill, whatever order the sheet columns arrive in.
    setTimeout(() => document.getElementById(`field-${firstFieldId}`)?.focus(), 0);
  });

  // Watch fields and keep form values initialized
  $effect(() => {
    const todayIso = new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString().slice(0, 16);

    for (const f of activeFields) {
      if (formValues[f.id] === undefined) {
        if (f.id === 'pageNumber') {
          formValues[f.id] = appState.currentPage;
        } else if (f.defaultValue !== undefined) {
          formValues[f.id] = f.defaultValue;
        } else if (f.type === 'boolean') {
          formValues[f.id] = false;
        } else if (f.type === 'date') {
          formValues[f.id] = todayIso;
        } else if (f.type === 'datetime') {
          formValues[f.id] = nowIso;
        } else {
          formValues[f.id] = '';
        }
      }
    }
  });

  // Push tracker changes INTO the form field only when the tracker itself moved.
  // A plain two-way effect fights the keyboard: clearing the field snaps back to the old
  // number before a new digit can be typed, so the page number looks read-only.
  let lastTrackerPage = appState.currentPage;
  $effect(() => {
    if (appState.currentPage === lastTrackerPage) return;
    lastTrackerPage = appState.currentPage;
    formValues['pageNumber'] = appState.currentPage;
  });

  /**
   * The page field in the form is the same value as the tracker: write through to the store,
   * otherwise the sync effect above overwrites whatever the user types.
   */
  function handlePageInput(e: Event) {
    const val = parseInt((e.currentTarget as HTMLInputElement).value, 10);
    if (!isNaN(val) && val > 0) {
      appState.setPageNumber(val);
      applyKnownPage();
    }
  }



  // Lookups built from the rows already in the sheet: by SKU, and by page (a book spans many
  // rows, so the sheet leaves SKU/JUDUL blank on the later pages — both are forward-filled).
  let sheetIndex = $derived(
    buildSheetIndex(appState.sheetSnapshot.rows, appState.fields, appState.mappings)
  );
  let bookIndex = $derived(sheetIndex.bySku);
  let skuFieldId = $derived(findSkuField(appState.fields)?.id ?? null);
  let nameFieldId = $derived(findNameField(appState.fields)?.id ?? null);
  let matchedBook = $state<KnownBook | null>(null);
  // Tracks a name we filled ourselves, so a later SKU change can replace it without
  // clobbering a title the operator typed by hand.
  let autoFilledName = '';

  /**
   * When the typed/picked SKU is already in the sheet, fill the book name (and any other
   * still-empty column) from that row instead of making the operator retype it.
   */
  // Headers that are a fixed choice, not free text. Options are read from the sheet itself
  // (its data-validation dropdown, else the distinct values already in that column) — no hardcoded lists.
  const CHOICE_HEADER = /kategori|jenis|status|hasil|kondisi|tipe|verifikasi/;

  let columnOptions = $derived.by(() => {
    const out: Record<string, string[]> = {};
    const { headers, rows } = appState.sheetSnapshot;
    if (headers.length === 0) return out;

    for (const field of activeFields) {
      if (field.options?.length) continue; // sheet validation already gave us the list
      // A select-typed column with no validation list, or a header that is obviously a fixed choice.
      if (field.type !== 'select' && !CHOICE_HEADER.test(field.label.toLowerCase())) continue;

      const letter = appState.mappings.find((m) => m.fieldId === field.id)?.columnLetter;
      if (!letter) continue;
      let idx: number;
      try {
        idx = columnLetterToIndex(letter) - 1;
      } catch {
        continue;
      }

      const seen = new Set<string>();
      for (const row of rows) {
        const v = (row.cells[idx] || '').trim();
        if (v) seen.add(v);
      }
      if (seen.size > 0 && seen.size <= 20) out[field.id] = [...seen].sort();
    }
    return out;
  });

  function optionsFor(field: { id: string; options?: string[] }): string[] {
    return field.options?.length ? field.options : (columnOptions[field.id] ?? []);
  }

  /** Known SKUs offered as a pick-list, so the operator can choose instead of typing. */
  let skuOptions = $derived(
    [...bookIndex.values()].sort((a, b) => a.sku.localeCompare(b.sku)).slice(0, 500)
  );

  function handleFieldInput(fieldId: string, e: Event) {
    const value = (e.currentTarget as HTMLInputElement).value;
    if (fieldId === 'pageNumber') {
      handlePageInput(e);
      return;
    }
    if (fieldId === skuFieldId) {
      formValues[fieldId] = value;
      applyKnownSku();
    }
  }

  /** Typing a page that is already in the sheet fills SKU + title from that row. */
  function applyKnownPage() {
    const page = String(formValues.pageNumber ?? '').trim();
    if (!page) return;
    const book = sheetIndex.byPage.get(page);
    if (!book) return;
    if (skuFieldId && !String(formValues[skuFieldId] || '').trim()) formValues[skuFieldId] = book.sku;
    if (nameFieldId && book.name && !String(formValues[nameFieldId] || '').trim()) {
      formValues[nameFieldId] = book.name;
      autoFilledName = book.name;
    }
    matchedBook = book;
    applyBooleanFromRow();
  }

  /**
   * One click copies the columns that repeat for every page of the same book (judul, kategori,
   * jenis konten, checkbox) from the matched row. Page number and link columns are deliberately
   * left alone — those differ per row, copying them would be wrong.
   */
  function fillChoicesFromRow() {
    const book = matchedBook;
    if (!book) return;
    for (const field of activeFields) {
      const isChoice = field.type === 'select' || field.type === 'boolean';
      if (!isChoice && field.id !== nameFieldId) continue;
      // Never clobber what the operator already typed.
      if (field.type === 'boolean' ? formValues[field.id] === true : String(formValues[field.id] ?? '').trim()) continue;

      const letter = appState.mappings.find((m) => m.fieldId === field.id)?.columnLetter;
      if (!letter) continue;
      let idx: number;
      try {
        idx = columnLetterToIndex(letter) - 1;
      } catch {
        continue;
      }
      const value = (book.cells[idx] ?? '').trim();
      if (!value) continue;

      if (field.type === 'boolean') {
        const { yes } = yesNoLabels(optionsFor(field));
        formValues[field.id] = yes
          ? value.trim().toLowerCase() === yes.trim().toLowerCase()
          : YES_RE.test(value);
      } else {
        formValues[field.id] = value;
      }
    }
  }

  /**
   * "KONTEN INTERNAL TS?" holds Ya/Bukan in the sheet, so the checkbox is not a free choice:
   * it mirrors that column for the matched book (Ya -> centang, Bukan -> kosong).
   */
  function applyBooleanFromRow() {
    if (!matchedBook) return;
    for (const field of appState.fields) {
      if (field.type !== 'boolean' || field.readOnly) continue;
      const letter = appState.mappings.find((m) => m.fieldId === field.id)?.columnLetter;
      if (!letter) continue;
      let idx: number;
      try {
        idx = columnLetterToIndex(letter) - 1;
      } catch {
        continue;
      }
      const value = (matchedBook.cells[idx] ?? '').trim();
      if (!value) continue;
      const { yes } = yesNoLabels(optionsFor(field));
      formValues[field.id] = yes ? value.trim().toLowerCase() === yes.trim().toLowerCase() : YES_RE.test(value);
    }
  }

  function applyKnownSku() {
    if (!skuFieldId) return;
    const key = String(formValues[skuFieldId] || '').trim().toLowerCase();
    const book = key ? bookIndex.get(key) : undefined;
    matchedBook = book ?? null;
    if (!book) return;

    if (nameFieldId && book.name) {
      const current = String(formValues[nameFieldId] || '').trim();
      if (!current || current === autoFilledName) {
        formValues[nameFieldId] = book.name;
        autoFilledName = book.name;
      }
    }
    applyBooleanFromRow();
  }

  function initDefaultValues() {
    const todayIso = new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString().slice(0, 16);

    for (const f of activeFields) {
      if (f.id === 'pageNumber') {
        formValues[f.id] = appState.currentPage;
      } else if (f.defaultValue !== undefined) {
        formValues[f.id] = f.defaultValue;
      } else if (f.type === 'date') {
        formValues[f.id] = todayIso;
      } else if (f.type === 'datetime') {
        formValues[f.id] = nowIso;
      } else if (f.type === 'boolean') {
        formValues[f.id] = f.defaultValue === true;
      } else {
        formValues[f.id] = '';
      }
    }
  }

  function handleClearForm() {
    stopCamera();
    initDefaultValues();
  }

  onDestroy(() => {
    stopCamera();
    clearUndoTimer();
  });

  function clearUndoTimer() {
    if (undoTimeoutId) clearTimeout(undoTimeoutId);
    if (undoIntervalId) clearInterval(undoIntervalId);
    undoTimeoutId = null;
    undoIntervalId = null;
  }

  function startUndoCountdown(record: QRRecord) {
    clearUndoTimer();
    lastSubmittedRecord = record;
    undoRemainingSeconds = 5;

    undoIntervalId = setInterval(() => {
      undoRemainingSeconds -= 1;
      if (undoRemainingSeconds <= 0) {
        clearUndoTimer();
        lastSubmittedRecord = null;
      }
    }, 1000);

    undoTimeoutId = setTimeout(() => {
      clearUndoTimer();
      lastSubmittedRecord = null;
    }, 5000);
  }

  function handleUndo() {
    if (!lastSubmittedRecord) return;
    const rec = lastSubmittedRecord;
    appState.deleteRecord(rec.recordId);

    // Restore form values
    formValues['pageNumber'] = rec.pageNumber;
    formValues['qrContent'] = rec.qrContent;
    formValues['testStatus'] = rec.testStatus;
    formValues['notes'] = rec.notes;
    if (rec.customFields) {
      for (const [k, v] of Object.entries(rec.customFields)) {
        formValues[k] = v;
      }
    }

    clearUndoTimer();
    lastSubmittedRecord = null;
    feedback = { type: 'warning', message: 'Input dikembalikan ke form (Data di sheet tetap terisi).' };
  }

  async function toggleCameraForField(fieldId: string) {
    if (scanningFieldId === fieldId) {
      stopCamera();
    } else {
      if (scanningFieldId) {
        stopCamera();
      }
      await startCamera(fieldId);
    }
  }

  async function startCamera(fieldId: string) {
    cameraError = null;
    isStartingCamera = true;
    scanningFieldId = fieldId;

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Kamera tidak didukung oleh browser Anda.');
      }

      await new Promise((r) => setTimeout(r, 80));

      const { Html5Qrcode } = await import('html5-qrcode');
      html5QrCodeInstance = new Html5Qrcode(`qr-viewfinder-${fieldId}`);

      const config = {
        fps: 15,
        qrbox: { width: 200, height: 200 },
        aspectRatio: 1.0
      };

      try {
        await html5QrCodeInstance.start(
          { facingMode: 'environment' },
          config,
          (decodedText: string) => onScanSuccess(fieldId, decodedText),
          () => {}
        );
      } catch {
        await html5QrCodeInstance.start(
          { facingMode: 'user' },
          config,
          (decodedText: string) => onScanSuccess(fieldId, decodedText),
          () => {}
        );
      }
    } catch (err: unknown) {
      cameraError = err instanceof Error ? err.message : 'Izin kamera ditolak';
      scanningFieldId = null;
    } finally {
      isStartingCamera = false;
    }
  }

  function stopCamera() {
    if (html5QrCodeInstance) {
      try {
        html5QrCodeInstance.stop().catch(() => {});
        html5QrCodeInstance.clear();
      } catch (_) {}
      html5QrCodeInstance = null;
    }
    scanningFieldId = null;
  }

  function onScanSuccess(fieldId: string, decodedText: string) {
    if (isThrottled) return;
    isThrottled = true;
    frameFlashed = true;

    if (appState.config.soundEnabled !== false) {
      playScanBeep();
    }

    // Set value into the specifically targeted field
    formValues[fieldId] = decodedText.trim();
    if (fieldId === skuFieldId) applyKnownSku();

    setTimeout(() => { frameFlashed = false; }, 350);
    setTimeout(() => { isThrottled = false; }, 1500);

    stopCamera();
  }

  async function handleSubmit() {
    if (disabledReason) return;

    isSubmitting = true;
    feedback = { type: null, message: '' };

    const customData: Record<string, any> = {};
    for (const f of activeFields) {
      if (!['pageNumber', 'qrContent', 'testStatus', 'notes', 'scannedAt'].includes(f.id)) {
        customData[f.id] = formValues[f.id] ?? '';
      }
    }

    const newRecord: QRRecord = {
      recordId: generateRecordId(),
      pageNumber: formValues['pageNumber'] ? Number(formValues['pageNumber']) : appState.currentPage,
      // Jangan fallback ke kolom lain: LINK QR kosong harus tetap kosong, bukan terisi SKU.
      qrContent: String(formValues['qrContent'] || '').trim(),
      testStatus: (formValues['testStatus'] || 'PASS') as TestStatus,
      notes: String(formValues['notes'] || '').trim(),
      scannedAt: formValues['scannedAt'] ? String(formValues['scannedAt']) : new Date().toISOString(),
      customFields: customData,
      submissionStatus: 'saving'
    };

    appState.addRecord(newRecord);

    try {
      const res = await submitRecord(
        newRecord,
        appState.config,
        appState.fields,
        appState.mappings
      );

      appState.updateRecordStatus(newRecord.recordId, 'saved');

      feedback = {
        type: 'success',
        message: res.message || 'Tersimpan ke Google Sheets',
        details: res.rowNumber ? `Row ${res.rowNumber}` : undefined
      };

      // Notify parent to refresh live spreadsheet preview
      onRecordSubmitted?.();

      startUndoCountdown(newRecord);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Gagal menyimpan ke Google Sheets';
      appState.updateRecordStatus(newRecord.recordId, 'failed', errMsg);
      feedback = { type: 'error', message: errMsg };
    } finally {
      isSubmitting = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Existing SKUs from the sheet, offered as a pick-list on the SKU field -->
<datalist id="known-skus">
  {#each skuOptions as book (book.sku)}
    <option value={book.sku}>{book.name}</option>
  {/each}
</datalist>

<div class="bg-[var(--surface-panel)] border border-[var(--border-subtle)] rounded-md transition-colors">
  <!-- Panel header: what this panel does, in one line -->
  <div class="flex items-baseline justify-between gap-3 px-5 pt-4 pb-3 border-b border-[var(--border-subtle)]">
    <h2 class="text-sm font-semibold text-[var(--text-primary)]">Input hasil uji</h2>
    <span class="text-[11px] text-[var(--text-tertiary)]">
      {activeFields.length} kolom dikirim ke sheet
    </span>
  </div>

  <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="px-5 pb-4">
    {#each groupedFields as group}
      <section class="pt-4">
        <div class="flex items-center gap-3 pb-2.5">
          <h3 class="text-[11px] font-semibold text-[var(--text-secondary)]">{group.title}</h3>
          <span class="h-px flex-1 bg-[var(--border-subtle)]"></span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-3.5">
          {#each group.fields as field}
            {@const mapping = appState.mappings.find((m) => m.fieldId === field.id)}
            {@const isLink = isLinkField(field)}
            {@const fieldValue = String(formValues[field.id] || '')}
            {@const fieldParsed = isLink && fieldValue.trim() ? parseDestination(fieldValue) : null}
            {@const isWide = isLink || field.type === 'longtext' || field.readOnly}

            <div class="min-w-0 {isWide ? 'sm:col-span-2' : ''}">
              <div class="flex items-baseline justify-between gap-2 pb-1">
                <label for={`field-${field.id}`} class="text-xs font-medium text-[var(--text-primary)] leading-tight">
                  {field.label}
                  {#if field.required}<span class="text-[#b3261e] ml-0.5">*</span>{/if}
                </label>
                {#if mapping?.columnLetter}
                  <span
                    class="font-mono-data text-[10px] text-[var(--text-tertiary)] shrink-0"
                    title={`Kolom ${mapping.columnLetter} di Google Sheets`}
                  >{mapping.columnLetter}</span>
                {/if}
              </div>

              {#if field.readOnly}
                <!-- Filled by a human in the sheet afterwards; shown greyed out, never submitted -->
                <div class="w-full text-xs py-2 px-2.5 rounded-[3px] border border-dashed border-[#c9a44a] bg-[#fffaf0] text-[#7a5a12] flex items-center justify-between gap-2">
                  <span class="truncate">{readOnlyValue(field) || 'Diisi manual di Google Sheets'}</span>
                  <span class="text-[10px] shrink-0">manual</span>
                </div>
              {:else if field.type === 'boolean'}
                <label class="flex items-center gap-2.5 py-2 px-2.5 rounded-[3px] border border-[var(--border-strong)] bg-[var(--surface-raised)] text-[13px] text-[var(--text-primary)] cursor-pointer">
                  <input
                    type="checkbox"
                    bind:checked={formValues[field.id]}
                    class="w-4 h-4 shrink-0 rounded-[2px] border-[var(--border-strong)] accent-[var(--accent)]"
                  />
                  <span class="truncate">
                    {#if optionsFor(field).length >= 2}
                      {formValues[field.id] ? yesNoLabels(optionsFor(field)).yes : yesNoLabels(optionsFor(field)).no}
                    {:else}
                      Centang jika aktif
                    {/if}
                  </span>
                </label>
              {:else if field.type === 'select' || optionsFor(field).length > 0}
                <select
                  id={`field-${field.id}`}
                  bind:value={formValues[field.id]}
                  class="w-full text-[13px] py-2 px-2.5 rounded-[3px] border border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                >
                  <option value="">Pilih…</option>
                  {#each optionsFor(field) as opt}
                    <option value={opt}>{opt}</option>
                  {/each}
                </select>
              {:else if field.type === 'longtext'}
                <textarea
                  id={`field-${field.id}`}
                  rows="2"
                  bind:value={formValues[field.id]}
                  placeholder={`Tulis ${field.label.toLowerCase()}…`}
                  class="w-full text-[13px] leading-relaxed py-2 px-2.5 rounded-[3px] border border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
                ></textarea>
              {:else if field.type === 'date' || field.type === 'datetime'}
                <input
                  id={`field-${field.id}`}
                  type={field.type === 'datetime' ? 'datetime-local' : 'date'}
                  bind:value={formValues[field.id]}
                  class="w-full text-[13px] py-2 px-2.5 rounded-[3px] border border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                />
              {:else}
                <!-- Text / number / URL, with an inline camera button on link columns -->
                <div class="relative flex items-center">
                  <input
                    id={`field-${field.id}`}
                    type={field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'}
                    bind:value={formValues[field.id]}
                    oninput={(e) => handleFieldInput(field.id, e)}
                    list={field.id === skuFieldId ? 'known-skus' : undefined}
                    placeholder={isLink ? 'Tempel atau scan tautan…' : `Ketik ${field.label.toLowerCase()}…`}
                    class="w-full {field.id === skuFieldId ? 'font-mono-data ' : ''}text-[13px] py-2 pl-2.5 {isLink ? 'pr-9' : 'pr-2.5'} rounded-[3px] border border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
                  />

                  {#if isLink}
                    <button
                      type="button"
                      class="absolute right-1 p-1.5 rounded-[2px] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--surface-panel)] transition-colors cursor-pointer"
                      title={`Scan QR langsung ke kolom ${field.label}`}
                      onclick={() => toggleCameraForField(field.id)}
                    >
                      {#if scanningFieldId === field.id}
                        <CameraOff class="w-4 h-4 text-[#b3261e]" />
                      {:else}
                        <Camera class="w-4 h-4" />
                      {/if}
                    </button>
                  {/if}
                </div>

                <!-- Known-SKU hint: one book spans many pages, so a repeat SKU is normal, not a clash -->
                {#if field.id === skuFieldId && matchedBook}
                  <div class="mt-1.5 flex items-start gap-1.5 text-[11px] text-[#17694a]">
                    <CheckCircle2 class="w-3.5 h-3.5 shrink-0 mt-px" />
                    <span>
                      {matchedBook.name || 'Buku ini'} sudah ada di baris {matchedBook.rowNumber}
                      ({matchedBook.pages} halaman). Judul terisi otomatis.
                      <button
                        type="button"
                        onclick={fillChoicesFromRow}
                        class="underline underline-offset-2 hover:no-underline cursor-pointer"
                      >
                        Salin kolom pilihan dari baris itu
                      </button>
                    </span>
                  </div>
                {/if}

                <!-- Sample links for quick testing on link columns -->
                {#if isLink && !formValues[field.id]}
                  <div class="flex items-center gap-2 mt-1.5">
                    <span class="text-[11px] text-[var(--text-tertiary)]">Contoh:</span>
                    {#each SAMPLE_QRS as sample}
                      <button
                        type="button"
                        class="text-[11px] text-[var(--accent)] hover:underline cursor-pointer"
                        onclick={() => formValues[field.id] = sample.url}
                      >
                        {sample.label}
                      </button>
                    {/each}
                  </div>
                {/if}

                <!-- Contextual inline viewfinder for this field -->
                {#if scanningFieldId === field.id}
                  <div class="mt-2 relative overflow-hidden rounded-[3px] border border-[var(--border-strong)] bg-[#14130f] min-h-[200px] flex items-center justify-center">
                    <div id={`qr-viewfinder-${field.id}`} class="w-full max-w-xs"></div>
                    <div class="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div class="w-40 h-40 rounded-[3px] border-2 transition-colors duration-150 {frameFlashed ? 'border-[#7dfb4c] bg-[#7dfb4c]/20' : 'border-white/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]'}">
                      </div>
                    </div>
                  </div>
                  {#if cameraError}
                    <div class="mt-1.5 p-2 text-[11px] text-[#b3261e] bg-[#fdeceb] rounded-[3px] border border-[#f0c8c4]">
                      {cameraError}
                    </div>
                  {/if}
                {/if}

                <!-- Automatic media preview for this link field -->
                {#if fieldParsed}
                  <div class="mt-2">
                    <MediaPreview parsed={fieldParsed} />
                  </div>
                {/if}
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/each}

    <!-- Feedback -->
    {#if feedback.type}
      <div class="mt-4 p-2.5 rounded-[3px] text-[11px] flex items-center gap-2 {feedback.type === 'success' ? 'bg-[#eaf5ef] text-[#14532d] border border-[#bfe0cd]' : feedback.type === 'warning' ? 'bg-[#fdf6e3] text-[#7a5a12] border border-[#e8d9a8]' : 'bg-[#fdeceb] text-[#8f1d16] border border-[#f0c8c4]'}">
        {#if feedback.type === 'success'}
          <CheckCircle2 class="w-3.5 h-3.5 shrink-0" />
        {:else}
          <AlertCircle class="w-3.5 h-3.5 shrink-0" />
        {/if}
        <span class="flex-1">{feedback.message}</span>
        {#if feedback.details}
          <span class="font-mono-data opacity-70">{feedback.details}</span>
        {/if}
      </div>
    {/if}

    <!-- 5-second undo -->
    {#if lastSubmittedRecord}
      <div class="mt-3 px-3 py-2 rounded-[3px] bg-[var(--accent-soft)] text-[#0f3f2c] text-xs flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="w-1.5 h-1.5 rounded-full bg-[#17694a]"></span>
          <span>Tersimpan di halaman {lastSubmittedRecord.pageNumber}</span>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-1 px-2 py-1 rounded-[2px] font-semibold bg-white/70 hover:bg-white transition-colors cursor-pointer"
          onclick={handleUndo}
        >
          <Undo2 class="w-3 h-3" />
          <span>Batalkan ({undoRemainingSeconds}s)</span>
        </button>
      </div>
    {/if}

    <!-- Actions -->
    <div class="mt-4 pt-3.5 border-t border-[var(--border-subtle)]">
      <div class="flex items-stretch gap-2">
        <button
          type="button"
          onclick={handleClearForm}
          class="flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-medium rounded-[3px] border border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] transition-colors cursor-pointer"
          title="Kosongkan form"
        >
          <RotateCcw class="w-3.5 h-3.5" />
          <span>Kosongkan</span>
        </button>

        <button
          type="submit"
          disabled={isSubmitting || !!disabledReason}
          class="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 text-[13px] font-semibold rounded-[3px] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          title={disabledReason || 'Kirim baris ke Google Sheets (Ctrl+Enter)'}
        >
          {#if isSubmitting}
            <div class="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
            <span>Menyimpan…</span>
          {:else}
            <span>Kirim ke Google Sheets</span>
            <kbd class="hidden sm:inline-block text-[10px] opacity-70 font-mono-data">Ctrl+Enter</kbd>
          {/if}
        </button>
      </div>

      {#if disabledReason}
        <p class="text-[11px] text-[var(--text-tertiary)] text-center mt-2">{disabledReason}</p>
      {/if}
    </div>
  </form>
</div>
