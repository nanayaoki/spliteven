const MAX_INPUT_LENGTH = 500;
const MAX_PEOPLE = 1000;

function parseModelJson(text) {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  return JSON.parse(withoutFence);
}

function normalizeExpense(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Gemini returned an invalid expense object');
  }

  const amount = Number(value.amount);
  const people = Number(value.people);
  const description = typeof value.description === 'string'
    ? value.description.trim()
    : '';

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Gemini returned an invalid amount');
  }
  if (!Number.isInteger(people) || people < 1 || people > MAX_PEOPLE) {
    throw new Error('Gemini returned an invalid people count');
  }

  return {
    amount: Math.round(amount * 100) / 100,
    people,
    each: Math.round((amount / people) * 100) / 100,
    description: description || 'Expense',
  };
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return Response.json({ error: 'Please describe an expense.' }, { status: 400 });
  }
  if (text.length > MAX_INPUT_LENGTH) {
    return Response.json({ error: `Expense descriptions must be ${MAX_INPUT_LENGTH} characters or fewer.` }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not configured');
    return Response.json({ error: 'The AI service is not configured yet.' }, { status: 503 });
  }

  const prompt = `You extract one expense from a human sentence.

Return ONLY valid JSON with exactly these keys:
{
  "amount": number,
  "people": integer,
  "each": number,
  "description": string
}

Rules:
- amount is the total expense, in the currency and number as written.
- people is the total number of people sharing the expense, including "me" or the speaker.
- "N friends" means N friends plus the speaker, so "split with 2 friends" means 3 people.
- "just me" means 1 person.
- Count named people, including the speaker when "me" is present.
- each must equal amount divided by people.
- description is a short label such as "dinner", "cab", or "coffee".
- Never include markdown, explanations, or additional keys.

Human sentence: ${JSON.stringify(text)}`;

  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const upstream = await response.json().catch(() => null);
      const upstreamMessage = upstream?.error?.message || '';
      console.error('Gemini request failed', response.status, upstreamMessage);

      if (response.status === 401 || response.status === 403) {
        return Response.json({ error: 'The Gemini API key is invalid or not authorized.' }, { status: 502 });
      }
      if (response.status === 404) {
        return Response.json({ error: `The configured Gemini model "${model}" is unavailable. Update GEMINI_MODEL and restart the app.` }, { status: 502 });
      }
      if (response.status === 429 || response.status === 503) {
        return Response.json({ error: 'Gemini is temporarily busy. Please try again in a moment.' }, { status: 503 });
      }
      return Response.json({ error: 'The AI service could not parse that expense. Please try again.' }, { status: 502 });
    }

    const result = await response.json();
    const modelText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof modelText !== 'string' || !modelText.trim()) {
      throw new Error('Gemini returned no content');
    }

    return Response.json(normalizeExpense(parseModelJson(modelText)));
  } catch (error) {
    console.error('Expense parsing failed', error);
    return Response.json({ error: 'The AI returned an unusable expense. Please try rephrasing it.' }, { status: 502 });
  }
}
