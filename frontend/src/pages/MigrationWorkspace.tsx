import { Link } from 'react-router-dom';
import { Database, GitBranch, Play, ChevronLeft, ChevronRight, AlertCircle, LogOut } from 'lucide-react';
import { Button } from '@/components/ui';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Logo } from '@/components/Logo';
import { SchemaPanel } from '@/components/SchemaPanel';
import { MigrateTab } from '@/components/MigrateTab';
import { SchemaBuilder } from '@/components/SchemaBuilder';
import { MappingEditor } from '@/components/wizard/MappingEditor';
import { useMigrationStore } from '@/store/migration';

const TABS = [
  { id: 'migrate' as const, label: 'Migrate', icon: Play, description: 'Run a migration' },
  { id: 'schemas' as const, label: 'Schemas', icon: Database, description: 'Manage schemas' },
  { id: 'mappings' as const, label: 'Mappings', icon: GitBranch, description: 'Manage mappings' },
];

interface MigrationWorkspaceProps {
  onLogout?: () => void;
}

export function MigrationWorkspace({ onLogout }: MigrationWorkspaceProps) {
  const { activeTab, setActiveTab, schemaPanelCollapsed, setSchemaPanelCollapsed, schemasModified, mappingsModified } = useMigrationStore();
  const hasUnsavedChanges = schemasModified || mappingsModified;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'migrate':
        return <MigrateTab />;
      case 'schemas':
        return <SchemaBuilder />;
      case 'mappings':
        return <MappingEditor />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen flex-col bg-[hsl(var(--background))]">
      {/* Header */}
      <header className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-4">
          <Link to="/app" className="hover:opacity-80 transition-opacity">
            <Logo size="sm" />
          </Link>
          {hasUnsavedChanges && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Unsaved changes</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {onLogout && (
            <Button variant="ghost" size="sm" onClick={onLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          )}
          <Link to="/app">
            <Button variant="outline" size="sm">Back to Dashboard</Button>
          </Link>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Schema Panel (Left Sidebar) */}
        <div
          className={`flex-shrink-0 border-r transition-all duration-300 ${
            schemaPanelCollapsed ? 'w-0' : 'w-80'
          }`}
        >
          {!schemaPanelCollapsed && <SchemaPanel />}
        </div>

        {/* Collapse Toggle */}
        <button
          onClick={() => setSchemaPanelCollapsed(!schemaPanelCollapsed)}
          className="flex h-full w-4 items-center justify-center border-r bg-[hsl(var(--muted))] hover:bg-[hsl(var(--accent))] transition-colors"
          title={schemaPanelCollapsed ? 'Show schema panel' : 'Hide schema panel'}
        >
          {schemaPanelCollapsed ? (
            <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          ) : (
            <ChevronLeft className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          )}
        </button>

        {/* Main Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Tab Navigation */}
          <div className="flex border-b bg-[hsl(var(--muted))]">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-b-2 border-[hsl(var(--primary))]'
                      : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--background))]/50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-auto p-6">
            {renderTabContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
