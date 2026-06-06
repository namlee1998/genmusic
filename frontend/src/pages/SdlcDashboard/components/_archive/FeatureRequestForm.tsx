import { useState } from 'react';
import type { FeatureRequest } from '@/services/api/sdlcApi';

interface Props {
  onSubmit: (request: FeatureRequest) => void;
  onCancel: () => void;
}

export default function FeatureRequestForm({ onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'High' | 'Medium' | 'Low'>('High');
  const [targetUser, setTargetUser] = useState('End user');
  const [businessGoal, setBusinessGoal] = useState('');
  const [constraintInput, setConstraintInput] = useState('');
  const [constraints, setConstraints] = useState<string[]>([]);

  const addConstraint = () => {
    if (!constraintInput.trim()) return;
    setConstraints((current) => [...current, constraintInput.trim()]);
    setConstraintInput('');
  };

  return (
    <form className="fr-form" onSubmit={(event) => {
      event.preventDefault();
      if (!title.trim()) return;
      onSubmit({ title, description, priority, target_user: targetUser, business_goal: businessGoal, constraints });
    }}>
      <div className="fr-form-header">
        <h2>New feature request</h2>
        <p>This request goes directly to PO Agent. PO will call its allowed MCP tools and produce the first reviewable output.</p>
      </div>
      <div className="fr-field">
        <label>Feature title *</label>
        <input className="fr-input" required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Example: Add login lockout after five failed attempts" />
      </div>
      <div className="fr-field">
        <label>Description</label>
        <textarea className="fr-input" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the user need and expected behavior." />
      </div>
      <div className="fr-row">
        <div className="fr-field">
          <label>Priority</label>
          <select className="fr-input" value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}>
            <option>High</option><option>Medium</option><option>Low</option>
          </select>
        </div>
        <div className="fr-field">
          <label>Target user</label>
          <input className="fr-input" value={targetUser} onChange={(event) => setTargetUser(event.target.value)} />
        </div>
      </div>
      <div className="fr-field">
        <label>Business goal</label>
        <input className="fr-input" value={businessGoal} onChange={(event) => setBusinessGoal(event.target.value)} placeholder="Example: Reduce support tickets caused by brute-force login attempts" />
      </div>
      <div className="fr-field">
        <label>Constraints</label>
        <div className="fr-constraint-row">
          <input className="fr-input" value={constraintInput} onChange={(event) => setConstraintInput(event.target.value)} placeholder="Example: Preserve the current sign-in API" />
          <button type="button" className="fr-btn-add" onClick={addConstraint}>+</button>
        </div>
        {constraints.length > 0 && <ul className="fr-constraint-list">{constraints.map((constraint, index) => (
          <li key={`${constraint}-${index}`}>{constraint}<button type="button" onClick={() => setConstraints((current) => current.filter((_, itemIndex) => itemIndex !== index))}>x</button></li>
        ))}</ul>}
      </div>
      <div className="fr-actions">
        <button type="button" className="fr-btn-cancel" onClick={onCancel}>Cancel</button>
        <button type="submit" className="fr-btn-submit" disabled={!title.trim()}>Send directly to PO</button>
      </div>
    </form>
  );
}
