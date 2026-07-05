import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '../../lib/api-client'
import { adminUserListSchema } from '../../schemas/user'

function usersKey(role: 'user' | 'driver') {
  return ['admin-users', role] as const
}

export function useAdminUsers(role: 'user' | 'driver') {
  const path = role === 'driver' ? '/admin/drivers' : '/admin/users'
  return useQuery({
    queryKey: usersKey(role),
    queryFn: async () => {
      const response = await apiClient.get(path)
      return adminUserListSchema.parse(response.data).data
    },
  })
}

export function useSetUserActive(role: 'user' | 'driver') {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, active }: { userId: string; active: boolean }) => {
      await apiClient.put(`/admin/users/${userId}/active`, { active })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: usersKey(role) })
    },
  })
}

export interface CreateDriverInput {
  phone: string
  first_name: string
  last_name: string
}

export function useCreateDriver() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateDriverInput) => {
      await apiClient.post('/admin/drivers', input)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: usersKey('driver') })
    },
  })
}

export function useResetLockout(role: 'user' | 'driver') {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      await apiClient.post(`/admin/users/${userId}/reset-lockout`)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: usersKey(role) })
    },
  })
}

export interface CreateUserInput {
  phone: string
  first_name: string
  last_name: string
  role: 'user' | 'vendor' | 'driver'
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateUserInput) => {
      await apiClient.post('/admin/users', input)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-vendor-owners'] })
    },
  })
}

export function useVendorOwners() {
  return useQuery({
    queryKey: ['admin-vendor-owners'],
    queryFn: async () => {
      const response = await apiClient.get('/admin/vendor-owners')
      return adminUserListSchema.parse(response.data).data
    },
  })
}
