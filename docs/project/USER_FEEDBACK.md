# Mentor & User Feedback

- **Feedback 1**: *"The Dynamic Token Router breaks the cost allocation rules. DEV Agent should be Pro, QA should be Flash, etc."*
  - **Resolution**: Refactored `router.py` to use Static Mapping by default, only using Token counts as an extreme safety fallback.
- **Feedback 2**: *"UI components are overlapping on the Pipeline view."*
  - **Resolution**: Converted `.sdlc-pipeline` from CSS Grid to Flexbox with `overflow-x: auto` and `min-width: 250px` for Phase Cards.
- **Feedback 3**: *"Keep the codebase clean, remove legacy agent files."*
  - **Resolution**: Deleted `agent_1.py`, `agent_2.py`, `agent_3.py` and sanitized `main_pipeline.py`.
