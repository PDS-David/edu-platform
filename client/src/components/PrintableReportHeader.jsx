// client/src/components/PrintableReportHeader.jsx
// Shared header shown at the top of any printable report — identifies what
// the report is, who it's for, and when it was generated. Shown on screen
// too (not just when printing), so nothing looks different right before
// someone prints it.

export default function PrintableReportHeader({ brand = 'AISchoolonair', title, subtitle }) {
  return (
    <div className="mb-4 pb-3 border-b border-gray-200">
      <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">{brand}</p>
      <h2 className="text-lg font-bold text-gray-900 leading-tight">{title}</h2>
      {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      <p className="text-xs text-gray-400 mt-1">
        Generated {new Date().toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}
      </p>
    </div>
  );
}
