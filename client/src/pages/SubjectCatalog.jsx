import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X, BookOpen, Search, AlertCircle, RefreshCw } from 'lucide-react';
import ExamBoardSelector from '../components/ExamBoardSelector';
import SubjectCard from '../components/SubjectCard';
import branding from '../config/branding';

const SubjectCatalog = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedBoard, setSelectedBoard] = useState('');
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Only fetch when a board is selected
  useEffect(() => {
    if (selectedBoard) {
      fetchSubjects();
    } else {
      setSubjects([]);
      setLoading(false);
      setError(null);
    }
  }, [selectedBoard]);

  const fetchSubjects = async () => {
    setLoading(true);
    setError(null);

    try {
      // FIXED: Use environment variable for API base URL
      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const response = await fetch(`${API_BASE}/exam-boards/${selectedBoard}/subjects`);

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const json = await response.json();

      // API returns { success: true, exam_board: {...}, count: N, data: [...] }
      // Guard against plain array responses too
      const list = Array.isArray(json) ? json : (json.data || []);
      setSubjects(list);
    } catch (err) {
      console.error('Error fetching subjects:', err);
      setError('Unable to load subjects. Please check your connection and try again.');
      setSubjects([]);
    } finally {
      setLoading(false);
    }
  };

  // Client-side search filter
  const filteredSubjects = subjects.filter(subject =>
    subject.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    subject.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleBoardChange = (boardCode) => {
    setSelectedBoard(boardCode);
    setSearchQuery('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">

      {/* ── Navbar (matches LandingPage exactly) ── */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-lg shadow-sm z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">

            {/* Logo */}
            <div className="flex items-center">
              <Link to="/">
                <img
                  src={branding.logo.main}
                  alt="EAC Learning Platform"
                  className="h-14 w-auto object-contain"
                />
              </Link>
            </div>

            {/* Desktop Menu */}
            <div className="hidden md:flex items-center space-x-8">
              <Link to="/" className="text-gray-700 hover:text-primary-600 font-medium transition-colors">
                Home
              </Link>
              <Link
                to="/subjects"
                className="text-green-600 font-semibold border-b-2 border-green-600 pb-0.5 transition-colors"
              >
                Subjects
              </Link>
              <Link to="/login" className="text-gray-700 hover:text-primary-600 font-medium transition-colors">
                Sign In
              </Link>
              <Link to="/register" className="btn-primary">
                Get Started
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t">
            <div className="px-4 py-4 space-y-3">
              <Link to="/" className="block text-gray-700 hover:text-primary-600 font-medium">
                Home
              </Link>
              <Link to="/subjects" className="block text-green-600 font-semibold">
                Subjects
              </Link>
              <Link to="/login" className="block text-gray-700 hover:text-primary-600 font-medium">
                Sign In
              </Link>
              <Link to="/register" className="block btn-primary text-center">
                Get Started
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* ── Page Content ── */}
      <main className="pt-28 pb-20 px-4">
        <div className="max-w-7xl mx-auto">

          {/* ── Page Header ── */}
          <div className="text-center mb-12 animate-fadeIn">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-100 to-emerald-100 rounded-2xl mb-4">
              <BookOpen className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">
              Examinations
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Choose your examination type to explore subjects, study materials, past papers and practice questions.
            </p>
          </div>

          {/* ── Filters Bar ── */}
          <div className="bg-white rounded-2xl shadow-md p-6 mb-10">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">

              {/* Exam Board Selector */}
              <div className="w-full md:w-72">
                <ExamBoardSelector
                  selectedBoard={selectedBoard}
                  onBoardChange={handleBoardChange}
                  showLabel={true}
                  size="medium"
                />
              </div>

              {/* Subject Search — only shown when a board is selected */}
              {selectedBoard && (
                <div className="w-full md:flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Search Subjects
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="e.g. Mathematics, Biology..."
                      className="input-field pl-10"
                    />
                  </div>
                </div>
              )}

              {/* Clear Filters */}
              {(selectedBoard || searchQuery) && (
                <button
                  onClick={() => { setSelectedBoard(''); setSearchQuery(''); }}
                  className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors whitespace-nowrap"
                >
                  <X className="w-4 h-4" />
                  Clear
                </button>
              )}
            </div>

            {/* Active filter badge */}
            {selectedBoard && (
              <div className="mt-4 flex items-center gap-2">
                <span className="text-sm text-gray-500">Filtering by:</span>
                <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-semibold rounded-full">
                  {selectedBoard}
                </span>
              </div>
            )}
          </div>

          {/* ── No Board Selected Prompt ── */}
          {!loading && !error && !selectedBoard && (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
              <div className="text-6xl">🎓</div>
              <h3 className="text-xl font-bold text-gray-900">Select an Examination Type</h3>
              <p className="text-gray-500 max-w-sm">
                Choose an examination type above — JAMB, WAEC, A-Levels, English Language Lab and more — to see all available subjects.
              </p>
            </div>
          )}

          {/* ── Loading State ── */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-green-600"></div>
              <p className="text-gray-500 font-medium">Loading subjects...</p>
            </div>
          )}

          {/* ── Error State ── */}
          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center">
                <AlertCircle className="w-10 h-10 text-red-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h3>
                <p className="text-gray-500 max-w-md">{error}</p>
              </div>
              <button
                onClick={fetchSubjects}
                className="flex items-center gap-2 btn-primary"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
            </div>
          )}

          {/* ── Empty State (board selected but no subjects returned) ── */}
          {!loading && !error && selectedBoard && filteredSubjects.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
              <div className="text-6xl">📭</div>
              <h3 className="text-xl font-bold text-gray-900">No subjects found</h3>
              <p className="text-gray-500 max-w-sm">
                {searchQuery
                  ? `No subjects match "${searchQuery}". Try a different search term.`
                  : `No subjects are listed under ${selectedBoard} yet. Try another exam board.`}
              </p>
              <button
                onClick={() => { setSelectedBoard(''); setSearchQuery(''); }}
                className="btn-secondary"
              >
                Clear Filters
              </button>
            </div>
          )}

          {/* ── Subject Grid ── */}
          {!loading && !error && filteredSubjects.length > 0 && (
            <>
              <p className="text-sm text-gray-500 mb-6 font-medium">
                Showing <span className="text-gray-900 font-bold">{filteredSubjects.length}</span>{' '}
                {filteredSubjects.length === 1 ? 'subject' : 'subjects'}
                {selectedBoard ? ` for ${selectedBoard}` : ''}
                {searchQuery ? ` matching "${searchQuery}"` : ''}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 animate-fadeIn">
                {filteredSubjects.map((subject) => (
                  <SubjectCard
                    key={subject.id}
                    subject={subject}
                    examBoard={selectedBoard}
                    showExamBoard={false}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="bg-gray-900 text-gray-300 py-10 px-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <img
            src={branding.logo.main}
            alt="EAC Learning Platform"
            className="h-10 w-auto object-contain"
          />
          <p className="text-sm">© 2026 EAC Learning Platform. All rights reserved.</p>
          <div className="flex gap-6 text-sm">
            <Link to="/privacy" className="hover:text-primary-400 transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-primary-400 transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default SubjectCatalog;
