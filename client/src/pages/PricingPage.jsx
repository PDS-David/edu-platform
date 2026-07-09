// client/src/pages/PricingPage.jsx
import branding from '../config/branding';
import PublicNav from '../components/PublicNav';

const whatsapp = (branding.contact?.phones?.[0] || '+2348090123412').replace(/\s+/g, '');

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <PublicNav />
      <div className="flex flex-col items-center justify-center p-8 text-center">
      <h1 className="text-3xl font-bold text-gray-900 mb-3">Pricing</h1>
      <p className="text-gray-500 mb-2 max-w-md text-sm">
        Affordable plans for every student — JAMB, WAEC, NECO, JUPEB and more.
      </p>
      <p className="text-gray-400 mb-8 max-w-md text-sm">
        Contact us directly for current subscription rates and school bulk pricing.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <a
          href={`https://wa.me/${whatsapp.replace('+', '')}`}
          target="_blank" rel="noopener noreferrer"
          className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
        >
          💬 Chat on WhatsApp
        </a>
        <a
          href={`mailto:${branding.contact?.email || 'info@aischoolonair.ng'}`}
          className="border-2 border-blue-600 text-blue-600 hover:bg-blue-50 px-6 py-3 rounded-xl font-semibold transition-colors"
        >
          ✉️ Send us an Email
        </a>
      </div>
      </div>
    </div>
  );
}

// UpgradeWall — disabled for MVP. Components that import this get a no-op.
export function UpgradeWall() { return null; }
