// src/App.tsx - CON VERCEL ANALYTICS
import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Outlet, ScrollRestoration, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Analytics } from '@vercel/analytics/react'; // ✅ PARA REACT (no Next.js)
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from './hooks/useAuth';
import Web3ContextProvider from '@/libs/components/Web3ContextProvider';
import ProtectedRoute, { GuestRoute } from '@/components/auth/ProtectedRoute';
import { ThemeProvider } from '@/components/ThemeProvider';

// Layout components (no lazy loading para layouts)
import MainLayout from '@/components/layout/MainLayout';
import AdminLayout from '@/pages/admin/AdminLayout';
import UserLayout from '@/pages/user/UserLayout';

// Lazy load todas las páginas para mejor performance
const HomePage = lazy(() => import('@/pages/HomePage'));
const StartupsPage = lazy(() => import('@/pages/StartupsPage'));
const StartupDetailPage = lazy(() => import('@/pages/StartupDetailPage'));
const BlogPage = lazy(() => import('@/pages/BlogPage'));
const BlogPostPage = lazy(() => import('@/pages/BlogPostPage'));
const CommunityDetailPage = lazy(() => import('@/pages/CommunityDetailPage'));
const ComunidadesPage = lazy(() => import('@/pages/ComunidadesPage'));
const EventosPage = lazy(() => import('@/pages/EventosPage'));
const ResourcesPage = lazy(() => import('@/pages/ResourcesPage'));
const EventDetailPage = lazy(() => import('@/pages/EventDetailPage'));
// APY Analysis y Academia removidos temporalmente
// const InvestmentOpportunitiesPage = lazy(() => import('@/pages/InvestmentOpportunitiesPage'));
// const DeFiAcademyPage = lazy(() => import('@/pages/DeFiAcademyPage'));
// const CourseDetailPage = lazy(() => import('@/pages/CourseDetailPage'));
const VideoTutorialsPage = lazy(() => import('@/pages/VideoTutorialsPage'));
const MetricsPage = lazy(() => import('@/pages/MetricsPage'));

// Mercado LP Game
const MercadoLPGamePage = lazy(() => import('@/pages/MercadoLPGamePage'));
const NFTGalleryPage = lazy(() => import('@/pages/NFTGalleryPage'));

// Digital Art NFT Pages
const DigitalArtDeFiPage = lazy(() => import('@/pages/DigitalArtDeFiPage'));
const DigitalArtStudioPage = lazy(() => import('@/pages/DigitalArtStudioPage'));
const DigitalArtGalleryPage = lazy(() => import('@/pages/DigitalArtGalleryPage'));

// Web3 Jobs
const Web3JobsPage = lazy(() => import('@/pages/Web3JobsPage'));

// Hackathon Projects
const HackathonProjectsPage = lazy(() => import('@/pages/HackathonProjectsPage'));

// Agentic World
const AgenticWorldPage = lazy(() => import('@/pages/AgenticWorldPage'));
const AgenticLeaderboardPage = lazy(() => import('@/pages/AgenticLeaderboardPage'));
const PolymarketTrackerPage = lazy(() => import('@/pages/PolymarketTrackerPage'));
const ConsensusPage = lazy(() => import('@/pages/ConsensusPage'));
const ClawTraderPage = lazy(() => import('@/pages/ClawTraderPage'));
const ClawTraderChatPage = lazy(() => import('@/pages/ClawTraderChatPage'));
const BobbyAgentTraderPage = lazy(() => import('@/pages/BobbyAgentTraderPage'));
const BobbyChallengePage = lazy(() => import('@/pages/BobbyChallengePage'));
const BobbyAnalyticsPage = lazy(() => import('@/pages/BobbyAnalyticsPage'));
const BobbyHistoryPage = lazy(() => import('@/pages/BobbyHistoryPage'));
const BobbyAgentsPage = lazy(() => import('@/pages/BobbyAgentsPage'));
const BobbyPortfolioPage = lazy(() => import('@/pages/BobbyPortfolioPage'));
const BobbyTelegramPage = lazy(() => import('@/pages/BobbyTelegramPage'));
const AgentForumPage = lazy(() => import('@/pages/AgentForumPage'));
const DeployAgentPage = lazy(() => import('@/pages/DeployAgentPage'));
const BobbyB2BPage = lazy(() => import('@/pages/BobbyB2BPage'));
const BobbyMetacognitionPage = lazy(() => import('@/pages/BobbyMetacognitionPage'));


// Auth pages
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage'));
const CheckEmailPage = lazy(() => import('@/pages/CheckEmailPage'));
const AuthCallback = lazy(() => import('@/pages/AuthCallback'));

// Admin pages
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const ContentMachine = lazy(() => import('@/pages/admin/ContentMachine'));
// Admin Blog y Academia removidos temporalmente
const AdminBlog = lazy(() => import('@/pages/admin/AdminBlog'));
// const AdminAcademia = lazy(() => import('@/pages/admin/AdminAcademia'));
const AdminVideoTutorials = lazy(() => import('@/pages/admin/AdminVideoTutorials'));
const AdminEvents = lazy(() => import('@/pages/admin/AdminEvents'));
const AdminStartups = lazy(() => import('@/pages/admin/AdminStartups'));
const AdminCommunities = lazy(() => import('@/pages/admin/AdminCommunities'));
const AdminAdvocates = lazy(() => import('@/pages/admin/AdminAdvocates'));
const AdminUsers = lazy(() => import('@/pages/admin/AdminUsers'));
const AdminSettings = lazy(() => import('@/pages/admin/AdminSettings'));
const AdminShortUrls = lazy(() => import('@/pages/admin/AdminShortUrls'));

// User pages
const UserDashboard = lazy(() => import('@/pages/user/UserDashboard'));
const UserSettings = lazy(() => import('@/pages/user/UserSettings'));
const ProposeCommunity = lazy(() => import('@/pages/user/ProposeCommunity'));
const ProposeEvent = lazy(() => import('@/pages/user/ProposeEvent'));
const ProposeStartup = lazy(() => import('@/pages/user/ProposeStartup'));
const ProposeReferent = lazy(() => import('@/pages/user/ProposeReferent'));
const ProposeJob = lazy(() => import('@/pages/user/ProposeJob'));

// Admin Startup Forms
const AdminStartupForm = lazy(() => import('@/pages/admin/AdminStartupForm'));

// Admin Community Forms
const AdminCommunityForm = lazy(() => import('@/pages/admin/AdminCommunityForm'));

// Admin Jobs
const AdminJobs = lazy(() => import('@/pages/admin/AdminJobs'));
const AdminJobForm = lazy(() => import('@/pages/admin/AdminJobForm'));

// Admin Blog Forms - REMOVIDOS TEMPORALMENTE
const BlogNew = lazy(() => import('@/pages/admin/BlogNew'));
const BlogEditPage = lazy(() => import('@/pages/admin/BlogEditPage'));

// TikTok Feed Page
const TikTokFeedPage = lazy(() => import('@/pages/TikTokFeedPage'));

// Short URL Redirect
const ShortRedirect = lazy(() => import('@/pages/ShortRedirect'));

// Error pages
const NotFound = lazy(() => import('@/pages/NotFound'));
const UnauthorizedPage = lazy(() => import('@/pages/UnauthorizedPage'));

// ==========================================
// COMPONENTES AUXILIARES
// ==========================================

// Componente de loading para Suspense
function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-xl animate-pulse" />
          <div className="relative">
            <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Cargando</p>
          <p className="text-xs text-muted-foreground">DeFi México Hub</p>
        </div>
      </div>
    </div>
  );
}

// Root layout que envuelve todo con AuthProvider y Web3ContextProvider
function RootLayout() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="defi-mexico-theme">
      <Web3ContextProvider>
        <AuthProvider>
          <Outlet />
          <ScrollRestoration />
          <Toaster
            position="top-right"
            richColors
            closeButton
            duration={4000}
            toastOptions={{
              style: {
                background: 'hsl(var(--background))',
                color: 'hsl(var(--foreground))',
                border: '1px solid hsl(var(--border))',
              },
            }}
          />
          {/* ✨ VERCEL ANALYTICS COMPONENT */}
          <Analytics />
        </AuthProvider>
      </Web3ContextProvider>
    </ThemeProvider>
  );
}

// Error Boundary Component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center space-y-4 p-8">
            <div className="text-red-500 mb-4">
              <svg
                className="w-16 h-16 mx-auto"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold">Algo salió mal</h2>
            <p className="text-muted-foreground">
              Ha ocurrido un error inesperado. Por favor, recarga la página.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
            >
              Recargar página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ==========================================
// CONFIGURACIÓN DEL ROUTER
// ==========================================

// Crear el router con todas las rutas y future flags
const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <RootLayout />,
      errorElement: (
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <NotFound />
          </Suspense>
        </ErrorBoundary>
      ),
      children: [
        // ==========================================
        // SHORT URL REDIRECT (sin layout)
        // ==========================================
        {
          path: 's/:code',
          element: (
            <Suspense fallback={<PageLoader />}>
              <ShortRedirect />
            </Suspense>
          ),
        },
        // ==========================================
        // RUTAS PÚBLICAS CON MAIN LAYOUT
        // ==========================================
        {
          element: (
            <Suspense fallback={<PageLoader />}>
              <MainLayout />
            </Suspense>
          ),
          children: [
            {
              index: true,
              element: (
                <Suspense fallback={<PageLoader />}>
                  <HomePage />
                </Suspense>
              ),
            },
            {
              path: 'startups',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <StartupsPage />
                </Suspense>
              ),
            },
            {
              path: 'startups/:id',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <StartupDetailPage />
                </Suspense>
              ),
            },
            // ==========================================
            // RUTAS DEL BLOG
            // ==========================================
            {
              path: 'blog',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <BlogPage />
                </Suspense>
              ),
            },
            {
              path: 'blog/:slug',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <BlogPostPage />
                </Suspense>
              ),
            },
            // ==========================================
            // TIKTOK FEED
            // ==========================================
            {
              path: 'tiktok',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <TikTokFeedPage />
                </Suspense>
              ),
            },
            // ==========================================
            // OTRAS RUTAS PÚBLICAS
            // ==========================================
            {
              path: 'comunidades',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <ComunidadesPage />
                </Suspense>
              ),
            },
            {
              path: 'comunidades/:id',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <CommunityDetailPage />
                </Suspense>
              ),
            },
            {
              path: 'recursos',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <ResourcesPage />
                </Suspense>
              ),
            },
            {
              path: 'eventos',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <EventosPage />
                </Suspense>
              ),
            },
            {
              path: 'eventos/:id',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <EventDetailPage />
                </Suspense>
              ),
            },
            // ==========================================
            // APY ANALYSIS Y ACADEMIA - REMOVIDO TEMPORALMENTE
            // ==========================================
            // {
            //   path: 'oportunidades',
            //   element: (
            //     <Suspense fallback={<PageLoader />}>
            //       <InvestmentOpportunitiesPage />
            //     </Suspense>
            //   ),
            // },
            // {
            //   path: 'academia',
            //   element: (
            //     <Suspense fallback={<PageLoader />}>
            //       <DeFiAcademyPage />
            //     </Suspense>
            //   ),
            // },
            // {
            //   path: 'curso/:courseId',
            //   element: (
            //     <Suspense fallback={<PageLoader />}>
            //       <CourseDetailPage />
            //     </Suspense>
            //   ),
            // },
            {
              path: 'academia/videos',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <VideoTutorialsPage />
                </Suspense>
              ),
            },
            // Mercado LP Game
            {
              path: 'academia/juego/mercado-lp',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <MercadoLPGamePage />
                </Suspense>
              ),
            },
            // NFT Gallery (Mercado LP completers)
            {
              path: 'nft-gallery',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <NFTGalleryPage />
                </Suspense>
              ),
            },
            {
              path: 'metricas',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <MetricsPage />
                </Suspense>
              ),
            },
            // Digital Art NFT Routes
            {
              path: 'digital-art-defi',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <DigitalArtDeFiPage />
                </Suspense>
              ),
            },
            {
              path: 'digital-art-defi/studio',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <DigitalArtStudioPage />
                </Suspense>
              ),
            },
            {
              path: 'digital-art-defi/gallery',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <DigitalArtGalleryPage />
                </Suspense>
              ),
            },
            // Web3 Jobs México
            {
              path: 'ecosistema/trabajos',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <Web3JobsPage />
                </Suspense>
              ),
            },
            // MVP Hackathon Projects
            {
              path: 'hackathon-projects',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <HackathonProjectsPage />
                </Suspense>
              ),
            },
            // Agentic World
            {
              path: 'agentic-world',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <AgenticWorldPage />
                </Suspense>
              ),
            },
            {
              path: 'agentic-world/leaderboard',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <AgenticLeaderboardPage />
                </Suspense>
              ),
            },
            {
              path: 'agentic-world/polymarket',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <PolymarketTrackerPage />
                </Suspense>
              ),
            },
            {
              path: 'agentic-world/consensus',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <ConsensusPage />
                </Suspense>
              ),
            },
            // Bobby Terminal route stays in MainLayout (it's full-screen with z-[100])
            {
              path: 'agentic-world/bobby',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <BobbyAgentTraderPage />
                </Suspense>
              ),
            },
            // Forum moved outside MainLayout — uses KineticShell
            {
              path: 'agentic-world/claw-trader',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <ClawTraderPage />
                </Suspense>
              ),
            },
            {
              path: 'agentic-world/claw-trader-chat',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <ClawTraderChatPage />
                </Suspense>
              ),
            },

            // ==========================================
            // RUTA ESPECIAL PARA STARTUP OWNERS CON MAIN LAYOUT
            // ==========================================
            {
              path: 'admin/startups/new',
              element: (
                <ProtectedRoute requireAnyRole={['admin', 'editor', 'user']}>
                  <Suspense fallback={<PageLoader />}>
                    <AdminStartupForm />
                  </Suspense>
                </ProtectedRoute>
              ),
            },
          ],
        },

        // ==========================================
        // B2B LANDING PAGE (SIN LAYOUT)
        {
          path: 'agentic-world/bobby/b2b',
          element: (
            <Suspense fallback={<PageLoader />}>
              <BobbyB2BPage />
            </Suspense>
          ),
        },

        // DEPLOY AGENT WIZARD (SIN LAYOUT)
        {
          path: 'agentic-world/deploy',
          element: (
            <Suspense fallback={<PageLoader />}>
              <DeployAgentPage />
            </Suspense>
          ),
        },

        // BOBBY KINETIC SHELL ROUTES (SIN MAIN LAYOUT)
        // These pages use their own KineticShell nav/sidebar
        // ==========================================
        {
          path: 'bobby',
          element: <Navigate to="/agentic-world/bobby/challenge" replace />,
        },
        {
          path: 'agentic-world/bobby/challenge',
          element: (
            <Suspense fallback={<PageLoader />}>
              <BobbyChallengePage />
            </Suspense>
          ),
        },
        {
          path: 'agentic-world/bobby/analytics',
          element: (
            <Suspense fallback={<PageLoader />}>
              <BobbyAnalyticsPage />
            </Suspense>
          ),
        },
        {
          path: 'agentic-world/bobby/history',
          element: (
            <Suspense fallback={<PageLoader />}>
              <BobbyHistoryPage />
            </Suspense>
          ),
        },
        {
          path: 'agentic-world/bobby/agents',
          element: (
            <Suspense fallback={<PageLoader />}>
              <BobbyAgentsPage />
            </Suspense>
          ),
        },
        {
          path: 'agentic-world/bobby/portfolio',
          element: (
            <Suspense fallback={<PageLoader />}>
              <BobbyPortfolioPage />
            </Suspense>
          ),
        },
        {
          path: 'agentic-world/bobby/telegram',
          element: (
            <Suspense fallback={<PageLoader />}>
              <BobbyTelegramPage />
            </Suspense>
          ),
        },
        {
          path: 'agentic-world/bobby/metacognition',
          element: (
            <Suspense fallback={<PageLoader />}>
              <BobbyMetacognitionPage />
            </Suspense>
          ),
        },

        {
          path: 'agentic-world/forum',
          element: (
            <Suspense fallback={<PageLoader />}>
              <AgentForumPage />
            </Suspense>
          ),
        },

        // ==========================================
        // RUTAS DE AUTENTICACIÓN (SIN LAYOUT)
        // ==========================================
        {
          path: 'login',
          element: (
            <GuestRoute>
              <Suspense fallback={<PageLoader />}>
                <LoginPage />
              </Suspense>
            </GuestRoute>
          ),
        },
        {
          path: 'register',
          element: (
            <GuestRoute>
              <Suspense fallback={<PageLoader />}>
                <RegisterPage />
              </Suspense>
            </GuestRoute>
          ),
        },
        {
          path: 'forgot-password',
          element: (
            <GuestRoute>
              <Suspense fallback={<PageLoader />}>
                <ForgotPasswordPage />
              </Suspense>
            </GuestRoute>
          ),
        },
        {
          path: 'reset-password',
          element: (
            <Suspense fallback={<PageLoader />}>
              <ResetPasswordPage />
            </Suspense>
          ),
        },
        {
          path: 'check-email',
          element: (
            <Suspense fallback={<PageLoader />}>
              <CheckEmailPage />
            </Suspense>
          ),
        },
        {
          path: 'auth/callback',
          element: (
            <Suspense fallback={<PageLoader />}>
              <AuthCallback />
            </Suspense>
          ),
        },
        {
          path: 'unauthorized',
          element: (
            <Suspense fallback={<PageLoader />}>
              <UnauthorizedPage />
            </Suspense>
          ),
        },


        // ==========================================
        // RUTAS USER PROTEGIDAS (Editor y Usuario Regular)
        // ==========================================
        {
          path: 'user',
          element: (
            <ProtectedRoute>
              <Suspense fallback={<PageLoader />}>
                <UserLayout />
              </Suspense>
            </ProtectedRoute>
          ),
          errorElement: (
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <NotFound />
              </Suspense>
            </ErrorBoundary>
          ),
          children: [
            {
              index: true,
              element: (
                <Suspense fallback={<PageLoader />}>
                  <UserDashboard />
                </Suspense>
              ),
            },
            {
              path: 'settings',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <UserSettings />
                </Suspense>
              ),
            },
            // Rutas de propuestas
            {
              path: 'comunidades/nueva',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <ProposeCommunity />
                </Suspense>
              ),
            },
            {
              path: 'eventos/nuevo',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <ProposeEvent />
                </Suspense>
              ),
            },
            {
              path: 'startups/nueva',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <ProposeStartup />
                </Suspense>
              ),
            },
            {
              path: 'referentes/nuevo',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <ProposeReferent />
                </Suspense>
              ),
            },
            {
              path: 'trabajos/nuevo',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <ProposeJob />
                </Suspense>
              ),
            },
          ],
        },

        // ==========================================
        // RUTAS ADMIN PROTEGIDAS
        // ==========================================
        {
          path: 'admin',
          element: (
            <ProtectedRoute requireAnyRole={['admin', 'editor']}>
              <Suspense fallback={<PageLoader />}>
                <AdminLayout />
              </Suspense>
            </ProtectedRoute>
          ),
          errorElement: (
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <NotFound />
              </Suspense>
            </ErrorBoundary>
          ),
          children: [
            // Dashboard admin
            {
              index: true,
              element: (
                <Suspense fallback={<PageLoader />}>
                  <AdminDashboard />
                </Suspense>
              ),
            },

            // ==========================================
            // RUTAS ADMIN - STARTUPS
            // ==========================================
            {
              path: 'startups',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <AdminStartups />
                </Suspense>
              ),
            },
            {
              path: 'startups/new',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <AdminStartupForm />
                </Suspense>
              ),
            },
            {
              path: 'startups/edit/:id',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <AdminStartupForm />
                </Suspense>
              ),
            },
            {
              path: 'startups/:id/edit',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <AdminStartupForm />
                </Suspense>
              ),
            },

            // ==========================================
            // RUTAS ADMIN - BLOG
            // ==========================================
            {
              path: 'blog',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <AdminBlog />
                </Suspense>
              ),
            },
            {
              path: 'blog/new',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <BlogNew />
                </Suspense>
              ),
            },
            {
              path: 'blog/edit/:id',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <BlogEditPage />
                </Suspense>
              ),
            },

            // ==========================================
            // RUTAS ADMIN - ACADEMIA - REMOVIDO TEMPORALMENTE
            // ==========================================
            // {
            //   path: 'academia',
            //   element: (
            //     <Suspense fallback={<PageLoader />}>
            //       <AdminAcademia />
            //     </Suspense>
            //   ),
            // },
            {
              path: 'academia/videos',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <AdminVideoTutorials />
                </Suspense>
              ),
            },

            // ==========================================
            // OTRAS RUTAS ADMIN
            // ==========================================
            {
              path: 'eventos',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <AdminEvents />
                </Suspense>
              ),
            },
            {
              path: 'comunidades',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <AdminCommunities />
                </Suspense>
              ),
            },
            {
              path: 'comunidades/new',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <AdminCommunityForm />
                </Suspense>
              ),
            },
            {
              path: 'comunidades/edit/:id',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <AdminCommunityForm />
                </Suspense>
              ),
            },
            {
              path: 'referentes',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <AdminAdvocates />
                </Suspense>
              ),
            },
            // Admin Jobs Routes
            {
              path: 'jobs',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <AdminJobs />
                </Suspense>
              ),
            },
            {
              path: 'jobs/new',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <AdminJobForm />
                </Suspense>
              ),
            },
            {
              path: 'jobs/edit/:id',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <AdminJobForm />
                </Suspense>
              ),
            },
            {
              path: 'short-urls',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <AdminShortUrls />
                </Suspense>
              ),
            },
            {
              path: 'usuarios',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <AdminUsers />
                </Suspense>
              ),
            },
            {
              path: 'settings',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <AdminSettings />
                </Suspense>
              ),
            },
            {
              path: 'content-machine',
              element: (
                <Suspense fallback={<PageLoader />}>
                  <ContentMachine />
                </Suspense>
              ),
            },
          ],
        },

        // ==========================================
        // 404 CATCH-ALL
        // ==========================================
        {
          path: '*',
          element: (
            <Suspense fallback={<PageLoader />}>
              <NotFound />
            </Suspense>
          ),
        },
      ],
    },
  ],
  {
    basename: import.meta.env.VITE_BASE_PATH || '/',
  }
);

// ==========================================
// MAIN APP COMPONENT
// ==========================================

export default function App() {
  return (
    <HelmetProvider>
      <ErrorBoundary>
        <RouterProvider router={router} />
      </ErrorBoundary>
    </HelmetProvider>
  );
}