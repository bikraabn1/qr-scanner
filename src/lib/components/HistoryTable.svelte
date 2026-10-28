<script lang="ts">
  import { appState } from '../store.svelte';
  import { retryFailedRecord } from '../api';
  import type { QRRecord, TestStatus } from '../types';
  import {
    Search,
    Check,
    X,
    Ban,
    Flag,
    RotateCw,
    Trash2,
    Clock,
    FileSpreadsheet,
    AlertCircle,
    CheckCircle2
  } from '@lucide/svelte';

  let searchQuery = $state('');
  let statusFilter = $state<TestStatus | 'ALL'>('ALL');
  let retryingId = $state<string | null>(null);

  // Filtered records
  let filteredRecords = $derived.by(() => {
    let list = appState.records;

    if (statusFilter !== 'ALL') {
      list = list.filter((r) => r.testStatus === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.qrContent.toLowerCase().includes(q) ||
          r.notes.toLowerCase().includes(q) ||
          String(r.pageNumber).includes(q)
      );
    }

    return list;
  });

  // Verdict counts
  let counts = $derived({
    all: appState.records.length,
    pass: appState.records.filter((r) => r.testStatus === 'PASS').length,
    fail: appState.records.filter((r) => r.testStatus === 'FAIL').length,
    blocked: appState.records.filter((r) => r.testStatus === 'BLOCKED').length,
    flagged: appState.records.filter((r) => r.testStatus === 'FLAGGED').length
  });

  function formatTime(isoStr: string) {
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return isoStr;
    }
  }

  async function handleRetry(record: QRRecord) {
    retryingId = record.recordId;
    appState.updateRecordStatus(record.recordId, 'saving');

    try {
      await retryFailedRecord(record, appState.config, appState.fields, appState.mappings);
      appState.updateRecordStatus(record.recordId, 'saved');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Retry failed';
      appState.updateRecordStatus(record.recordId, 'failed', msg);
    } finally {
      retryingId = null;
    }
  }

  function clearAll() {
    if (confirm('Clear all logged records in this local session?')) {
      appState.clearHistory();
    }
  }
</script>

<section class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 sm:p-6 shadow-2xs flex flex-col h-full min-h-[580px] transition-colors" aria-label="Session Log">
  <!-- Log Header: Title, Clear button -->
  <div class="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800/80">
    <div class="flex items-center gap-2">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">Session Log</h2>
      <span class="text-[11px] font-mono-data px-1.5 py-0.5 rounded-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
        {appState.records.length} records
      </span>
    </div>

    {#if appState.records.length > 0}
      <button
        type="button"
        class="inline-flex items-center gap-1 text-[11px] font-mono-data text-zinc-500 hover:text-red-600 dark:hover:text-red-400 px-2 py-1 rounded-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        onclick={clearAll}
        title="Clear local session history"
      >
        <Trash2 class="w-3 h-3" />
        Clear
      </button>
    {/if}
  </div>

  <!-- Filter & Search Bar: Single segmented filter with counts + search -->
  <div class="py-3 flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
    <!-- Segmented Filter -->
    <div class="inline-flex p-0.5 rounded-md bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 self-start text-xs font-medium overflow-x-auto max-w-full">
      <button
        type="button"
        class="px-2.5 py-1 rounded-sm text-xs font-mono-data transition-colors flex items-center gap-1.5 {statusFilter === 'ALL' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'}"
        onclick={() => statusFilter = 'ALL'}
      >
        <span>All</span>
        <span class="text-[10px] opacity-75">{counts.all}</span>
      </button>

      <button
        type="button"
        class="px-2.5 py-1 rounded-sm text-xs font-mono-data transition-colors flex items-center gap-1.5 {statusFilter === 'PASS' ? 'bg-white dark:bg-zinc-800 text-emerald-700 dark:text-emerald-400 shadow-2xs font-semibold' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'}"
        onclick={() => statusFilter = 'PASS'}
      >
        <span>Pass</span>
        <span class="text-[10px] opacity-75 {counts.pass > 0 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}">{counts.pass}</span>
      </button>

      <button
        type="button"
        class="px-2.5 py-1 rounded-sm text-xs font-mono-data transition-colors flex items-center gap-1.5 {statusFilter === 'FAIL' ? 'bg-white dark:bg-zinc-800 text-red-700 dark:text-red-400 shadow-2xs font-semibold' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'}"
        onclick={() => statusFilter = 'FAIL'}
      >
        <span>Fail</span>
        <span class="text-[10px] opacity-75 {counts.fail > 0 ? 'text-red-600 dark:text-red-400 font-bold' : ''}">{counts.fail}</span>
      </button>

      <button
        type="button"
        class="px-2.5 py-1 rounded-sm text-xs font-mono-data transition-colors flex items-center gap-1.5 {statusFilter === 'BLOCKED' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'}"
        onclick={() => statusFilter = 'BLOCKED'}
      >
        <span>Blocked</span>
        <span class="text-[10px] opacity-75 {counts.blocked > 0 ? 'font-bold text-zinc-900 dark:text-zinc-100' : ''}">{counts.blocked}</span>
      </button>

      <button
        type="button"
        class="px-2.5 py-1 rounded-sm text-xs font-mono-data transition-colors flex items-center gap-1.5 {statusFilter === 'FLAGGED' ? 'bg-white dark:bg-zinc-800 text-amber-700 dark:text-amber-400 shadow-2xs font-semibold' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'}"
        onclick={() => statusFilter = 'FLAGGED'}
      >
        <span>Flagged</span>
        <span class="text-[10px] opacity-75 {counts.flagged > 0 ? 'text-amber-600 dark:text-amber-400 font-bold' : ''}">{counts.flagged}</span>
      </button>
    </div>

    <!-- Search Input -->
    <div class="relative w-full sm:w-48">
      <Search class="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="text"
        placeholder="Search log..."
        bind:value={searchQuery}
        class="w-full pl-8 pr-2 py-1 text-xs rounded-sm border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
      />
    </div>
  </div>

  <!-- Dense Table with Sticky Header -->
  <div class="flex-1 overflow-auto border border-zinc-200 dark:border-zinc-800 rounded-sm relative min-h-[300px]">
    {#if filteredRecords.length === 0}
      <div class="h-full flex flex-col items-center justify-center p-8 text-center text-zinc-500 dark:text-zinc-400 space-y-2">
        <FileSpreadsheet class="w-8 h-8 text-zinc-300 dark:text-zinc-700 stroke-[1.5]" />
        {#if appState.records.length === 0}
          <div class="text-xs font-medium text-zinc-800 dark:text-zinc-200">No scans logged yet</div>
          <p class="text-[11px] max-w-xs text-zinc-500">
            Scan a QR code or use sample data, choose a verdict (keys 1-4), then hit Enter.
          </p>
        {:else}
          <div class="text-xs font-medium text-zinc-800 dark:text-zinc-200">No matching records</div>
          <p class="text-[11px] text-zinc-500">Adjust the verdict filter or search query.</p>
        {/if}
      </div>
    {:else}
      <table class="w-full text-left border-collapse text-xs">
        <thead class="sticky top-0 bg-zinc-100/90 dark:bg-zinc-950/90 backdrop-blur-xs z-10 border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider font-mono-data">
          <tr>
            <th class="py-2 px-3 w-20">Time</th>
            <th class="py-2 px-2 w-14 text-center">Page</th>
            <th class="py-2 px-3">Destination</th>
            <th class="py-2 px-2 w-24">Verdict</th>
            <th class="py-2 px-3">Notes</th>
            <th class="py-2 px-2 w-14 text-right">Sync</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800/80 font-mono-data" aria-live="polite">
          {#each filteredRecords as r (r.recordId)}
            <tr class="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors group">
              <!-- Time -->
              <td class="py-2 px-3 text-[11px] text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                {formatTime(r.scannedAt)}
              </td>

              <!-- Page Number -->
              <td class="py-2 px-2 text-center font-bold text-zinc-900 dark:text-zinc-100">
                p.{r.pageNumber}
              </td>

              <!-- Destination URL -->
              <td class="py-2 px-3 max-w-[200px] truncate" title={r.qrContent}>
                <span class="text-zinc-800 dark:text-zinc-200">{r.qrContent}</span>
              </td>

              <!-- Verdict Chip -->
              <td class="py-2 px-2 whitespace-nowrap">
                {#if r.testStatus === 'PASS'}
                  <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-xs">
                    <Check class="w-3 h-3 stroke-[2.5]" /> PASS
                  </span>
                {:else if r.testStatus === 'FAIL'}
                  <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 dark:text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-xs">
                    <X class="w-3 h-3 stroke-[2.5]" /> FAIL
                  </span>
                {:else if r.testStatus === 'BLOCKED'}
                  <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-500/10 px-1.5 py-0.5 rounded-xs">
                    <Ban class="w-3 h-3 stroke-[2.5]" /> BLOCKED
                  </span>
                {:else if r.testStatus === 'FLAGGED'}
                  <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-xs">
                    <Flag class="w-3 h-3 stroke-[2.5]" /> FLAGGED
                  </span>
                {/if}
              </td>

              <!-- Notes -->
              <td class="py-2 px-3 max-w-[180px] truncate font-sans text-zinc-600 dark:text-zinc-400" title={r.notes}>
                {r.notes || '—'}
              </td>

              <!-- Sync / Status & Retry -->
              <td class="py-2 px-2 text-right whitespace-nowrap">
                {#if r.submissionStatus === 'saved'}
                  <div class="flex items-center justify-end gap-1">
                    {#if r.isSimulated}
                      <span class="text-[10px] text-zinc-400 font-mono-data">Simulated</span>
                    {/if}
                    <span class="text-emerald-600 dark:text-emerald-400 inline-block" title={r.isSimulated ? 'Simulated write' : 'Synced to Sheets'}>
                      <CheckCircle2 class="w-3.5 h-3.5" />
                    </span>
                  </div>
                {:else if r.submissionStatus === 'saving'}
                  <RotateCw class="w-3.5 h-3.5 ml-auto animate-spin text-zinc-400" />
                {:else if r.submissionStatus === 'failed' || r.submissionStatus === 'unknown'}
                  <div class="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      class="text-red-600 dark:text-red-400 hover:text-red-800 p-0.5 rounded-xs hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                      title={r.submissionError ? `Failed: ${r.submissionError}. Click to retry.` : 'Click to retry'}
                      disabled={retryingId === r.recordId}
                      onclick={() => handleRetry(r)}
                    >
                      <RotateCw class="w-3.5 h-3.5 {retryingId === r.recordId ? 'animate-spin' : ''}" />
                    </button>
                  </div>
                {:else}
                  <Clock class="w-3.5 h-3.5 ml-auto text-zinc-400" />
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</section>
