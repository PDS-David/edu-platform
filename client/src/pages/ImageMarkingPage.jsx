// client/src/pages/ImageMarkingPage.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Student feature: Upload a photo of a handwritten exam answer for AI marking.
// Route: /student/mark-image  (add to App.jsx — see instructions below)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

// ── Grade colour helper ───────────────────────────────────────────────────────
function gradeColor(grade) {
  if (!grade) return '#6b7280';
  const g = grade.toUpperCase();
  if (g === 'A1')                   return '#16a34a';
  if (g === 'B2' || g === 'B3')    return '#2563eb';
  if (g === 'C4' || g === 'C5' || g === 'C6') return '#d97706';
  return '#dc2626';
}

// ── Score ring SVG ────────────────────────────────────────────────────────────
function ScoreRing({ percentage }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percentage / 100) * circ;
  const color = percentage >= 75 ? '#16a34a'
    : percentage >= 60 ? '#2563eb'
    : percentage >= 45 ? '#d97706'
    : '#dc2626';
  return (
    <svg width="140" height="140" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
      <circle
        cx="60" cy="60" r={r} fill="none"
        stroke={color} strokeWidth="10"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 60 60)"
        style={{ transition: 'stroke-dashoffset 1s ease' }}
      />
      <text x="60" y="55" textAnchor="middle" fontSize="22" fontWeight="700" fill={color}>{percentage}%</text>
      <text x="60" y="72" textAnchor="middle" fontSize="11" fill="#6b7280">score</text>
    </svg>
  );
}

export default function ImageMarkingPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [imageFile,    setImageFile]    = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [questionText, setQuestionText] = useState('');
  const [subject,      setSubject]      = useState('');
  const [examBoard,    setExamBoard]    = useState('WAEC');
  const [totalMarks,   setTotalMarks]   = useState(10);
  const [markScheme,   setMarkScheme]   = useState('');

  // ── UI state ────────────────────────────────────────────────────────────────
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState('');
  const [dragging, setDragging] = useState(false);

  // ── File handling ───────────────────────────────────────────────────────────
  const handleFile = useCallback((file) => {
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    if (!allowed.includes(file.type)) {
      setError('Please upload a JPEG, PNG, WEBP or HEIC image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10 MB.');
      return;
    }
    setError('');
    setImageFile(file);
    setResult(null);
    const reader = new FileReader();
    reader.onload = e => setImagePreview(e.target.result);
    reader.readAsDataURL(file);
  }, []);

  const onFileChange  = e => handleFile(e.target.files[0]);
  const onDrop        = e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); };
  const onDragOver    = e => { e.preventDefault(); setDragging(true); };
  const onDragLeave   = () => setDragging(false);

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!imageFile)          return setError('Please select an image to upload.');
    if (!questionText.trim()) return setError('Please enter the exam question.');

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('image',         imageFile);
      formData.append('question_text', questionText.trim());
      formData.append('subject',       subject || 'General');
      formData.append('exam_board',    examBoard);
      formData.append('total_marks',   String(totalMarks));
      if (markScheme.trim()) {
        formData.append('mark_scheme', markScheme.trim());
      }

      const { data } = await api.post('/ai/mark-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (data.success) {
        setResult(data.data);
        // Smooth scroll to results
        setTimeout(() => {
          document.getElementById('marking-result')?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      } else {
        setError(data.error || 'Marking failed. Please try again.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Styles ──────────────────────────────────────────────────────────────────
  const S = {
    page: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f0f4ff 0%, #fafafa 100%)',
      padding: '32px 16px 64px',
      fontFamily: "'Inter', system-ui, sans-serif",
    },
    container: {
      maxWidth: 760,
      margin: '0 auto',
    },
    backBtn: {
      background: 'none',
      border: 'none',
      color: '#2563eb',
      cursor: 'pointer',
      fontSize: 14,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      marginBottom: 24,
      padding: 0,
    },
    header: {
      marginBottom: 32,
    },
    title: {
      fontSize: 28,
      fontWeight: 700,
      color: '#111827',
      margin: '0 0 8px',
    },
    subtitle: {
      fontSize: 15,
      color: '#6b7280',
      margin: 0,
    },
    card: {
      background: '#fff',
      borderRadius: 16,
      padding: 28,
      boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05)',
      marginBottom: 20,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: 600,
      color: '#374151',
      marginBottom: 16,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    dropZone: (active) => ({
      border: `2px dashed ${active ? '#2563eb' : '#d1d5db'}`,
      borderRadius: 12,
      padding: '32px 16px',
      textAlign: 'center',
      cursor: 'pointer',
      background: active ? '#eff6ff' : '#f9fafb',
      transition: 'all 0.2s ease',
      position: 'relative',
    }),
    previewWrap: {
      position: 'relative',
      display: 'inline-block',
      maxWidth: '100%',
    },
    previewImg: {
      maxWidth: '100%',
      maxHeight: 320,
      borderRadius: 10,
      border: '1px solid #e5e7eb',
      display: 'block',
      margin: '0 auto',
    },
    clearBtn: {
      position: 'absolute',
      top: -10,
      right: -10,
      background: '#ef4444',
      color: '#fff',
      border: 'none',
      borderRadius: '50%',
      width: 28,
      height: 28,
      cursor: 'pointer',
      fontSize: 16,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
    },
    label: {
      display: 'block',
      fontSize: 13,
      fontWeight: 600,
      color: '#374151',
      marginBottom: 6,
    },
    input: {
      width: '100%',
      padding: '10px 14px',
      border: '1px solid #d1d5db',
      borderRadius: 8,
      fontSize: 14,
      color: '#111827',
      background: '#fff',
      outline: 'none',
      boxSizing: 'border-box',
      transition: 'border-color 0.2s',
    },
    textarea: {
      width: '100%',
      padding: '10px 14px',
      border: '1px solid #d1d5db',
      borderRadius: 8,
      fontSize: 14,
      color: '#111827',
      background: '#fff',
      outline: 'none',
      boxSizing: 'border-box',
      minHeight: 90,
      resize: 'vertical',
      fontFamily: 'inherit',
    },
    select: {
      width: '100%',
      padding: '10px 14px',
      border: '1px solid #d1d5db',
      borderRadius: 8,
      fontSize: 14,
      color: '#111827',
      background: '#fff',
      outline: 'none',
      boxSizing: 'border-box',
      appearance: 'none',
    },
    row: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: 16,
    },
    submitBtn: {
      width: '100%',
      padding: '14px',
      background: loading ? '#93c5fd' : '#2563eb',
      color: '#fff',
      border: 'none',
      borderRadius: 10,
      fontSize: 16,
      fontWeight: 600,
      cursor: loading ? 'not-allowed' : 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      transition: 'background 0.2s',
      marginTop: 8,
    },
    errorBox: {
      background: '#fef2f2',
      border: '1px solid #fecaca',
      borderRadius: 10,
      padding: '12px 16px',
      color: '#dc2626',
      fontSize: 14,
      marginBottom: 16,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    // Result styles
    resultCard: {
      background: '#fff',
      borderRadius: 16,
      padding: 32,
      boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.08)',
      marginBottom: 20,
    },
    scoreRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 32,
      marginBottom: 28,
      flexWrap: 'wrap',
    },
    gradeTag: (grade) => ({
      display: 'inline-block',
      padding: '6px 18px',
      borderRadius: 8,
      background: gradeColor(grade) + '18',
      color: gradeColor(grade),
      fontWeight: 700,
      fontSize: 22,
      border: `2px solid ${gradeColor(grade)}30`,
    }),
    marksText: {
      fontSize: 15,
      color: '#6b7280',
      marginTop: 4,
    },
    feedbackBox: {
      background: '#f0fdf4',
      border: '1px solid #bbf7d0',
      borderRadius: 10,
      padding: '16px 20px',
      color: '#166534',
      fontSize: 15,
      lineHeight: 1.6,
      marginBottom: 20,
    },
    listSection: {
      marginBottom: 20,
    },
    listTitle: {
      fontSize: 14,
      fontWeight: 700,
      color: '#374151',
      marginBottom: 10,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    },
    listItem: (type) => ({
      display: 'flex',
      gap: 10,
      padding: '8px 12px',
      borderRadius: 8,
      marginBottom: 6,
      fontSize: 14,
      background: type === 'strength' ? '#f0fdf4' : '#fff7ed',
      color: type === 'strength' ? '#166534' : '#92400e',
      border: `1px solid ${type === 'strength' ? '#bbf7d0' : '#fed7aa'}`,
    }),
    modelAnswerBox: {
      background: '#eff6ff',
      border: '1px solid #bfdbfe',
      borderRadius: 10,
      padding: '16px 20px',
      marginBottom: 20,
    },
    modelAnswerTitle: {
      fontSize: 13,
      fontWeight: 700,
      color: '#1d4ed8',
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    },
    modelAnswerText: {
      fontSize: 14,
      color: '#1e40af',
      lineHeight: 1.7,
      whiteSpace: 'pre-wrap',
    },
    tryAgainBtn: {
      width: '100%',
      padding: '12px',
      background: '#f3f4f6',
      color: '#374151',
      border: '1px solid #d1d5db',
      borderRadius: 10,
      fontSize: 15,
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'background 0.2s',
    },
    spinner: {
      width: 20,
      height: 20,
      border: '3px solid rgba(255,255,255,0.4)',
      borderTopColor: '#fff',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    },
    readabilityWarning: {
      background: '#fffbeb',
      border: '1px solid #fcd34d',
      borderRadius: 10,
      padding: '12px 16px',
      color: '#92400e',
      fontSize: 14,
      marginBottom: 16,
      display: 'flex',
      gap: 8,
      alignItems: 'flex-start',
    },
  };

  return (
    <div style={S.page}>
      {/* Spinner keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={S.container}>

        {/* Back button */}
        <button style={S.backBtn} onClick={() => navigate(-1)}>
          ← Back
        </button>

        {/* Header */}
        <div style={S.header}>
          <h1 style={S.title}>📸 AI Answer Marking</h1>
          <p style={S.subtitle}>
            Take a photo of your handwritten answer, upload it, and get instant AI feedback and marks.
          </p>
        </div>

        {/* ── FORM ── */}
        {!result && (
          <form onSubmit={handleSubmit}>

            {/* Step 1 — Upload image */}
            <div style={S.card}>
              <div style={S.sectionTitle}>
                <span>1</span> Upload Your Answer Sheet
              </div>

              {!imagePreview ? (
                <div
                  style={S.dropZone(dragging)}
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📷</div>
                  <p style={{ fontWeight: 600, color: '#374151', margin: '0 0 4px' }}>
                    Drag & drop your photo here, or click to browse
                  </p>
                  <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>
                    JPEG, PNG, WEBP or HEIC — max 10 MB
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic"
                    onChange={onFileChange}
                    style={{ display: 'none' }}
                  />
                </div>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={S.previewWrap}>
                    <img src={imagePreview} alt="Answer preview" style={S.previewImg} />
                    <button type="button" style={S.clearBtn} onClick={clearImage} title="Remove image">✕</button>
                  </div>
                  <p style={{ fontSize: 13, color: '#6b7280', marginTop: 8 }}>
                    ✅ {imageFile?.name} ({(imageFile?.size / 1024).toFixed(0)} KB)
                  </p>
                </div>
              )}
            </div>

            {/* Step 2 — Question & context */}
            <div style={S.card}>
              <div style={S.sectionTitle}>
                <span>2</span> Question Details
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>
                  Exam Question <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  style={S.textarea}
                  placeholder="Type or paste the exact exam question the student was answering…"
                  value={questionText}
                  onChange={e => setQuestionText(e.target.value)}
                  required
                />
              </div>

              <div style={S.row}>
                <div>
                  <label style={S.label}>Subject</label>
                  <input
                    style={S.input}
                    placeholder="e.g. Mathematics"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                  />
                </div>
                <div>
                  <label style={S.label}>Exam Board</label>
                  <select
                    style={S.select}
                    value={examBoard}
                    onChange={e => setExamBoard(e.target.value)}
                  >
                    <option value="WAEC">WAEC</option>
                    <option value="NECO">NECO</option>
                    <option value="JAMB">JAMB</option>
                    <option value="Cambridge IGCSE">Cambridge IGCSE</option>
                    <option value="Cambridge A Level">Cambridge A Level</option>
                    <option value="Edexcel">Edexcel</option>
                    <option value="AQA">AQA</option>
                    <option value="IELTS">IELTS</option>
                  </select>
                </div>
                <div>
                  <label style={S.label}>Total Marks</label>
                  <input
                    style={S.input}
                    type="number"
                    min={1}
                    max={100}
                    value={totalMarks}
                    onChange={e => setTotalMarks(parseInt(e.target.value) || 10)}
                  />
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <label style={S.label}>
                  Mark Scheme / Model Answer
                  <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>(optional but improves accuracy)</span>
                </label>
                <textarea
                  style={{ ...S.textarea, minHeight: 70 }}
                  placeholder="Paste the mark scheme or key points the answer should include…"
                  value={markScheme}
                  onChange={e => setMarkScheme(e.target.value)}
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={S.errorBox}>
                <span>⚠️</span> {error}
              </div>
            )}

            {/* Submit */}
            <button type="submit" style={S.submitBtn} disabled={loading}>
              {loading ? (
                <>
                  <div style={S.spinner} />
                  Marking your answer…
                </>
              ) : (
                '🤖 Mark My Answer'
              )}
            </button>
          </form>
        )}

        {/* ── RESULTS ── */}
        {result && (
          <div id="marking-result">

            {/* Readability warning */}
            {result.readabilityNote && (
              <div style={S.readabilityWarning}>
                <span>⚠️</span>
                <span><strong>Handwriting note:</strong> {result.readabilityNote}</span>
              </div>
            )}

            <div style={S.resultCard}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 20 }}>
                📊 Marking Results
              </h2>

              {/* Score ring + grade */}
              <div style={S.scoreRow}>
                <ScoreRing percentage={result.percentage} />
                <div>
                  <div style={S.gradeTag(result.grade)}>{result.grade}</div>
                  <p style={S.marksText}>
                    {result.marksAwarded} / {result.totalMarks} marks awarded
                  </p>
                </div>
              </div>

              {/* Feedback */}
              <div style={S.feedbackBox}>
                <strong style={{ display: 'block', marginBottom: 4 }}>Overall Feedback</strong>
                {result.feedback}
              </div>

              {/* Strengths */}
              {result.strengths?.length > 0 && (
                <div style={S.listSection}>
                  <div style={S.listTitle}>✅ Strengths</div>
                  {result.strengths.map((s, i) => (
                    <div key={i} style={S.listItem('strength')}>
                      <span>✓</span> {s}
                    </div>
                  ))}
                </div>
              )}

              {/* Improvements */}
              {result.improvements?.length > 0 && (
                <div style={S.listSection}>
                  <div style={S.listTitle}>📈 Areas for Improvement</div>
                  {result.improvements.map((imp, i) => (
                    <div key={i} style={S.listItem('improvement')}>
                      <span>→</span> {imp}
                    </div>
                  ))}
                </div>
              )}

              {/* Model answer */}
              {result.modelAnswer && (
                <div style={S.modelAnswerBox}>
                  <div style={S.modelAnswerTitle}>💡 Model Answer / Key Points</div>
                  <div style={S.modelAnswerText}>{result.modelAnswer}</div>
                </div>
              )}
            </div>

            {/* Image submitted */}
            {imagePreview && (
              <div style={{ ...S.card, padding: 20 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 10 }}>
                  YOUR SUBMITTED ANSWER
                </p>
                <img src={imagePreview} alt="Submitted answer" style={{ ...S.previewImg, maxHeight: 240 }} />
              </div>
            )}

            {/* Try another */}
            <button
              style={S.tryAgainBtn}
              onClick={() => {
                setResult(null);
                setImageFile(null);
                setImagePreview(null);
                setQuestionText('');
                setMarkScheme('');
              }}
            >
              📸 Mark Another Answer
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
