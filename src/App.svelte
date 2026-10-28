<script lang="ts">
  import { onMount } from 'svelte';
  import { appState } from './lib/store.svelte';
  import Header from './lib/components/Header.svelte';
  import PageTracker from './lib/components/PageTracker.svelte';
  import Workspace from './lib/components/Workspace.svelte';
  import HistoryTable from './lib/components/HistoryTable.svelte';
  import SettingsView from './lib/components/SettingsView.svelte';

  let currentView = $state<'testing' | 'settings'>('testing');

  onMount(() => {
    if (appState.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  });

  // Global keyboard shortcuts
  function handleGlobalKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === '1') {
      e.preventDefault();
      currentView = 'testing';
    } else if ((e.ctrlKey || e.metaKey) && e.key === '2') {
      e.preventDefault();
      currentView = 'settings';
    }
  }
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div class="min-h-screen bg-[var(--surface-page)] text-[var(--text-primary)] flex flex-col font-sans selection:bg-zinc-800 selection:text-white transition-colors duration-150">
  <!-- Top Navigation Header with Persistent Mode Indicator -->
  <Header bind:currentView />

  <!-- Main Container: Unified max-width across Console and Config (~1240px) -->
  <main class="flex-1 w-full max-w-[1240px] mx-auto px-4 sm:px-6 py-6 space-y-6">
    {#if currentView === 'testing'}
      <!-- Slim Session Bar: Page Stepper & Session Verdict Counts -->
      <PageTracker />

      <!-- Testing Workspace Grid: ~5/12 and 7/12 panes on desktop (>=1024px) -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <!-- Left: Continuous Verify Workspace -->
        <div class="lg:col-span-5">
          <Workspace />
        </div>

        <!-- Right: Dense Session Log -->
        <div class="lg:col-span-7">
          <HistoryTable />
        </div>
      </div>
    {:else}
      <!-- Settings & Column Mapping View -->
      <SettingsView />
    {/if}
  </main>

  <!-- Instrument Panel Minimal Footer -->
  <footer class="border-t border-zinc-200 dark:border-zinc-800/80 py-3 px-6 text-center text-[11px] font-mono-data text-zinc-400">
    QR-LOGBOOK &bull; Svelte 5 Runes &bull; Google Apps Script Integration
  </footer>
</div>
