// client/src/pages/JoinSchoolPage.jsx
// Route: /join-school (any authenticated teacher or student)
//
// Self-join by code has been permanently disabled — POST /api/schools/join
// now returns a 403 unconditionally for every caller (see commit 2643baf on
// server/routes/schoolRoutes.js). School membership is now set up by a
// school or app administrator instead. This page is kept (rather than
// deleted) so anyone who still lands on /join-school via a bookmark or old
// link sees a clear explanation instead of a raw 404 or a form that always
// fails.

import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import TopNav from '../components/TopNav';
import { School, Info } from 'lucide-react';

export default function JoinSchoolPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Already affiliated with a school — nothing to do here.
  const alreadyInSchool = !!user?.school_id;

  return (
    <div className="min-h-screen bg-[#f9f7f4]">
      <TopNav />
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
            <School size={22} className="text-indigo-600" />
          </div>

          {alreadyInSchool ? (
            <>
              <h1 className="text-lg font-bold text-gray-900 mb-1">You're already part of a school</h1>
              <p className="text-sm text-gray-500 mb-5">
                Your account is already linked to a school. If that's changed, contact your school
                admin or AISchoolonair support.
              </p>
              <button onClick={() => navigate(-1)}
                className="text-sm font-semibold text-indigo-600 hover:underline">
                Go back
              </button>
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <Info size={20} className="text-gray-500" />
              </div>
              <h1 className="text-lg font-bold text-gray-900 mb-1">Joining by code is no longer available</h1>
              <p className="text-sm text-gray-500 mb-5">
                Accounts are now linked to a school by a school or app admin. If you're expecting to
                be part of a school, ask your school admin to add your account directly.
              </p>
              <button onClick={() => navigate(-1)}
                className="text-sm font-semibold text-indigo-600 hover:underline">
                Go back
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

