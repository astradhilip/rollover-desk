import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: api.me });

/** Viewers read only. The API enforces this; hiding the controls just avoids offering what would be refused. */
export const useCanEdit = () => useMe().data?.role === 'analyst';

/** Every write can change figures across the property, so all cached data is refreshed. */
export function useAction<V, R>(action: (vars: V) => Promise<R>, onSuccess?: (result: R) => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: async (result) => {
      await client.invalidateQueries();
      onSuccess?.(result);
    },
  });
}
