<script lang="ts">
  import type { ParsedDestination } from '../url-parser';
  import {
    Video,
    Volume2,
    Globe,
    HelpCircle,
    FileText,
    ExternalLink,
    Play,
    Image as ImageIcon,
    ChevronDown,
    ChevronUp
  } from '@lucide/svelte';

  let { parsed }: { parsed: ParsedDestination } = $props();

  let isPlayerExpanded = $state(true);
</script>

<div class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/60 overflow-hidden my-1">
  <!-- Header row: Type icon + Domain + Actions -->
  <div class="p-3.5 flex items-start justify-between gap-3">
    <div class="flex items-start gap-2.5 min-w-0">
      <div class="p-1.5 rounded-sm bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 shrink-0 mt-0.5">
        {#if parsed.category === 'youtube'}
          <Play class="w-4 h-4 text-red-500 fill-current" />
        {:else if parsed.category === 'video'}
          <Video class="w-4 h-4 text-blue-500" />
        {:else if parsed.category === 'audio'}
          <Volume2 class="w-4 h-4 text-amber-500" />
        {:else if parsed.category === 'image'}
          <ImageIcon class="w-4 h-4 text-emerald-500" />
        {:else if parsed.category === 'quiz'}
          <HelpCircle class="w-4 h-4 text-purple-500" />
        {:else if parsed.category === 'document'}
          <FileText class="w-4 h-4 text-zinc-500" />
        {:else}
          <Globe class="w-4 h-4 text-zinc-500" />
        {/if}
      </div>

      <div class="min-w-0">
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

        <div class="flex items-center gap-2 mt-1 text-[11px] text-zinc-500">
          <span class="capitalize font-semibold text-zinc-700 dark:text-zinc-300">
            {parsed.category === 'youtube' ? 'YouTube Video' : `${parsed.category} destination`}
          </span>
          {#if parsed.isUrl}
            <span>&bull;</span>
            <a
              href={parsed.raw}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 text-zinc-700 dark:text-zinc-300 hover:underline"
            >
              Open Link <ExternalLink class="w-3 h-3" />
            </a>
          {/if}
        </div>
      </div>
    </div>

    <!-- Toggle Collapse for media players -->
    {#if parsed.category === 'youtube' || parsed.category === 'video' || parsed.category === 'audio' || parsed.category === 'image'}
      <button
        type="button"
        class="p-1 rounded-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors"
        onclick={() => isPlayerExpanded = !isPlayerExpanded}
        title={isPlayerExpanded ? 'Hide media preview' : 'Show media preview'}
      >
        {#if isPlayerExpanded}
          <ChevronUp class="w-4 h-4" />
        {:else}
          <ChevronDown class="w-4 h-4" />
        {/if}
      </button>
    {/if}
  </div>

  <!-- Interactive Embedded Player / Preview Section -->
  {#if isPlayerExpanded}
    {#if parsed.category === 'youtube' && parsed.youtubeId}
      <div class="border-t border-zinc-200 dark:border-zinc-800 bg-black/90 p-2">
        <div class="relative w-full aspect-video rounded-sm overflow-hidden bg-black">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${parsed.youtubeId}?autoplay=0&rel=0`}
            title="YouTube Preview"
            class="absolute inset-0 w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
          ></iframe>
        </div>
      </div>
    {:else if parsed.category === 'video' && parsed.mediaSrc}
      <div class="border-t border-zinc-200 dark:border-zinc-800 bg-black p-2">
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
          src={parsed.mediaSrc}
          controls
          class="w-full max-h-56 rounded-sm bg-black object-contain mx-auto"
        ></video>
      </div>
    {:else if parsed.category === 'audio' && parsed.mediaSrc}
      <div class="border-t border-zinc-200 dark:border-zinc-800 p-2.5 bg-zinc-100/50 dark:bg-zinc-900/50">
        <audio
          src={parsed.mediaSrc}
          controls
          class="w-full h-9"
        ></audio>
      </div>
    {:else if parsed.category === 'image' && parsed.mediaSrc}
      <div class="border-t border-zinc-200 dark:border-zinc-800 p-2 bg-zinc-100 dark:bg-zinc-950 flex justify-center">
        <img
          src={parsed.mediaSrc}
          alt="QR Preview"
          class="max-h-52 rounded-sm object-contain border border-zinc-200 dark:border-zinc-800"
        />
      </div>
    {/if}
  {/if}
</div>
