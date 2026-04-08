import { Link } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import PublicNav from '../components/PublicNav';

const TermsOfService = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <PublicNav
        right={
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Shield className="w-4 h-4" />
            <span>Last updated: March 2026</span>
          </div>
        }
      />

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-lg p-8 md:p-12">

          {/* Title */}
          <div className="mb-10 pb-8 border-b border-gray-100">
            <h1 className="text-4xl font-extrabold text-gray-900 mb-3">Terms of Service</h1>
            <p className="text-gray-500">
              Please read these terms carefully before using the EAC Learning Platform.
            </p>
          </div>

          <div className="prose prose-gray max-w-none space-y-8 text-gray-700 leading-relaxed">

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">1. Acceptance of Terms</h2>
              <p>
                By accessing or using the EAC Learning Platform ("Platform"), you agree to be bound by these Terms of Service.
                These terms apply to all users — students, teachers, and administrators. If you do not agree to these terms,
                you may not access or use the Platform.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">2. Description of Service</h2>
              <p>
                The EAC Learning Platform is an educational management system provided by Educational Advancement Centre,
                Ibadan. The Platform offers tools for course management, student tracking, assessments, analytics,
                and AI-assisted learning to support academic excellence.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">3. User Accounts</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>You must provide accurate and complete information when creating an account.</li>
                <li>You are responsible for maintaining the confidentiality of your login credentials.</li>
                <li>You must notify us immediately of any unauthorised access to your account.</li>
                <li>One person may not maintain more than one active account without prior written consent.</li>
                <li>Accounts are non-transferable and may not be shared with others.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">4. Acceptable Use</h2>
              <p className="mb-3">You agree not to use the Platform to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Upload, share, or distribute content that is unlawful, harmful, defamatory, or offensive.</li>
                <li>Impersonate another person or misrepresent your identity or affiliation.</li>
                <li>Attempt to gain unauthorised access to any part of the Platform or its related systems.</li>
                <li>Interfere with or disrupt the integrity or performance of the Platform.</li>
                <li>Use automated tools (bots, scrapers) to access the Platform without prior written permission.</li>
                <li>Engage in academic dishonesty, including submitting another person's work as your own.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">5. Intellectual Property</h2>
              <p>
                All content on the Platform — including course materials, assessments, logos, and software — is the property
                of Educational Advancement Centre or its licensors and is protected by applicable intellectual property laws.
                You may not copy, reproduce, distribute, or create derivative works without express written permission.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">6. Student Data & Privacy</h2>
              <p>
                We take the privacy of student data seriously. Collection and use of personal data is governed by our
                <Link to="/privacy" className="text-primary-600 hover:text-primary-700 font-medium mx-1">Privacy Policy</Link>,
                which forms part of these Terms. By using the Platform, you consent to such collection and use as described therein.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">7. Termination</h2>
              <p>
                We reserve the right to suspend or terminate your account at our discretion, without prior notice,
                if we determine you have violated these Terms or engaged in conduct harmful to other users or the Platform.
                Upon termination, your right to access the Platform ceases immediately.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">8. Limitation of Liability</h2>
              <p>
                To the fullest extent permitted by law, EAC shall not be liable for any indirect, incidental, special,
                or consequential damages arising from your use of the Platform. The Platform is provided "as is" without
                warranties of any kind, express or implied.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">9. Changes to Terms</h2>
              <p>
                We may update these Terms from time to time. We will notify users of significant changes via email or
                a prominent notice on the Platform. Continued use of the Platform after changes take effect constitutes
                acceptance of the revised Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">10. Contact Us</h2>
              <p>
                If you have any questions about these Terms, please contact us at:
              </p>
              <div className="mt-3 p-4 bg-primary-50 rounded-lg border border-primary-100">
                <p className="font-semibold text-gray-900">Educational Advancement Centre, Ibadan</p>
                <p className="text-gray-600 text-sm mt-1">Email: info@eac.edu.ng</p>
              </div>
            </section>

          </div>

          {/* Footer links */}
          <div className="mt-12 pt-8 border-t border-gray-100 flex flex-col sm:flex-row gap-4 justify-between items-center">
            <p className="text-sm text-gray-500">© 2026 EAC Learning Platform. All rights reserved.</p>
            <div className="flex gap-6 text-sm">
              <Link to="/privacy" className="text-primary-600 hover:text-primary-700 font-medium">Privacy Policy</Link>
              <Link to="/register" className="text-primary-600 hover:text-primary-700 font-medium">Create Account</Link>
              <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">Sign In</Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default TermsOfService;
