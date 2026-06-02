def write_test_run(payload):
    return {"source": "testrail-mock", "status": "stored-locally", "case_count": len(payload.get("cases", []))}
