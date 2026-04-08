const Ajv = require('ajv');
const ajv = new Ajv();

const schema = {
  type: 'object',
  required: ['question_text', 'options'],
  properties: {
    question_text: { type: 'string', minLength: 10 },
    explanation: { type: 'string' },
    options: {
      type: 'array',
      minItems: 2,
      maxItems: 6,
      items: {
        type: 'object',
        required: ['text', 'is_correct'],
        properties: {
          text: { type: 'string', minLength: 1 },
          is_correct: { type: 'boolean' }
        }
      }
    }
  }
};

const validate = ajv.compile(schema);

module.exports = (data) => {
  const valid = validate(data);

  if (!valid) {
    console.error('AI VALIDATION ERROR:', validate.errors);
    return false;
  }

  return true;
};