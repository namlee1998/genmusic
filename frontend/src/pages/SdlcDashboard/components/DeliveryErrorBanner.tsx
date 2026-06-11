import { AlertTriangle, X } from 'lucide-react';
import type { SdlcError } from '@/store/useSdlcStore';

interface Props {
  error: SdlcError | null;
  onDismiss?: () => void;
}

/**
 * Renders the structured backend error envelope ({code, phase, requestId})
 * instead of a blank screen, so a failure is precise and debuggable. requestId
 * lets a user/dev correlate the error with the server log line (I2).
 */
export default function DeliveryErrorBanner({ error, onDismiss }: Props) {
  if (!error) return null;
  return (
    <div className="delivery-error delivery-error--rich" role="alert">
      <AlertTriangle size={15} className="delivery-error__icon" />
      <div className="delivery-error__body">
        <div className="delivery-error__message">{error.message}</div>
        <div className="delivery-error__meta">
          {error.code && <span className="delivery-error__chip">code: {error.code}</span>}
          {error.phase && <span className="delivery-error__chip">phase: {error.phase}</span>}
          {error.requestId && (
            <span className="delivery-error__chip delivery-error__chip--req" title="Correlates with the server log line">
              requestId: {error.requestId}
            </span>
          )}
        </div>
      </div>
      {onDismiss && (
        <button type="button" className="delivery-error__close" onClick={onDismiss} aria-label="Dismiss error">
          <X size={14} />
        </button>
      )}
    </div>
  );
}
