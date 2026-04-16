import { adminClient } from './adminClient';

export const statsService = {
  platformStats: () =>
    adminClient.get('/admin/platform-stats'),

  pendingCount: () =>
    adminClient.get('/admin/questions/pending-count')
};
