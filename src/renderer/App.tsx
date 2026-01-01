import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Import } from './pages/Import';
import { Library } from './pages/Library';
import { Settings } from './pages/Settings';
import { Export } from './pages/Export';
import { BatchJobs } from './pages/BatchJobs';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="import" element={<Import />} />
          <Route path="library" element={<Library />} />
          <Route path="export" element={<Export />} />
          <Route path="batch-jobs" element={<BatchJobs />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
