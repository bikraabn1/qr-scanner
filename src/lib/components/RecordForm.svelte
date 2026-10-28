<script lang="ts">
  import { appState } from '../store.svelte';
  import { submitRecord } from '../api';
  import { generateRecordId } from '../utils';
  import type { QRRecord, TestStatus } from '../types';
  import { Send, CheckCircle2, AlertCircle, RefreshCw, XCircle, ClipboardCheck } from '@lucide/svelte';

  let { qrContent = $bindable() }: {
    qrContent: string;
  } = $props();

  let testStatus = $state<TestStatus>('PASS');
  let notes = $state('');
  let customFields = $state<Record<string, string | number | boolean>>({});

  let isSubmitting = $state(false);
  let feedback = $state<{
    type: 'success' | 'error' | 'warning' | null;
    message: string;
    details?: string;
    recordId?: string;
  }>({ type: null, message: '' });

  let activeCustomFields = $derived(
    appState.fields.filter((f) => !f.isBuiltIn && f.enabled)
  );

  async function handleSubmit() {
    if (!qrContent || !qrContent.trim()) {
      feedback = {
        type: 'error',
        message: 'QR content or URL cannot be empty. Please scan or enter a URL.'
      };
      return;
    }

    if (!appState.currentPage || appState.currentPage < 1) {
      feedback = {
        type: 'error',
        message: 'Valid positive page number is required.'
      };
      return;
    }

    for (const f of activeCustomFields) {
      if (f.required) {
        const val = customFields[f.id];
        if (val === undefined || val === null || val === '') {
          feedback = {
            type: 'error',
            message: `Required field "${f.label}" is missing.`
          };
          return;
        }
      }
    }

    isSubmitting = true;
    feedback = { type: null, message: '' };

    const newRecord: QRRecord = {
      recordId: generateRecordId(),
      pageNumber: appState.currentPage,
      qrContent: qrContent.trim(),
      testStatus,
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
        details: `Page ${newRecord.pageNumber} | Status: ${newRecord.testStatus}`,
        recordId: newRecord.recordId
      };

      if (appState.config.autoClearOnSubmit) {
        qrContent = '';
        notes = '';
        customFields = {};
        testStatus = 'PASS';
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown submission error';
      const isTimeout = errMsg.toLowerCase().includes('timed out');
      
      const newStatus = isTimeout ? 'unknown' : 'failed';
      appState.updateRecordStatus(newRecord.recordId, newStatus, errMsg);

      feedback = {
        type: isTimeout ? 'warning' : 'error',
        message: isTimeout
          ? 'Submission timed out. Record outcome is unknown. Please verify sheet or retry.'
          : 'Failed to write to Google Sheets: ' + errMsg,
        recordId: newRecord.recordId
      };
    } finally {
      isSubmitting = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function clearForm() {
    qrContent = '';
    notes = '';
    customFields = {};
    feedback = { type: null, message: '' };
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<form
  onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}
  class="bg-white dark:bg-zinc-900/90 border border-zinc-200/90 dark:border-zinc-800/90 rounded-xl p-5 shadow-xs space-y-4 transition-colors"
>
  <div class="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 pb-3">
    <div class="flex items-center gap-2.5">
      <div class="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700/60">
        <ClipboardCheck class="w-4 h-4" />
      </div>
      <div>
        <h3 class="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">Verification Outcome</h3>
        <p class="text-[11px] text-zinc-500 dark:text-zinc-400">Record destination status and tester notes</p>
      </div>
    </div>
    <div class="text-[11px] text-zinc-400 flex items-center gap-1 font-mono">
      <kbd class="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-[10px]">Ctrl+Enter</kbd>
      <span>to save</span>
    </div>
  </div>

  <!-- Feedback Banner -->
  {#if feedback.type}
    <div class="p-3.5 rounded-lg text-xs flex items-start gap-3 transition-all {feedback.type === 'success' ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20' : feedback.type === 'warning' ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20' : 'bg-red-500/10 text-red-800 dark:text-red-300 border border-red-500/20'}">
      {#if feedback.type === 'success'}
        <CheckCircle2 class="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
      {:else if feedback.type === 'warning'}
        <AlertCircle class="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
      {:else}
        <XCircle class="w-4 h-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
      {/if}
      <div class="flex-1">
        <div class="font-semibold">{feedback.message}</div>
        {#if feedback.details}
          <div class="text-[11px] opacity-80 mt-0.5 font-mono-data">{feedback.details}</div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Test Status Buttons -->
  <fieldset class="space-y-1.5 border-0 p-0 m-0">
    <legend class="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
      Test Result <span class="text-red-500">*</span>
    </legend>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <!-- PASS -->
      <button
        type="button"
        class="flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-lg border transition-all {testStatus === 'PASS' ? 'bg-emerald-500 text-white border-emerald-600 shadow-xs' : 'bg-zinc-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'}"
        onclick={() => testStatus = 'PASS'}
      >
        <span class="w-2 h-2 rounded-full {testStatus === 'PASS' ? 'bg-white' : 'bg-emerald-500'}"></span>
        PASS
      </button>

      <!-- FAIL -->
      <button
        type="button"
        class="flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-lg border transition-all {testStatus === 'FAIL' ? 'bg-red-600 text-white border-red-700 shadow-xs' : 'bg-zinc-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'}"
        onclick={() => testStatus = 'FAIL'}
      >
        <span class="w-2 h-2 rounded-full {testStatus === 'FAIL' ? 'bg-white' : 'bg-red-500'}"></span>
        FAIL
      </button>

      <!-- BLOCKED -->
      <button
        type="button"
        class="flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-lg border transition-all {testStatus === 'BLOCKED' ? 'bg-zinc-800 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-white shadow-xs' : 'bg-zinc-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'}"
        onclick={() => testStatus = 'BLOCKED'}
      >
        <span class="w-2 h-2 rounded-full {testStatus === 'BLOCKED' ? 'bg-white dark:bg-zinc-900' : 'bg-zinc-400'}"></span>
        BLOCKED
      </button>

      <!-- FLAGGED -->
      <button
        type="button"
        class="flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-lg border transition-all {testStatus === 'FLAGGED' ? 'bg-amber-500 text-white border-amber-600 shadow-xs' : 'bg-zinc-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'}"
        onclick={() => testStatus = 'FLAGGED'}
      >
        <span class="w-2 h-2 rounded-full {testStatus === 'FLAGGED' ? 'bg-white' : 'bg-amber-500'}"></span>
        FLAGGED
      </button>
    </div>
  </fieldset>

  <!-- Notes Input -->
  <div class="space-y-1.5">
    <label for="record-notes" class="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
      Observations / Remarks
    </label>
    <textarea
      id="record-notes"
      bind:value={notes}
      rows="2"
      placeholder="e.g. Page 4 video playback confirmed, typography mismatch, caption typo..."
      class="w-full text-xs py-2 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 transition-all"
    ></textarea>
  </div>

  <!-- Dynamic Custom Fields -->
  {#if activeCustomFields.length > 0}
    <div class="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
      <div class="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Custom Book Metadata</div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {#each activeCustomFields as f}
          <div class="space-y-1">
            <label for={`custom-field-${f.id}`} class="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {f.label} {#if f.required}<span class="text-red-500">*</span>{/if}
            </label>
            {#if f.type === 'select'}
              <select
                id={`custom-field-${f.id}`}
                bind:value={customFields[f.id]}
                class="w-full text-xs py-2 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
              >
                <option value="">Select option...</option>
                {#each f.options || [] as opt}
                  <option value={opt}>{opt}</option>
                {/each}
              </select>
            {:else if f.type === 'boolean'}
              <div class="flex items-center gap-2 pt-1">
                <input
                  id={`custom-field-${f.id}`}
                  type="checkbox"
                  bind:checked={customFields[f.id] as boolean}
                  class="rounded border-zinc-300 dark:border-zinc-700 w-4 h-4 text-zinc-900 focus:ring-zinc-900"
                />
                <span class="text-xs text-zinc-600 dark:text-zinc-400">Yes / Verified</span>
              </div>
            {:else}
              <input
                id={`custom-field-${f.id}`}
                type={f.type === 'number' ? 'number' : f.type === 'url' ? 'url' : 'text'}
                bind:value={customFields[f.id]}
                placeholder={f.label}
                class="w-full text-xs py-2 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
              />
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Submit Buttons -->
  <div class="pt-2 flex items-center justify-end gap-2 border-t border-zinc-100 dark:border-zinc-800/80">
    <button
      type="button"
      class="px-3.5 py-2 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      onclick={clearForm}
    >
      Clear
    </button>
    <button
      type="submit"
      disabled={isSubmitting || !qrContent.trim()}
      class="inline-flex items-center justify-center gap-2 px-5 py-2 text-xs font-bold rounded-lg bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-100 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none shadow-xs"
    >
      {#if isSubmitting}
        <RefreshCw class="w-3.5 h-3.5 animate-spin" />
        Saving Record...
      {:else}
        <Send class="w-3.5 h-3.5" />
        Submit Record
      {/if}
    </button>
  </div>
</form>
