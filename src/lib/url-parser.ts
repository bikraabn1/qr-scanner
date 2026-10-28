export interface ParsedDestination {
  isUrl: boolean;
  domain: string;
  path: string;
  category: 'youtube' | 'video' | 'audio' | 'image' | 'quiz' | 'document' | 'link';
  raw: string;
  youtubeId?: string;
  mediaSrc?: string;
}

export function parseYouTubeId(urlStr: string): string | undefined {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.replace('www.', '');

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (url.pathname === '/watch') {
        return url.searchParams.get('v') || undefined;
      }
      if (url.pathname.startsWith('/shorts/')) {
        return url.pathname.split('/')[2];
      }
      if (url.pathname.startsWith('/embed/')) {
        return url.pathname.split('/')[2];
      }
    } else if (host === 'youtu.be') {
      return url.pathname.slice(1).split('?')[0];
    }
  } catch {
    // not a valid URL
  }
  return undefined;
}

export function parseDestination(raw: string): ParsedDestination {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { isUrl: false, domain: '', path: '', category: 'link', raw: '' };
  }

  try {
    const url = new URL(trimmed);
    const domain = url.hostname;
    const path = url.pathname + url.search + url.hash;
    const lower = trimmed.toLowerCase();

    // 1. YouTube
    const ytId = parseYouTubeId(trimmed);
    if (ytId) {
      return {
        isUrl: true,
        domain,
        path: path === '/' ? '' : path,
        category: 'youtube',
        raw: trimmed,
        youtubeId: ytId
      };
    }

    // 2. Direct Video (mp4, webm, ogg video)
    if (url.pathname.match(/\.(mp4|webm|ogv)$/i) || /\b(vimeo|dailymotion)\b/i.test(domain)) {
      return {
        isUrl: true,
        domain,
        path: path === '/' ? '' : path,
        category: 'video',
        raw: trimmed,
        mediaSrc: trimmed
      };
    }

    // 3. Audio (mp3, wav, ogg, podcast)
    if (url.pathname.match(/\.(mp3|wav|ogg|aac|m4a)$/i) || /\b(podcast|soundcloud|spotify)\b/i.test(domain)) {
      return {
        isUrl: true,
        domain,
        path: path === '/' ? '' : path,
        category: 'audio',
        raw: trimmed,
        mediaSrc: trimmed
      };
    }

    // 4. Image
    if (url.pathname.match(/\.(png|jpe?g|gif|webp|svg)$/i)) {
      return {
        isUrl: true,
        domain,
        path: path === '/' ? '' : path,
        category: 'image',
        raw: trimmed,
        mediaSrc: trimmed
      };
    }

    // 5. Quiz / Exams
    if (/\/(quiz|exams?|assessment)\//i.test(trimmed) || trimmed.includes('/quiz') || trimmed.includes('/soal')) {
      return {
        isUrl: true,
        domain,
        path: path === '/' ? '' : path,
        category: 'quiz',
        raw: trimmed
      };
    }

    // 6. Documents
    if (url.pathname.endsWith('.pdf') || trimmed.includes('/docs/') || trimmed.includes('/document/')) {
      return {
        isUrl: true,
        domain,
        path: path === '/' ? '' : path,
        category: 'document',
        raw: trimmed
      };
    }

    return {
      isUrl: url.protocol === 'http:' || url.protocol === 'https:',
      domain,
      path: path === '/' ? '' : path,
      category: 'link',
      raw: trimmed
    };
  } catch {
    return {
      isUrl: false,
      domain: '',
      path: trimmed,
      category: 'link',
      raw: trimmed
    };
  }
}
