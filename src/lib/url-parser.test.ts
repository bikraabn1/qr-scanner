import { describe, it, expect } from 'vitest';
import { parseDestination, parseYouTubeId } from './url-parser';

describe('parseDestination', () => {
  it('parses valid web URLs into domain and path', () => {
    const res = parseDestination('https://example.com/books/ch1/qr-01?lang=id');
    expect(res.isUrl).toBe(true);
    expect(res.domain).toBe('example.com');
    expect(res.path).toBe('/books/ch1/qr-01?lang=id');
    expect(res.category).toBe('link');
  });

  it('detects YouTube links and extracts video ID', () => {
    const yt1 = parseDestination('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(yt1.category).toBe('youtube');
    expect(yt1.youtubeId).toBe('dQw4w9WgXcQ');

    const yt2 = parseDestination('https://youtu.be/dQw4w9WgXcQ?t=10');
    expect(yt2.category).toBe('youtube');
    expect(yt2.youtubeId).toBe('dQw4w9WgXcQ');

    const yt3 = parseDestination('https://youtube.com/shorts/3jZ_hxb8Wbo');
    expect(yt3.category).toBe('youtube');
    expect(yt3.youtubeId).toBe('3jZ_hxb8Wbo');
  });

  it('detects video and audio categories', () => {
    const vid = parseDestination('https://example.com/media/video-03.mp4');
    expect(vid.category).toBe('video');
    expect(vid.mediaSrc).toBe('https://example.com/media/video-03.mp4');

    const aud = parseDestination('https://podcast.org/episode-1.mp3');
    expect(aud.category).toBe('audio');
    expect(aud.mediaSrc).toBe('https://podcast.org/episode-1.mp3');
  });

  it('detects image URLs', () => {
    const img = parseDestination('https://example.com/diagram.png');
    expect(img.category).toBe('image');
    expect(img.mediaSrc).toBe('https://example.com/diagram.png');
  });

  it('handles non-url raw text gracefully', () => {
    const text = parseDestination('SAMPLE-BOOK-ISBN-97812345');
    expect(text.isUrl).toBe(false);
    expect(text.domain).toBe('');
    expect(text.path).toBe('SAMPLE-BOOK-ISBN-97812345');
  });
});
