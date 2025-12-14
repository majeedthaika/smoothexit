import { Check, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui';
import { useMigrationStore } from '@/store/migration';
import { SelectMappingsStep } from './SelectMappingsStep';
import { UploadSourcesStep } from './UploadSourcesStep';
import { TransformStep } from './TransformStep';
import { UploadTargetStep } from './UploadTargetStep';

const STEPS = [
  { id: 1 as const, label: 'Select Mappings', description: 'Choose source schemas and mappings' },
  { id: 2 as const, label: 'Upload Data', description: 'Upload CSV files for each source' },
  { id: 3 as const, label: 'Transform', description: 'Preview and run transformation' },
  { id: 4 as const, label: 'Upload to Target', description: 'Send data to target service' },
];

export function MigrateWizard() {
  const {
    migrationRunStep,
    setMigrationRunStep,
    selectedMappingKeys,
    uploadedSourceData,
    entityMappings,
    transformedData,
    uploadStatus,
    resetMigrationRun,
  } = useMigrationStore();

  // Get unique source keys from selected mappings
  const selectedMappings = entityMappings.filter((_, index) =>
    selectedMappingKeys.includes(`mapping-${index}`)
  );
  const requiredSourceKeys = [...new Set(
    selectedMappings.map(m => `${m.source_service}.${m.source_entity}`)
  )];

  // Validation for each step
  const canProceedFromStep1 = selectedMappingKeys.length > 0;
  const canProceedFromStep2 = requiredSourceKeys.every(key => uploadedSourceData[key]);
  const canProceedFromStep3 = Object.keys(transformedData).length > 0;
  const isStep4Complete = uploadStatus === 'completed';

  const canProceed = () => {
    switch (migrationRunStep) {
      case 1: return canProceedFromStep1;
      case 2: return canProceedFromStep2;
      case 3: return canProceedFromStep3;
      case 4: return isStep4Complete;
      default: return false;
    }
  };

  const handleNext = () => {
    if (migrationRunStep < 4 && canProceed()) {
      setMigrationRunStep((migrationRunStep + 1) as 1 | 2 | 3 | 4);
    }
  };

  const handleBack = () => {
    if (migrationRunStep > 1) {
      setMigrationRunStep((migrationRunStep - 1) as 1 | 2 | 3 | 4);
    }
  };

  const handleReset = () => {
    if (window.confirm('Reset migration? This will clear all uploaded data and results.')) {
      resetMigrationRun();
    }
  };

  const renderStepContent = () => {
    switch (migrationRunStep) {
      case 1:
        return <SelectMappingsStep />;
      case 2:
        return <UploadSourcesStep requiredSourceKeys={requiredSourceKeys} />;
      case 3:
        return <TransformStep selectedMappings={selectedMappings} />;
      case 4:
        return <UploadTargetStep />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Run Migration</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Transform and upload your data step by step
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleReset}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset
        </Button>
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-between">
        {STEPS.map((step, index) => {
          const isActive = migrationRunStep === step.id;
          const isCompleted = migrationRunStep > step.id;
          const isLast = index === STEPS.length - 1;

          return (
            <div key={step.id} className="flex items-center flex-1">
              <button
                onClick={() => step.id < migrationRunStep && setMigrationRunStep(step.id)}
                disabled={step.id > migrationRunStep}
                className={`flex items-center gap-3 ${
                  step.id <= migrationRunStep ? 'cursor-pointer' : 'cursor-not-allowed'
                }`}
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 font-semibold transition-colors ${
                    isCompleted
                      ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                      : isActive
                      ? 'border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                      : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]'
                  }`}
                >
                  {isCompleted ? <Check className="h-5 w-5" /> : step.id}
                </div>
                <div className="hidden lg:block">
                  <div
                    className={`text-sm font-medium ${
                      isActive ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'
                    }`}
                  >
                    {step.label}
                  </div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">
                    {step.description}
                  </div>
                </div>
              </button>
              {!isLast && (
                <div
                  className={`mx-4 h-0.5 flex-1 ${
                    isCompleted ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--border))]'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="min-h-[400px]">
        {renderStepContent()}
      </div>

      {/* Navigation */}
      <div className="flex justify-between border-t pt-4">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={migrationRunStep === 1}
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        {migrationRunStep < 4 ? (
          <Button
            onClick={handleNext}
            disabled={!canProceed()}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={uploadStatus === 'running'}
          >
            {isStep4Complete ? 'Start New Migration' : 'Cancel'}
          </Button>
        )}
      </div>
    </div>
  );
}
