// client/src/pages/lang/ComingSoon.jsx
// Shared "yet to be completed" placeholder — used for the Listening
// Comprehension and Written Composition exercises (deliberately not built
// yet, see languageMasterclassRoutes.js for why) and for the empty
// Intermediate/Advanced levels. This is not an error state or a loading
// state — it's an honest, permanent placeholder until this is actually
// built, so it says that plainly rather than pretending to be "loading."

import { Construction } from 'lucide-react';

export default function ComingSoon({ title, description, accent = '#6366f1' }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: `${accent}1a` }}
      >
        <Construction size={28} style={{ color: accent }} aria-hidden="true" />
      </div>
      <h3 className="text-lg font-bold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 max-w-xs">
        {description || 'This part is yet to be completed.'}
      </p>
    </div>
  );
}
