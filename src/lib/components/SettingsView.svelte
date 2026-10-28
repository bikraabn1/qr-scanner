<script lang="ts">
  import { appState } from '../store.svelte';
  import { pingGoogleSheets } from '../api';
  import { isValidColumnLetter, isValidUrl } from '../utils';
  import type { FieldDefinition, FieldType } from '../types';
  import {
    CheckCircle2,
    AlertTriangle,
    RefreshCw,
    Undo2,
    Trash2,
    Plus,
    Volume2,
    VolumeX,
    Sparkles,
    Check
  } from '@lucide/svelte';

  let scriptUrlInput = $state(appState.config.scriptUrl);
  let sheetNameInput = $state(appState.config.sheetName);
  let dummyModeToggle = $state(appState.config.dummyMode);
  let writeStrategyInput = $state(appState.config.writeStrategy);
  let soundEnabled = $state(appState.config.soundEnabled !== false);

  let pingStatus = $state<{
    loading: boolean;
    success?: boolean;
    latencyMs?: number;
    testedAt?: string;
    message?: string;
  }>({ loading: false });

  let saveIndicator = $state(false);
  let saveTimer: any = null;

  // New custom field form state
  let isAddDrawerOpen = $state(false);
  let newFieldLabel = $state('');
  let newFieldType = $state<FieldType>('text');
  let newFieldRequired = $state(false);
  let newFieldOptions = $state('');

  function triggerSavedBadge() {
    saveIndicator = true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveIndicator = false;
    }, 1500);
  }

  function handleSaveConfig() {
    appState.saveConfig({
      scriptUrl: scriptUrlInput.trim(),
      sheetName: sheetNameInput.trim() || 'Sheet1',
      dummyMode: dummyModeToggle,
      writeStrategy: writeStrategyInput,
      autoClearOnSubmit: true,
      soundEnabled
    });
    triggerSavedBadge();
  }

  async function handleTestConnection() {
    if (!isValidUrl(scriptUrlInput)) return;
    const start = performance.now();
    pingStatus = { loading: true };

    try {
      const res = await pingGoogleSheets(scriptUrlInput, sheetNameInput);
      const latency = Math.round(performance.now() - start);
      pingStatus = {
        loading: false,
        success: true,
        latencyMs: latency,
        testedAt: new Date().toLocaleTimeString(),
        message: res.message || 'Endpoint reachable'
      };
      handleSaveConfig();
    } catch (err: unknown) {
      pingStatus = {
        loading: false,
        success: false,
        testedAt: new Date().toLocaleTimeString(),
        message: err instanceof Error ? err.message : 'Connection failed'
      };
    }
  }

  function handleColumnChange(fieldId: string, col: string) {
    const cleaned = col.trim().toUpperCase();
    const existing = [...appState.mappings];
    const idx = existing.findIndex((m) => m.fieldId === fieldId);
    if (idx >= 0) {
      existing[idx].columnLetter = cleaned;
    } else {
      existing.push({ fieldId, columnLetter: cleaned });
    }
    appState.saveMappings(existing);
    triggerSavedBadge();
  }

  function getColumnForField(fieldId: string): string {
    return appState.mappings.find((m) => m.fieldId === fieldId)?.columnLetter || '';
  }

  let duplicateColumns = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const m of appState.mappings) {
      const col = m.columnLetter.trim().toUpperCase();
      if (col) {
        counts.set(col, (counts.get(col) || 0) + 1);
      }
    }
    const dups = new Set<string>();
    for (const [col, count] of counts.entries()) {
      if (count > 1) dups.add(col);
    }
    return dups;
  });

  const PREVIEW_COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

  let columnToFieldMap = $derived.by(() => {
    const map = new Map<string, { label: string; enabled: boolean }[]>();
    for (const m of appState.mappings) {
      const col = m.columnLetter.trim().toUpperCase();
      if (!col) continue;
      const f = appState.fields.find((field) => field.id === m.fieldId);
      if (f) {
        const list = map.get(col) || [];
        list.push({ label: f.label, enabled: f.enabled });
        map.set(col, list);
      }
    }
    return map;
  });

  function handleAddField() {
    if (!newFieldLabel.trim()) return;

    const slug = 'custom_' + newFieldLabel.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    const options = newFieldType === 'select'
      ? newFieldOptions.split(',').map((o) => o.trim()).filter(Boolean)
      : undefined;

    const newField: FieldDefinition = {
      id: slug + '_' + Date.now().toString(36),
      label: newFieldLabel.trim(),
      type: newFieldType,
      required: newFieldRequired,
      options,
      enabled: true,
      isBuiltIn: false
    };

    appState.saveFields([...appState.fields, newField]);
    triggerSavedBadge();

    newFieldLabel = '';
    newFieldType = 'text';
    newFieldRequired = false;
    newFieldOptions = '';
    isAddDrawerOpen = false;
  }

  function handleRemoveField(fieldId: string) {
    appState.saveFields(appState.fields.filter((f) => f.id !== fieldId));
    appState.saveMappings(appState.mappings.filter((m) => m.fieldId !== fieldId));
    triggerSavedBadge();
  }

  function toggleFieldEnabled(fieldId: string) {
    appState.saveFields(
      appState.fields.map((f) => (f.id === fieldId ? { ...f, enabled: !f.enabled } : f))
    );
    triggerSavedBadge();
  }
</script>

<div class="max-w-[1240px] mx-auto px-4 sm:px-6 py-6 space-y-6">
  <!-- Top bar of Config view: Title + Autosave feedback indicator -->
  <div class="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
    <div>
      <h1 class="text-sm font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">Instrument Configuration</h1>
      <p class="text-xs text-zinc-500 dark:text-zinc-400">Settings and destination worksheet mappings</p>
    </div>

    <!-- Autosave indicator -->
    <div class="flex items-center gap-2">
      {#if saveIndicator}
        <span class="inline-flex items-center gap-1 text-[11px] font-mono-data text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-sm">
          <Check class="w-3 h-3" /> Saved
        </span>
      {:else}
        <span class="text-[11px] font-mono-data text-zinc-400">Autosaved</span>
      {/if}
    </div>
  </div>

  <!-- 1. Google Sheets Integration & Dummy Switch -->
  <div class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 shadow-2xs space-y-5 transition-colors">
    <div class="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
      <div>
        <h2 class="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">Google Sheets Integration</h2>
        <p class="text-[11px] text-zinc-500 dark:text-zinc-400">Configure Web App URL and destination worksheet</p>
      </div>
    </div>

    <!-- Dummy Mode Switch -->
    <div class="p-3.5 rounded-md border {dummyModeToggle ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40' : 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40'} flex items-start justify-between gap-4">
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold text-zinc-900 dark:text-zinc-100">Operating Mode</span>
          <span class="text-[11px] font-mono-data font-semibold {dummyModeToggle ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}">
            {dummyModeToggle ? 'DUMMY MODE (SIMULATED)' : 'LIVE MODE (GOOGLE SHEETS)'}
          </span>
        </div>
        <p class="text-xs text-zinc-600 dark:text-zinc-400">
          {#if dummyModeToggle}
            Records are stored locally only in browser storage. No network requests are made to Google Sheets.
          {:else}
            Records are written directly to Google Sheets worksheet: <strong class="text-zinc-900 dark:text-zinc-100 font-mono-data">{sheetNameInput.trim() || 'Sheet1'}</strong>.
          {/if}
        </p>
      </div>

      <!-- Real Switch -->
      <label class="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
        <input
          type="checkbox"
          bind:checked={dummyModeToggle}
          onchange={handleSaveConfig}
          class="sr-only peer"
        />
        <div class="w-11 h-6 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
      </label>
    </div>

    <!-- Script URL & Sheet Tab Settings -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="space-y-1.5 md:col-span-2">
        <label for="script-url" class="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          Google Apps Script Web App URL
        </label>
        <input
          id="script-url"
          type="url"
          bind:value={scriptUrlInput}
          onblur={handleSaveConfig}
          placeholder="https://script.google.com/macros/s/.../exec"
          class="w-full font-mono-data text-xs py-2 px-3 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
        />
        <p class="text-[11px] text-zinc-500">Deploy as Web App with "Execute as: Me" and "Who has access: Anyone".</p>
      </div>

      <div class="space-y-1.5">
        <label for="sheet-name" class="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          Worksheet / Tab Name
        </label>
        <input
          id="sheet-name"
          type="text"
          bind:value={sheetNameInput}
          onblur={handleSaveConfig}
          placeholder="Sheet1"
          class="w-full font-mono-data text-xs py-2 px-3 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
        />
      </div>
    </div>

    <!-- Secondary options: Sound beep & Write strategy -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
      <div class="space-y-1.5">
        <label for="write-strategy" class="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          Write Strategy
        </label>
        <select
          id="write-strategy"
          bind:value={writeStrategyInput}
          onchange={handleSaveConfig}
          class="w-full text-xs py-2 px-3 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
        >
          <option value="append">Append (Add new row per scan)</option>
          <option value="update">Update (Match unique key)</option>
        </select>
      </div>

      <div class="space-y-1.5">
        <span class="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          Scan Sound Feedback
        </span>
        <label class="flex items-center gap-2 py-2 text-xs text-zinc-800 dark:text-zinc-200 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={soundEnabled}
            onchange={handleSaveConfig}
            class="rounded-sm border-zinc-300 text-zinc-900"
          />
          {#if soundEnabled}
            <Volume2 class="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
            <span>Short audio beep on successful QR scan</span>
          {:else}
            <VolumeX class="w-3.5 h-3.5 text-zinc-400" />
            <span class="text-zinc-400">Audio disabled (silent scans)</span>
          {/if}
        </label>
      </div>
    </div>

    <!-- Test Connection & Inline Results -->
    <div class="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        {#if !isValidUrl(scriptUrlInput)}
          <span class="text-[11px] text-zinc-500 font-mono-data">
            Enter a valid Apps Script Web App URL to test connection
          </span>
        {:else if pingStatus.loading}
          <div class="text-xs text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5 font-mono-data">
            <RefreshCw class="w-3.5 h-3.5 animate-spin" />
            Pinging Google Apps Script endpoint...
          </div>
        {:else if pingStatus.success !== undefined}
          <div class="text-xs flex items-center gap-1.5 font-mono-data {pingStatus.success ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}">
            {#if pingStatus.success}
              <CheckCircle2 class="w-3.5 h-3.5 shrink-0" />
            {:else}
              <AlertTriangle class="w-3.5 h-3.5 shrink-0" />
            {/if}
            <span>{pingStatus.message}</span>
            {#if pingStatus.latencyMs !== undefined}
              <span class="text-zinc-500">({pingStatus.latencyMs}ms)</span>
            {/if}
            {#if pingStatus.testedAt}
              <span class="text-zinc-400">• tested at {pingStatus.testedAt}</span>
            {/if}
          </div>
        {:else}
          <span class="text-[11px] text-zinc-500 font-mono-data">
            Ready to test reachability
          </span>
        {/if}
      </div>

      <button
        type="button"
        disabled={pingStatus.loading || !isValidUrl(scriptUrlInput)}
        class="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        onclick={handleTestConnection}
      >
        <RefreshCw class="w-3.5 h-3.5 {pingStatus.loading ? 'animate-spin' : ''}" />
        Test Connection
      </button>
    </div>
  </div>

  <!-- 2. Column Mapping & Sheet Preview Strip -->
  <div class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 shadow-2xs space-y-4 transition-colors">
    <div class="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
      <div>
        <h2 class="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
          Spreadsheet Column Mapping
        </h2>
        <p class="text-[11px] text-zinc-500 dark:text-zinc-400">Destination columns A–Z in Google Sheets</p>
      </div>

      {#if duplicateColumns.size > 0}
        <div class="flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-500/10 dark:text-amber-400 px-2.5 py-0.5 rounded-sm border border-amber-500/30">
          <AlertTriangle class="w-3.5 h-3.5" />
          Duplicate column assigned: {[...duplicateColumns].join(', ')}
        </div>
      {/if}
    </div>

    <!-- Sheet Preview Strip: Columns A to L -->
    <div class="space-y-1.5">
      <div class="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Sheet Preview (Row 1 Header)</div>
      <div class="overflow-x-auto pb-1">
        <div class="inline-flex border border-zinc-200 dark:border-zinc-800 rounded-sm bg-zinc-50 dark:bg-zinc-950 divide-x divide-zinc-200 dark:divide-zinc-800 text-xs">
          {#each PREVIEW_COLUMNS as col}
            {@const mapped = columnToFieldMap.get(col)}
            <div class="w-24 min-w-[96px] p-2 flex flex-col justify-between">
              <span class="font-mono-data font-bold text-[11px] text-zinc-400">{col}</span>
              <div class="mt-1 h-7 flex items-center">
                {#if mapped && mapped.length > 0}
                  <div class="truncate text-[11px] font-medium {mapped.length > 1 ? 'text-amber-600 dark:text-amber-400' : mapped[0].enabled ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 line-through'}" title={mapped.map(m => m.label).join(', ')}>
                    {mapped.map(m => m.label).join(', ')}
                  </div>
                {:else}
                  <span class="text-zinc-300 dark:text-zinc-700 font-mono-data">—</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>

    <!-- Compact Table -->
    <div class="border border-zinc-200 dark:border-zinc-800 rounded-sm overflow-hidden">
      <table class="w-full text-xs text-left border-collapse">
        <thead class="bg-zinc-50 dark:bg-zinc-950/80 border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider font-mono-data">
          <tr>
            <th class="py-2 px-3 w-12 text-center">Active</th>
            <th class="py-2 px-3">Field Name</th>
            <th class="py-2 px-3 w-28">Type</th>
            <th class="py-2 px-3 w-28">Column</th>
            <th class="py-2 px-3 w-14 text-right"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800/80">
          {#each appState.fields as field}
            {@const currentCol = getColumnForField(field.id)}
            {@const isDup = duplicateColumns.has(currentCol)}
            {@const isInvalid = currentCol && !isValidColumnLetter(currentCol)}
            <tr class="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
              <!-- Real enable checkbox -->
              <td class="py-2 px-3 text-center">
                <input
                  type="checkbox"
                  checked={field.enabled}
                  onchange={() => toggleFieldEnabled(field.id)}
                  aria-label={`Enable ${field.label}`}
                  class="rounded-sm border-zinc-300 text-zinc-900"
                />
              </td>

              <!-- Field Name & ID -->
              <td class="py-2 px-3">
                <span class="font-medium text-zinc-900 dark:text-zinc-100 {field.enabled ? '' : 'text-zinc-400'}">
                  {field.label}
                </span>
                {#if field.required}
                  <span class="text-red-500 ml-0.5">*</span>
                {/if}
                <span class="ml-1.5 text-[10px] font-mono-data text-zinc-400">({field.id})</span>
              </td>

              <!-- Type as small plain label -->
              <td class="py-2 px-3 text-zinc-500 dark:text-zinc-400 font-mono-data text-[11px]">
                {field.type}
              </td>

              <!-- Column Input with inline validation -->
              <td class="py-2 px-3">
                <input
                  type="text"
                  maxlength="3"
                  value={currentCol}
                  placeholder="—"
                  oninput={(e) => handleColumnChange(field.id, (e.target as HTMLInputElement).value)}
                  aria-label={`Column letter for ${field.label}`}
                  class="w-14 text-center font-mono-data text-xs uppercase font-bold py-1 px-1.5 rounded-sm border {isDup ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400' : isInvalid ? 'border-red-500 bg-red-500/10 text-red-700 dark:text-red-400' : 'border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100'} focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                />
              </td>

              <!-- Delete (custom fields only) -->
              <td class="py-2 px-3 text-right">
                {#if !field.isBuiltIn}
                  <button
                    type="button"
                    class="p-1 text-zinc-400 hover:text-red-600 transition-colors"
                    title="Delete custom field"
                    onclick={() => handleRemoveField(field.id)}
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>

      <!-- Add Custom Field Inline Row / Drawer -->
      <div class="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/50 p-2.5">
        {#if !isAddDrawerOpen}
          <button
            type="button"
            class="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white px-2 py-1 rounded-sm transition-colors"
            onclick={() => isAddDrawerOpen = true}
          >
            <Plus class="w-3.5 h-3.5" />
            Add Custom Field...
          </button>
        {:else}
          <div class="space-y-3 p-1">
            <div class="text-xs font-semibold text-zinc-800 dark:text-zinc-200">New Custom Field</div>
            <div class="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <div class="sm:col-span-2">
                <input
                  type="text"
                  placeholder="Field label (e.g. Chapter, Grade)..."
                  bind:value={newFieldLabel}
                  class="w-full text-xs py-1.5 px-2.5 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div>
                <select
                  bind:value={newFieldType}
                  class="w-full text-xs py-1.5 px-2 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="url">URL</option>
                  <option value="select">Select</option>
                  <option value="boolean">Checkbox</option>
                </select>
              </div>

              <div class="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!newFieldLabel.trim()}
                  class="px-3 py-1.5 text-xs font-semibold rounded-sm bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 hover:bg-zinc-800 disabled:opacity-40"
                  onclick={handleAddField}
                >
                  Save Field
                </button>
                <button
                  type="button"
                  class="px-2.5 py-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  onclick={() => isAddDrawerOpen = false}
                >
                  Cancel
                </button>
              </div>
            </div>

            {#if newFieldType === 'select'}
              <div>
                <input
                  type="text"
                  placeholder="Options separated by comma (Option A, Option B)"
                  bind:value={newFieldOptions}
                  class="w-full text-xs py-1.5 px-2.5 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                />
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- 3. Developer Section (Visible in Dummy Mode only) -->
  {#if dummyModeToggle}
    <div class="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 space-y-2">
      <div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
        <Sparkles class="w-3.5 h-3.5 text-amber-500" />
        Developer Samples (Dummy Mode Only)
      </div>
      <p class="text-[11px] text-zinc-500">
        Quick QR destination URLs to verify parsers, audio cues, and sheet columns:
      </p>
      <div class="flex flex-wrap gap-2 pt-1 font-mono-data text-[11px]">
        <code class="px-2 py-0.5 rounded-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300">
          https://example.com/books/ch1/qr-01
        </code>
        <code class="px-2 py-0.5 rounded-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300">
          https://example.com/media/video-03.mp4
        </code>
        <code class="px-2 py-0.5 rounded-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300">
          https://books.publisher.org/quiz/ch-04
        </code>
      </div>
    </div>
  {/if}

  <!-- 4. Danger Zone / Reset -->
  <div class="flex items-center justify-between p-3.5 rounded-lg border border-red-500/20 bg-red-500/5 text-xs">
    <div>
      <div class="font-bold text-red-600 dark:text-red-400">Reset Configuration to Factory Defaults</div>
      <div class="text-zinc-500 dark:text-zinc-400 text-[11px]">Restore standard built-in fields and column mappings.</div>
    </div>
    <button
      type="button"
      class="inline-flex items-center gap-1 px-3 py-1.5 rounded-sm border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 font-semibold transition-colors"
      onclick={() => {
        if (confirm('Reset all field definitions and column mappings back to default?')) {
          appState.resetToDefaults();
          scriptUrlInput = appState.config.scriptUrl;
          sheetNameInput = appState.config.sheetName;
          triggerSavedBadge();
        }
      }}
    >
      <Undo2 class="w-3.5 h-3.5" />
      Reset Defaults
    </button>
  </div>
</div>
