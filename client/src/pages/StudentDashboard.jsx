import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import TopNav from '../components/TopNav';
import api from '../services/api';

export default function StudentDashboard() {

  const { user } = useAuth();
  const navigate = useNavigate();

  const [resources, setResources] = useState([]);
  const [loadingResources, setLoadingResources] = useState(true);

  const firstName = user?.firstName || 'Student';

/* ===============================
   LOAD RESOURCES
=============================== */

  useEffect(() => {

    const loadResources = async () => {

      try {

        const res = await api.get('/resources');

        setResources(res.data.data || []);

      } catch (err) {

        console.error('Resources load failed:', err);

      } finally {

        setLoadingResources(false);

      }

    };

    loadResources();

  }, []);

/* ===============================
   GROUP BY SUBJECT
=============================== */

  const grouped = {};

  resources.forEach(r => {

    const subject = r.subject_name || 'Other';

    if (!grouped[subject]) {
      grouped[subject] = [];
    }

    grouped[subject].push(r);

  });

/* ===============================
   RENDER
=============================== */

  return (

    <div className="min-h-screen bg-gray-50">

      <TopNav />

      <div className="max-w-2xl mx-auto p-4">

        <h1 className="text-xl font-bold mb-4">
          Hi, {firstName}
        </h1>

{/* ===============================
   MY FILES SECTION
=============================== */}

        <div className="bg-white p-4 rounded-xl">

          <h2 className="font-semibold mb-3">
            My Files
          </h2>

          {loadingResources ? (

            <p className="text-sm text-gray-400">
              Loading files...
            </p>

          ) : resources.length === 0 ? (

            <p className="text-sm text-gray-400">
              No files assigned yet.
            </p>

          ) : (

            Object.keys(grouped).map(subject => (

              <div key={subject} className="mb-4">

                <h3 className="font-semibold text-sm mb-2">
                  {subject}
                </h3>

                <div className="space-y-2">

                  {grouped[subject].map(file => (

                    <div
                      key={file.id}
                      className="border p-3 rounded-lg flex justify-between items-center"
                    >

                      <span className="text-sm">
                        {file.title}
                      </span>

                      <div className="flex gap-2">

                        <a
                          href={file.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-500 text-sm"
                        >
                          View
                        </a>

                        <a
                          href={file.file_url}
                          download
                          className="text-green-500 text-sm"
                        >
                          Download
                        </a>

                      </div>

                    </div>

                  ))}

                </div>

              </div>

            ))

          )}

        </div>

      </div>

    </div>

  );

}
