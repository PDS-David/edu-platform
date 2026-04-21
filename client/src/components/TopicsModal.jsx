// client/src/components/TopicsModal.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ChevronDown, ArrowRight, CheckCircle, Circle } from 'lucide-react';
import api from '../../services/apiClient';



const MODE_SUBTITLES = {
  practice: 'Choose the subject area and dive into the specific topic you want to explore for practice questions',
  quiz:     'Choose the subject area and dive into the specific topic you want to explore for quizzes',
  resources:'Choose the subject area and dive into the specific topic you want to explore for resources',
};

export default function TopicsModal({ subjectId, mode, onClose }) {
  const navigate = useNavigate();
  const [topics, setTopics]         = useState([]);
  const [expanded, setExpanded]     = useState(null);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    if (!subjectId) return;
    api.get('/topics', {
        params: { subject_id: subjectId },
      })
      .then(r => setTopics(r.data?.topics || r.data || []))
      .catch(() => setTopics([]))
      .finally(() => setLoading(false));
  }, [subjectId]);

  const handleSubtopic = (subtopicId) => {
    onClose();
    navigate(`/student/subtopic/${subtopicId}?tab=${mode}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
          <div className="flex-1 text-center">
            <h2 className="text-base font-bold text-gray-900">Topics &amp; Sub-topics</h2>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{MODE_SUBTITLES[mode]}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-3 shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-4 py-3">
          {loading && (
            <div className="flex justify-center py-10">
              <div className="w-7 h-7 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && topics.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">No topics found.</p>
          )}

          <div className="space-y-2">
            {topics.map(topic => (
              <div key={topic.id} className="rounded-xl border border-gray-100 overflow-hidden">
                {/* Topic row */}
                <button
                  onClick={() => setExpanded(e => e === topic.id ? null : topic.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full border-2 border-blue-400 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-blue-600">
                      {topic.completion_percentage ?? 0}%
                    </span>
                  </div>
                  <span className="flex-1 text-sm font-medium text-gray-800 text-left">{topic.name}</span>
                  <ChevronDown
                    size={16}
                    className={`text-gray-400 transition-transform duration-200 ${expanded === topic.id ? 'rotate-180' : ''}`}
                  />
                </button>

                {/* Sub-topics */}
                {expanded === topic.id && (
                  <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 space-y-1">
                    <div className="flex justify-end mb-1">
                      <span className="text-xs text-blue-500 font-medium cursor-pointer hover:underline">View all</span>
                    </div>
                    {(topic.subtopics || []).map(st => (
                      <button
                        key={st.id}
                        onClick={() => handleSubtopic(st.id)}
                        className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white transition-colors group"
                      >
                        {st.is_complete
                          ? <CheckCircle size={16} className="text-blue-500 shrink-0" />
                          : <Circle size={16} className="text-gray-300 shrink-0" />
                        }
                        <span className="flex-1 text-sm text-gray-700 text-left">{st.name}</span>
                        <ArrowRight size={14} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
                      </button>
                    ))}
                    {(!topic.subtopics || topic.subtopics.length === 0) && (
                      <p className="text-xs text-gray-400 py-2 text-center">No sub-topics available.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
