import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, endpoints } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'

export const useSite = () => useQuery({ queryKey: ['site'], queryFn: endpoints.site })
export const useProfile = () => useQuery({ queryKey: ['profile'], queryFn: endpoints.profile })
export const useStatistics = () => useQuery({ queryKey: ['statistics'], queryFn: endpoints.statistics })
export const useProjects = (featured = false) =>
  useQuery({ queryKey: ['projects', featured], queryFn: () => endpoints.projects(featured) })
export const useProject = (slug: string) =>
  useQuery({ queryKey: ['project', slug], queryFn: () => endpoints.project(slug), enabled: !!slug })
export const useBlog = () => useQuery({ queryKey: ['blog'], queryFn: endpoints.blog })
export const usePost = (slug: string) =>
  useQuery({ queryKey: ['post', slug], queryFn: () => endpoints.post(slug), enabled: !!slug })
export const useSkills = () => useQuery({ queryKey: ['skills'], queryFn: endpoints.skills })
export const useExperience = () => useQuery({ queryKey: ['experience'], queryFn: endpoints.experience })
export const useEducation = () => useQuery({ queryKey: ['education'], queryFn: endpoints.education })
export const useServices = () => useQuery({ queryKey: ['services'], queryFn: endpoints.services })
export const useTestimonials = () => useQuery({ queryKey: ['testimonials'], queryFn: endpoints.testimonials })
export const useContactInfo = () => useQuery({ queryKey: ['contact-info'], queryFn: endpoints.contactInfo })
export const usePage = (slug: string) => {
  const { token } = useAuth()
  return useQuery({
    // Staff token unlocks draft pages — keep cache buckets separate.
    queryKey: ['page', slug, token ? 'staff' : 'public'],
    queryFn: () => endpoints.page(slug),
    enabled: !!slug,
    retry: false,
  })
}
export const useProducts = () =>
  useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { normalizeProduct } = await import('@/modules/products/normalizeProduct')
      const list = await endpoints.products()
      return (list ?? [])
        .map((row) => normalizeProduct(row as never))
        .filter((p): p is NonNullable<typeof p> => p != null)
    },
  })
export const useProduct = (slug: string) =>
  useQuery({
    queryKey: ['product', slug],
    queryFn: async () => {
      const { normalizeProduct } = await import('@/modules/products/normalizeProduct')
      const row = await endpoints.product(slug)
      return normalizeProduct(row as never)
    },
    enabled: !!slug,
  })
export const useDashboard = () => useQuery({ queryKey: ['dashboard'], queryFn: endpoints.dashboard })

export const useAdminList = <T>(resource: string, enabled = true) =>
  useQuery({ queryKey: ['admin', resource], queryFn: () => endpoints.adminList<T>(resource), enabled })

export const useAdminItem = <T>(resource: string, id?: string) =>
  useQuery({
    queryKey: ['admin', resource, id],
    queryFn: () => endpoints.adminGet<T>(resource, id!),
    enabled: !!id && id !== 'new',
  })

export const useAdminSingleton = <T>(path: string) =>
  useQuery({ queryKey: ['admin-singleton', path], queryFn: () => endpoints.adminSingleton<T>(path) })

export function useCrud(resource: string) {
  const client = useQueryClient()
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ['admin', resource] })
    void client.invalidateQueries({ queryKey: [resource] })
    void client.invalidateQueries({ queryKey: ['site'] })
    void client.invalidateQueries({ queryKey: ['dashboard'] })
  }
  return {
    save: useMutation({
      mutationFn: ({ data, id }: { data: unknown; id?: string | number }) =>
        endpoints.adminSave(resource, data, id),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string | number) => endpoints.adminDelete(resource, id),
      onSuccess: invalidate,
      onError: (error) => {
        window.alert(error instanceof Error ? error.message : 'Не удалось удалить')
      },
    }),
  }
}

export function useSingletonSave(path: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => endpoints.adminSingletonSave(path, data),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin-singleton', path] })
      void client.invalidateQueries({ queryKey: ['site'] })
    },
  })
}

export function useContactMutation() {
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post<{ message: string }>('/contact', data),
  })
}
