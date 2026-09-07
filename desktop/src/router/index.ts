import { createRouter, createWebHashHistory } from 'vue-router';
import HomeTab from '../components/HomeTab.vue';
import SettingsTab from '../components/SettingsTab.vue';
import JobDetailView from '../components/JobDetailView.vue';
import ResumesTab from '../components/ResumesTab.vue';
import ResumeDetailView from '../components/ResumeDetailView.vue';
import CoverLettersTab from '../components/CoverLettersTab.vue';
import CoverLetterDetailView from '../components/CoverLetterDetailView.vue';
import CompilerTab from '../components/CompilerTab.vue';
import AboutTab from '../components/AboutTab.vue';
import DiagramTab from '../components/DiagramTab.vue';

const routes = [
  { 
    path: '/', 
    name: 'Home', 
    component: HomeTab 
  },
  {
    path: '/about',
    name: 'About',
    component: AboutTab
  },
  {
    path: '/compiler',
    name: 'Compiler',
    component: CompilerTab
  },
  {
    path: '/diagrams',
    name: 'Diagrams',
    component: DiagramTab
  },
  {
    path: '/inbox',
    name: 'Inbox',
    component: () => import('../components/InboxTab.vue')
  },
  {
    path: '/outreach',
    name: 'Outreach',
    component: () => import('../components/OutreachTab.vue')
  },
  {
    path: '/audit',
    name: 'ErrorAudit',
    component: () => import('../components/ErrorAuditTab.vue'),
    alias: ['/errors', '/logs']
  },
  { 
    path: '/settings', 
    name: 'Settings', 
    component: SettingsTab 
  },
  {
    path: '/templates',
    component: () => import('../components/TemplatesHub.vue'),
    children: [
      {
        path: '',
        redirect: '/templates/resumes',
      },
      {
        path: 'resumes',
        name: 'TemplatesResumes',
        component: ResumesTab,
        alias: ['resume'],
      },
      {
        path: 'cover-letters',
        name: 'TemplatesCoverLetters',
        component: CoverLettersTab,
        alias: ['cover-letter', 'coverletter', 'coverletters'],
      },
      {
        path: 'hr-messages',
        name: 'TemplatesHrMessages',
        component: () => import('../components/HrMessagesTab.vue'),
        alias: ['hr-message', 'hr', 'inbox'],
      },
    ],
  },
  {
    path: '/template/:type',
    redirect: (to: any) => {
      const type = ((to.params.type as string) || '').toLowerCase();
      if (type.includes('cl') || type.includes('cover')) return '/templates/cover-letters';
      if (type.includes('hr') || type.includes('message') || type.includes('inbox')) return '/templates/hr-messages';
      return '/templates/resumes';
    },
  },
  {
    path: '/resumes',
    redirect: '/templates/resumes',
  },
  {
    path: '/cover-letters',
    redirect: '/templates/cover-letters',
  },
  {
    path: '/hr-messages',
    redirect: '/templates/hr-messages',
  },
  {
    path: '/jobs',
    name: 'Jobs',
    component: () => import('../components/JobsTab.vue')
  },
  {
    path: '/resume/:id',
    name: 'ResumeDetail',
    component: ResumeDetailView,
    props: true
  },
  {
    path: '/cover-letter/:id',
    name: 'CoverLetterDetail',
    component: CoverLetterDetailView,
    props: true
  },
  { 
    path: '/parse', 
    name: 'JobParser', 
    component: () => import('../components/JobParserView.vue') 
  },
  {
    path: '/job/:id', 
    name: 'JobDetail', 
    component: JobDetailView, 
    props: true // Passes the :id as a prop to the component
  },
  {
    path: '/inbox/:id',
    name: 'InboxDetail',
    component: () => import('../components/InboxJobDetailView.vue'),
    props: true
  },
  {
    path: '/documents',
    name: 'Documents',
    component: () => import('../components/DocumentsTab.vue')
  },
  {
    path: '/document/:id',
    name: 'DocumentDetail',
    component: () => import('../components/DocumentDetailView.vue'),
    props: true
  },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});
