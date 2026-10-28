<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { appState } from '../store.svelte';
  import { submitRecord } from '../api';
  import { generateRecordId, isValidUrl } from '../utils';
  import { parseDestination } from '../url-parser';
  import { playScanBeep } from '../audio';
  import type { QRRecord, TestStatus } from '../types';
  import {
    Camera,
    CameraOff,
    Check,
    X,
    Ban,
    Flag,
    ExternalLink,
    RefreshCw,
    Video,
    Volume2,
    HelpCircle,
    FileText,
    Globe,
    Undo2,
    CheckCircle2,
    AlertCircle,
    Sparkles
  } from '@lucide/svelte';

  let qrInput = $state('');
  let testStatus = $state<TestStatus | null>(null); // NO default selection!
  let notes = $state('');
  let customFields = $state<Record<string, string | number | boolean>>({});

  let isSubmitting = $state(false);
  let isCameraOpen = $state(false);
  let cameraError = $state<string | null>(null);
  let html5QrCodeInstance: any = null;
  let isThrottled = false;
  let frameFlashed = $state(false);

  let captureInputRef = $state<HTMLInputElement | null>(null);
  let notesInputRef = $state<HTMLTextAreaElement | null>(null);

  // Undo state (5 seconds)
  let lastSubmittedRecord = $state<QRRecord | null>(null);
  let undoTimeoutId: any = null;
  let undoRemainingSeconds = $state(5);
  let undoIntervalId: any = null;

  // Feedback state
  let feedback = $state<{
    type: 'success' | 'error' | 'warning' | null;
    message: string;
    details?: string;
  }>({ type: null, message: '' });

  // Quick note chips for negative/flagged verdicts
  const QUICK_NOTES = [
    'Broken link',
    'Wrong page',
    "Media won't play",
    'Typo on destination'
  ];

  const SAMPLE_QRS = [
    { label: 'Sample 1', url: 'https://example.com/books/ch1/qr-01' },
    { label: 'Sample 2', url: 'https://example.com/books/ch2/qr-02' },
    { label: 'Video 3', url: 'https://example.com/books/media/video-03.mp4' },
    { label: 'Quiz 4', url: 'https://books.publisher.org/quiz/ch-04' }
  ];

  let parsed = $derived(parseDestination(qrInput));

  let activeCustomFields = $derived(
    appState.fields.filter((f) => !f.isBuiltIn && f.enabled)
  );

  let disabledReason = $derived.by(() => {
    if (!qrInput.trim()) return 'Scan or enter a QR to continue';
    if (!testStatus) return 'Select a verdict (1-4)';
    for (const f of activeCustomFields) {
      if (f.required && (customFields[f.id] === undefined || customFields[f.id] === '')) {
        return `Required field "${f.label}" is missing`;
      }
    }
    return null;
  });

  onMount(() => {
    captureInputRef?.focus();
  });

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

    // Restore state to form
    qrInput = rec.qrContent;
    testStatus = rec.testStatus;
    notes = rec.notes;
    customFields = { ...rec.customFields };

    clearUndoTimer();
    lastSubmittedRecord = null;
    feedback = {
      type: 'warning',
      message: `Submission undone (Page ${rec.pageNumber})`
    };
    captureInputRef?.focus();
  }

  async function toggleCamera() {
    if (isCameraOpen) {
      await stopCamera();
    } else {
      await startCamera();
    }
  }

  async function startCamera() {
    cameraError = null;
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      html5QrCodeInstance = new Html5Qrcode('qr-viewfinder');

      await html5QrCodeInstance.start(
        { facingMode: 'environment' },
        {
          fps: 12,
          qrbox: { width: 220, height: 220 }
        },
        (decodedText: string) => {
          if (isThrottled) return;
          handleScanSuccess(decodedText);
        },
        () => {}
      );
      isCameraOpen = true;
    } catch (err: unknown) {
      isCameraOpen = false;
      cameraError = err instanceof Error ? err.message : 'Camera permission denied or camera not supported';
    }
  }

  async function stopCamera() {
    if (html5QrCodeInstance && isCameraOpen) {
      try {
        await html5QrCodeInstance.stop();
        html5QrCodeInstance.clear();
      } catch (err) {
        console.warn('Error stopping camera:', err);
      }
    }
    isCameraOpen = false;
  }

  function handleScanSuccess(raw: string) {
    isThrottled = true;
    frameFlashed = true;

    // Haptic feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(30); } catch (_) {}
    }

    // Sound beep
    if (appState.config.soundEnabled !== false) {
      playScanBeep();
    }

    qrInput = raw.trim();

    setTimeout(() => {
      frameFlashed = false;
    }, 350);

    // Pause scanning ~1.5s to avoid duplicate scans
    setTimeout(() => {
      isThrottled = false;
    }, 1500);

    // Close camera on detection to allow rapid keyboard submission
    stopCamera();
    captureInputRef?.focus();
  }

  function selectVerdict(status: TestStatus) {
    testStatus = status;
    if (status !== 'PASS') {
      setTimeout(() => notesInputRef?.focus(), 50);
    }
  }

  function appendQuickNote(noteText: string) {
    if (!notes.trim()) {
      notes = noteText;
    } else if (!notes.includes(noteText)) {
      notes = notes + ', ' + noteText;
    }
    notesInputRef?.focus();
  }

  async function handleSubmit() {
    if (disabledReason) return;

    isSubmitting = true;
    feedback = { type: null, message: '' };

    const newRecord: QRRecord = {
      recordId: generateRecordId(),
      pageNumber: appState.currentPage,
      qrContent: qrInput.trim(),
      testStatus: testStatus as TestStatus,
      notes: notes.trim(),
      scannedAt: new Date().toISOString(),
      customFields: { ...customFields },
      submissionStatus: 'saving',
      isSimulated: appState.config.dummyMode
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
        message: res.simulated
          ? 'Record saved locally (Dummy Mode active)'
          : `Record written to Google Sheets row ${res.rowNumber || 'confirmed'}`,
        details: `p.${newRecord.pageNumber} • ${newRecord.testStatus}`
      };

      startUndoCountdown(newRecord);

      // Reset form but retain page number
      qrInput = '';
      notes = '';
      testStatus = null; // No default selection for next scan
      customFields = {};

      captureInputRef?.focus();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown submission error';
      const isTimeout = errMsg.toLowerCase().includes('timed out');
      const newStatus = isTimeout ? 'unknown' : 'failed';

      appState.updateRecordStatus(newRecord.recordId, newStatus, errMsg);

      feedback = {
        type: isTimeout ? 'warning' : 'error',
        message: isTimeout
          ? 'Submission timed out. Verification state is unconfirmed.'
          : 'Write failed: ' + errMsg
      };
    } finally {
      isSubmitting = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    // ESC closes camera
    if (e.key === 'Escape') {
      if (isCameraOpen) {
        e.preventDefault();
        stopCamera();
        return;
      }
    }

    // Submit with Enter or Ctrl+Enter (if not in multiline notes without modifier)
    if (e.key === 'Enter') {
      if (e.ctrlKey || e.metaKey || document.activeElement !== notesInputRef) {
        e.preventDefault();
        handleSubmit();
        return;
      }
    }

    // Number keys 1-4 for verdict when not typing in text fields
    const isEditingText =
      document.activeElement?.tagName === 'INPUT' ||
      document.activeElement?.tagName === 'TEXTAREA';

    if (!isEditingText) {
      if (e.key === '1') { e.preventDefault(); selectVerdict('PASS'); }
      else if (e.key === '2') { e.preventDefault(); selectVerdict('FAIL'); }
      else if (e.key === '3') { e.preventDefault(); selectVerdict('BLOCKED'); }
      else if (e.key === '4') { e.preventDefault(); selectVerdict('FLAGGED'); }
    }
  }

  function insertSample(url: string) {
    qrInput = url;
    captureInputRef?.focus();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<section class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 sm:p-6 shadow-2xs space-y-6 transition-colors" aria-label="Verify Workspace">
  <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-6">
    <!-- Section Title & Keyboard shortcut prompt -->
    <div class="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 pb-3">
      <div>
        <h2 class="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">Verify Workspace</h2>
        <p class="text-[11px] text-zinc-500 dark:text-zinc-400">Continuous inspection loop</p>
      </div>
      
      <div class="flex items-center gap-2">
        <!-- Quick Sample button QR-1 for fast testing & E2E -->
        <button
          type="button"
          class="inline-flex items-center gap-1 text-[11px] font-mono-data px-2 py-1 rounded-sm border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          onclick={() => insertSample('https://example.com/books/ch1/qr-01')}
          title="Insert QR-1 sample"
        >
          <Sparkles class="w-3 h-3 text-amber-500" />
          <span>QR-1</span>
        </button>

        <!-- Quick Sample dropdown -->
        <div class="relative group">
          <button
            type="button"
            class="inline-flex items-center gap-1 text-[11px] font-mono-data px-2 py-1 rounded-sm border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            title="Insert quick dummy URL for testing"
          >
            <span>Samples ▾</span>
          </button>
          <div class="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg p-1 hidden group-hover:block group-focus-within:block z-20">
            {#each SAMPLE_QRS as sample}
              <button
                type="button"
                class="w-full text-left text-[11px] px-2 py-1 rounded-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono-data truncate"
                onclick={() => insertSample(sample.url)}
              >
                {sample.label}
              </button>
            {/each}
          </div>
        </div>
      </div>
    </div>

  <!-- 1. Capture Area -->
  <div class="space-y-2">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs">
      <label for="qr-content-input" class="font-medium text-zinc-700 dark:text-zinc-300">
        QR Destination or Barcode
      </label>

      <button
        type="button"
        class="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium border transition-colors {isCameraOpen ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700'}"
        onclick={toggleCamera}
      >
        {#if isCameraOpen}
          <CameraOff class="w-3.5 h-3.5" />
          Close Camera (Esc)
        {:else}
          <Camera class="w-3.5 h-3.5" />
          Open Camera
        {/if}
      </button>
    </div>

    <!-- Camera Viewfinder Overlay -->
    {#if isCameraOpen}
      <div class="relative overflow-hidden rounded-md border border-zinc-300 dark:border-zinc-700 bg-black min-h-[260px] flex items-center justify-center">
        <div id="qr-viewfinder" class="w-full max-w-sm"></div>

        <!-- Dimmed overlay cutout with flash indicator -->
        <div class="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div class="w-56 h-56 rounded-md border-2 transition-colors duration-150 {frameFlashed ? 'border-emerald-500 bg-emerald-500/20' : 'border-zinc-100/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]'}">
          </div>
        </div>
      </div>
    {/if}

    {#if cameraError}
      <div class="p-2 text-xs text-red-600 dark:text-red-400 bg-red-500/10 rounded-sm border border-red-500/20">
        {cameraError}
      </div>
    {/if}

    <div class="relative">
      <input
        id="qr-content-input"
        type="text"
        bind:this={captureInputRef}
        bind:value={qrInput}
        placeholder="Auto-focused: scan QR, barcode, or paste destination URL..."
        class="w-full font-mono-data text-xs py-2 px-3 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
      />
    </div>
  </div>

  <!-- 2. Current Scan Summary -->
  {#if qrInput.trim()}
    <div class="p-4 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/60 flex items-start gap-3 my-1">
      <div class="p-1.5 rounded-sm bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 shrink-0 mt-0.5">
        {#if parsed.category === 'video'}
          <Video class="w-4 h-4" />
        {:else if parsed.category === 'audio'}
          <Volume2 class="w-4 h-4" />
        {:else if parsed.category === 'quiz'}
          <HelpCircle class="w-4 h-4" />
        {:else if parsed.category === 'document'}
          <FileText class="w-4 h-4" />
        {:else}
          <Globe class="w-4 h-4" />
        {/if}
      </div>

      <div class="flex-1 min-w-0">
        {#if parsed.isUrl}
          <div class="text-xs truncate font-mono-data">
            <span class="font-bold text-zinc-900 dark:text-zinc-100">{parsed.domain}</span>
            <span class="text-zinc-500 dark:text-zinc-400">{parsed.path}</span>
          </div>
        {:else}
          <div class="text-xs font-mono-data text-zinc-800 dark:text-zinc-200 truncate">
            {parsed.raw}
          </div>
        {/if}

        <div class="flex items-center gap-2 mt-1.5 text-[11px] text-zinc-500">
          <span class="capitalize font-medium">{parsed.category} destination</span>
          {#if parsed.isUrl}
            <span>&bull;</span>
            <a
              href={parsed.raw}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 text-zinc-700 dark:text-zinc-300 hover:underline"
            >
              Open destination <ExternalLink class="w-3 h-3" />
            </a>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- 3. Verdict Selection (Segmented buttons, NO default selection) -->
  <fieldset class="space-y-2 border-0 p-0 m-0">
    <div class="flex items-center justify-between">
      <legend class="text-xs font-medium text-zinc-700 dark:text-zinc-300">
        Verdict <span class="text-red-500">*</span>
      </legend>
      <span class="text-[11px] text-zinc-400 font-mono-data">Keys 1, 2, 3, 4</span>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <!-- 1 Pass -->
      <button
        type="button"
        class="flex items-center justify-center gap-1.5 min-h-[44px] py-2 px-2.5 text-xs font-medium rounded-sm border transition-colors {testStatus === 'PASS' ? 'bg-emerald-600 text-white border-emerald-700 font-bold shadow-2xs' : 'bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'}"
        onclick={() => selectVerdict('PASS')}
        aria-label="PASS"
      >
        <Check class="w-3.5 h-3.5" />
        <span>PASS</span>
        <kbd class="text-[10px] opacity-60 font-mono-data ml-0.5">1</kbd>
      </button>

      <!-- 2 Fail -->
      <button
        type="button"
        class="flex items-center justify-center gap-1.5 min-h-[44px] py-2 px-2.5 text-xs font-medium rounded-sm border transition-colors {testStatus === 'FAIL' ? 'bg-red-600 text-white border-red-700 font-bold shadow-2xs' : 'bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'}"
        onclick={() => selectVerdict('FAIL')}
        aria-label="FAIL"
      >
        <X class="w-3.5 h-3.5" />
        <span>FAIL</span>
        <kbd class="text-[10px] opacity-60 font-mono-data ml-0.5">2</kbd>
      </button>

      <!-- 3 Blocked -->
      <button
        type="button"
        class="flex items-center justify-center gap-1.5 min-h-[44px] py-2 px-2.5 text-xs font-medium rounded-sm border transition-colors {testStatus === 'BLOCKED' ? 'bg-zinc-800 text-white border-zinc-900 dark:bg-zinc-200 dark:text-zinc-900 font-bold shadow-2xs' : 'bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'}"
        onclick={() => selectVerdict('BLOCKED')}
        aria-label="BLOCKED"
      >
        <Ban class="w-3.5 h-3.5" />
        <span>BLOCKED</span>
        <kbd class="text-[10px] opacity-60 font-mono-data ml-0.5">3</kbd>
      </button>

      <!-- 4 Flagged -->
      <button
        type="button"
        class="flex items-center justify-center gap-1.5 min-h-[44px] py-2 px-2.5 text-xs font-medium rounded-sm border transition-colors {testStatus === 'FLAGGED' ? 'bg-amber-600 text-white border-amber-700 font-bold shadow-2xs' : 'bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'}"
        onclick={() => selectVerdict('FLAGGED')}
        aria-label="FLAGGED"
      >
        <Flag class="w-3.5 h-3.5" />
        <span>FLAGGED</span>
        <kbd class="text-[10px] opacity-60 font-mono-data ml-0.5">4</kbd>
      </button>
    </div>
  </fieldset>

  <!-- Quick Note Chips (Visible especially when Fail/Blocked/Flagged) -->
  {#if testStatus && testStatus !== 'PASS'}
    <div class="space-y-1.5 pt-1">
      <div class="text-[11px] text-zinc-500 font-medium">Quick reason tags:</div>
      <div class="flex flex-wrap gap-1.5">
        {#each QUICK_NOTES as tag}
          <button
            type="button"
            class="text-[11px] font-mono-data px-2 py-0.5 rounded-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            onclick={() => appendQuickNote(tag)}
          >
            + {tag}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Notes Textarea -->
  <div class="space-y-1.5 pt-5">
    <label for="record-notes" class="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
      Notes {testStatus && testStatus !== 'PASS' ? '(recommended for issues)' : '(optional)'}
    </label>
    <textarea
      id="record-notes"
      bind:this={notesInputRef}
      bind:value={notes}
      rows="2"
      placeholder="Observations or defect notes..."
      class="w-full text-xs py-2 px-2.5 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
    ></textarea>
  </div>

  <!-- Dynamic Custom Fields (if configured) -->
  {#if activeCustomFields.length > 0}
    <div class="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
      <div class="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Custom Fields</div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {#each activeCustomFields as f}
          <div class="space-y-1">
            <label for={`custom-${f.id}`} class="block text-xs text-zinc-700 dark:text-zinc-300">
              {f.label} {#if f.required}<span class="text-red-500">*</span>{/if}
            </label>
            {#if f.type === 'select'}
              <select
                id={`custom-${f.id}`}
                bind:value={customFields[f.id]}
                class="w-full text-xs py-1.5 px-2 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
              >
                <option value="">Select...</option>
                {#each f.options || [] as opt}
                  <option value={opt}>{opt}</option>
                {/each}
              </select>
            {:else if f.type === 'boolean'}
              <label class="flex items-center gap-2 pt-1 text-xs">
                <input
                  type="checkbox"
                  bind:checked={customFields[f.id] as boolean}
                  class="rounded-sm border-zinc-300 text-zinc-900"
                />
                <span>Confirmed</span>
              </label>
            {:else}
              <input
                id={`custom-${f.id}`}
                type={f.type === 'number' ? 'number' : f.type === 'url' ? 'url' : 'text'}
                bind:value={customFields[f.id]}
                class="w-full text-xs py-1.5 px-2 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
              />
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Feedback Banner -->
  {#if feedback.type}
    <div class="p-2.5 rounded-sm text-xs flex items-center gap-2 {feedback.type === 'success' ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20' : feedback.type === 'warning' ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20' : 'bg-red-500/10 text-red-800 dark:text-red-300 border border-red-500/20'}">
      {#if feedback.type === 'success'}
        <CheckCircle2 class="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      {:else if feedback.type === 'warning'}
        <AlertCircle class="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
      {:else}
        <AlertCircle class="w-3.5 h-3.5 shrink-0 text-red-600 dark:text-red-400" />
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
        <span>Saved p.{lastSubmittedRecord.pageNumber} ({lastSubmittedRecord.testStatus})</span>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-semibold bg-white/20 dark:bg-black/10 hover:bg-white/30 transition-colors"
        onclick={handleUndo}
      >
        <Undo2 class="w-3 h-3" />
        Undo ({undoRemainingSeconds}s)
      </button>
    </div>
  {/if}

  <!-- 4. Submit Area -->
  <div class="pt-2 flex items-center justify-between gap-3 border-t border-zinc-100 dark:border-zinc-800/80">
    <div>
      {#if disabledReason}
        <span class="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono-data">
          {disabledReason}
        </span>
      {:else}
        <span class="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono-data">
          Ready to commit record
        </span>
      {/if}
    </div>

    <button
      type="submit"
      disabled={isSubmitting || !!disabledReason}
      class="inline-flex items-center justify-center gap-2 px-5 py-2 text-xs font-semibold rounded-sm bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-white/90 active:scale-98 transition-all disabled:opacity-35 disabled:pointer-events-none shadow-xs"
    >
      {#if isSubmitting}
        <RefreshCw class="w-3.5 h-3.5 animate-spin" />
        Saving...
      {:else}
        Submit Record
        <kbd class="text-[10px] opacity-60 font-mono-data ml-1">Enter</kbd>
      {/if}
    </button>
  </div>
  </form>
</section>
