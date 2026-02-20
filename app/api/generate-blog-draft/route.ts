import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `You are a blog writer for Touchless Car Wash Finder, the leading directory of touchless car washes in the United States. Write engaging, informative blog posts that help car owners understand touchless car washing and find the best options for their vehicle.

Guidelines:
- Write in Markdown format
- Start with a single H1 title on the first line (# Title)
- Use H2 (##) for main sections and H3 (###) for subsections
- Write naturally for humans first, but weave in the provided target keywords where they fit naturally
- Include a compelling introduction that hooks the reader
- Include practical, actionable information
- End with a brief conclusion that encourages the reader to browse our directory
- Do NOT use generic filler content — every paragraph should provide real value
- Do NOT use the words "comprehensive" or "landscape"
- Use short paragraphs (2-3 sentences max) for readability`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Anthropic API key not configured.' }, { status: 500 });
  }

  const body = await req.json();
  const { topic, keywords, tone, length } = body;

  const wordCountMap: Record<string, string> = {
    short: '~500 words',
    medium: '~1000 words',
    long: '~1500 words',
  };

  const userMessage = `Write a blog post with the following specifications:

Topic: ${topic}
Target keywords to weave in naturally: ${keywords || 'none specified'}
Tone: ${tone || 'Informative'}
Target length: ${wordCountMap[length] || '~1000 words'}

Remember to start with "# Title Here" on the very first line, then write the full post body below it.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return NextResponse.json({ error: `API error: ${err}` }, { status: response.status });
  }

  const data = await response.json();
  const text: string = data?.content?.[0]?.text ?? '';

  return NextResponse.json({ text });
}
