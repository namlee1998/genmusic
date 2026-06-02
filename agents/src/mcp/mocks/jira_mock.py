def read_issue(payload):
    return {"source": "jira-mock", "issue_id": payload.get("issue_id"), "status": "not-synced"}


def write_issue(payload):
    return {"source": "jira-mock", "status": "stored-locally", "summary": payload.get("summary")}
