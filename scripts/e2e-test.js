#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

/**
 * End-to-end test that walks through the 15 admin/teacher/student steps
 * documented in attached_assets/Pasted-ADMIN-One-Time-Setup-Step-1-...txt
 *
 * Usage:
 *   node scripts/e2e-test.js              # run full suite (default)
 *   API=http://localhost:5000 node scripts/e2e-test.js
 */

const API = process.env.API || 'http://localhost:5000';
const STAMP = Date.now();

const colors = {
  reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m',
};
const c = (col, s) => `${colors[col]}${s}${colors.reset}`;

let pass = 0, fail = 0;
const results = [];

async function req(method, path, { token, body, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

function step(label, ok, info = '') {
  if (ok) { pass++; console.log(c('green', `  ✓ ${label}`) + (info ? c('dim', `  ${info}`) : '')); }
  else    { fail++; console.log(c('red',   `  ✗ ${label}`) + (info ? `  ${info}` : '')); }
  results.push({ label, ok, info });
}

function head(s) { console.log('\n' + c('cyan', '━━ ' + s + ' ━━')); }

(async () => {
  console.log(c('cyan', `\nE2E Walkthrough against ${API}\n`));

  // ───── login admin & teacher ─────
  head('Login known accounts');
  const adminLogin = await req('POST', '/api/auth/login', {
    body: { email: 'admin@aischoolonair.com', password: 'Admin1234' },
  });
  step('Admin login', adminLogin.ok && adminLogin.data?.token, JSON.stringify(adminLogin.data).slice(0, 200));
  const adminToken = adminLogin.data?.token;

  const teacherLogin = await req('POST', '/api/auth/login', {
    body: { email: 'teacher1@test.com', password: 'Admin1234' },
  });
  step('Teacher login', teacherLogin.ok && teacherLogin.data?.token);
  const teacherToken = teacherLogin.data?.token;
  const teacherId = teacherLogin.data?.user?.id;

  if (!adminToken || !teacherToken) {
    console.log(c('red', '\nCannot continue without admin+teacher tokens.'));
    process.exit(1);
  }

  // ───── STEP 1: Create Exam Type ─────
  head('Step 1: Create Exam Type (admin)');
  const examTypeName = `JAMB-E2E-${STAMP}`;
  const examTypeCode = `JE${STAMP.toString().slice(-6)}`;
  const createType = await req('POST', '/api/catalog/types', {
    token: adminToken,
    body: { name: examTypeName, code: examTypeCode, emoji: '📋' },
  });
  step('Create exam type', createType.ok, `status=${createType.status} ${JSON.stringify(createType.data).slice(0, 200)}`);
  const examTypeId = createType.data?.data?.id || createType.data?.id;

  // ───── STEP 2: Add Subject ─────
  head('Step 2: Add Subjects under exam type (admin)');
  const subjName = `Biology-E2E-${STAMP}`;
  const subjCode = `BIO${STAMP.toString().slice(-6)}`;
  const createSubj = await req('POST', `/api/catalog/types/${examTypeId}/subjects`, {
    token: adminToken,
    body: { name: subjName, code: subjCode, emoji: '🧬' },
  });
  step('Create subject', createSubj.ok, `status=${createSubj.status} ${JSON.stringify(createSubj.data).slice(0, 200)}`);
  const subjectId = createSubj.data?.data?.id || createSubj.data?.id;

  // ───── STEP 4: Assign teacher to subject ─────
  head('Step 4: Assign teacher to subject (admin)');
  const assign = await req('POST', `/api/catalog/teachers/${teacherId}/assign`, {
    token: adminToken,
    body: { subject_ids: [subjectId] },
  });
  step('Assign teacher → subject', assign.ok, `status=${assign.status} ${JSON.stringify(assign.data).slice(0, 200)}`);

  // ───── STEP 5: Add Topic (teacher) ─────
  head('Step 5: Teacher adds topic');
  const createTopic = await req('POST', '/api/teacher/topics', {
    token: teacherToken,
    body: { subject_id: subjectId, name: 'Cell Biology', description: 'E2E topic' },
  });
  step('Create topic via /api/teacher/topics', createTopic.ok, `status=${createTopic.status} ${JSON.stringify(createTopic.data).slice(0, 200)}`);
  const topicId = createTopic.data?.data?.id || createTopic.data?.id;

  // ───── STEP 6: Add Subtopic ─────
  head('Step 6: Teacher adds subtopic');
  const createSubtopic = await req('POST', '/api/teacher/subtopics', {
    token: teacherToken,
    body: { topic_id: topicId, name: 'Cell Structure', description: 'E2E subtopic' },
  });
  step('Create subtopic via /api/teacher/subtopics', createSubtopic.ok, `status=${createSubtopic.status} ${JSON.stringify(createSubtopic.data).slice(0, 200)}`);
  const subtopicId = createSubtopic.data?.data?.id || createSubtopic.data?.id;

  // ───── STEP 7: Upload Resource ─────
  head('Step 7: Teacher uploads resource (single, multipart)');
  const fd = new FormData();
  const fakeFile = new Blob(['Hello E2E PDF content'], { type: 'application/pdf' });
  fd.append('file', fakeFile, `e2e-${STAMP}.pdf`);
  fd.append('title', `E2E Resource ${STAMP}`);
  fd.append('subtopic_id', subtopicId || '');
  fd.append('topic_id', topicId || '');
  fd.append('subject_id', subjectId || '');
  const uploadRes = await req('POST', '/api/resources/upload', { token: teacherToken, formData: fd });
  step('Upload resource', uploadRes.ok, `status=${uploadRes.status} ${JSON.stringify(uploadRes.data).slice(0, 200)}`);
  const resourceId = uploadRes.data?.data?.id || uploadRes.data?.id || uploadRes.data?.resource?.id;

  // assign to all students
  if (resourceId) {
    const assignRes = await req('PUT', `/api/resources/${resourceId}/assign-users`, {
      token: teacherToken, body: { audience: 'all' },
    });
    step('Assign resource → all students', assignRes.ok, `status=${assignRes.status} ${JSON.stringify(assignRes.data).slice(0, 200)}`);
  } else {
    step('Assign resource → all students', false, 'no resourceId from upload');
  }

  // ───── STEP 8: Add Question ─────
  head('Step 8: Teacher adds practice question');
  const qBody = {
    subtopic_id: subtopicId, topic_id: topicId, subject_id: subjectId,
    question_text: 'What is the basic unit of life?',
    options: [
      { text: 'Atom', is_correct: false },
      { text: 'Cell', is_correct: true },
      { text: 'Tissue', is_correct: false },
      { text: 'Organ', is_correct: false },
    ],
    explanation: 'A cell is the smallest structural and functional unit of life.',
    difficulty: 'easy',
  };
  const createQ = await req('POST', '/api/teacher/questions', { token: teacherToken, body: qBody });
  step('Create question via /api/teacher/questions', createQ.ok, `status=${createQ.status} ${JSON.stringify(createQ.data).slice(0, 200)}`);
  const questionId = createQ.data?.data?.id || createQ.data?.id || createQ.data?.question?.id;

  // ───── STEP 9: Student register ─────
  head('Step 9: Student registration');
  const studentEmail = `student-e2e-${STAMP}@test.local`;
  const reg = await req('POST', '/api/auth/register', {
    body: {
      first_name: 'E2E', last_name: 'Student', email: studentEmail,
      password: 'Student1234', role: 'student',
      exam_type: examTypeName, exam_type_id: examTypeId,
      grade: 'SS3',
    },
  });
  step('Register student', reg.ok, `status=${reg.status} ${JSON.stringify(reg.data).slice(0, 200)}`);
  let studentToken = reg.data?.token;
  if (!studentToken) {
    const sLogin = await req('POST', '/api/auth/login', { body: { email: studentEmail, password: 'Student1234' } });
    studentToken = sLogin.data?.token;
    step('Student login (fallback)', sLogin.ok && !!studentToken);
  }

  // ───── STEP 10: Enroll student in subject ─────
  head('Step 10: Student enrols in subject');
  const enrol = await req('POST', '/api/students/subjects', {
    token: studentToken,
    body: { subject_id: subjectId },
  });
  step('Enrol student → subject', enrol.ok, `status=${enrol.status} ${JSON.stringify(enrol.data).slice(0, 200)}`);

  // ───── STEP 11: Load subject (topics & subtopics) ─────
  head('Step 11: Student loads subject content');
  const mySubs = await req('GET', '/api/students/my-subjects', { token: studentToken });
  step('GET /api/students/my-subjects shows enrolled subject', mySubs.ok && JSON.stringify(mySubs.data).includes(subjectId || '__nope__'),
    `status=${mySubs.status} count=${Array.isArray(mySubs.data?.data) ? mySubs.data.data.length : 'n/a'}`);
  const topics = await req('GET', `/api/topics?subject_id=${subjectId}`, { token: studentToken });
  step('GET /api/topics?subject_id=...', topics.ok && JSON.stringify(topics.data).includes(topicId || '__nope__'),
    `status=${topics.status}`);

  // ───── STEP 12: Study resource & record completion ─────
  head('Step 12: Student studies resource');
  const myResources = await req('GET', `/api/resources?subtopic_id=${subtopicId}`, { token: studentToken });
  step('GET /api/resources?subtopic_id=... returns the uploaded resource',
    myResources.ok && JSON.stringify(myResources.data).includes(resourceId || '__nope__'),
    `status=${myResources.status}`);
  const markRes = await req('POST', `/api/subtopics/${subtopicId}/progress`, {
    token: studentToken, body: { task: 'resources' },
  });
  step('POST /api/subtopics/:id/progress {resources_completed:true}', markRes.ok,
    `status=${markRes.status} ${JSON.stringify(markRes.data).slice(0, 200)}`);

  // ───── STEP 13: Practice question ─────
  head('Step 13: Student practices a question');
  if (questionId) {
    const ans = await req('POST', `/api/questions/${questionId}/answer`, {
      token: studentToken,
      body: { selected_answer: 'Cell', time_taken_seconds: 5 },
    });
    step('Answer question (practice)', ans.ok, `status=${ans.status} ${JSON.stringify(ans.data).slice(0, 200)}`);
  } else {
    step('Answer question (practice)', false, 'no questionId');
  }
  const practiceMark = await req('POST', `/api/subtopics/${subtopicId}/progress`, {
    token: studentToken, body: { task: 'practice' },
  });
  step('POST /api/subtopics/:id/progress {practice_completed:true}', practiceMark.ok,
    `status=${practiceMark.status}`);

  // ───── STEP 14: Take quiz ─────
  head('Step 14: Student takes a graded quiz');
  const quizSubmit = await req('POST', '/api/quizzes/attempt', {
    token: studentToken,
    body: {
      subtopic_id: subtopicId,
      mode: 'quiz',
      answers: questionId ? [{ question_id: questionId, selected_answer: 'Cell' }] : [],
      duration_seconds: 30,
    },
  });
  step('POST /api/quizzes/attempt', quizSubmit.ok, `status=${quizSubmit.status} ${JSON.stringify(quizSubmit.data).slice(0, 200)}`);

  // ───── STEP 15: Dashboard reflects activity ─────
  head('Step 15: Dashboard summary');
  const dash = await req('GET', '/api/dashboard/summary', { token: studentToken });
  step('GET /api/dashboard/summary', dash.ok, `status=${dash.status} ${JSON.stringify(dash.data).slice(0, 200)}`);

  // ───── teacher analytics ─────
  head('Bonus: Teacher sees students');
  const tStudents = await req('GET', '/api/teacher/students', { token: teacherToken });
  step('GET /api/teacher/students', tStudents.ok, `status=${tStudents.status} count=${Array.isArray(tStudents.data?.data) ? tStudents.data.data.length : (Array.isArray(tStudents.data) ? tStudents.data.length : 'n/a')}`);

  console.log('\n' + c('cyan', `Total: ${pass + fail}  ${c('green', pass + ' pass')}  ${c('red', fail + ' fail')}\n`));
  process.exit(fail ? 1 : 0);
})();
