<script lang="ts">
  import { appState } from '../store.svelte';
  import { Moon, Sun, SlidersHorizontal, Terminal, ShieldAlert, CloudCheck } from '@lucide/svelte';

  let { currentView = $bindable() }: {
    currentView: 'testing' | 'settings';
  } = $props();
</script>

<header class="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 sticky top-0 z-30 transition-colors">
  <div class="max-w-[1240px] mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
    <!-- Brand / Instrument ID -->
    <div class="flex items-center gap-2 sm:gap-3 min-w-0">
      <div class="flex items-center gap-1.5 shrink-0">
        <span class="w-2 h-2 rounded-xs bg-zinc-900 dark:bg-zinc-100"></span>
        <span class="text-xs font-bold tracking-tight text-zinc-900 dark:text-zinc-100 font-mono-data">
          QR Book Tester
        </span>
      </div>

      <span class="text-zinc-300 dark:text-zinc-700 hidden sm:inline">|</span>

      <!-- Mode indicator with explicit text -->
      {#if appState.config.dummyMode}
        <span
          class="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-mono-data font-medium text-amber-700 dark:text-amber-400 bg-amber-500/10 px-1.5 sm:px-2 py-0.5 rounded-sm border border-amber-500/20 truncate"
          title="Dummy Mode active. Records are saved locally in the browser and will NOT write to Google Sheets."
        >
          <span class="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
          <span class="hidden sm:inline">Dummy Mode (Local Storage)</span>
          <span class="sm:hidden">Dummy</span>
        </span>
      {:else}
        <span
          class="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-mono-data font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-1.5 sm:px-2 py-0.5 rounded-sm border border-emerald-500/20 truncate"
          title="Live mode active. Records are written directly to Google Sheets ({appState.config.sheetName})."
        >
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
          <span class="hidden sm:inline">Live ({appState.config.sheetName})</span>
          <span class="sm:hidden">Live</span>
        </span>
      {/if}
    </div>

    <!-- Navigation & Theme Controls -->
    <div class="flex items-center gap-2">
      <nav class="flex items-center bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-md border border-zinc-200 dark:border-zinc-800" aria-label="Views">
        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-sm transition-colors {currentView === 'testing' ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100 shadow-2xs font-semibold' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'}"
          onclick={() => currentView = 'testing'}
        >
          <Terminal class="w-3.5 h-3.5" />
          Console
          <kbd class="hidden sm:inline-block text-[10px] opacity-40 font-mono-data">^1</kbd>
        </button>
        <button
          type="button"
          aria-label="Config & Mapping"
          class="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-sm transition-colors {currentView === 'settings' ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100 shadow-2xs font-semibold' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'}"
          onclick={() => currentView = 'settings'}
        >
          <SlidersHorizontal class="w-3.5 h-3.5" />
          Config
          <kbd class="hidden sm:inline-block text-[10px] opacity-40 font-mono-data">^2</kbd>
        </button>
      </nav>

      <!-- Theme Switcher -->
      <button
        type="button"
        class="p-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
        aria-label="Toggle dark/light theme"
        onclick={() => appState.toggleTheme()}
      >
        {#if appState.theme === 'dark'}
          <Sun class="w-3.5 h-3.5" />
        {:else}
          <Moon class="w-3.5 h-3.5" />
        {/if}
      </button>
    </div>
  </div>
</header>
