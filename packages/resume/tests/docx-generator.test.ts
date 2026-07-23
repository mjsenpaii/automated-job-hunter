import { describe, it, expect } from 'vitest';
import { generateDocx } from '../src/docx-generator';
import { ResumeDocument } from '../src/types';

describe('DOCX Generator', () => {
  it('should produce a valid docx Buffer starting with PK', async () => {
    const mockResume: ResumeDocument = {
      profileId: 'test-profile',
      sections: [
        {
          title: 'Header',
          type: 'header',
          items: [{
            name: 'John Doe',
            location: 'New York, NY',
            email: 'john@example.com',
            phone: '123-456-7890'
          }]
        }
      ]
    };

    const buffer = await generateDocx(mockResume);
    
    // Check if it is a Buffer
    expect(Buffer.isBuffer(buffer)).toBe(true);
    
    // DOCX files are ZIP files, so they should start with 'PK' magic bytes (0x50 0x4b)
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });
});
