<script lang="ts">
  import { onMount } from 'svelte';
  import { appState } from '../store.svelte';
  import { fetchSheetRows } from '../api';
  import {
    FileSpreadsheet,
    RefreshCw,
    ExternalLink,
    Search,
    AlertCircle,
    Database
  } from '@lucide/svelte';

  let headers = $state<string[]>([]);
  let rows = $state<string[][]>([]);
  let isLoading = $state(false);
  let searchQuery = $state('');
  let lastFetchedTime = $state<string | null>(null);

  let currentSheet = $derived(appState.config.sheetName || 'Sheet1');
  let spreadsheetId = $derived(appState.config.spreadsheetId || '');

  // Filtered rows by search query
  let filteredRows = $derived.by(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(q)));
  });

  onMount(() => {
    if (spreadsheetId && currentSheet && appState.accessToken) {
      loadSheetData();
    }
  });

  // Reload when tab or spreadsheet changes
  $effect(() => {
    if (spreadsheetId && currentSheet && appState.accessToken) {
      loadSheetData();
    }
  });

  export async function loadSheetData() {
    if (!spreadsheetId || !currentSheet || !appState.accessToken) return;
    isLoading = true;
    try {
      const data = await fetchSheetRows(spreadsheetId, currentSheet, 60);
      headers = data.headers;
      rows = data.rows;
      lastFetchedTime = new Date().toLocaleTimeString();
    } catch (err) {
      console.warn('Gagal memuat preview sheet:', err);
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-2xs overflow-hidden flex flex-col h-full min-h-[520px] transition-colors">
  <!-- Top bar: Header, Sheet Name badge, and Controls -->
  <div class="p-3.5 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
    <div class="flex items-center gap-2 min-w-0">
      <FileSpreadsheet class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
      <span class="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 truncate">
        Sheet Live Preview
      </span>
      {#if currentSheet}
        <span class="text-[11px] font-mono-data px-1.5 py-0.5 rounded-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 truncate">
          Tab: {currentSheet}
        </span>
      {/if}
    </div>

    <!-- Actions: Search + Refresh + Open Spreadsheet link -->
    <div class="flex items-center gap-2">
      <!-- Search filter -->
      <div class="relative w-36 sm:w-44">
        <Search class="w-3.5 h-3.5 text-zinc-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          placeholder="Cari di sheet..."
          bind:value={searchQuery}
          class="w-full pl-7 pr-2 py-1 text-xs font-mono-data rounded-sm border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
        />
      </div>

      <!-- Refresh button -->
      <button
        type="button"
        disabled={isLoading || !spreadsheetId}
        class="p-1.5 rounded-sm border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors disabled:opacity-40 cursor-pointer"
        title="Muat ulang data dari Google Sheets"
        onclick={loadSheetData}
      >
        <RefreshCw class="w-3.5 h-3.5 {isLoading ? 'animate-spin' : ''}" />
      </button>

      <!-- Open in Google Drive -->
      {#if spreadsheetId}
        <a
          href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`}
          target="_blank"
          rel="noopener noreferrer"
          class="p-1.5 rounded-sm border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors"
          title="Buka Spreadsheet di tab baru"
        >
          <ExternalLink class="w-3.5 h-3.5" />
        </a>
      {/if}
    </div>
  </div>

  <!-- Spreadsheet Table Container -->
  <div class="flex-1 overflow-auto max-h-[580px]">
    {#if !spreadsheetId}
      <div class="flex flex-col items-center justify-center p-12 text-center text-zinc-400 space-y-2">
        <Database class="w-8 h-8 opacity-40 mb-1" />
        <p class="text-xs font-medium">Spreadsheet belum dipilih</p>
        <p class="text-[11px] text-zinc-500">Masukkan Spreadsheet ID di tab Config terlebih dahulu.</p>
      </div>
    {:else if isLoading && rows.length === 0}
      <div class="flex flex-col items-center justify-center p-12 text-center text-zinc-400 space-y-2">
        <RefreshCw class="w-6 h-6 animate-spin opacity-50 mb-1" />
        <p class="text-xs font-mono-data">Memuat data dari Google Sheets...</p>
      </div>
    {:else if headers.length === 0}
      <div class="flex flex-col items-center justify-center p-12 text-center text-zinc-400 space-y-2">
        <AlertCircle class="w-8 h-8 opacity-40 mb-1" />
        <p class="text-xs font-medium">Tab "{currentSheet}" masih kosong</p>
        <p class="text-[11px] text-zinc-500">Belum ada baris header atau data pada sheet ini.</p>
      </div>
    {:else}
      <table class="w-full text-xs text-left border-collapse font-mono-data">
        <thead class="bg-zinc-100 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider sticky top-0 z-10">
          <tr>
            <th class="py-2 px-2.5 w-10 text-center border-r border-zinc-200 dark:border-zinc-800 text-zinc-400 bg-zinc-100 dark:bg-zinc-950">#</th>
            {#each headers as head}
              <th class="py-2 px-3 border-r border-zinc-200 dark:border-zinc-800 last:border-r-0 whitespace-nowrap bg-zinc-100 dark:bg-zinc-950">
                {head || '—'}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
          {#if filteredRows.length === 0}
            <tr>
              <td colspan={headers.length + 1} class="py-8 text-center text-zinc-400 italic">
                {searchQuery ? 'Tidak ada data yang cocok dengan pencarian' : 'Belum ada data baris (hanya header)'}
              </td>
            </tr>
          {:else}
            {#each filteredRows as row, rIdx}
              <tr class="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors">
                <td class="py-1.5 px-2.5 text-center text-[10px] text-zinc-400 border-r border-zinc-200 dark:border-zinc-800">
                  {rIdx + 2}
                </td>
                {#each headers as _, cIdx}
                  {@const val = row[cIdx] || ''}
                  <td class="py-1.5 px-3 border-r border-zinc-200 dark:border-zinc-800 last:border-r-0 max-w-[220px] truncate" title={val}>
                    {#if val.startsWith('http://') || val.startsWith('https://')}
                      <a
                        href={val}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-blue-600 dark:text-blue-400 hover:underline truncate block"
                      >
                        {val}
                      </a>
                    {:else}
                      <span class="text-zinc-900 dark:text-zinc-100">{val || '—'}</span>
                    {/if}
                  </td>
                {/each}
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    {/if}
  </div>

  <!-- Bottom status info -->
  <div class="p-2 border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-950/60 flex items-center justify-between text-[11px] font-mono-data text-zinc-400">
    <span>
      {rows.length} baris data dimuat
      {#if filteredRows.length !== rows.length}
        ({filteredRows.length} cocok)
      {/if}
    </span>
    {#if lastFetchedTime}
      <span>Terakhir update: {lastFetchedTime}</span>
    {/if}
  </div>
</div>
