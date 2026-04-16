import { useState } from 'react';
import * as sessionApi from '../api/sessionApi';

export default function useSession() {
  const [session, setSession] = useState(null);

  const start = async (subtopicId) => {
    const res = await sessionApi.startSession(subtopicId);
    setSession(res.data.data);
  };

  const end = async () => {
    if (!session) return;
    await sessionApi.endSession(session.id);
    setSession(null);
  };

  return { session, start, end };
}
