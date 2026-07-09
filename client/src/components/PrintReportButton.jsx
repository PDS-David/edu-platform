// client/src/components/PrintReportButton.jsx
// Shared "Download / Print Report" button used on both the AISchoolonair
// teacher/admin student report and the English Masterclass progress report.
//
// How it works: pressing it calls the browser's own print dialog
// (window.print()). The report content it prints is whatever is wrapped in
// a "printable-report" class (see index.css) elsewhere on the same page —
// everything else is hidden automatically while printing. From that dialog,
// choosing a physical printer prints it, and choosing "Save as PDF" (or
// "Microsoft Print to PDF" on Windows) downloads it as a PDF file. Either
// way, this one button covers both "printable" and "downloadable".

import { Printer } from 'lucide-react';

export default function PrintReportButton({ label = 'Download / Print Report', className = '' }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={`no-print flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors ${className}`}
    >
      <Printer size={14} aria-hidden="true" />
      {label}
    </button>
  );
}
