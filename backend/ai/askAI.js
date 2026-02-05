// AI is temporarily disabled (no OpenAI API billing).
// This function keeps the app working and returns a helpful explanation-style response.
// Later, when you enable API billing, you can replace this file with the real OpenAI version again.

export async function askAI(question, grade, subject) {
  const q = (question || "").trim();

  return `
AI explanations are temporarily unavailable (API billing not enabled).

Your question: "${q}"
Grade: ${grade || "N/A"}
Subject: ${subject || "N/A"}

Try this for now:
• Use the CAPS video link (if shown above).
• Break the question into keywords (topic + what is being asked).
• If it's a definition, write: "Definition + example".
• If it's a calculation, write: "Given → Steps → Answer".

(You can re-enable live AI later by plugging in an API key with billing.)
  `.trim();
}

