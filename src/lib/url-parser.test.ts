import { describe, it, expect } from 'vitest';
import { parseDestination } from './url-parser';

describe('parseDestination', () => {
  it('parses valid web URLs into bold domain and muted path', () => {
    const res = parseDestination('https://example.com/books/ch1/qr-01?lang=id');
    expect(res.isUrl).toBe(true);
    expect(res.domain).toBe('example.com');
    expect(res.path).toBe('/books/ch1/qr-01?lang=id');
    expect(res.category).toBe('link');
  });

  it('detects video and audio categories', () => {
    const vid = parseDestination('https://example.com/media/video-03.mp4');
    expect(vid.category).toBe('video');

    const aud = parseDestination('https://podcast.org/episode-1.mp3');
    expect(aud.category).toBe('audio');
  });

  it('handles non-url raw text gracefully', () => {
    const text = parseDestination('SAMPLE-BOOK-ISBN-97812345');
    expect(text.isUrl).toBe(false);
    expect(text.domain).toBe('');
    expect(text.path).toBe('SAMPLE-BOOK-ISBN-97812345');
  });
});
