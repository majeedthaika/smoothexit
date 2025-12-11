import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Clock, CheckCircle, XCircle, Loader2, Trash2, Play } from 'lucide-react';
import { Button, Card, CardContent, Badge } from '@/components/ui';
import { ThemeToggle } from '@/components/ThemeToggle';
import { migrationAPI } from '@/lib/api';
import type { Migration } from '@/types/migration';
import { formatDate, getStatusColor } from '@/lib/utils';

export function Dashboard() {
  const [migrations, setMigrations] = useState<Migration[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMigrations = async () => {
    setLoading(true);
    const res = await migrationAPI.list();
    if (res.data) {
      setMigrations(res.data.migrations);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadMigrations();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this migration?')) return;

    const res = await migrationAPI.delete(id);
    if (!res.error) {
      setMigrations((prev) => prev.filter((m) => m.id !== id));
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'extracting':
      case 'transforming':
      case 'validating':
      case 'loading':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  // Stats
  const stats = {
    total: migrations.length,
    completed: migrations.filter((m) => m.status === 'completed').length,
    failed: migrations.filter((m) => m.status === 'failed').length,
    running: migrations.filter((m) =>
      ['extracting', 'transforming', 'validating', 'loading'].includes(m.status)
    ).length,
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Migrations</h1>
            <p className="text-[hsl(var(--muted-foreground))]">
              Manage and monitor your data migrations
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/wizard">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Migration
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="py-4">
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-2xl font-bold text-green-500">{stats.completed}</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Completed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-2xl font-bold text-blue-500">{stats.running}</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Running</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-2xl font-bold text-red-500">{stats.failed}</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Failed</p>
            </CardContent>
          </Card>
        </div>

        {/* Migration List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--muted-foreground))]" />
          </div>
        ) : migrations.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 rounded-full bg-[hsl(var(--secondary))] p-4">
                <Play className="h-8 w-8 text-[hsl(var(--muted-foreground))]" />
              </div>
              <h3 className="text-lg font-medium">No migrations yet</h3>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Create your first migration to get started
              </p>
              <Link to="/wizard" className="mt-4">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Migration
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {migrations.map((migration) => (
              <Card key={migration.id} className="hover:border-[hsl(var(--primary))]/50 transition-colors">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {getStatusIcon(migration.status)}
                      <div>
                        <h3 className="font-medium">{migration.name}</h3>
                        <p className="text-sm text-[hsl(var(--muted-foreground))]">
                          {migration.description || 'No description'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <Badge className={getStatusColor(migration.status)}>{migration.status}</Badge>
                        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                          {formatDate(migration.created_at)}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 text-sm text-[hsl(var(--muted-foreground))]">
                        <div>
                          <p className="font-medium text-[hsl(var(--foreground))]">
                            {migration.total_records_succeeded}
                          </p>
                          <p className="text-xs">Succeeded</p>
                        </div>
                        <div>
                          <p className="font-medium text-[hsl(var(--destructive))]">
                            {migration.total_records_failed}
                          </p>
                          <p className="text-xs">Failed</p>
                        </div>
                      </div>

                      <div className="flex gap-1">
                        {migration.dry_run && (
                          <Badge variant="outline" className="text-xs">
                            Dry Run
                          </Badge>
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[hsl(var(--destructive))]"
                        onClick={() => handleDelete(migration.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Progress for running migrations */}
                  {['extracting', 'transforming', 'validating', 'loading'].includes(migration.status) && (
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-[hsl(var(--muted-foreground))]">
                        <span>
                          {migration.total_records_processed} records processed
                        </span>
                        <span className="capitalize">{migration.status}...</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--secondary))]">
                        <div className="h-full w-1/3 animate-pulse bg-[hsl(var(--primary))]" />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
