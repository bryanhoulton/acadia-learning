import { kea } from 'kea';
import { toast } from 'sonner';

import { Goal } from '../types';
import client from '../utils/api';
import type { goalsLogicType } from './goalsLogicType';

export const goalsLogic = kea<goalsLogicType>({
  path: ["src", "logic", "goalsLogic"],

  loaders: {
    goals: [
      [] as Goal[],
      {
        loadGoals: async () => {
          const { data, error } = await client.GET("/api/lms/calendars/goals/");
          if (error) {
            toast.error("Error fetching goals");
            return [];
          }
          return data;
        },
      },
    ],
  },

  events: ({ actions }) => ({
    afterMount: actions.loadGoals,
  }),
});
