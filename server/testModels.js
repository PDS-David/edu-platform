require('dotenv').config();

const { GoogleGenerativeAI } =
  require('@google/generative-ai');

if (!process.env.GEMINI_API_KEY) {
  throw new Error('Missing GEMINI_API_KEY');
}

const genAI =
  new GoogleGenerativeAI(
    process.env.GEMINI_API_KEY
  );

async function testModel() {

  try {

    const model =
      genAI.getGenerativeModel({
        model: "gemini-2.0-flash"
      });

    const result =
      await model.generateContent(
        "Say hello in one sentence."
      );

    const text =
      result.response.text();

    console.log("✅ Model working:");
    console.log(text);

  } catch (err) {

    console.error(
      "❌ Model test failed:",
      err.message
    );

  }

}

testModel();