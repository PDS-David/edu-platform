// Standardised back button — always top-left, same style, same position.
// Usage: <BackButton to="/student/subjects" /> or <BackButton /> (uses navigate(-1))
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function BackButton({ to, label = 'Back' }) {
  const navigate = useNavigate();
  const handleClick = () => to ? navigate(to) : navigate(-1);

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
    >
      <ArrowLeft size={15} />
      {label}
    </button>
  );
}
