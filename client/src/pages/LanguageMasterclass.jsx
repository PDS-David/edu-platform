// client/src/pages/LanguageMasterclass.jsx
// Route: /language/:code (french, german, mandarin, arabic, spanish,
// swahili, yoruba — English is deliberately excluded, see App.jsx).
// FrenchMasterclass.jsx / GermanMasterclass.jsx are retired — this
// component now reads :code from the URL directly.
//
// Orchestrator for the 7-language Masterclass proof-of-concept — the
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
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import api from '../services/apiClient';
import TopNav from '../components/TopNav';
import LanguageDropdown from '../components/LanguageDropdown';
import LangLevelsView from './lang/LangLevelsView';
import LangPracticeSession from './lang/LangPracticeSession';
import LangSessionSummary from './lang/LangSessionSummary';
import { LANGUAGE_META } from './lang/constants';

export default function LanguageMasterclass({ language: languageProp }) {
  const { code } = useParams();
  const language = languageProp || code;
  const navigate = useNavigate();
  const meta = LANGUAGE_META[language];

  if (!meta) {
    return (
      <div className="min-h-screen bg-gray-50">
        <TopNav />
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <AlertCircle className="mx-auto mb-3 text-gray-300" size={40} />
          <p className="text-gray-600">"{language}" isn't a language we offer yet.</p>
          {/* Was /student/dashboard — that's AISchoolonair, a different
              product, and not necessarily one this account even has
              access to. English is the one language handled elsewhere
              (see App.jsx), so send them there instead of into
              AISchoolonair. */}
          <Link to="/em/dashboard" className="text-sm font-semibold text-blue-600 hover:underline mt-3 inline-block">
            Back to Language Masterclass
          </Link>
        </div>
      </div>
    );
  }

  if (!meta.enabled) {
    // Withheld language — introduced by code (LANGUAGE_META.enabled) on a
    // demand basis. No categories/words/level-progress call is ever made
    // for these, so there's no path by which any of their content could
    // reach the browser ahead of that flip; the backend enforces the same
    // boundary independently via ENABLED_LANGUAGES either way.
    return (
      <div className="min-h-screen bg-gray-50">
        <TopNav />
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <span className="text-4xl">{meta.flag}</span>
          <h1 className="text-lg font-bold text-gray-900 mt-3 mb-1">{meta.label}</h1>
          <p className="text-gray-600">Will soon be available.</p>
          <Link to="/em/dashboard" className="text-sm font-semibold text-blue-600 hover:underline mt-3 inline-block">
            Back to Language Masterclass
          </Link>
        </div>
      </div>
    );
  }

  const [view, setView] = useState('loading'); // loading | levels | practice | summary | error
  const [error, setError] = useState('');
  const [categories, setCategories] = useState([]);
  const [levelProgress, setLevelProgress] = useState(null);
  const [selectedCat, setSelectedCat] = useState(null);
  const [words, setWords] = useState([]);
  const [loadingCatId, setLoadingCatId] = useState(null);
  const [sessionResult, setSessionResult] = useState(null);

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
      // Registration is no longer a possible failure here — a not-yet-
      // registered standalone student is silently registered by the
      // backend on this very request (see requireLanguageRegistration in
      // languageMasterclassRoutes.js) instead of being rejected. The only
      // access-related failures left are a school without Language
      // Masterclass enabled (should already be caught by LangPrivateRoute
      // before this component even mounts — this is just defense in
      // depth) or a language withheld at the backend
      // (LANGUAGE_NOT_YET_ENABLED — shouldn't happen either, since
      // meta.enabled already stops this call from firing, but the two
      // lists living in two files means it's worth handling gracefully
      // rather than showing a raw error).
      const code = err?.response?.data?.code;
      setError(err?.response?.data?.error || `Could not load ${meta.short} Masterclass.`);
      setView('error');
      if (code !== 'LANGUAGE_MASTERCLASS_NOT_ENABLED_FOR_SCHOOL' && code !== 'LANGUAGE_NOT_YET_ENABLED') {
        console.error(`[LanguageMasterclass] unexpected error loading ${language}`, err);
      }
    }
  }, [language, meta.short]);

  useEffect(() => {
    loadLevelsData();
  }, [loadLevelsData]);

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
        <div className="max-w-4xl mx-auto px-4 py-5 sm:py-6">
          {/* Persistent escape hatch + language switcher — every language
              routed through this component previously had no way back to
              the Language Masterclass hub (/em/dashboard) or across to
              another language once inside, short of the browser's own back
              button. LanguageDropdown is the same "one way to navigate
              between languages" component EMLayout uses for /em/* and
              English; it's self-contained (own auth check, own click-away
              handling) so it's safe to drop in here without adopting
              EMLayout's sidebar shell, which is shaped for English's
              separate Dashboard/Practice/Progress pages rather than this
              single orchestrated page.
              flex-wrap + min-w-0/truncate on the link keeps this row from
              ever forcing horizontal scroll on narrow phones — worst case
              the link's own label wraps to a second line instead of
              pushing the dropdown off the edge of the screen. */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3">
            <Link
              to="/em/dashboard"
              className="flex items-center gap-1 text-sm text-white/80 hover:text-white transition-colors min-w-0"
            >
              <ArrowLeft size={14} className="shrink-0" /> <span className="truncate">Language Masterclass</span>
            </Link>
            <LanguageDropdown />
          </div>
          {view === 'practice' && (
            <button
              onClick={() => setView('levels')}
              className="flex items-center gap-1 text-sm text-white/80 hover:text-white mb-2 transition-colors"
            >
              <ArrowLeft size={14} /> Back to levels
            </button>
          )}
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
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
