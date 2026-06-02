def upsert_design(payload):
    job_id = payload.get("job_id", "local")
    return {"source": "penpot-mock", "file_url": f"http://127.0.0.1:9001/#/workspace/{job_id}"}


def export_preview(payload):
    job_id = payload.get("job_id", "local")
    return {"source": "penpot-mock", "preview_url": f"/mock-assets/penpot/{job_id}.png"}
