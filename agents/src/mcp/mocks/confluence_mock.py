def read_page(payload):
    return {"source": "confluence-mock", "page_id": payload.get("page_id"), "content": ""}


def write_page(payload):
    return {"source": "confluence-mock", "status": "stored-locally", "title": payload.get("title")}
