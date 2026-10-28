<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { appState } from '../store.svelte';
  import { submitRecord } from '../api';
  import { generateRecordId } from '../utils';
  import { parseDestination } from '../url-parser';
  import { playScanBeep } from '../audio';
  import MediaPreview from './MediaPreview.svelte';
  import type { QRRecord, TestStatus } from '../types';
  import {
    Camera,
    CameraOff,
    CheckCircle2,
    AlertCircle,
    Undo2
  } from '@lucide/svelte';

  let { onRecordSubmitted }: { onRecordSubmitted?: () => void } = $props();

  // Active fields derived directly from store (guaranteed 100% in sync with Config & Sheet headers)
  let activeFields = $derived(appState.fields.filter((f) => f.enabled));

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

  let firstInputRef = $state<HTMLInputElement | null>(null);

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
    firstInputRef?.focus();
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

  // Keep pageNumber in sync with page tracker
  $effect(() => {
    if (formValues['pageNumber'] !== undefined && formValues['pageNumber'] !== appState.currentPage) {
      formValues['pageNumber'] = appState.currentPage;
    }
  });

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
      } else {
        formValues[f.id] = f.type === 'boolean' ? false : '';
      }
    }
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
      qrContent: String(formValues['qrContent'] || formValues[activeFields[0]?.id] || '').trim(),
      testStatus: (formValues['testStatus'] || 'PASS') as TestStatus,
      notes: String(formValues['notes'] || '').trim(),
      scannedAt: new Date().toISOString(),
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

      // Auto clear input fields (retain page number and today date)
      const todayIso = new Date().toISOString().split('T')[0];
      for (const f of activeFields) {
        if (f.id !== 'pageNumber') {
          if (f.type === 'boolean') {
            formValues[f.id] = false;
          } else if (f.type === 'date') {
            formValues[f.id] = todayIso;
          } else {
            formValues[f.id] = '';
          }
        }
      }
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

<div class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 shadow-2xs space-y-4 transition-colors">
  <!-- Top bar -->
  <div class="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
    <div class="flex items-center gap-2">
      <span class="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 font-mono-data">
        Testing Input Console
      </span>
      <span class="text-[11px] font-mono-data text-zinc-400">
        ({activeFields.length} kolom aktif)
      </span>
    </div>
  </div>

  <!-- Pure Dynamic Form Fields (100% In Sync with Config & Sheet Columns) -->
  <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
    {#each activeFields as field, idx}
      {@const mapping = appState.mappings.find((m) => m.fieldId === field.id)}
      {@const isLink = isLinkField(field)}
      {@const fieldValue = String(formValues[field.id] || '')}
      {@const fieldParsed = isLink && fieldValue.trim() ? parseDestination(fieldValue) : null}

      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <label for={`field-${field.id}`} class="block text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            {field.label}
            {#if field.required}<span class="text-red-500 ml-0.5">*</span>{/if}
          </label>
          {#if mapping?.columnLetter}
            <span class="text-[10px] font-mono-data px-1.5 py-0.2 rounded-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700" title={`Kolom ${mapping.columnLetter} di Google Sheets`}>
              Kolom {mapping.columnLetter}
            </span>
          {/if}
        </div>

        {#if field.type === 'select'}
          <select
            id={`field-${field.id}`}
            bind:value={formValues[field.id]}
            class="w-full font-mono-data text-xs py-2 px-3 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
          >
            <option value="">Pilih opsi...</option>
            {#each field.options || [] as opt}
              <option value={opt}>{opt}</option>
            {/each}
          </select>
        {:else if field.type === 'longtext'}
          <textarea
            id={`field-${field.id}`}
            rows="2"
            bind:value={formValues[field.id]}
            placeholder={`Masukkan ${field.label.toLowerCase()}...`}
            class="w-full text-xs py-2 px-3 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
          ></textarea>
        {:else if field.type === 'boolean'}
          <label class="flex items-center gap-2 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={formValues[field.id]}
              class="rounded-sm border-zinc-300 text-zinc-900"
            />
            <span>Centang jika valid / terkonfirmasi</span>
          </label>
        {:else if field.type === 'date' || field.type === 'datetime'}
          <input
            id={`field-${field.id}`}
            type={field.type === 'datetime' ? 'datetime-local' : 'date'}
            bind:value={formValues[field.id]}
            class="w-full font-mono-data text-xs py-2 px-3 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
          />
        {:else}
          <!-- Input field with inline Camera icon button if it's a link/URL/QR column -->
          <div class="relative flex items-center">
            {#if idx === 0}
              <input
                id={`field-${field.id}`}
                type={field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'}
                bind:this={firstInputRef}
                bind:value={formValues[field.id]}
                placeholder={`Ketik ${field.label.toLowerCase()}...`}
                class="w-full font-mono-data text-xs py-2 pl-3 {isLink ? 'pr-9' : 'pr-3'} rounded-sm border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
              />
            {:else}
              <input
                id={`field-${field.id}`}
                type={field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'}
                bind:value={formValues[field.id]}
                placeholder={`Ketik ${field.label.toLowerCase()}...`}
                class="w-full font-mono-data text-xs py-2 pl-3 {isLink ? 'pr-9' : 'pr-3'} rounded-sm border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
              />
            {/if}

            <!-- Inline Camera Action Button for link/URL columns -->
            {#if isLink}
              <button
                type="button"
                class="absolute right-1.5 p-1 rounded-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                title={`Scan QR langsung ke kolom ${field.label}`}
                onclick={() => toggleCameraForField(field.id)}
              >
                {#if scanningFieldId === field.id}
                  <CameraOff class="w-3.5 h-3.5 text-red-500" />
                {:else}
                  <Camera class="w-3.5 h-3.5" />
                {/if}
              </button>
            {/if}
          </div>

          <!-- Sample Links for quick testing on QR / link columns -->
          {#if isLink && !formValues[field.id]}
            <div class="flex items-center gap-1.5 mt-1">
              <span class="text-[10px] text-zinc-400">Sample:</span>
              {#each SAMPLE_QRS as sample}
                <button
                  type="button"
                  class="text-[10px] font-mono-data text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  onclick={() => formValues[field.id] = sample.url}
                >
                  {sample.label}
                </button>
              {/each}
            </div>
          {/if}

          <!-- Contextual Inline Viewfinder for this specific field -->
          {#if scanningFieldId === field.id}
            <div class="mt-2 relative overflow-hidden rounded-md border border-zinc-300 dark:border-zinc-700 bg-black min-h-[200px] flex items-center justify-center">
              <div id={`qr-viewfinder-${field.id}`} class="w-full max-w-xs"></div>
              <div class="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div class="w-40 h-40 rounded-md border-2 transition-colors duration-150 {frameFlashed ? 'border-emerald-500 bg-emerald-500/20' : 'border-zinc-100/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]'}">
                </div>
              </div>
            </div>
            {#if cameraError}
              <div class="p-2 text-xs text-red-600 dark:text-red-400 bg-red-500/10 rounded-sm border border-red-500/20">
                {cameraError}
              </div>
            {/if}
          {/if}

          <!-- Automatic Media Preview specifically for this link field -->
          {#if fieldParsed}
            <div class="mt-2">
              <MediaPreview parsed={fieldParsed} />
            </div>
          {/if}
        {/if}
      </div>
    {/each}

    <!-- Feedback Banner -->
    {#if feedback.type}
      <div class="p-2.5 rounded-sm text-xs flex items-center gap-2 {feedback.type === 'success' ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20' : feedback.type === 'warning' ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20' : 'bg-red-500/10 text-red-800 dark:text-red-300 border border-red-500/20'}">
        {#if feedback.type === 'success'}
          <CheckCircle2 class="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        {:else}
          <AlertCircle class="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        {/if}
        <span class="flex-1 font-medium">{feedback.message}</span>
        {#if feedback.details}
          <span class="text-[11px] opacity-75 font-mono-data">{feedback.details}</span>
        {/if}
      </div>
    {/if}

    <!-- 5-Second Undo Toast Bar -->
    {#if lastSubmittedRecord}
      <div class="p-2.5 rounded-sm bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs flex items-center justify-between transition-all">
        <div class="flex items-center gap-2">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          <span>Tersimpan p.{lastSubmittedRecord.pageNumber}</span>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-semibold bg-white/20 dark:bg-black/10 hover:bg-white/30 transition-colors cursor-pointer"
          onclick={handleUndo}
        >
          <Undo2 class="w-3 h-3" />
          <span>Batalkan ({undoRemainingSeconds}s)</span>
        </button>
      </div>
    {/if}

    <!-- Submit Button -->
    <div class="pt-2">
      <button
        type="submit"
        disabled={isSubmitting || !!disabledReason}
        class="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-bold rounded-sm bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        title={disabledReason || 'Kirim baris ke Google Sheets (Ctrl+Enter)'}
      >
        {#if isSubmitting}
          <div class="w-3.5 h-3.5 border-2 border-white/40 dark:border-black/40 border-t-white dark:border-t-black rounded-full animate-spin"></div>
          <span>Menyimpan ke Sheets...</span>
        {:else}
          <span>Kirim Baris ke Google Sheets</span>
          <kbd class="hidden sm:inline-block text-[10px] opacity-60 font-mono-data ml-1">Ctrl+Enter</kbd>
        {/if}
      </button>

      {#if disabledReason}
        <p class="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono-data text-center mt-1.5">
          {disabledReason}
        </p>
      {/if}
    </div>
  </form>
</div>
