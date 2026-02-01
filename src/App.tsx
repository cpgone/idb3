import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import AuthorDetail from "./pages/AuthorDetail";
import Help from "./pages/Help";
import AuthorNetwork from "./pages/AuthorNetwork";
import PublicationsPage from "./pages/Publications";
import Members from "./pages/Members";
import TopicsPage from "./pages/Topics";
import InstitutionsPage from "./pages/Institutions";
import InsightsPage from "./pages/Insights";
import About from "./pages/About";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <HashRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/help" element={<Help />} />
            <Route path="/authors" element={<Navigate to="/help" replace />} />
            <Route path="/members" element={<Members />} />
            <Route path="/topics" element={<TopicsPage />} />
            <Route path="/institutions" element={<InstitutionsPage />} />
            <Route path="/author/:id" element={<AuthorDetail />} />
            <Route path="/author/:id/network" element={<AuthorNetwork />} />
            <Route path="/publications" element={<PublicationsPage mode="publications" />} />
            <Route path="/citations" element={<PublicationsPage mode="citations" />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Help />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </HashRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
