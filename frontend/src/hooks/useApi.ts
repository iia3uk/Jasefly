import { useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, endpoints } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { siteHasPlugin } from '@/core/pluginGates'
import {
  arePluginsHydrated,
  isPluginEnabledReady,
  subscribePluginState,
} from '@/core/moduleRegistry'

export const useSite = () => useQuery({ queryKey: ['site'], queryFn: endpoints.site })

/** True after /site or /admin/plugins has hydrated the enable map. */
export function usePluginsHydrated(): boolean {
  return useSyncExternalStore(subscribePluginState, arePluginsHydrated, () => false)
}

/** Strict plugin gate for admin API/UI — false until hydrated (no fail-open). */
export function usePluginEnabled(name: string): boolean {
  return useSyncExternalStore(
    subscribePluginState,
    () => isPluginEnabledReady(name),
    () => false,
  )
}

/** Wait for /site.enabled_plugins, then gate portfolio-owned public fetches. */
function usePortfolioFetchEnabled(extra = true): boolean {
  const { data: site } = useSite()
  if (!Array.isArray(site?.enabled_plugins)) return false
  return extra && siteHasPlugin(site.enabled_plugins, 'portfolio')
}

export const useProfile = () => {
  const enabled = usePortfolioFetchEnabled()
  return useQuery({ queryKey: ['profile'], queryFn: endpoints.profile, enabled })
}
export const useStatistics = () => {
  const enabled = usePortfolioFetchEnabled()
  return useQuery({ queryKey: ['statistics'], queryFn: endpoints.statistics, enabled })
}
export const useProjects = (featured = false, enabled = true) => {
  const on = usePortfolioFetchEnabled(enabled)
  return useQuery({ queryKey: ['projects', featured], queryFn: () => endpoints.projects(featured), enabled: on })
}
export const useProject = (slug: string) => {
  const on = usePortfolioFetchEnabled(!!slug)
  return useQuery({ queryKey: ['project', slug], queryFn: () => endpoints.project(slug), enabled: on })
}
export const useBlog = () => useQuery({ queryKey: ['blog'], queryFn: endpoints.blog })
export const usePost = (slug: string) =>
  useQuery({ queryKey: ['post', slug], queryFn: () => endpoints.post(slug), enabled: !!slug })
export const useSkills = () => {
  const enabled = usePortfolioFetchEnabled()
  return useQuery({ queryKey: ['skills'], queryFn: endpoints.skills, enabled })
}
export const useExperience = () => {
  const enabled = usePortfolioFetchEnabled()
  return useQuery({ queryKey: ['experience'], queryFn: endpoints.experience, enabled })
}
export const useEducation = () => {
  const enabled = usePortfolioFetchEnabled()
  return useQuery({ queryKey: ['education'], queryFn: endpoints.education, enabled })
}
export const useServices = () => {
  const enabled = usePortfolioFetchEnabled()
  return useQuery({ queryKey: ['services'], queryFn: endpoints.services, enabled })
}
export const useTestimonials = () => {
  const enabled = usePortfolioFetchEnabled()
  return useQuery({ queryKey: ['testimonials'], queryFn: endpoints.testimonials, enabled })
}
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
