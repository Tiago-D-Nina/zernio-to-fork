import React from 'react';
import { Rocket, Check, Circle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/Button';
import { useOnboardingStatus } from '@/hooks/useOnboardingStatus';

interface OnboardingBannerProps {
  onOpenWizard: () => void;
}

export const OnboardingBanner: React.FC<OnboardingBannerProps> = ({ onOpenWizard }) => {
  const { loading, loadFailed, isComplete, isDismissed, steps, completionPercentage } = useOnboardingStatus();

  if (loading || loadFailed || isComplete || isDismissed) return null;

  return (
    <section className="onboarding-banner via-card" aria-labelledby="onboarding-banner-title">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="onboarding-banner-icon">
              <Rocket aria-hidden="true" />
            </div>
            <div>
              <h2 id="onboarding-banner-title">Termine de configurar a Nina.</h2>
              <p className="text-sm text-muted-foreground">
                Faltam poucos passos para ela começar a atender sozinha.
              </p>
            </div>
          </div>

          {/* Barra de progresso */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Progresso</span>
              <span className="text-primary font-medium">{completionPercentage}%</span>
            </div>
            <div className="onboarding-progress">
              <div
                className="onboarding-progress-fill"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </div>

          {/* Chips dos passos */}
          <div className="flex flex-wrap gap-2">
            {steps.map((step) => (
              <span
                key={step.id}
                className={`via-pill onboarding-step ${step.isComplete ? 'is-complete' : ''}`}
              >
                {step.isComplete ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}
                {step.title}
              </span>
            ))}
          </div>
        </div>

        <div className="shrink-0">
          <Button variant="primary" onClick={onOpenWizard} className="whitespace-nowrap">
            Continuar configuração
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </section>
  );
};
