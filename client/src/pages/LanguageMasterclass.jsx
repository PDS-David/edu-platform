// client/src/pages/LanguageMasterclass.jsx
// Route: /french and /german (see FrenchMasterclass.jsx / GermanMasterclass.jsx)
//
// Orchestrator for the French/German Masterclass proof-of-concept — the
// deliberately incomplete sibling to English Masterclass. See the
// file-level note in server/routes/languageMasterclassRoutes.js for the
// full "why incomplete" explanation.
//
// Deliberately NOT wired into the ChooseAppPage/getPostAuthRedirect login
// unification (client/src/utils/postAuthRedirect.js) — that logic was
// just stabilized and this is presales/demo content, not a third product
// ready to sit alongside AISchoolonair/English Masterclass in that flow.
// Reached instead via a direct link (see the "More Languages" card added
// to EMDashboard.jsx) while logged in through the normal app.

import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import api from '../services/apiClient';
import TopNav from '../components/TopNav';
import { useAuth } from '../context/AuthContext';
import LangLevelsView from './lang/LangLevelsView';
import LangPracticeSession from './lang/LangPracticeSession';
import LangSessionSummary from './lang/LangSessionSummary';
import { LANGUAGE_META } from './lang/constants';

export default function LanguageMasterclass({ language }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const meta = LANGUAGE_META[language];

  const [view, setView] = useState('loading'); // loading | needs-registration | levels | practice | summary | error
  const [error, setError] = useState('');
  const [categories, setCategories] = useState([]);
  const [levelProgress, setLevelProgress] = useState(null);
  const [selectedCat, setSelectedCat] = useState(null);
  const [words, setWords] = useState([]);
  const [loadingCatId, setLoadingCatId] = useState(null);
  const [sessionResult, setSessionResult] = useState(null);
  const [registering, setRegistering] = useState(false);

  const registeredKey = `${language}_registered_at`;

  const loadLevelsData = useCallback(async () => {
    try {
      const [catRes, progRes] = await Promise.all([
        api.get(`/language-masterclass/${language}/categories`),
        api.get(`/language-masterclass/${language}/level-progress`),
      ]);
      // apiClient's response interceptor already unwraps the backend's
      // { success, data } envelope — catRes.data IS the categories array,
      // not catRes.data.data. (Confirmed against client/src/services/apiClient.js;
      // this differs from a couple of English Masterclass files that get away
      // with the .data.data pattern only because those specific endpoints
      // don't wrap their payload in a "data" key to begin with.)
      setCategories(catRes.data || []);
      setLevelProgress(progRes.data || null);
      setView('levels');
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === 'LANGUAGE_NOT_ENABLED_FOR_SCHOOL') {
        setError(err.response.data.error);
        setView('error');
      } else if (code === 'LANGUAGE_REGISTRATION_REQUIRED') {
        setView('needs-registration');
      } else {
        setError(err?.response?.data?.error || `Could not load ${meta.short} Masterclass.`);
        setView('error');
      }
    }
  }, [language, meta.short]);

  useEffect(() => {
    if (!user?.[registeredKey]) {
      // Try loading anyway — the backend is the source of truth; this just
      // avoids a guaranteed round-trip failure for accounts we already know
      // haven't registered.
      setView('needs-registration');
      return;
    }
    loadLevelsData();
  }, [user, registeredKey, loadLevelsData]);

  const handleRegister = async () => {
    setRegistering(true);
    setError('');
    try {
      await api.post(`/language-masterclass/${language}/register`);
      await loadLevelsData();
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not complete registration.');
    } finally {
      setRegistering(false);
    }
  };

  const handleStartCategory = async (cat) => {
    setLoadingCatId(cat.id);
    try {
      const res = await api.get(`/language-masterclass/${language}/categories/${cat.id}/words`);
      const w = res.data || [];
      if (w.length === 0) {
        setError('This category has no words yet.');
        return;
      }
      setSelectedCat(cat);
      setWords(w);
      setView('practice');
    } catch {
      setError('Could not load words for that category.');
    } finally {
      setLoadingCatId(null);
    }
  };

  const handleSessionComplete = (result) => {
    setSessionResult(result);
    setView('summary');
    loadLevelsData(); // refresh unlock progress in the background
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      {/* Header */}
      <div className="text-white" style={{ background: meta.accent }}>
        <div className="max-w-4xl mx-auto px-4 py-6">
          {view === 'practice' && (
            <button
              onClick={() => setView('levels')}
              className="flex items-center gap-1 text-sm text-white/80 hover:text-white mb-2 transition-colors"
            >
              <ArrowLeft size={14} /> Back to levels
            </button>
          )}
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span>{meta.flag}</span> {meta.label}
          </h1>
          <p className="text-sm text-white/80 mt-1">
            Preview — a proof of concept. Full course content is not yet complete.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {view === 'loading' && (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin" style={{ color: meta.accent }} />
          </div>
        )}

        {view === 'needs-registration' && (
          <div className="max-w-md mx-auto text-center bg-white rounded-2xl border border-gray-100 p-8">
            <span className="text-4xl">{meta.flag}</span>
            <h2 className="text-lg font-bold text-gray-900 mt-3 mb-1">Try {meta.label}</h2>
            <p className="text-sm text-gray-500 mb-6">
              A one-time, one-click registration — same account, no new signup needed.
            </p>
            {error && (
              <p className="flex items-center gap-1.5 justify-center text-xs text-red-600 mb-3">
                <AlertCircle size={13} /> {error}
              </p>
            )}
            <button
              onClick={handleRegister}
              disabled={registering}
              className="text-white font-semibold text-sm px-6 py-2.5 rounded-xl transition-opacity disabled:opacity-50"
              style={{ background: meta.accent }}
            >
              {registering ? 'Registering…' : `Register for ${meta.short} Masterclass`}
            </button>
          </div>
        )}

        {view === 'error' && (
          <div className="max-w-md mx-auto text-center bg-white rounded-2xl border border-gray-100 p-8">
            <AlertCircle size={28} className="text-red-400 mx-auto mb-3" />
            <p className="text-sm text-gray-600 mb-4">{error}</p>
            <Link to="/em/dashboard" className="text-sm font-semibold" style={{ color: meta.accent }}>
              ← Back to Language Masterclass
            </Link>
          </div>
        )}

        {view === 'levels' && (
          <LangLevelsView
            language={language}
            categories={categories}
            unlocked={levelProgress?.unlocked}
            onStart={handleStartCategory}
            loadingCatId={loadingCatId}
          />
        )}

        {view === 'practice' && selectedCat && (
          <LangPracticeSession
            language={language}
            category={selectedCat}
            words={words}
            onComplete={handleSessionComplete}
          />
        )}

        {view === 'summary' && sessionResult && (
          <LangSessionSummary
            language={language}
            result={sessionResult}
            onPracticeAgain={() => handleStartCategory(selectedCat)}
            onBackToLevels={() => setView('levels')}
          />
        )}
      </div>
    </div>
  );
}
