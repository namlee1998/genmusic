import { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import * as sdlcApi from '@/services/api/sdlcApi';

const LABELS: Record<string, string> = {
  happy_path: 'Happy path -> Released',
  low_confidence_hold: 'Low confidence -> HOLD',
  missing_evidence: 'Missing evidence -> INVALID',
  qa_blocker: 'QA blocker -> release LOCKED',
  release_reject: 'Release reject',
  escalation: 'Escalation (max retries)',
};

/**
 * Dev-only demo control: flips the backend MOCK_SCENARIO so the next worker run
 * follows a chosen branch. Renders nothing unless the backend is in mock mode.
 */
export default function ScenarioSwitcher({ onChanged }: { onChanged?: () => void }) {
  const [state, setState] = useState<sdlcApi.MockScenarioState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    sdlcApi.getMockScenario().then(setState).catch(() => setState(null));
  }, []);

  if (!state?.mockEnabled) return null;

  const onSelect = async (value: string) => {
    setSaving(true);
    try {
      await sdlcApi.setMockScenario(value);
      setState((s) => (s ? { ...s, scenario: value } : s));
      onChanged?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="scenario-switcher" title="Demo only - sets MOCK_SCENARIO on the backend">
      <FlaskConical size={14} className="scenario-switcher__icon" />
      <span className="scenario-switcher__label">Demo scenario</span>
      <select
        className="scenario-switcher__select"
        value={state.scenario || state.available[0] || 'happy_path'}
        disabled={saving}
        onChange={(e) => void onSelect(e.target.value)}
      >
        {state.available.map((value) => (
          <option key={value} value={value}>{LABELS[value] || value}</option>
        ))}
      </select>
      <span className="scenario-switcher__hint">Applies to the next worker run</span>
    </div>
  );
}
