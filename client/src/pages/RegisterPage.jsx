import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, ChevronDown, ChevronUp, AlertCircle, RefreshCw } from 'lucide-react';
import PublicNav from '../components/PublicNav';
import api from '../services/apiClient';

// ── Country codes ─────────────────────────────────────────────────────────────
const COUNTRY_CODES = [
  { code: 'NG', dial: '+234', flag: '', name: 'Nigeria' },
  { code: 'GH', dial: '+233', flag: '', name: 'Ghana' },
  { code: 'KE', dial: '+254', flag: '', name: 'Kenya' },
  { code: 'ZA', dial: '+27',  flag: '', name: 'South Africa' },
  { code: 'GB', dial: '+44',  flag: '', name: 'United Kingdom' },
  { code: 'US', dial: '+1',   flag: '', name: 'United States' },
  { code: 'SG', dial: '+65',  flag: '', name: 'Singapore' },
  { code: 'IN', dial: '+91',  flag: '', name: 'India' },
  { code: 'AU', dial: '+61',  flag: '', name: 'Australia' },
  { code: 'CA', dial: '+1',   flag: '', name: 'Canada' },
];

// ── Grades per curriculum ─────────────────────────────────────────────────────
const GRADE_MAP = {
  'AQA A Level':                   ['Grade 11/Year 12', 'Grade 12/Year 13'],
  'AQA A-Level':                   ['Grade 11/Year 12', 'Grade 12/Year 13'],
  'Cambridge A Level':             ['Grade 11/Year 12', 'Grade 12/Year 13'],
  'Cambridge O Level':             ['Grade 9/Year 10',  'Grade 10/Year 11'],
  'Cambridge Pre IGCSE':           ['Grade 7/Year 8',   'Grade 8/Year 9'],
  'Cambridge Primary':             ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6'],
  'Edexcel A Level':               ['Grade 11/Year 12', 'Grade 12/Year 13'],
  'Edexcel International A Level': ['Grade 11/Year 12', 'Grade 12/Year 13'],
  'WAEC/NECO (SSCE)':              ['SS1', 'SS2', 'SS3'],
  'WAEC':                          ['SS1', 'SS2', 'SS3'],
  'NECO':                          ['SS1', 'SS2', 'SS3'],
  'JAMB/UTME':                     ['SS3 / Year 13'],
  'JAMB':                          ['SS3 / Year 13'],
  'Junior WAEC (BECE)':            ['JSS1', 'JSS2', 'JSS3'],
  'BECE':                          ['JSS1', 'JSS2', 'JSS3'],
  'IELTS':                         ['All Levels'],
  'TOEFL':                         ['All Levels'],
  'SAT':                           ['Grade 11', 'Grade 12'],
  // GCE A-Levels: Lower 6 (Year 12) and Upper 6 (Year 13)
  "GCE A' Levels":                 ['Lower 6 (Year 12)', 'Upper 6 (Year 13)'],
  'GCE A Levels':                  ['Lower 6 (Year 12)', 'Upper 6 (Year 13)'],
  'GCE':                           ['Lower 6 (Year 12)', 'Upper 6 (Year 13)'],
  // JUPEB: 1-year programme, Year 1 only
  'JUPEB':                         ['JUPEB Year 1'],
  // Language Lab: proficiency levels
  'Language Lab – English':        ['Beginner (A1)', 'Elementary (A2)', 'Intermediate (B1)', 'Upper-Intermediate (B2)', 'Advanced (C1)', 'Proficiency (C2)'],
  'Language Lab – French':         ['Beginner (A1)', 'Elementary (A2)', 'Intermediate (B1)', 'Upper-Intermediate (B2)', 'Advanced (C1)', 'Proficiency (C2)'],
  'Language Lab – Yoruba':         ['Beginner', 'Elementary', 'Intermediate', 'Advanced'],
};

// ── FIX A: Hardcoded fallback curricula used if the API call fails ─────────────
// This means the Curriculum dropdown is ALWAYS populated, even offline.
const FALLBACK_CURRICULA = [
  { id: null, code: 'JAMB',    name: 'JAMB/UTME',              icon_emoji: '' },
  { id: null, code: 'WAEC',    name: 'WAEC/NECO (SSCE)',        icon_emoji: '' },
  { id: null, code: 'BECE',    name: 'Junior WAEC (BECE)',      icon_emoji: '' },
  { id: null, code: 'GCE_AL',  name: "GCE A' Levels",          icon_emoji: '' },
  { id: null, code: 'JUPEB',   name: 'JUPEB',                   icon_emoji: '' },
  { id: null, code: 'CAMBAL',  name: 'Cambridge A Level',       icon_emoji: '' },
  { id: null, code: 'CAMBOL',  name: 'Cambridge O Level',       icon_emoji: '' },
  { id: null, code: 'AQAAL',   name: 'AQA A Level',             icon_emoji: '' },
  { id: null, code: 'EDXAL',   name: 'Edexcel A Level',         icon_emoji: '' },
  { id: null, code: 'IELTS',   name: 'IELTS',                   icon_emoji: '' },
  { id: null, code: 'TOEFL',   name: 'TOEFL',                   icon_emoji: '' },
  { id: null, code: 'SAT',     name: 'SAT',                     icon_emoji: '' },
  { id: null, code: 'LANG_EN', name: 'Language Lab – English',  icon_emoji: '' },
  { id: null, code: 'LANG_FR', name: 'Language Lab – French',   icon_emoji: '' },
  { id: null, code: 'LANG_YO', name: 'Language Lab – Yoruba',   icon_emoji: '' },
];

// ── Resolve grade options for a curriculum ───────────────────────────────────
// FIX: More robust matching — tries exact name, then code, then partial match,
// then falls back to sensible defaults instead of generic Grade 1/2/3.
function getGradeOptions(curriculum) {
  if (!curriculum) return [];
  const name = curriculum.name || '';
  const code = (curriculum.code || '').toUpperCase();

  // Exact name match
  if (GRADE_MAP[name]) return GRADE_MAP[name];

  // Code-based match
  const codeMap = {
    'JAMB':    GRADE_MAP['JAMB/UTME'],
    'WAEC':    GRADE_MAP['WAEC/NECO (SSCE)'],
    'NECO':    GRADE_MAP['WAEC/NECO (SSCE)'],
    'BECE':    GRADE_MAP['Junior WAEC (BECE)'],
    'IELTS':   GRADE_MAP['IELTS'],
    'TOEFL':   GRADE_MAP['TOEFL'],
    'SAT':     GRADE_MAP['SAT'],
    'GCE_AL':  GRADE_MAP["GCE A' Levels"],
    'GCE':     GRADE_MAP["GCE A' Levels"],
    'JUPEB':   GRADE_MAP['JUPEB'],
    'LANG_EN': GRADE_MAP['Language Lab – English'],
    'LANG_FR': GRADE_MAP['Language Lab – French'],
    'LANG_YO': GRADE_MAP['Language Lab – Yoruba'],
  };
  if (codeMap[code]) return codeMap[code];

  // Partial name match (case-insensitive)
  const lowerName = name.toLowerCase();
  if (lowerName.includes('jamb'))     return GRADE_MAP['JAMB/UTME'];
  if (lowerName.includes('waec') || lowerName.includes('neco') || lowerName.includes('ssce'))
    return GRADE_MAP['WAEC/NECO (SSCE)'];
  if (lowerName.includes('junior') || lowerName.includes('bece') || lowerName.includes('jss'))
    return GRADE_MAP['Junior WAEC (BECE)'];
  if (lowerName.includes('jupeb'))    return GRADE_MAP['JUPEB'];
  if (lowerName.includes('gce'))      return GRADE_MAP["GCE A' Levels"];
  if (lowerName.includes('language lab') || lowerName.includes('lang lab')) {
    if (lowerName.includes('french') || lowerName.includes('fr'))  return GRADE_MAP['Language Lab – French'];
    if (lowerName.includes('yoruba') || lowerName.includes('yo'))  return GRADE_MAP['Language Lab – Yoruba'];
    return GRADE_MAP['Language Lab – English']; // default language lab
  }
  if (lowerName.includes('cambridge') && lowerName.includes('primary'))
    return GRADE_MAP['Cambridge Primary'];
  if (lowerName.includes('cambridge') && (lowerName.includes('o level') || lowerName.includes('igcse')))
    return GRADE_MAP['Cambridge O Level'];
  if (lowerName.includes('cambridge') && lowerName.includes('pre'))
    return GRADE_MAP['Cambridge Pre IGCSE'];
  if (lowerName.includes('cambridge'))
    return GRADE_MAP['Cambridge A Level'];
  if (lowerName.includes('aqa'))
    return GRADE_MAP['AQA A Level'];
  if (lowerName.includes('edexcel') && lowerName.includes('international'))
    return GRADE_MAP['Edexcel International A Level'];
  if (lowerName.includes('edexcel'))
    return GRADE_MAP['Edexcel A Level'];
  if (lowerName.includes('ielts')) return GRADE_MAP['IELTS'];
  if (lowerName.includes('toefl')) return GRADE_MAP['TOEFL'];
  if (lowerName.includes('sat'))   return GRADE_MAP['SAT'];

  // Sensible default for unknown curricula
  return ['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'Year 6'];
}

// ── Country Code Picker ───────────────────────────────────────────────────────
function CountryCodePicker({ selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-3 bg-gray-50 hover:bg-gray-100 transition-colors border-r border-gray-300 rounded-l-lg"
      >
        <span className="text-lg leading-none">{selected.flag}</span>
        <span className="text-sm font-medium text-gray-700">{selected.dial}</span>
        <ChevronDown size={13} className="text-gray-400" />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl w-56 max-h-56 overflow-y-auto">
          {COUNTRY_CODES.map(c => (
            <button
              key={c.code}
              type="button"
              onClick={() => { onChange(c); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-indigo-50 transition-colors
                ${selected.code === c.code ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-700'}`}
            >
              <span className="text-base">{c.flag}</span>
              <span className="flex-1">{c.name}</span>
              <span className="text-gray-400 text-xs">{c.dial}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Custom Dropdown ───────────────────────────────────────────────────────────
function CustomDropdown({ value, options, onChange, disabled, placeholder, loading }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close when disabled changes to true
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div className="relative w-full" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-4 py-3 border rounded-lg text-sm transition-all
          ${disabled
            ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-white border-gray-300 hover:border-indigo-400 cursor-pointer'}
          ${open ? 'border-indigo-500 ring-2 ring-indigo-100' : ''}
        `}
      >
        <span className={value ? 'text-gray-900 truncate' : 'text-gray-400'}>
          {loading ? 'Loading…' : (value || placeholder)}
        </span>
        {loading
          ? <svg className="animate-spin h-4 w-4 text-gray-400 shrink-0 ml-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          : open
            ? <ChevronUp size={15} className="text-gray-400 shrink-0 ml-1" />
            : <ChevronDown size={15} className="text-gray-400 shrink-0 ml-1" />
        }
      </button>
      {open && options.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-56 overflow-y-auto">
          {options.map((opt, i) => {
            const optLabel = typeof opt === 'string' ? opt : (opt.name || String(opt));
            return (
              <button
                key={i}
                type="button"
                onClick={() => { onChange(opt); setOpen(false); }}
                className={`w-full px-4 py-2.5 text-left text-sm hover:bg-indigo-50 hover:text-indigo-700 transition-colors
                  ${value === optLabel ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-700'}`}
              >
                {optLabel}
              </button>
            );
          })}
        </div>
      )}
      {/* FIX: Show a message when dropdown is open but has no options */}
      {open && options.length === 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl px-4 py-3">
          <p className="text-sm text-gray-400 text-center">No options available</p>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const RegisterPage = () => {
  const [formData, setFormData] = useState({
    fullName: '',
    email:    '',
    phone:    '',
    password: '',
    role:     'student',
  });

  const [countryCode,        setCountryCode]       = useState(COUNTRY_CODES[0]);
  const [showPassword,       setShowPassword]       = useState(false);
  const [selectedCurriculum, setSelectedCurriculum] = useState(null);
  const [selectedGrade,      setSelectedGrade]      = useState('');
  const [curricula,          setCurricula]          = useState([]);
  const [loadingCurricula,   setLoadingCurricula]   = useState(true);
  // FIX A: Track API failure so we can show the fallback list
  const [usingFallback,      setUsingFallback]      = useState(false);
  const [error,              setError]              = useState('');
  const [loading,            setLoading]            = useState(false);
  const [termsAccepted,      setTermsAccepted]      = useState(false);

  const { register } = useAuth();
  const navigate      = useNavigate();

  // ── FIX A: Fetch curricula with fallback on failure ───────────────────────
  const fetchCurricula = () => {
    setLoadingCurricula(true);
    setUsingFallback(false);

    api.get('/exam-boards')
      .then(res => {
        // api.js interceptor returns response.data directly
        // res = { success, count, data: [...boards] }
        const boards = res.data || res || [];
        if (Array.isArray(boards) && boards.length > 0) {
          setCurricula(boards);
          setUsingFallback(false);
        } else {
          // Empty response — use fallback
          setCurricula(FALLBACK_CURRICULA);
          setUsingFallback(true);
        }
      })
      .catch(() => {
        // API unreachable — use hardcoded fallback so user is never stuck
        setCurricula(FALLBACK_CURRICULA);
        setUsingFallback(true);
      })
      .finally(() => setLoadingCurricula(false));
  };

  useEffect(() => {
    fetchCurricula();
  }, []);

  // FIX: Use robust grade resolution instead of exact key lookup
  const gradeOptions = getGradeOptions(selectedCurriculum);

  const handleChange = (e) =>
    setFormData(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleCurriculumChange = (opt) => {
    setSelectedCurriculum(opt);
    setSelectedGrade(''); // reset grade whenever curriculum changes
  };

  // isReady: curriculum/grade only required for students
  const isReady =
    formData.fullName.trim().length > 0 &&
    formData.email.trim().length > 0 &&
    formData.phone.trim().length > 0 &&
    formData.password.length >= 8 &&
    (selectedCurriculum !== null && selectedGrade !== '') &&
    termsAccepted;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.role === 'student') {
      if (!selectedCurriculum) { setError('Please select a curriculum.'); return; }
      if (!selectedGrade)       { setError('Please select your grade.'); return; }
    }
    if (formData.password.length < 8) { setError('Password must be at least 8 characters.'); return; }

    const nameParts = formData.fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName  = nameParts.slice(1).join(' ') || firstName;

    setLoading(true);
    try {
      const user = await register({
        firstName,
        lastName,
        email:             formData.email.trim().toLowerCase(),
        phone:             `${countryCode.dial}${formData.phone.trim()}`,
        password:          formData.password,
        role:              formData.role,
        pendingExamBoards: selectedCurriculum?.id ? [selectedCurriculum.id] : [],
        grade:             selectedGrade || null,
        terms_accepted:    true,
      });

      if (user.role === 'student')      navigate('/student/dashboard');
      else if (user.role === 'teacher') navigate('/teacher/dashboard');
      else                              navigate('/admin/dashboard');
    } catch (err) {
      setError(err?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const BG_GRADIENT = 'linear-gradient(135deg, #f0f4ff 0%, #e8eeff 50%, #f5f0ff 100%)';
  const BTN_ACTIVE  = 'linear-gradient(135deg, #4f46e5 0%, #6d28d9 100%)';
  const ACCENT      = '#6366f1';

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BG_GRADIENT }}>
      <PublicNav />

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div
          className="w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden flex"
          style={{ minHeight: '580px' }}
        >
          {/* ── Left panel ── */}
          <div
            className="hidden md:flex flex-col justify-center items-start flex-1 px-10 py-12 relative"
            style={{ background: 'linear-gradient(160deg, #3730a3 0%, #4338ca 50%, #2563eb 100%)' }}
          >
            <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-10"
              style={{ background: 'radial-gradient(circle, #818cf8, transparent)', transform: 'translate(30%, -30%)' }} />
            <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full opacity-10"
              style={{ background: 'radial-gradient(circle, #a78bfa, transparent)', transform: 'translate(-30%, 30%)' }} />

            <h1 className="text-3xl xl:text-4xl font-bold text-white leading-tight mb-4 relative z-10">
              Join Us &amp;<br />
              <span style={{ color: '#818cf8' }}>Elevate Your Education</span>
            </h1>
            <p className="text-gray-300 text-sm xl:text-base max-w-xs leading-relaxed relative z-10">
              Make learning easy and hassle free by practising our study
              quizzes and using our resources to boost your confidence and
              achieve exam success!
            </p>

            <div className="mt-8 w-64 xl:w-72 relative z-10">
              <svg viewBox="0 0 280 230" xmlns="http://www.w3.org/2000/svg" className="w-full drop-shadow-2xl">
                <rect x="55" y="158" width="170" height="13" rx="5" fill="#7c3aed" opacity="0.9"/>
                <rect x="70" y="90"  width="140" height="70" rx="6" fill="#4c1d95"/>
                <rect x="74" y="94"  width="132" height="62" rx="4" fill="#1e1b4b"/>
                <rect x="78" y="98"  width="124" height="54" rx="3" fill="#0f0a2e"/>
                <rect x="82" y="102" width="60" height="8" rx="2" fill="#818cf8" opacity="0.8"/>
                <rect x="82" y="114" width="40" height="5" rx="2" fill="#a78bfa" opacity="0.5"/>
                <rect x="82" y="123" width="50" height="5" rx="2" fill="#a78bfa" opacity="0.4"/>
                <rect x="82" y="132" width="35" height="5" rx="2" fill="#a78bfa" opacity="0.3"/>
                <circle cx="175" cy="122" r="14" fill="none" stroke="#818cf8" strokeWidth="1.5" opacity="0.7"/>
                <circle cx="175" cy="122" r="4"  fill="#f472b6"/>
                <ellipse cx="175" cy="122" rx="14" ry="5" fill="none" stroke="#c4b5fd" strokeWidth="1" opacity="0.6"/>
                <ellipse cx="175" cy="122" rx="14" ry="5" fill="none" stroke="#c4b5fd" strokeWidth="1" opacity="0.6" transform="rotate(60 175 122)"/>
                <ellipse cx="175" cy="122" rx="14" ry="5" fill="none" stroke="#c4b5fd" strokeWidth="1" opacity="0.6" transform="rotate(-60 175 122)"/>
                <rect x="130" y="115" width="14" height="34" rx="7" fill="#34d399" opacity="0.85"/>
                <rect x="148" y="108" width="14" height="42" rx="7" fill="#f472b6" opacity="0.85"/>
                <rect x="112" y="120" width="14" height="28" rx="7" fill="#fbbf24" opacity="0.85"/>
                <rect x="164" y="88"  width="6"  height="28" rx="3" fill="#e2e8f0" opacity="0.9"/>
                <polygon points="164,116 170,116 167,126" fill="#818cf8" opacity="0.9"/>
                <circle cx="100" cy="100" r="3"   fill="#f472b6" opacity="0.7"/>
                <circle cx="210" cy="95"  r="2.5" fill="#818cf8" opacity="0.7"/>
                <circle cx="95"  cy="145" r="2"   fill="#fbbf24" opacity="0.6"/>
                <circle cx="215" cy="150" r="2"   fill="#c4b5fd" opacity="0.6"/>
              </svg>
            </div>
          </div>

          {/* ── Right panel — form ── */}
          <div className="flex-1 bg-white flex items-center justify-center px-8 py-10">
            <div className="w-full max-w-sm">

              <h2 className="text-2xl font-bold text-gray-900 text-center mb-1">
                Register With Us
              </h2>
              <p className="text-center text-gray-500 text-sm mb-7">
                Unlock a world of possibilities! Sign up now to access exclusive features.
              </p>

              {/* Error */}
              {error && (
                <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* FIX A: Offline / fallback notice with retry button */}
              {usingFallback && !loadingCurricula && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between gap-2">
                  <p className="text-xs text-amber-700">
                    Using offline curriculum list — some options may differ.
                  </p>
                  <button
                    type="button"
                    onClick={fetchCurricula}
                    className="flex items-center gap-1 text-xs text-amber-700 font-semibold hover:text-amber-900 shrink-0"
                  >
                    <RefreshCw size={12} /> Retry
                  </button>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">

                {/* Full Name */}
                <div className="relative">
                  <label className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-500 font-medium z-10">
                    Full Name *
                  </label>
                  <input
                    name="fullName"
                    type="text"
                    value={formData.fullName}
                    onChange={handleChange}
                    placeholder="Full Name"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors"
                  />
                </div>

                {/* Email */}
                <div className="relative">
                  <label className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-500 font-medium z-10">
                    Email Address *
                  </label>
                  <input
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Email Address"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors"
                  />
                </div>

                {/* Phone */}
                <div className="relative">
                  <label className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-500 font-medium z-10">
                    Phone Number *
                  </label>
                  <div className="flex border border-gray-300 rounded-lg overflow-hidden focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-colors">
                    <CountryCodePicker selected={countryCode} onChange={setCountryCode} />
                    <input
                      name="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="Phone number"
                      required
                      className="flex-1 px-3 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none bg-white"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="relative">
                  <label className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-500 font-medium z-10">
                    Password *
                  </label>
                  <input
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Password (min 8 characters)"
                    required
                    minLength={8}
                    className="w-full px-4 py-3 pr-11 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                  {/* FIX B: Live password strength indicator */}
                  {formData.password.length > 0 && formData.password.length < 8 && (
                    <p className="text-xs text-amber-600 mt-1 ml-1">
                      {8 - formData.password.length} more character{8 - formData.password.length !== 1 ? 's' : ''} needed
                    </p>
                  )}
                </div>

                {/* Role selector */}
                <div className="relative">
                  <label className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-500 font-medium z-10">
                    I am a *
                  </label>
                  <div className="flex gap-2 pt-1">
                    {[
                      { value: 'student', label: ' Student', desc: 'Access lessons & practice exams' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFormData(f => ({ ...f, role: opt.value }))}
                        className={`flex-1 flex flex-col items-center py-3 px-2 border-2 rounded-lg text-xs font-medium transition-all
                          ${formData.role === opt.value
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                            : 'border-gray-200 bg-white text-gray-500 hover:border-indigo-300'}`}
                      >
                        <span className="text-lg mb-0.5">{opt.label.split(' ')[0]}</span>
                        <span className="font-semibold">{opt.label.split(' ').slice(1).join(' ')}</span>
                        <span className="text-gray-400 text-[10px] mt-0.5 text-center leading-tight">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Curriculum & Grade — only for students */}
                {formData.role === 'student' && (
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <label className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-500 font-medium z-10">
                        Curriculum *
                      </label>
                      <CustomDropdown
                        placeholder="Curriculum"
                        value={selectedCurriculum?.name || ''}
                        options={curricula}
                        onChange={handleCurriculumChange}
                        loading={loadingCurricula}
                      />
                    </div>
                    <div className="relative flex-1">
                      <label className="absolute -top-2 left-3 px-1 bg-white text-xs text-gray-500 font-medium z-10">
                        Grade *
                      </label>
                      <CustomDropdown
                        placeholder="Grade"
                        value={selectedGrade}
                        options={gradeOptions}
                        onChange={(opt) => setSelectedGrade(typeof opt === 'string' ? opt : (opt.name || opt))}
                        disabled={!selectedCurriculum || loadingCurricula}
                      />
                    </div>
                  </div>
                )}

                {/* Terms of Service */}
                <div className="flex items-start gap-2 mt-2">
                  <input
                    type="checkbox"
                    id="terms"
                    checked={termsAccepted}
                    onChange={e => setTermsAccepted(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 accent-indigo-600"
                  />
                  <label htmlFor="terms" className="text-xs text-gray-500 leading-relaxed">
                    I agree to the{' '}
                    <Link to="/terms" target="_blank" className="text-indigo-600 underline">Terms of Service</Link>
                    {' '}and{' '}
                    <Link to="/privacy" target="_blank" className="text-indigo-600 underline">Privacy Policy</Link>
                  </label>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading || !isReady}
                  className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-all mt-1"
                  style={{
                    background: isReady && !loading ? BTN_ACTIVE : '#d1d5db',
                    cursor:     isReady && !loading ? 'pointer'   : 'not-allowed',
                  }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Creating account…
                    </span>
                  ) : 'Sign Up'}
                </button>

              </form>

              <p className="text-center text-sm text-gray-500 mt-5">
                Already have an account?{' '}
                <Link to="/login" className="font-semibold" style={{ color: ACCENT }}>
                  Login here
                </Link>
              </p>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
