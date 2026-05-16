import { lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';

// Lazy-loaded page components for code-splitting per topic route
const Dashboard = lazy(() => import('./pages/Dashboard'));
const TopicPage = lazy(() => import('./pages/TopicPage'));
const ProgressPage = lazy(() => import('./pages/ProgressPage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const CategoryPage = lazy(() => import('./pages/CategoryPage'));
const CheatSheets = lazy(() => import('./pages/CheatSheets'));
const NotFound = lazy(() => import('./pages/NotFound'));

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="/topic/:categorySlug/:topicSlug/:subtopicSlug" element={<TopicPage />} />
          <Route path="/topic/:categorySlug/:topicSlug" element={<TopicPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/category/:categorySlug" element={<CategoryPage />} />
          <Route path="/cheat-sheets" element={<CheatSheets />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
