import { describe, it, expect } from 'bun:test';
import { htmlToText, slugify } from '../scrape-sources';

describe('htmlToText', () => {
  it('strips script and style tags', () => {
    const html = '<html><script>alert(1)</script><style>.x{}</style><p>Hello world</p></html>';
    expect(htmlToText(html)).toBe('Hello world');
  });

  it('decodes HTML entities', () => {
    const result = htmlToText('Lei n&deg; 15.040/2024');
    expect(result.length).toBeGreaterThan(0);
  });

  it('collapses excess whitespace', () => {
    const html = '<p>foo</p>   <p>bar</p>';
    expect(htmlToText(html)).not.toMatch(/\s{3,}/);
  });
});

describe('slugify', () => {
  it('converts URL to safe filename slug', () => {
    const slug = slugify('https://www.planalto.gov.br/ccivil_03/lei/L15040.htm');
    expect(slug).toMatch(/^[a-zA-Z0-9-]+$/);
    expect(slug.length).toBeGreaterThan(0);
  });
});
