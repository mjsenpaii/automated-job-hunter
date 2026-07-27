import { describe, expect, it } from 'vitest';
import { AnalyzeJobRequestSchema } from '../src/gemini-contracts.js';
import { cleanJobContent, detectJobInputKind } from '../src/content-cleaner.js';

describe('job content cleaner', () => {
  it('cleans copied OnlineJobs.ph webpage text while keeping job facts', () => {
    const copied = `
Home
Log In
Sign Up
OnlineJobs.ph
Backend TypeScript Developer
Northstar Labs
Full-time · 40 hours per week
Work from home
We need a TypeScript developer with PostgreSQL experience.
HOW TO APPLY
Include the keyword NORTHSTAR in your subject line.
Facebook
Privacy Policy
Copyright 2026 OnlineJobs.ph
`;

    const cleaned = cleanJobContent(copied);
    expect(cleaned).toContain('Backend TypeScript Developer');
    expect(cleaned).toContain('NORTHSTAR');
    expect(cleaned).not.toMatch(/^Log In$/m);
    expect(cleaned).not.toMatch(/^Privacy Policy$/m);
    expect(cleaned).not.toMatch(/^Facebook$/m);
  });

  it('turns raw Supabase-style HTML into readable structured text', () => {
    const html = `
      <html><head><style>.red{color:red}</style></head>
      <body>
        <nav>Product Careers Log in</nav>
        <main>
          <h1>Backend Engineer, Auth</h1>
          <p>Fully Remote. We hire globally.</p>
          <h2>Requirements</h2>
          <ul>
            <li>Required: 4+ years writing production Go.</li>
            <li>2+ years building authentication systems.</li>
            <li>TypeScript, Postgres/MySQL, OAuth/OIDC/SAML.</li>
            <li>Kubernetes and AWS.</li>
          </ul>
          <a href="https://supabase.com/careers/backend-auth/apply">Apply now</a>
        </main>
        <footer>© 2026 Supabase · Privacy Policy</footer>
      </body></html>`;

    const cleaned = cleanJobContent(html);
    expect(cleaned).toContain('Backend Engineer, Auth');
    expect(cleaned).toContain('- Required: 4+ years writing production Go.');
    expect(cleaned).toContain('We hire globally');
    expect(cleaned).toContain('https://supabase.com/careers/backend-auth/apply');
    expect(cleaned).not.toContain('<h2>');
    expect(cleaned).not.toContain('color:red');
    expect(cleaned).not.toContain('Product Careers Log in');
  });

  it('removes navigation/footer/social noise without deleting meaningful content', () => {
    const cleaned = cleanJobContent(`
Menu
Search
Senior Product Engineer
Build accessible workflow software.
Terms of Service
Instagram
All rights reserved.
`);
    expect(cleaned).toBe(
      'Senior Product Engineer\nBuild accessible workflow software.',
    );
  });

  it('detects URL, HTML, and plain-text inputs', () => {
    expect(detectJobInputKind('https://example.com/jobs/123')).toBe('url');
    expect(detectJobInputKind('<h1>Engineer</h1>')).toBe('html');
    expect(detectJobInputKind('Engineer at Acme')).toBe('text');
    expect(AnalyzeJobRequestSchema.safeParse({ input: 'https://x.co/j' }).success).toBe(true);
  });
});
