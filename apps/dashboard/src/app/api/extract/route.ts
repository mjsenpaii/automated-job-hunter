import { NextResponse } from 'next/server';
import { extractFromUrl } from '@job-app/ingestion';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const result = await extractFromUrl(body.url);
    if (!result.success) {
      if (result.error && (result.error.includes('allow') || result.error.includes('format'))) {
        return NextResponse.json(result, { status: 400 });
      }
      return NextResponse.json(result, { status: 422 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Extraction API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
