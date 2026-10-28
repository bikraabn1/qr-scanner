export interface ParsedDestination {
  isUrl: boolean;
  domain: string;
  path: string;
  category: 'video' | 'audio' | 'quiz' | 'document' | 'link';
  raw: string;
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
    let category: ParsedDestination['category'] = 'link';

    if (/\b(video|youtube|vimeo)\b/i.test(trimmed) || trimmed.endsWith('.mp4')) {
      category = 'video';
    } else if (/\b(audio|podcast|soundcloud)\b/i.test(trimmed) || trimmed.endsWith('.mp3')) {
      category = 'audio';
    } else if (/\/(quiz|exams?|assessment)\//i.test(trimmed) || trimmed.includes('/quiz') || trimmed.includes('/soal')) {
      category = 'quiz';
    } else if (trimmed.endsWith('.pdf') || trimmed.includes('/docs/') || trimmed.includes('/document/')) {
      category = 'document';
    }

    return {
      isUrl: url.protocol === 'http:' || url.protocol === 'https:',
      domain,
      path: path === '/' ? '' : path,
      category,
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
