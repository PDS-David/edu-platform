const db = require('../config/database');
const { generateAIQuestion } = require('./aiQuestionGenerator');

function shuffle(array) {
    return array.sort(() => Math.random() - 0.5);
}

async function getConceptsBySubtopic(subtopicId) {
    const res = await db.query(
        `SELECT id, name, difficulty_level
         FROM concepts
         WHERE subtopic_id = $1`,
        [subtopicId]
    );
    return res.rows;
}

async function generateQuestions({ subtopic_id, student_id, count }) {
    const client = await db.connect();

    try {
        const concepts = await getConceptsBySubtopic(subtopic_id);

        if (!concepts.length) {
            throw new Error('No concepts found for subtopic');
        }

        const shuffled = shuffle(concepts);

        const selectedConcepts = shuffled.slice(0, count);

        const results = [];

        for (const concept of selectedConcepts) {
            try {
                const question = await generateAIQuestion(
                    concept.id,
                    student_id
                );

                if (!question || !question.options) {
                    console.error('Invalid AI response:', question);
                    continue;
                }

                results.push(question);

            } catch (err) {
                console.error('AI generation failed:', err.message);
                continue;
            }
        }

        return results;

    } finally {
        client.release();
    }
}

module.exports = {
    generateQuestions
};