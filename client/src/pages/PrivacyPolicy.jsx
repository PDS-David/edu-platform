import { Link } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import PublicNav from '../components/PublicNav';

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <PublicNav
        right={
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Lock className="w-4 h-4" />
            <span>Last updated: March 2026</span>
          </div>
        }
      />

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-lg p-8 md:p-12">

          {/* Title */}
          <div className="mb-10 pb-8 border-b border-gray-100">
            <h1 className="text-4xl font-extrabold text-gray-900 mb-3">Privacy Policy</h1>
            <p className="text-gray-500">
              Your privacy matters to us. This policy explains how EAC Learning Platform collects,
              uses, and protects your personal information.
            </p>
          </div>

          <div className="prose prose-gray max-w-none space-y-8 text-gray-700 leading-relaxed">

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">1. Who We Are</h2>
              <p>
                This Privacy Policy applies to the EAC Learning Platform operated by Educational Advancement Centre, Ibadan
                ("EAC", "we", "us", or "our"). We are committed to protecting the privacy of all users,
                with particular care for the data of students.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">2. Information We Collect</h2>
              <p className="mb-3">We collect the following categories of personal information:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Account Information:</strong> Name, email address, role (student/teacher/admin), and password (stored encrypted).</li>
                <li><strong>Academic Data:</strong> Course enrolments, quiz results, assignment submissions, and progress records.</li>
                <li><strong>Usage Data:</strong> Time spent on the Platform, pages visited, features used, and login timestamps.</li>
                <li><strong>Device & Technical Data:</strong> IP address, browser type, and operating system (collected automatically for security purposes).</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">3. How We Use Your Information</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>To provide, maintain, and improve the Platform and its features.</li>
                <li>To personalise your learning experience and generate academic progress reports.</li>
                <li>To communicate with you about your account, updates, and important notices.</li>
                <li>To detect and prevent fraud, abuse, and security incidents.</li>
                <li>To generate anonymised analytics to improve educational outcomes across the Platform.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">4. How We Share Your Information</h2>
              <p className="mb-3">We do <strong>not</strong> sell your personal information. We may share information only in the following circumstances:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>With Teachers & Administrators:</strong> Student academic data is visible to assigned teachers and school administrators for legitimate educational purposes.</li>
                <li><strong>Service Providers:</strong> We may engage trusted third-party providers (e.g., hosting, email delivery) who are bound by confidentiality obligations.</li>
                <li><strong>Legal Requirements:</strong> We may disclose information if required by law or to protect the rights and safety of our users.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">5. Data Security</h2>
              <p>
                We implement industry-standard security measures including encrypted passwords (bcrypt), HTTPS connections,
                JWT-based authentication, and access controls to protect your data. However, no system is completely
                immune from security risks. You are responsible for keeping your login credentials confidential.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">6. Data Retention</h2>
              <p>
                We retain your personal data for as long as your account is active or as needed to provide services.
                Academic records may be retained for longer periods to fulfil institutional obligations.
                You may request deletion of your account by contacting us at the details below.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">7. Children's Privacy</h2>
              <p>
                The Platform may be used by students under the age of 18. In such cases, we require
                that schools and teachers are responsible for obtaining any necessary parental consent
                before registering minors on the Platform. We do not knowingly collect personal data
                from children without appropriate institutional oversight.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">8. Your Rights</h2>
              <p className="mb-3">You have the right to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Access the personal information we hold about you.</li>
                <li>Request correction of inaccurate data.</li>
                <li>Request deletion of your account and associated personal data.</li>
                <li>Object to the processing of your data in certain circumstances.</li>
              </ul>
              <p className="mt-3">To exercise any of these rights, contact us at the email below.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">9. Cookies</h2>
              <p>
                The Platform uses browser local storage (not traditional cookies) to maintain your login session.
                No third-party advertising cookies are used. You can clear your local storage at any time
                through your browser settings, which will log you out of the Platform.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">10. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy periodically. We will inform users of material changes
                via a notice on the Platform or by email. Your continued use of the Platform after
                changes are posted constitutes acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3">11. Contact Us</h2>
              <p>For any privacy-related questions or requests, please reach out to us:</p>
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
              <Link to="/terms" className="text-primary-600 hover:text-primary-700 font-medium">Terms of Service</Link>
              <Link to="/register" className="text-primary-600 hover:text-primary-700 font-medium">Create Account</Link>
              <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">Sign In</Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PrivacyPolicy;
