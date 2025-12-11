import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  StepperProgress,
  SourceConfig,
  TargetConfig,
  MappingEditor,
  PreviewValidate,
  ExecuteMonitor,
} from '@/components/wizard';
import { useMigrationStore } from '@/store/migration';

const STEPS = [
  { number: 1, title: 'Sources', description: 'Configure data sources' },
  { number: 2, title: 'Target', description: 'Set up target service' },
  { number: 3, title: 'Mapping', description: 'Map fields' },
  { number: 4, title: 'Preview', description: 'Validate data' },
  { number: 5, title: 'Execute', description: 'Run migration' },
];

export function MigrationWizard() {
  const { currentStep, setCurrentStep, sources, targetService, entityMappings, name } = useMigrationStore();

  const canGoNext = () => {
    switch (currentStep) {
      case 1:
        return name.trim() !== '' && sources.length > 0;
      case 2:
        return targetService !== '';
      case 3:
        return entityMappings.length > 0;
      case 4:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < 5 && canGoNext()) {
      setCurrentStep((currentStep + 1) as 1 | 2 | 3 | 4 | 5);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as 1 | 2 | 3 | 4 | 5);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return <SourceConfig />;
      case 2:
        return <TargetConfig />;
      case 3:
        return <MappingEditor />;
      case 4:
        return <PreviewValidate />;
      case 5:
        return <ExecuteMonitor />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">New Migration</h1>
            <p className="text-[hsl(var(--muted-foreground))]">
              Configure and run a data migration between services
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/">
              <Button variant="outline">Back to Dashboard</Button>
            </Link>
          </div>
        </div>

        {/* Stepper */}
        <StepperProgress steps={STEPS} currentStep={currentStep} />

        {/* Step Content */}
        <div className="mb-8">{renderStepContent()}</div>

        {/* Navigation */}
        <div className="flex items-center justify-between border-t pt-6">
          <Button variant="outline" onClick={handleBack} disabled={currentStep === 1}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          {currentStep < 5 ? (
            <Button onClick={handleNext} disabled={!canGoNext()}>
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <div />
          )}
        </div>
      </div>
    </div>
  );
}
