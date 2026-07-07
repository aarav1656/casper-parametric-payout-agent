import OpenAI from "openai";

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

export async function analyzeReading(
  reading: number,
  threshold: number,
  unit: string
): Promise<{
  thresholdCrossed: boolean;
  explanation: string;
}> {
  const prompt = `You are an insurance claim analyst. A sensor reading came in for a flood risk policy.

Sensor Reading: ${reading} ${unit}
Threshold: ${threshold} ${unit}
Current Status: ${reading >= threshold ? "ABOVE" : "BELOW"} threshold

Analyze whether the reading crosses the policy threshold and provide a brief (1-2 sentence) explanation of the decision.
Format your response as JSON with keys: {"thresholdCrossed": boolean, "explanation": "string"}`;

  const message = await openrouter.chat.completions.create({
    model: "anthropic/claude-haiku-4-5-20241001",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0,
  });

  const content = message.choices[0].message.content;
  if (!content) {
    throw new Error("Empty response from AI");
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse AI response as JSON");
  }

  const result = JSON.parse(jsonMatch[0]);
  return {
    thresholdCrossed: result.thresholdCrossed,
    explanation: result.explanation,
  };
}
