// structuredResponse.js
import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

/**
 * Generates a JSON object that strictly follows the provided schema.
 * @param {object} options - The options for generating the structured response.
 * @param {string} options.query - Natural language request.
 * @param {object} options.schema - JSON Schema the answer must follow.
 * @param {string} [options.context=""] - Extra context to give the model.
 * @param {string} [options.model="gpt-5-mini"] - The model to use.
 * @param {number} [options.temperature=0.2] - The sampling temperature.
 * @param {string} [options.apiKey=process.env.OPENAI_API_KEY] - The OpenAI API key.
 * @returns {Promise<object>} Parsed JSON from the model.
 */
export async function generateStructuredResponse({
  query,
  schema,
  context = "",
  model = "gpt-4o-mini",
  temperature = 0.1,
  apiKey = process.env.OPENAI_API_KEY,
}) {
  if (!apiKey) throw new Error("Missing OpenAI API key");
  if (!query) throw new Error("query is required");
  if (!schema) throw new Error("schema is required");

  const openai = new OpenAI({ apiKey });

  const systemMsg = `
You are an AI assistant that must answer ONLY with valid JSON.

Query: ${query}
${context ? `Context: ${context}` : ""}
Required Response Schema:
${JSON.stringify(schema, null, 2)}

Rules:
1. Output MUST be valid JSON.
2. MUST follow the schema exactly (all required fields, correct types).
3. Do NOT include explanations, comments, or extra keys.
`;

  const completion = await openai.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: systemMsg }],
    temperature,
  });

  const content = completion.choices?.[0]?.message?.content;
  if (!content) throw new Error("Model returned no content");

  try {
    return JSON.parse(content);
  } catch (e) {
    throw new Error(`Model did not return valid JSON: ${e.message}\n${content}`);
  }
}

// Example usage:
// async function main() {
//   const schema = {
//     type: "object",
//     properties: {
//       name: { type: "string" },
//       age: { type: "number" },
//     },
//     required: ["name", "age"],
//   };

//   const response = await generateStructuredResponse({
//     query: "What is your name and age?",
//     schema,
//   });

//   console.log(response);  
// }

// main();

