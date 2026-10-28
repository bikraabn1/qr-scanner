<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Camera, CameraOff, Sparkles, CheckCircle2, Keyboard, ScanLine } from '@lucide/svelte';
  import { isValidUrl } from '../utils';

  let {
    qrContent = $bindable(),
    onScanSuccess = () => {}
  }: {
    qrContent: string;
    onScanSuccess?: (content: string) => void;
  } = $props();

  let isCameraActive = $state(false);
  let cameraError = $state<string | null>(null);
  let html5QrCodeInstance: any = null;
  let manualInputRef: HTMLInputElement | null = null;

  const DUMMY_SAMPLES = [
    { label: 'QR-1', url: 'https://example.com/books/ch1/qr-01' },
    { label: 'QR-2', url: 'https://example.com/books/ch2/qr-02' },
    { label: 'QR-3', url: 'https://example.com/books/media/video-03' },
    { label: 'QR-4', url: 'https://books.publisher.org/quiz/q-04' }
  ];

  async function toggleCamera() {
    if (isCameraActive) {
      await stopCamera();
    } else {
      await startCamera();
    }
  }

  async function startCamera() {
    cameraError = null;
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      html5QrCodeInstance = new Html5Qrcode('qr-reader-container');

      await html5QrCodeInstance.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 }
        },
        (decodedText: string) => {
          handleScannedContent(decodedText);
          stopCamera();
        },
        () => {}
      );
      isCameraActive = true;
    } catch (err: unknown) {
      isCameraActive = false;
      if (err instanceof Error) {
        cameraError = err.message || 'Camera permission denied or camera not supported';
      } else {
        cameraError = 'Failed to access camera';
      }
    }
  }

  async function stopCamera() {
    if (html5QrCodeInstance && isCameraActive) {
      try {
        await html5QrCodeInstance.stop();
        html5QrCodeInstance.clear();
      } catch (err) {
        console.warn('Error stopping camera:', err);
      }
    }
    isCameraActive = false;
  }

  function handleScannedContent(text: string) {
    qrContent = text.trim();
    onScanSuccess(qrContent);
  }

  function insertDummy(sampleUrl: string) {
    handleScannedContent(sampleUrl);
  }

  onDestroy(() => {
    if (isCameraActive) {
      stopCamera();
    }
  });

  let isUrl = $derived(isValidUrl(qrContent));
</script>

<div class="bg-white dark:bg-zinc-900/90 border border-zinc-200/90 dark:border-zinc-800/90 rounded-xl p-5 shadow-xs space-y-4 transition-colors">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2.5">
      <div class="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700/60">
        <ScanLine class="w-4 h-4" />
      </div>
      <div>
        <h3 class="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">QR Code Capture</h3>
        <p class="text-[11px] text-zinc-500 dark:text-zinc-400">Scan via camera, USB barcode reader, or paste</p>
      </div>
    </div>

    <!-- Camera toggle button -->
    <button
      type="button"
      class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all active:scale-95 shadow-2xs {isCameraActive ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 hover:bg-red-500/20' : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700'}"
      onclick={toggleCamera}
    >
      {#if isCameraActive}
        <CameraOff class="w-3.5 h-3.5" />
        Close Camera
      {:else}
        <Camera class="w-3.5 h-3.5" />
        Open Camera
      {/if}
    </button>
  </div>

  <!-- Camera Container -->
  {#if isCameraActive}
    <div class="relative overflow-hidden rounded-xl border border-zinc-300 dark:border-zinc-700 bg-black min-h-[260px] flex items-center justify-center">
      <div id="qr-reader-container" class="w-full max-w-sm"></div>
    </div>
  {/if}

  {#if cameraError}
    <div class="flex items-center gap-2 p-3 rounded-lg border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-medium">
      <span>{cameraError}</span>
    </div>
  {/if}

  <!-- Manual & Barcode Scanner Input Field -->
  <div class="space-y-1.5">
    <div class="flex items-center justify-between text-xs">
      <label for="qr-content-input" class="font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
        Target URL / QR Content
      </label>
      {#if qrContent}
        {#if isUrl}
          <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            <CheckCircle2 class="w-3 h-3" /> Valid Web URL
          </span>
        {:else}
          <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
            Text / Local Schema
          </span>
        {/if}
      {/if}
    </div>

    <div class="relative">
      <input
        id="qr-content-input"
        type="text"
        bind:this={manualInputRef}
        bind:value={qrContent}
        placeholder="Scan QR with camera or paste URL here..."
        class="w-full font-mono-data text-xs sm:text-sm py-2.5 px-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 transition-all shadow-inner"
      />
    </div>
  </div>

  <!-- Dummy URL quick fill helper -->
  <div class="pt-1 flex flex-wrap items-center gap-1.5">
    <span class="text-[11px] font-medium text-zinc-400 flex items-center gap-1">
      <Sparkles class="w-3 h-3 text-amber-500" />
      Quick Dummy Samples:
    </span>
    {#each DUMMY_SAMPLES as sample, idx}
      <button
        type="button"
        class="text-[11px] font-medium px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 transition-colors font-mono-data"
        onclick={() => insertDummy(sample.url)}
      >
        {sample.label}
      </button>
    {/each}
  </div>
</div>
