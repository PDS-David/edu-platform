import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/apiClient';

const subjectIcons = {
  'Mathematics': '📐', 'Physics': '⚡', 'Chemistry': '🧪', 'Biology': '🧬',
  'English': '📖', 'English Language': '📖', 'Literature': '📚',
  'Economics': '📊', 'Government': '🏛️', 'Commerce': '💼',
  'Geography': '🌍', 'History': '📜', 'Civic Education': '🏫',
  'Computer Science': '💻', 'Agricultural Science': '🌱',
  'Technical Drawing': '📏', 'Further Mathematics': '🔢',
  'Accounting': '📋', 'Business Studies': '💰',
  'French': '🇫🇷', 'Igbo': '🌟', 'Yoruba': '🌟', 'Hausa': '🌟',
  'Islamic Studies': '☪️', 'Christian Religious Studies': '✝️',
};

const SubjectCard = ({ subject, examBoard, showExamBoard = true, isEnrolled = false, onEnrolled }) => {
  const navigate  = useNavigate();
  const [enrolling, setEnrolling] = useState(false);
  const [enrolled,  setEnrolled]  = useState(isEnrolled);

  const icon = subject.icon_emoji || subjectIcons[subject.name] || '📘';

  const handleEnrol = async (e) => {
    e.stopPropagation();
    if (enrolled || enrolling) return;
    setEnrolling(true);
    try {
      await api.post('/students/subjects', { subject_id: String(subject.id) });
      setEnrolled(true);
      if (onEnrolled) onEnrolled(subject.id);
    } catch (err) {
      alert(err?.message || 'Could not enrol. Please try again.');
    } finally {
      setEnrolling(false);
    }
  };

  const handleStudy = () => navigate(`/student/subject/${subject.id}`);

  return (
    <div className="bg-white rounded-xl shadow-md hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 overflow-hidden">
      {/* Card Header */}
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="text-5xl">{icon}</div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">{subject.name}</h3>
              {showExamBoard && (
                <span className="inline-block mt-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                  {examBoard}
                </span>
              )}
            </div>
          </div>
          {enrolled && (
            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-medium">Enrolled</span>
          )}
        </div>
        <p className="text-gray-600 text-sm leading-relaxed">
          {subject.description || `Comprehensive ${subject.name} resources for ${examBoard} examination preparation.`}
        </p>
      </div>

      {/* Topics Tags */}
      {subject.topics && subject.topics.length > 0 && (
        <div className="px-6 py-4 bg-gray-50">
          <div className="flex flex-wrap gap-2">
            {subject.topics.slice(0, 6).map((topic, index) => (
              <span key={index} className="px-3 py-1 bg-white border border-gray-200 text-gray-700 rounded-full text-xs font-medium hover:border-blue-400 transition-colors">
                {topic}
              </span>
            ))}
            {subject.topics.length > 6 && (
              <span className="px-3 py-1 text-gray-500 text-xs font-medium">+{subject.topics.length - 6} more</span>
            )}
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="p-6">
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
            <span className="text-3xl">✏️</span>
            <div>
              <div className="text-lg font-bold text-gray-900">{subject.question_count?.toLocaleString() || '500+'}</div>
              <div className="text-xs text-gray-600">Practice Questions</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
            <span className="text-3xl">🎥</span>
            <div>
              <div className="text-lg font-bold text-gray-900">{subject.video_count?.toLocaleString() || '100+'}</div>
              <div className="text-xs text-gray-600">Video Lessons</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
            <span className="text-3xl">📝</span>
            <div>
              <div className="text-lg font-bold text-gray-900">{subject.notes_count?.toLocaleString() || '200+'}</div>
              <div className="text-xs text-gray-600">Revision Notes</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg">
            <span className="text-3xl">📄</span>
            <div>
              <div className="text-lg font-bold text-gray-900">{subject.past_papers_count?.toLocaleString() || '50+'}</div>
              <div className="text-xs text-gray-600">Past Papers</div>
            </div>
          </div>
        </div>

        {subject.progress && (
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-medium text-gray-600">Your Progress</span>
              <span className="text-xs font-bold text-blue-600">{subject.progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${subject.progress}%` }} />
            </div>
          </div>
        )}

        {/* CTA Buttons */}
        <div className="flex gap-2">
          {enrolled ? (
            <button onClick={handleStudy} className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg">
              Study Now →
            </button>
          ) : (
            <>
              <button onClick={handleEnrol} disabled={enrolling} className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-60 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 shadow-md">
                {enrolling ? 'Enrolling…' : '+ Enrol'}
              </button>
              <button onClick={handleStudy} className="px-4 py-3 border-2 border-blue-200 hover:border-blue-400 text-blue-600 font-semibold rounded-lg transition-all duration-200">
                Preview
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SubjectCard;
