import { createElement } from 'react'
import { registerModule } from '@/core/moduleRegistry'
import { AnalyticsAdminPage } from './AnalyticsAdminPage'

registerModule({
  name:'analytics',
  label:'Аналитика',
  adminNav:[{group:'Система',path:'/admin/analytics',label:'Аналитика',permission:'analytics.view',icon:'bar-chart-3'}],
  adminScreens:[{path:'analytics',label:'Аналитика',group:'Система',element:createElement(AnalyticsAdminPage)}],
})
